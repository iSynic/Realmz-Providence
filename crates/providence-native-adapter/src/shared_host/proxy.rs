use super::*;
use std::io;

pub(super) fn run(project: &str, options: &[String], kind: &str) -> Result<(), String> {
    let (access, options) =
        providence_session_client::file_access::FileAccess::proxy_options(options, kind)?;
    let (owner, options, binding) = native_options(&options, kind)?;
    let descriptor = endpoint::descriptor_path(Path::new(project))?;
    let handshake = json!({"kind":kind, "owner":owner, "nativeControl":binding,"fileAccess":access,"build":providence_core::build_identity::current("providence-native-adapter"), "authority":providence_session_client::authority_identity(), "supportInputs":support::identities(&options)?});
    let input = io::stdin();
    let output = io::stdout();
    let mut reader = input.lock();
    let mut writer = output.lock();
    let Some(first) = read_frame(&mut reader).map_err(|e| e.to_string())? else {
        return Ok(());
    };
    let first_request: providence_session_client::Request =
        serde_json::from_str(&first).map_err(|e| e.to_string())?;
    let opening = if matches!(kind, "observer" | "native-control") {
        endpoint::load(&descriptor).and_then(|endpoint| Client::connect(&endpoint, handshake))
    } else {
        attach(project, &options, &descriptor, &handshake)
    };
    let connection = match opening {
        Ok(connection) => connection,
        Err(error) => {
            write_frame(
                &mut writer,
                &providence_session_client::Response::failure(first_request.id, &error),
            )
            .map_err(|e| e.to_string())?;
            return Err(error);
        }
    };
    relay(connection, kind, first, &mut reader, &mut writer)
}

fn relay(
    mut connection: Client,
    kind: &str,
    first: String,
    reader: &mut impl io::BufRead,
    writer: &mut impl io::Write,
) -> Result<(), String> {
    let native = kind == "native";
    let identity = connection.call("session.describe", json!({}))?;
    if !identity.ok {
        return Err(identity.error.unwrap_or_default());
    }
    let mut identity = identity.result.ok_or("host did not describe the session")?;
    let mut initial = Some(first);
    while let Some(line) = initial.take().map_or_else(
        || read_frame(reader).map_err(|e| e.to_string()),
        |line| Ok(Some(line)),
    )? {
        let mut request = match serde_json::from_str::<providence_session_client::Request>(&line) {
            Ok(request) => request,
            Err(error) => {
                write_frame(
                    writer,
                    &providence_session_client::Response::failure(0, error.to_string()),
                )
                .map_err(|e| e.to_string())?;
                continue;
            }
        };
        if kind != "mcp" {
            bind_native_request(&mut request, &identity, native);
        }
        let mut response = connection.request(&request)?;
        if native && request.method == "session.describe" && response.ok {
            response
                .result
                .as_mut()
                .ok_or("native description is missing")?["_nativeControl"] =
                connection.attachment["nativeControl"].clone();
        }
        if native && request.method == "session.replace-support" && response.ok {
            identity["sessionGeneration"] = response
                .result
                .as_ref()
                .ok_or("support replacement omitted its identity")?["sessionGeneration"]
                .clone();
        }
        write_frame(writer, &response).map_err(|e| e.to_string())?;
        if response.outcome_unknown == Some(true) {
            break;
        }
    }
    Ok(())
}

fn bind_native_request(
    request: &mut providence_session_client::Request,
    identity: &serde_json::Value,
    native: bool,
) {
    if !request.params.is_object() {
        request.params = json!({});
    }
    request.params["_hostSession"] = json!({"projectId":identity["projectId"],"sessionGeneration":identity["sessionGeneration"]});
    if native && request.params.get("operationId").is_none() {
        request.params["operationId"] = json!(providence_session_client::new_operation_id());
    }
}

const ATTACH_PATIENCE: Duration = Duration::from_secs(5);
const LAUNCHED_HOST_PATIENCE: Duration = Duration::from_secs(60);

// A host this proxy launched writes its descriptor only once the project is open.
// Under load that outlasts the ordinary attach window, so keep waiting while it has
// not reported success or failure.
fn attach_patience(pending: Option<&host_startup::Pending>) -> Result<Duration, String> {
    Ok(match pending {
        Some(launched) if !launched.reported()? => LAUNCHED_HOST_PATIENCE,
        _ => ATTACH_PATIENCE,
    })
}

fn attach(
    project: &str,
    options: &[String],
    descriptor: &Path,
    handshake: &serde_json::Value,
) -> Result<Client, String> {
    let mut pending: Option<host_startup::Pending> = None;
    let mut waiting_reported = false;
    let mut last_error: String;
    let started = std::time::Instant::now();
    loop {
        match endpoint::load(descriptor).and_then(|e| Client::connect(&e, handshake.clone())) {
            Ok(connection) => return Ok(connection),
            Err(error)
                if error.starts_with("host-incompatible:")
                    || error.starts_with("host-authentication:") =>
            {
                return Err(error);
            }
            Err(error) => last_error = error,
        }
        if last_error.starts_with("native-owner-active:") && !waiting_reported {
            eprintln!("Project session is waiting for its previous native connection to detach.");
            waiting_reported = true;
        }
        // A retiring host can remove its endpoint before releasing its writer.
        // Wait for that owner instead of launching a doomed replacement once.
        if pending.is_none() && !last_error.starts_with("native-owner-active:") {
            match providence_storage::ProjectWriterLock::acquire(Path::new(project)) {
                Ok(writer) => {
                    drop(writer);
                    pending = Some(host_startup::Pending::launch(project, options, descriptor)?);
                }
                Err(error) if error.kind() == io::ErrorKind::WouldBlock => {
                    last_error = "project-writer-active: the existing editing session has not released its writer; wait for it to finish or attach through its compatible host".into();
                }
                Err(error) => {
                    return Err(format!(
                        "could not inspect project writer ownership: {error}"
                    ));
                }
            }
        }
        if started.elapsed() >= attach_patience(pending.as_ref())? {
            break;
        }
        std::thread::sleep(Duration::from_millis(50));
    }
    if let Some(pending) = pending
        && let Some(error) = pending.failure()?
    {
        return Err(error);
    }
    Err(format!("host-attach-failed: {last_error}"))
}

fn native_options(
    options: &[String],
    kind: &str,
) -> Result<(String, Vec<String>, serde_json::Value), String> {
    let mut owner = String::new();
    let mut filtered = Vec::new();
    let mut binding = json!({});
    let mut arguments = options.iter();
    while let Some(option) = arguments.next() {
        if kind == "native" && option == "--native-client-id" {
            owner = arguments
                .next()
                .ok_or("--native-client-id requires a stable editor identity")?
                .clone();
        } else if kind == "native-control"
            && matches!(
                option.as_str(),
                "--native-parent-id" | "--native-control-token"
            )
        {
            let value = arguments
                .next()
                .ok_or("native control binding is incomplete")?;
            if option == "--native-parent-id" {
                binding["clientId"] = json!(
                    value
                        .parse::<u64>()
                        .map_err(|_| "invalid native control owner")?
                );
            } else {
                binding["token"] = json!(value);
            }
        } else {
            filtered.push(option.clone());
        }
    }
    if kind == "native" && (owner.is_empty() || owner.len() > 128) {
        return Err("native client identity must be 1 through 128 bytes".into());
    }
    Ok((owner, filtered, binding))
}

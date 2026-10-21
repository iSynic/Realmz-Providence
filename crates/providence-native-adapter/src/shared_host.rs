//! The host owns the only live project session; socket workers only frame requests.
mod changes;
mod collaboration;
mod export_jobs;
mod holds;
mod host_startup;
mod import_policy;
mod proxy;
mod receipts;
mod recovery;
mod retired_jobs;
mod revision_scope;
mod state;
mod support;
#[cfg(test)]
mod tests;
use crate::{Request, Response, startup, transport::ConnectionJobs};
use providence_session_client::{
    Client, endpoint,
    listener::{self, *},
    read_frame, write_frame,
};
use serde_json::json;
use std::{io::BufReader, path::Path, sync::mpsc, time::Duration};

enum Event {
    Request(u64, Request, mpsc::SyncSender<Response>),
    Disconnected(u64),
}

pub(crate) fn run(arguments: &[String]) -> Result<(), String> {
    let project = arguments.get(1).ok_or("a project directory is required")?;
    if matches!(
        arguments[0].as_str(),
        "serve-shared-project"
            | "serve-native-project"
            | "serve-observer-project"
            | "serve-native-control-project"
    ) {
        return proxy::run(
            project,
            &arguments[2..],
            match arguments[0].as_str() {
                "serve-native-project" => "native",
                "serve-observer-project" => "observer",
                "serve-native-control-project" => "native-control",
                _ => "mcp",
            },
        );
    }
    let (options, mut report) = host_startup::Reporter::parse(project, &arguments[2..])?;
    let result = host(project, &options, &mut report);
    if let Err(error) = &result {
        host_startup::report(&mut report, Some(error.as_str()))?;
    }
    result
}

fn host(
    project: &str,
    options: &[String],
    report: &mut Option<host_startup::Reporter>,
) -> Result<(), String> {
    let support_before = support::identities(options)?;
    let descriptor = endpoint::descriptor_path(Path::new(project))?;
    let mut startup = open_project(project, options)?;
    let endpoint_owner = endpoint::create()?;
    let endpoint = &endpoint_owner.endpoint;
    let listener = listener::listen(endpoint)?;
    let mut jobs = std::collections::BTreeMap::new();
    let mut retired = retired_jobs::RetiredJobs::default();
    let mut state = state::State::new(&endpoint.token, options);
    state.pin_support(support_before)?;
    state.load_holds(descriptor.with_extension("editing-holds.json"))?;
    state.load_receipt_gate(startup.store.as_ref().expect("host has store"))?;
    endpoint::save(&descriptor, endpoint)?;
    host_startup::report(report, None)?;
    let (sender, receiver) = mpsc::sync_channel(64);
    std::thread::spawn(move || accept(listener, sender));
    let mut connected = false;
    loop {
        let event = match receiver.recv_timeout(Duration::from_secs(10)) {
            Ok(event) => event,
            Err(mpsc::RecvTimeoutError::Timeout) if !connected => break,
            Err(mpsc::RecvTimeoutError::Timeout) => continue,
            Err(_) => break,
        };
        match event {
            Event::Request(client, request, reply) => {
                let response =
                    dispatch_client(&mut startup, &mut state, &mut jobs, client, request);
                connected |= !state.clients.is_empty();
                let uncertain = response.outcome_unknown == Some(true);
                let _ = reply.send(response);
                if uncertain {
                    break;
                }
            }
            Event::Disconnected(client) => {
                retired.retire(jobs.remove(&client));
                state.disconnect(client)?;
                if connected && !state.has_connected_clients() {
                    break;
                }
            }
        }
    }
    let _ = std::fs::remove_file(&descriptor);
    Ok(())
}

fn dispatch_client(
    startup: &mut startup::Startup,
    state: &mut state::State,
    jobs: &mut std::collections::BTreeMap<u64, ConnectionJobs>,
    client: u64,
    request: Request,
) -> Response {
    let client_jobs = jobs
        .entry(client)
        .or_insert_with(|| ConnectionJobs::new(startup.libraries.split().0));
    state.dispatch(
        client,
        request,
        &mut state::Context {
            session: &mut startup.session,
            store: startup.store.as_ref().expect("host has store"),
            libraries: &mut startup.libraries,
            jobs: client_jobs,
        },
    )
}

fn open_project(project: &str, options: &[String]) -> Result<startup::Startup, String> {
    let mut arguments = ["serve-project".into(), project.into()]
        .into_iter()
        .chain(options.iter().cloned());
    startup::start(&mut arguments).map_err(|error| error.message)
}

fn accept(
    listener: providence_session_client::listener::Listener,
    sender: mpsc::SyncSender<Event>,
) {
    for (index, incoming) in listener.incoming().enumerate() {
        let Ok(stream) = incoming else {
            continue;
        };
        let sender = sender.clone();
        std::thread::spawn(move || {
            let client = index as u64 + 1;
            let mut reader = BufReader::new(stream);
            while let Ok(Some(line)) = read_frame(&mut reader) {
                let request = match serde_json::from_str(&line) {
                    Ok(request) => request,
                    Err(_) => break,
                };
                let (reply, result) = mpsc::sync_channel(1);
                if sender.send(Event::Request(client, request, reply)).is_err() {
                    break;
                }
                let Ok(response) = result.recv() else {
                    break;
                };
                if write_frame(reader.get_mut(), &response).is_err() {
                    break;
                }
            }
            let _ = sender.send(Event::Disconnected(client));
        });
    }
}

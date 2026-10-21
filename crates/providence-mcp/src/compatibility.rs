//! Pair the MCP contract with the actual adapter before creating project files.
use providence_core::build_identity::{ProvidenceBuildIdentity, current};
use std::{
    io::Read,
    path::Path,
    process::{Command, Stdio},
    sync::mpsc,
    time::{Duration, Instant},
};

pub(crate) fn validate(adapter: &Path) -> Result<(), String> {
    let bytes = read_identity(adapter, "build-identity")?;
    let actual: ProvidenceBuildIdentity = serde_json::from_slice(&bytes)
        .map_err(|e| format!("adapter-incompatible: malformed build identity: {e}"))?;
    matches(&actual, &current("providence-native-adapter"))?;
    let bytes = read_identity(adapter, "session-contract-identity")?;
    let actual = serde_json::from_slice(&bytes)
        .map_err(|e| format!("adapter-incompatible: malformed authority identity: {e}"))?;
    matches_authority(&actual)
}

fn read_identity(adapter: &Path, mode: &str) -> Result<Vec<u8>, String> {
    let mut command = Command::new(adapter);
    command
        .arg(mode)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    let mut child = command
        .spawn()
        .map_err(|e| format!("adapter-unavailable: {e}"))?;
    let output = child.stdout.take().ok_or("adapter stdout is unavailable")?;
    let (sender, receiver) = mpsc::channel();
    std::thread::spawn(move || {
        let mut bytes = Vec::new();
        let result = output.take(65537).read_to_end(&mut bytes).map(|_| bytes);
        let _ = sender.send(result);
    });
    let deadline = Instant::now() + Duration::from_secs(3);
    let result = receiver.recv_timeout(Duration::from_secs(3));
    let completion = wait_for_identity_exit(&mut child, deadline);
    let bytes = result
        .map_err(|_| "adapter-incompatible: build identity did not finish within three seconds")?
        .map_err(|e| e.to_string())?;
    completion?;
    if bytes.len() > 65536 {
        return Err("adapter-incompatible: build identity exceeds its bound".into());
    }
    Ok(bytes)
}

fn matches_authority(actual: &serde_json::Value) -> Result<(), String> {
    if *actual != providence_session_client::authority_identity() {
        return Err("adapter-incompatible: authoring source fingerprint or host protocol differs; rebuild the server and adapter together".into());
    }
    Ok(())
}

fn wait_for_identity_exit(
    child: &mut std::process::Child,
    deadline: Instant,
) -> Result<(), String> {
    loop {
        match child.try_wait() {
            Ok(Some(status)) if status.success() => return Ok(()),
            Ok(Some(status)) => {
                return Err(format!(
                    "adapter-incompatible: identity query exited with {status}"
                ));
            }
            Ok(None) if Instant::now() < deadline => std::thread::sleep(Duration::from_millis(5)),
            result => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(format!(
                    "adapter-incompatible: identity query failed to exit: {result:?}"
                ));
            }
        }
    }
}
fn matches(
    actual: &ProvidenceBuildIdentity,
    expected: &ProvidenceBuildIdentity,
) -> Result<(), String> {
    if actual != expected {
        return Err("adapter-incompatible: server and adapter build, schema, lock, target and profile identities must match".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn uncommitted_authority_sources_must_match_independently_of_the_public_build() {
        let mut actual = providence_session_client::authority_identity();
        assert!(matches_authority(&actual).is_ok());
        actual["authoritySha256"] = serde_json::json!("older-dirty-build");
        assert!(matches_authority(&actual).is_err());
    }
    #[test]
    fn a_shared_protocol_number_does_not_allow_a_different_build_or_schema() {
        let expected = current("providence-native-adapter");
        assert!(matches(&expected, &expected).is_ok());
        let mut stale = expected.clone();
        stale.cargo_lock_sha256 = "stale-lock".into();
        assert!(matches(&stale, &expected).is_err());
        stale = expected.clone();
        stale.schema_sha256 = "stale-schema".into();
        assert!(matches(&stale, &expected).is_err());
    }
}

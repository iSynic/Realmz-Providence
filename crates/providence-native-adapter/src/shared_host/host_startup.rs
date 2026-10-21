//! A private, nonce-bound startup reply survives detached process launch failures.
use super::*;
use std::{fs, io::Read, path::PathBuf};

pub(super) struct Pending {
    path: tempfile::TempPath,
    nonce: String,
}

impl Pending {
    pub fn launch(project: &str, options: &[String], descriptor: &Path) -> Result<Self, String> {
        let path = tempfile::Builder::new()
            .prefix("startup-")
            .suffix(".json")
            .tempfile_in(descriptor.parent().ok_or("session directory is missing")?)
            .map_err(|e| e.to_string())?
            .into_temp_path();
        let pending = Self {
            path,
            nonce: providence_session_client::new_operation_id(),
        };
        let arguments = ["host-project".into(), project.into()]
            .into_iter()
            .chain(options.iter().cloned())
            .chain([
                "--host-startup-receipt".into(),
                pending.path.to_string_lossy().into_owned(),
                "--host-startup-nonce".into(),
                pending.nonce.clone(),
            ])
            .collect::<Vec<_>>();
        providence_session_client::process::spawn_host(
            &std::env::current_exe().map_err(|e| e.to_string())?,
            &arguments,
        )
        .map_err(|e| e.to_string())?;
        Ok(pending)
    }

    /// The launched host has written its startup reply, success or failure. Until it
    /// does it is still starting, which under load can outlast an ordinary attach window.
    pub fn reported(&self) -> Result<bool, String> {
        Ok(!self.reply()?.is_empty())
    }

    pub fn failure(&self) -> Result<Option<String>, String> {
        let bytes = self.reply()?;
        if bytes.is_empty() {
            return Ok(None);
        }
        if bytes.len() > 32768 {
            return Err("host startup reply exceeds its bound".into());
        }
        let value: serde_json::Value = serde_json::from_slice(&bytes)
            .map_err(|e| format!("invalid atomic host startup reply: {e}"))?;
        if value["nonce"] != self.nonce
            || value["build"]
                != json!(providence_core::build_identity::current(
                    "providence-native-adapter"
                ))
        {
            return Err("host startup reply identity does not match the launching proxy".into());
        }
        Ok(value["error"]
            .as_str()
            .map(|error| format!("host-startup-failed: {error}")))
    }

    fn reply(&self) -> Result<Vec<u8>, String> {
        let mut bytes = Vec::new();
        fs::File::open(&self.path)
            .map_err(|e| e.to_string())?
            .take(32769)
            .read_to_end(&mut bytes)
            .map_err(|e| e.to_string())?;
        Ok(bytes)
    }
}

pub(super) struct Reporter {
    path: PathBuf,
    nonce: String,
    written: bool,
}

impl Reporter {
    pub fn parse(project: &str, options: &[String]) -> Result<(Vec<String>, Option<Self>), String> {
        if !options.len().is_multiple_of(2) {
            return Err("host options require values".into());
        }
        let mut support = Vec::new();
        let (mut path, mut nonce) = (None, None);
        for pair in options.chunks_exact(2) {
            let target = match pair[0].as_str() {
                "--host-startup-receipt" => &mut path,
                "--host-startup-nonce" => &mut nonce,
                _ => {
                    support.extend_from_slice(pair);
                    continue;
                }
            };
            if target.replace(pair[1].clone()).is_some() {
                return Err("duplicate host startup option".into());
            }
        }
        let report = match (path, nonce) {
            (None, None) => None,
            (Some(path), Some(nonce)) => {
                let descriptor = endpoint::descriptor_path(Path::new(project))?;
                let path = receipt_path(Path::new(&path), descriptor.parent().unwrap(), &nonce)?;
                Some(Self {
                    path,
                    nonce,
                    written: false,
                })
            }
            _ => return Err("host startup receipt and nonce must be paired".into()),
        };
        Ok((support, report))
    }
}

fn receipt_path(path: &Path, directory: &Path, nonce: &str) -> Result<PathBuf, String> {
    let invalid = "invalid private host startup receipt";
    let name = path.file_name().ok_or(invalid)?;
    if !name.to_string_lossy().starts_with("startup-") || nonce.len() != 64 {
        return Err(invalid.into());
    }
    let expected = directory.join(name);
    for candidate in [path, expected.as_path()] {
        let metadata = fs::symlink_metadata(candidate).map_err(|e| e.to_string())?;
        if !metadata.is_file() || metadata.file_type().is_symlink() || metadata.len() != 0 {
            return Err(invalid.into());
        }
    }
    // Windows packaged clients can redirect a file without redirecting a
    // directory handle. Resolve the exact entry in the trusted session directory
    // so that both names identify the same receipt, without allowing file links.
    let resolved = path.canonicalize().map_err(|e| e.to_string())?;
    if resolved != expected.canonicalize().map_err(|e| e.to_string())? {
        return Err(invalid.into());
    }
    Ok(resolved)
}

pub(super) fn report(reporter: &mut Option<Reporter>, error: Option<&str>) -> Result<(), String> {
    let Some(reporter) = reporter else {
        return Ok(());
    };
    if reporter.written {
        return Ok(());
    }
    let error = error.map(|message| {
        let prefix = message.chars().take(4096).collect::<String>();
        if prefix.len() < message.len() {
            format!("{prefix} [startup diagnostic truncated]")
        } else {
            prefix
        }
    });
    let value = json!({"nonce":reporter.nonce,"build":providence_core::build_identity::current("providence-native-adapter"),"error":error});
    receipts::write(&reporter.path, &value)?;
    reporter.written = true;
    Ok(())
}

#[cfg(test)]
#[path = "host_startup_tests.rs"]
mod tests;

//! Endpoint descriptors are machine-local; the project writer lock arbitrates creation.
#[cfg(unix)]
use interprocess::local_socket::GenericFilePath;
#[cfg(windows)]
use interprocess::local_socket::GenericNamespaced;
use interprocess::local_socket::{Name, prelude::*};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs,
    path::{Path, PathBuf},
};

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Endpoint {
    pub address: String,
    pub token: String,
}

pub struct HostEndpoint {
    pub endpoint: Endpoint,
    #[cfg(unix)]
    _socket_directory: tempfile::TempDir,
}
impl Endpoint {
    pub fn name(&self) -> Result<Name<'_>, String> {
        #[cfg(windows)]
        {
            self.address
                .as_str()
                .to_ns_name::<GenericNamespaced>()
                .map_err(|e| e.to_string())
        }
        #[cfg(not(windows))]
        {
            self.address
                .as_str()
                .to_fs_name::<GenericFilePath>()
                .map_err(|e| e.to_string())
        }
    }
}

pub fn descriptor_path(project: &Path) -> Result<PathBuf, String> {
    let project = project.canonicalize().map_err(|e| e.to_string())?;
    let base = if cfg!(windows) {
        std::env::var_os("LOCALAPPDATA")
    } else {
        std::env::var_os("XDG_RUNTIME_DIR")
            .filter(|value| !value.is_empty())
            .or_else(|| std::env::var_os("HOME"))
    }
    .filter(|value| !value.is_empty())
    .ok_or("local user settings directory is unavailable")?;
    let directory = settings_directory(Path::new(&base))?;
    fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&directory, fs::Permissions::from_mode(0o700))
            .map_err(|e| e.to_string())?;
    }
    let key = format!("{:x}", Sha256::digest(project.to_string_lossy().as_bytes()));
    Ok(directory.join(format!("{key}.json")))
}

fn settings_directory(base: &Path) -> Result<PathBuf, String> {
    if !base.is_absolute() {
        return Err("local user settings directory must be absolute".into());
    }
    Ok(base.join("Providence").join("sessions"))
}

pub fn create() -> Result<HostEndpoint, String> {
    let token = uuid::Uuid::new_v4().to_string();
    #[cfg(windows)]
    let address = format!("providence-{}", uuid::Uuid::new_v4());
    #[cfg(unix)]
    let directory = socket_directory()?;
    #[cfg(unix)]
    let address = directory
        .path()
        .join("s")
        .to_str()
        .ok_or("local socket path must be valid Unicode")?
        .to_owned();
    Ok(HostEndpoint {
        endpoint: Endpoint { address, token },
        #[cfg(unix)]
        _socket_directory: directory,
    })
}

#[cfg(unix)]
fn socket_directory() -> Result<tempfile::TempDir, String> {
    use std::os::unix::fs::PermissionsExt;
    let base = std::env::temp_dir();
    let base = if base.is_absolute() && base.to_str().is_some_and(|path| path.len() <= 64) {
        base
    } else {
        PathBuf::from("/tmp")
    };
    // A host owns a short private directory, independent of project/settings
    // path length. A crashed host's socket is never reused or unlinked by a peer.
    tempfile::Builder::new()
        .prefix("pv-")
        .permissions(fs::Permissions::from_mode(0o700))
        .tempdir_in(base)
        .map_err(|e| e.to_string())
}
pub fn load(descriptor: &Path) -> Result<Endpoint, String> {
    serde_json::from_slice(&fs::read(descriptor).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())
}
pub fn save(descriptor: &Path, endpoint: &Endpoint) -> Result<(), String> {
    fs::write(
        descriptor,
        serde_json::to_vec(endpoint).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests;

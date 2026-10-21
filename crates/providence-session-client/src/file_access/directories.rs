//! Native Classic imports inspect immediate files; no implied parent or linked-file grant.
use super::*;
impl FileAccess {
    pub(super) fn input_directory(&self, params: &mut Value, key: &str) -> Result<(), String> {
        let path = absolute(params, key)?
            .canonicalize()
            .map_err(|error| format!("file-access: input directory is unavailable: {error}"))?;
        if !path.is_dir() || !self.input_roots.iter().any(|root| path.starts_with(root)) {
            return Err(
                "file-access: input directory is outside the configured input roots".into(),
            );
        }
        let mut bytes = 0u64;
        for (index, entry) in std::fs::read_dir(&path)
            .map_err(|error| error.to_string())?
            .enumerate()
        {
            if index >= 4096 {
                return Err("file-access: Classic input directory exceeds 4096 entries".into());
            }
            let entry = entry.map_err(|error| error.to_string())?;
            let kind = entry.file_type().map_err(|error| error.to_string())?;
            if kind.is_symlink() || (!kind.is_file() && !kind.is_dir()) {
                return Err(
                    "file-access: Classic input cannot contain linked or special files".into(),
                );
            }
            if kind.is_file() {
                let length = entry.metadata().map_err(|error| error.to_string())?.len();
                bytes = bytes.saturating_add(length);
                if length > 128 * 1024 * 1024 || bytes > 1024 * 1024 * 1024 {
                    return Err("file-access: Classic input exceeds 128 MiB per file or 1 GiB per directory".into());
                }
            }
        }
        params[key] = serde_json::json!(path);
        Ok(())
    }
}

use crate::error::{IoPath, ProvidenceError, Result};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use std::path::{Path, PathBuf};
use tauri::ipc::{InvokeBody, Request};

#[tauri::command]
pub async fn save_map_image_export(request: Request<'_>) -> Result<String> {
    let header = request
        .headers()
        .get("x-providence-export-path")
        .and_then(|value| value.to_str().ok())
        .ok_or_else(|| ProvidenceError::message("No map export destination was selected."))?;
    let path = decode_export_path(header)?;
    let bytes = match request.body() {
        InvokeBody::Raw(bytes) => bytes.clone(),
        _ => {
            return Err(ProvidenceError::message(
                "Map exports require a binary file payload.",
            ))
        }
    };
    tauri::async_runtime::spawn_blocking(move || write_map_export(&path, &bytes))
        .await
        .map_err(|error| ProvidenceError::message(format!("Map export write failed: {error}")))?
}

fn decode_export_path(encoded: &str) -> Result<PathBuf> {
    let bytes = STANDARD
        .decode(encoded)
        .map_err(|error| ProvidenceError::message(format!("Invalid map export path: {error}")))?;
    let path = String::from_utf8(bytes)
        .map_err(|error| ProvidenceError::message(format!("Invalid map export path: {error}")))?;
    Ok(PathBuf::from(path))
}

fn write_map_export(path: &Path, bytes: &[u8]) -> Result<String> {
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("");
    if !path.is_absolute()
        || !["jpg", "jpeg", "zip"]
            .iter()
            .any(|allowed| extension.eq_ignore_ascii_case(allowed))
    {
        return Err(ProvidenceError::message(
            "Choose an absolute JPEG or ZIP file destination.",
        ));
    }
    if bytes.is_empty() {
        return Err(ProvidenceError::message(
            "The map export contains no file data.",
        ));
    }
    std::fs::write(path, bytes).with_path(path)?;
    Ok(path.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn selected_jpeg_and_zip_files_receive_the_exact_bytes() {
        let temp = tempfile::tempdir().unwrap();
        for name in ["Café.jpg", "scenario.zip"] {
            let path = temp.path().join(name);
            let bytes = b"exact generated export bytes";
            assert_eq!(
                write_map_export(&path, bytes).unwrap(),
                path.to_string_lossy()
            );
            assert_eq!(std::fs::read(path).unwrap(), bytes);
        }
    }

    #[test]
    fn invalid_destinations_and_empty_payloads_do_not_overwrite_files() {
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("project.json");
        std::fs::write(&path, b"original").unwrap();
        assert!(write_map_export(&path, b"replacement").is_err());
        assert_eq!(std::fs::read(path).unwrap(), b"original");
        assert!(write_map_export(Path::new("relative.jpg"), b"jpg").is_err());
        assert!(write_map_export(&temp.path().join("empty.jpg"), b"").is_err());
    }

    #[test]
    fn destination_headers_preserve_unicode_paths() {
        let path = "C:\\Maps\\Café.jpg";
        assert_eq!(
            decode_export_path(&STANDARD.encode(path)).unwrap(),
            PathBuf::from(path)
        );
        assert!(decode_export_path("not base64").is_err());
    }
}

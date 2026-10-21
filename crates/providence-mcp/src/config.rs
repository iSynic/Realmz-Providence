use crate::server;
use std::{
    path::PathBuf,
    sync::{Arc, Mutex},
};

pub(crate) fn configure() -> Result<server::Server, String> {
    let mut arguments = std::env::args().skip(1);
    let mut root = None;
    let mut adapter = None;
    let mut options = Vec::new();
    let mut output_root = None;
    while let Some(option) = arguments.next() {
        let value = arguments
            .next()
            .ok_or_else(|| format!("missing value for {option}"))?;
        match option.as_str() {
            "--project-root" => root = Some(directory(value)?),
            "--adapter" => adapter = Some(PathBuf::from(value)),
            "--output-root" => output_root = Some(directory(value)?),
            "--input-root" => {
                options.push("--mcp-input-root".into());
                options.push(value);
            }
            "--application-library-root"
            | "--reference-catalog-root"
            | "--application-rules-root"
            | "--monster-library-root"
            | "--personal-monster-library-root"
            | "--personal-library-root"
            | "--monster-scrapbook-manifest" => {
                options.push(option);
                options.push(value);
            }
            _ => return Err(format!("unknown option {option}")),
        }
    }
    let root = root.ok_or("--project-root is required")?;
    let (access, mut options) =
        providence_session_client::file_access::FileAccess::proxy_options(&options, "mcp")?;
    for path in access.input_roots {
        options.extend([
            "--mcp-input-root".into(),
            path.to_string_lossy().into_owned(),
        ]);
    }
    let adapter = adapter.unwrap_or(
        std::env::current_exe()
            .map_err(|e| e.to_string())?
            .with_file_name(if cfg!(windows) {
                "providence-native-adapter.exe"
            } else {
                "providence-native-adapter"
            }),
    );
    Ok(server::Server {
        state: Arc::new(Mutex::new(server::State {
            root,
            output_root,
            adapter,
            options,
            backend: None,
        })),
    })
}

fn directory(value: String) -> Result<PathBuf, String> {
    let path = PathBuf::from(value)
        .canonicalize()
        .map_err(|error| error.to_string())?;
    if !path.is_dir() {
        return Err("project and output roots must be existing directories".into());
    }
    Ok(path)
}

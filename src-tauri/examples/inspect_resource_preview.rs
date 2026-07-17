use realmz_providence_lib::resource_fork::parse_resource_fork_entries;
use realmz_providence_lib::resource_preview::inspect_resource_preview;
use serde_json::json;
use std::env;
use std::fs;
use std::path::PathBuf;

fn main() {
    let args: Vec<String> = env::args().skip(1).collect();
    if args.is_empty() || args.iter().any(|arg| arg == "--help" || arg == "-h") {
        eprintln!(
            "Usage: cargo run --manifest-path src-tauri/Cargo.toml --example inspect_resource_preview -- <resource-file> [resource-type resource-id]"
        );
        std::process::exit(if args.is_empty() { 1 } else { 0 });
    }

    let path = PathBuf::from(&args[0]);
    let bytes = match fs::read(&path) {
        Ok(bytes) => bytes,
        Err(error) => fail(format!("Could not read {}: {error}", path.display())),
    };
    let (resource_type, resource_id, resource_name, payload) = if args.len() >= 3 {
        let resource_type = normalize_resource_type(&args[1]);
        let resource_id = args[2]
            .parse::<i16>()
            .unwrap_or_else(|_| fail(format!("Invalid resource ID: {}", args[2])));
        let entry = parse_resource_fork_entries(&bytes)
            .into_iter()
            .find(|entry| entry.resource_type == resource_type && entry.id == resource_id)
            .unwrap_or_else(|| {
                fail(format!(
                    "{} {} was not found in {}",
                    resource_type.trim(),
                    resource_id,
                    path.display()
                ))
            });
        (entry.resource_type, Some(entry.id), entry.name, entry.data)
    } else {
        let resource_type = infer_resource_type(&path).unwrap_or_else(|| {
            fail("A resource type and ID are required for resource-fork input.")
        });
        (resource_type, None, String::new(), bytes)
    };

    let preview = inspect_resource_preview(&resource_type, &payload)
        .unwrap_or_else(|error| fail(error.to_string()));
    let output = json!({
        "path": path,
        "resourceType": resource_type.trim(),
        "resourceId": resource_id,
        "resourceName": resource_name,
        "bytes": payload.len(),
        "status": preview.status,
        "mimeType": preview.mime_type,
        "summary": preview.summary,
        "diagnostics": preview.diagnostics,
        "hasPreview": preview.data_url.is_some(),
    });
    println!(
        "{}",
        serde_json::to_string_pretty(&output).expect("serialize preview report")
    );
}

fn normalize_resource_type(value: &str) -> String {
    let mut resource_type = value.to_string();
    while resource_type.len() < 4 {
        resource_type.push(' ');
    }
    resource_type
}

fn infer_resource_type(path: &PathBuf) -> Option<String> {
    match path
        .extension()?
        .to_string_lossy()
        .to_ascii_lowercase()
        .as_str()
    {
        "pict" => Some("PICT".to_string()),
        "cicn" => Some("cicn".to_string()),
        "snd" => Some("snd ".to_string()),
        "text" => Some("TEXT".to_string()),
        "styl" => Some("styl".to_string()),
        _ => None,
    }
}

fn fail<T>(message: impl Into<String>) -> T {
    eprintln!("{}", message.into());
    std::process::exit(1);
}

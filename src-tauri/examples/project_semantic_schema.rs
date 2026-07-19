use realmz_providence_lib::importer::{build_project_semantic_schema, open_project};
use std::env;
use std::fs;
use std::path::PathBuf;

fn main() {
    let args: Vec<String> = env::args().skip(1).collect();
    if args.len() != 2 || args.iter().any(|arg| arg == "--help" || arg == "-h") {
        eprintln!(
            "Usage: cargo run --manifest-path src-tauri/Cargo.toml --example project_semantic_schema -- <project-dir> <output-json>"
        );
        std::process::exit(if args.is_empty() { 1 } else { 0 });
    }

    let project_dir = PathBuf::from(&args[0]);
    let output_path = PathBuf::from(&args[1]);
    let result = open_project(&project_dir)
        .and_then(|project| build_project_semantic_schema(&project_dir, &project))
        .and_then(|schema| {
            serde_json::to_vec_pretty(&schema)
                .map_err(|error| {
                    realmz_providence_lib::error::ProvidenceError::message(format!(
                        "Failed to serialize semantic schema: {error}"
                    ))
                })
                .and_then(|bytes| {
                    fs::write(&output_path, bytes).map_err(|error| {
                        realmz_providence_lib::error::ProvidenceError::message(format!(
                            "Failed to write {}: {error}",
                            output_path.display()
                        ))
                    })
                })
        });

    if let Err(error) = result {
        eprintln!("{error}");
        std::process::exit(1);
    }
    println!("{}", output_path.display());
}

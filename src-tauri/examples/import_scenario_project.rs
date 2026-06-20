use realmz_providence_lib::importer::{import_scenario_into_project, open_project};
use std::env;
use std::path::PathBuf;

fn main() {
    let args: Vec<String> = env::args().skip(1).collect();
    if args.len() < 2 || args.iter().any(|arg| arg == "--help" || arg == "-h") {
        eprintln!(
            "Usage: cargo run --manifest-path src-tauri/Cargo.toml --example import_scenario_project -- <source-scenario-dir> <project-dir> [project-name]"
        );
        std::process::exit(if args.is_empty() { 1 } else { 0 });
    }

    let source = PathBuf::from(&args[0]);
    let project_dir = PathBuf::from(&args[1]);
    let project_name = args.get(2).cloned().unwrap_or_else(|| {
        source
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("Imported Scenario")
            .to_string()
    });

    match import_scenario_into_project(&source, &project_dir, project_name)
        .and_then(|_| open_project(&project_dir))
    {
        Ok(project) => {
            println!("{}", project_dir.join("project.json").display());
            eprintln!(
                "Imported {} map(s), {} asset(s), {} picture catalog entrie(s).",
                project.maps.len(),
                project.assets.len(),
                project.asset_catalog.pictures.len()
            );
        }
        Err(error) => {
            eprintln!("{error}");
            std::process::exit(1);
        }
    }
}

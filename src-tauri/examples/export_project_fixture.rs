use realmz_providence_lib::exporter::export_project;
use realmz_providence_lib::importer::open_project;
use realmz_providence_lib::project::ScenarioTarget;
use std::env;
use std::path::PathBuf;

fn main() {
    let args: Vec<String> = env::args().skip(1).collect();
    if args.len() != 3 || args.iter().any(|arg| arg == "--help" || arg == "-h") {
        eprintln!(
            "Usage: cargo run --manifest-path src-tauri/Cargo.toml --example export_project_fixture -- <project-dir> <output-dir> <mac-classic-folder|windows-realmz-folder>"
        );
        std::process::exit(if args.is_empty() { 1 } else { 0 });
    }

    let project_dir = PathBuf::from(&args[0]);
    let output_dir = PathBuf::from(&args[1]);
    let target = match args[2].as_str() {
        "mac-classic-folder" => ScenarioTarget::MacClassicFolder,
        "windows-realmz-folder" => ScenarioTarget::WindowsRealmzFolder,
        other => {
            eprintln!("Unsupported export target '{other}'.");
            std::process::exit(1);
        }
    };

    match open_project(&project_dir).and_then(|project| export_project(&project_dir, &project, &output_dir, target)) {
        Ok(report) => {
            println!("{}", output_dir.display());
            eprintln!(
                "Exported {} written file(s), {} pass-through file(s), {} written resource(s).",
                report.written_files.len(),
                report.pass_through_files.len(),
                report.written_resources.len()
            );
        }
        Err(error) => {
            eprintln!("{error}");
            std::process::exit(1);
        }
    }
}

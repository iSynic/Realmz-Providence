use realmz_providence_lib::importer::open_project;
use realmz_providence_lib::remake_exporter::export_remake_campaign;
use std::env;
use std::path::PathBuf;

fn main() {
    let args: Vec<String> = env::args().skip(1).collect();
    if args.iter().any(|arg| arg == "--help" || arg == "-h") {
        usage(0);
    }
    if args.len() != 3 || args[0] != "--project" {
        usage(1);
    }

    let project_dir = PathBuf::from(&args[1]);
    let output_dir = PathBuf::from(&args[2]);
    let result = open_project(&project_dir)
        .and_then(|project| export_remake_campaign(&project, &project_dir, &output_dir));
    match result {
        Ok(report) => {
            println!("{}", report.output_dir.display());
            eprintln!(
                "Wrote {} files: {} maps, {} active triggers, {} messages, and {} packaged asset payloads.",
                report.written_files.len(),
                report.counts.maps,
                report.counts.active_triggers,
                report.counts.messages,
                report.counts.packaged_asset_payloads,
            );
            for limitation in report.limitations {
                eprintln!("Boundary: {limitation}");
            }
        }
        Err(error) => {
            eprintln!("{error}");
            std::process::exit(1);
        }
    }
}

fn usage(exit_code: i32) -> ! {
    eprintln!(
        "Usage: cargo run --manifest-path src-tauri/Cargo.toml --bin realmz-remake-converter -- --project <project.providence> <output-directory>"
    );
    std::process::exit(exit_code);
}

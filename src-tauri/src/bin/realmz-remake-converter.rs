use realmz_providence_lib::importer::open_project;
use realmz_providence_lib::remake_exporter::{
    export_remake_campaign, update_remake_campaign_icons,
};
use std::env;
use std::path::PathBuf;

fn main() {
    let args: Vec<String> = env::args().skip(1).collect();
    if args.iter().any(|arg| arg == "--help" || arg == "-h") {
        usage(0);
    }
    let update_icons = args
        .first()
        .is_some_and(|argument| argument == "--update-icons");
    let project_argument = if update_icons { 1 } else { 0 };
    if args.len() != 3 + usize::from(update_icons) || args[project_argument] != "--project" {
        usage(1);
    }

    let project_dir = PathBuf::from(&args[project_argument + 1]);
    let output_dir = PathBuf::from(&args[project_argument + 2]);
    if update_icons {
        let result = open_project(&project_dir)
            .and_then(|project| update_remake_campaign_icons(&project, &output_dir));
        match result {
            Ok(report) => {
                println!("{}", report.output_dir.display());
                eprintln!(
                    "Wrote {} scenario icon payload files; bundle now has {} packaged asset payloads.",
                    report.written_files.len(),
                    report.packaged_asset_payloads,
                );
            }
            Err(error) => {
                eprintln!("{error}");
                std::process::exit(1);
            }
        }
        return;
    }
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
        "Usage: cargo run --manifest-path src-tauri/Cargo.toml --bin realmz-remake-converter -- [--update-icons] --project <project.providence> <output-directory>"
    );
    std::process::exit(exit_code);
}

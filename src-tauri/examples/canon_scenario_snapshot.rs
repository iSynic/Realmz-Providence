use realmz_providence_lib::evidence::{snapshot_scenario_dir, write_json_file};
use std::env;
use std::path::PathBuf;

fn main() {
    if let Err(error) = run() {
        eprintln!("error: {error}");
        std::process::exit(1);
    }
}

fn run() -> realmz_providence_lib::error::Result<()> {
    let args = Args::parse();
    if args.help || args.source.is_none() {
        Args::print_help();
        return Ok(());
    }
    let source = args.source.unwrap();
    let snapshot = snapshot_scenario_dir(&source, args.label.as_deref())?;
    if let Some(output) = args.output {
        write_json_file(&output, &snapshot)?;
        eprintln!("Wrote {}", output.display());
    } else {
        println!(
            "{}",
            serde_json::to_string_pretty(&snapshot).map_err(|error| {
                realmz_providence_lib::error::ProvidenceError::message(format!(
                    "Failed to serialize snapshot: {error}"
                ))
            })?
        );
    }
    Ok(())
}

#[derive(Debug, Default)]
struct Args {
    source: Option<PathBuf>,
    output: Option<PathBuf>,
    label: Option<String>,
    help: bool,
}

impl Args {
    fn parse() -> Self {
        let mut args = Args::default();
        let mut iter = env::args().skip(1);
        while let Some(arg) = iter.next() {
            match arg.as_str() {
                "--out" | "--output" => args.output = iter.next().map(PathBuf::from),
                "--label" => args.label = iter.next(),
                "--help" | "-h" => args.help = true,
                value if args.source.is_none() => args.source = Some(PathBuf::from(value)),
                other => eprintln!("Ignoring unknown argument: {other}"),
            }
        }
        args
    }

    fn print_help() {
        eprintln!(
            "Usage: cargo run --manifest-path src-tauri/Cargo.toml --example canon_scenario_snapshot -- <SCENARIO_DIR> [--out PATH] [--label LABEL]"
        );
    }
}

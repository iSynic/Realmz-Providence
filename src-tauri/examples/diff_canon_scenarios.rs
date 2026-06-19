use realmz_providence_lib::evidence::{
    diff_snapshots, diff_to_markdown, read_snapshot_file, write_json_file, write_text_file,
};
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
    if args.help || args.before.is_none() || args.after.is_none() {
        Args::print_help();
        return Ok(());
    }
    let before = read_snapshot_file(&args.before.unwrap())?;
    let after = read_snapshot_file(&args.after.unwrap())?;
    let diff = diff_snapshots(&before, &after)?;
    if let Some(output) = args.output {
        write_json_file(&output, &diff)?;
        eprintln!("Wrote {}", output.display());
    } else {
        println!(
            "{}",
            serde_json::to_string_pretty(&diff).map_err(|error| {
                realmz_providence_lib::error::ProvidenceError::message(format!(
                    "Failed to serialize diff: {error}"
                ))
            })?
        );
    }
    if let Some(markdown_output) = args.markdown_output {
        write_text_file(&markdown_output, &diff_to_markdown(&diff))?;
        eprintln!("Wrote {}", markdown_output.display());
    }
    Ok(())
}

#[derive(Debug, Default)]
struct Args {
    before: Option<PathBuf>,
    after: Option<PathBuf>,
    output: Option<PathBuf>,
    markdown_output: Option<PathBuf>,
    help: bool,
}

impl Args {
    fn parse() -> Self {
        let mut args = Args::default();
        let mut iter = env::args().skip(1);
        while let Some(arg) = iter.next() {
            match arg.as_str() {
                "--before" => args.before = iter.next().map(PathBuf::from),
                "--after" => args.after = iter.next().map(PathBuf::from),
                "--out" | "--output" => args.output = iter.next().map(PathBuf::from),
                "--markdown-out" => args.markdown_output = iter.next().map(PathBuf::from),
                "--help" | "-h" => args.help = true,
                value if args.before.is_none() => args.before = Some(PathBuf::from(value)),
                value if args.after.is_none() => args.after = Some(PathBuf::from(value)),
                other => eprintln!("Ignoring unknown argument: {other}"),
            }
        }
        args
    }

    fn print_help() {
        eprintln!(
            "Usage: cargo run --manifest-path src-tauri/Cargo.toml --example diff_canon_scenarios -- --before BEFORE.snapshot.json --after AFTER.snapshot.json [--out PATH] [--markdown-out PATH]"
        );
    }
}

#![forbid(unsafe_code)]

mod build;
mod corrections;
mod fixtures;
mod synthetic;
mod synthetic_atlas;

use providence_application_library::slim;

fn main() {
    if let Err(error) = run() {
        eprintln!("providence-application-library: {error}");
        std::process::exit(1);
    }
}

fn run() -> Result<(), String> {
    let args = std::env::args().skip(1).collect::<Vec<_>>();
    match args.first().map(String::as_str) {
        Some("build-identity") if args.len() == 1 => {
            println!(
                "{}",
                serde_json::to_string_pretty(&providence_core::build_identity::current(
                    "providence-application-library"
                ))
                .map_err(|error| error.to_string())?
            );
            Ok(())
        }
        Some("slim-scenarios") => slim::run(&args[1..]),
        Some("migrate-synthetic-fixture") => synthetic::run(&args[1..]),
        Some("build") => build::run(&args[1..]),
        _ => Err(build::usage()),
    }
}

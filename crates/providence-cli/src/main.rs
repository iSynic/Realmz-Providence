#![forbid(unsafe_code)]

use output::print_help;
use std::{env, process::ExitCode};

mod byte_inspection;
mod catalog_libraries;
mod cicn_inspection;
mod combat_inspection;
mod command_routes;
mod comparisons;
mod economy_inspection;
mod encounter_inspection;
mod extra_action_certification;
mod extra_code_certification;
mod foundation;
mod joined_dungeon;
mod monster_certification;
mod new_project_baseline;
mod output;
mod pict_inspection;
mod projects;
mod read_only_probe;
mod rebuilt_inspection;
mod rules_inspection;
mod scenario_inspection;
mod sound_inspection;
#[cfg(test)]
mod tests;
mod timed_certification;
mod world_inspection;

fn main() -> ExitCode {
    let mut arguments = env::args().skip(1);
    let command = arguments.next();
    match command.as_deref() {
        Some("--help") | Some("-h") | None => {
            print_help();
            ExitCode::SUCCESS
        }
        Some(command) => command_routes::dispatch(command, &mut arguments).unwrap_or_else(|| {
            eprintln!("unknown command: {command}");
            print_help();
            ExitCode::from(2)
        }),
    }
}

#![forbid(unsafe_code)]

use std::{
    env,
    path::Path,
    process::{Command, ExitCode, Stdio},
};

use providence_rebuilt_preview::{
    PreviewResult, PreviewTarget, headless_probe_arguments, interactive_host_arguments,
    prepare_request, read_request, read_result_for_request,
};
use serde_json::json;

const USAGE: &str = "usage: providence-rebuilt-preview prepare-action-point <package> <request> <result> <id> <map-id> <x> <y> <rng-seed> | prepare-simple-encounter <package> <request> <result> <id> <rng-seed> | prepare-complex-encounter <package> <request> <result> <id> <rng-seed> | prepare-thief-encounter <package> <request> <result> <id> <complex-encounter-id> <rng-seed> | prepare-extra-action-point-program <package> <request> <result> <id> <rng-seed> | prepare-map-location <package> <request> <result> <id> <map-id> <x> <y> <rng-seed> | prepare-scrolling-text <package> <request> <result> <id> <rng-seed> | prepare-battle <package> <request> <result> <id> <rng-seed> | prepare-treasure <package> <request> <result> <id> <rng-seed> | prepare-shop <package> <request> <result> <id> <rng-seed> | inspect-result <request> <result> | interactive-arguments <rebuilt-root> <request> | launch-interactive <godot> <rebuilt-root> <request> | launch-headless <godot> <rebuilt-root> <request>";

fn main() -> ExitCode {
    match run(env::args().skip(1).collect()) {
        Ok(value) => {
            println!("{}", serde_json::to_string(&value).expect("JSON output"));
            ExitCode::SUCCESS
        }
        Err(error) => {
            eprintln!("{error}");
            ExitCode::from(2)
        }
    }
}

fn run(arguments: Vec<String>) -> Result<serde_json::Value, String> {
    match arguments.first().map(String::as_str) {
        Some(command) if command.starts_with("prepare-") => prepare_command(&arguments),
        Some("inspect-result") if arguments.len() == 3 => {
            let request = read_request(Path::new(&arguments[1]))?;
            result_json(read_result_for_request(Path::new(&arguments[2]), &request)?)
        }
        Some("interactive-arguments") if arguments.len() == 3 => {
            read_request(Path::new(&arguments[2]))?;
            let launch =
                interactive_host_arguments(Path::new(&arguments[1]), Path::new(&arguments[2]))?;
            Ok(json!({"arguments": launch}))
        }
        Some("launch-interactive") if arguments.len() == 4 => {
            read_request(Path::new(&arguments[3]))?;
            let launch =
                interactive_host_arguments(Path::new(&arguments[2]), Path::new(&arguments[3]))?;
            let child = Command::new(&arguments[1])
                .args(launch)
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .spawn()
                .map_err(|error| format!("could not launch Rebuilt preview host: {error}"))?;
            Ok(json!({"status": "launched", "processId": child.id()}))
        }
        Some("launch-headless") if arguments.len() == 4 => {
            read_request(Path::new(&arguments[3]))?;
            let launch =
                headless_probe_arguments(Path::new(&arguments[2]), Path::new(&arguments[3]))?;
            let status = Command::new(&arguments[1])
                .args(launch)
                .status()
                .map_err(|error| format!("could not launch Rebuilt preview probe: {error}"))?;
            if !status.success() {
                return Err(format!(
                    "Rebuilt preview probe exited with code {}",
                    status
                        .code()
                        .map_or_else(|| "unknown".into(), |code| code.to_string())
                ));
            }
            Ok(json!({"status": "finished", "exitCode": status.code()}))
        }
        _ => Err(USAGE.into()),
    }
}

fn prepare_command(arguments: &[String]) -> Result<serde_json::Value, String> {
    let (target, seed_index) = match arguments.first().map(String::as_str) {
        Some("prepare-action-point") if arguments.len() == 9 => {
            (positioned_target(arguments, true)?, 8)
        }
        Some("prepare-map-location") if arguments.len() == 9 => {
            (positioned_target(arguments, false)?, 8)
        }
        Some("prepare-simple-encounter") if arguments.len() == 6 => (
            PreviewTarget::SimpleEncounter {
                id: parse(&arguments[4], "encounter id")?,
            },
            5,
        ),
        Some("prepare-scrolling-text") if arguments.len() == 6 => (
            PreviewTarget::ScrollingText {
                id: parse(&arguments[4], "TEXT resource id")?,
            },
            5,
        ),
        Some("prepare-thief-encounter") if arguments.len() == 7 => (
            PreviewTarget::ThiefEncounter {
                id: parse_native_id(&arguments[4], "thief encounter id")?,
                complex_encounter_id: parse_native_id(
                    &arguments[5],
                    "owning complex encounter id",
                )?,
            },
            6,
        ),
        Some(
            command @ ("prepare-complex-encounter"
            | "prepare-extra-action-point-program"
            | "prepare-battle"
            | "prepare-treasure"
            | "prepare-shop"),
        ) if arguments.len() == 6 => (native_record_target(command, &arguments[4])?, 5),
        _ => return Err(USAGE.into()),
    };
    let request = prepare_request(
        Path::new(&arguments[1]),
        Path::new(&arguments[2]),
        Path::new(&arguments[3]),
        target,
        parse(&arguments[seed_index], "rng seed")?,
    )?;
    serde_json::to_value(request).map_err(|error| error.to_string())
}

fn positioned_target(arguments: &[String], action_point: bool) -> Result<PreviewTarget, String> {
    let id = arguments[4].clone();
    let map_id = arguments[5].clone();
    let x = parse(&arguments[6], "x")?;
    let y = parse(&arguments[7], "y")?;
    Ok(if action_point {
        PreviewTarget::ActionPoint { id, map_id, x, y }
    } else {
        PreviewTarget::MapLocation { id, map_id, x, y }
    })
}

fn native_record_target(command: &str, value: &str) -> Result<PreviewTarget, String> {
    Ok(match command {
        "prepare-complex-encounter" => PreviewTarget::ComplexEncounter {
            id: parse_native_id(value, "complex encounter id")?,
        },
        "prepare-extra-action-point-program" => PreviewTarget::ExtraActionPointProgram {
            id: parse_native_id(value, "extra action point id")?,
        },
        "prepare-battle" => PreviewTarget::Battle {
            id: parse_native_id(value, "battle id")?,
        },
        "prepare-treasure" => PreviewTarget::Treasure {
            id: parse_native_id(value, "treasure id")?,
        },
        "prepare-shop" => PreviewTarget::Shop {
            id: parse_native_id(value, "shop id")?,
        },
        _ => return Err(USAGE.into()),
    })
}

fn parse<T: std::str::FromStr>(value: &str, label: &str) -> Result<T, String> {
    value
        .parse()
        .map_err(|_| format!("{label} must be an integer"))
}

fn parse_native_id(value: &str, label: &str) -> Result<u32, String> {
    value
        .parse()
        .map_err(|_| format!("{label} must be a nonnegative integer"))
}

fn result_json(result: PreviewResult) -> Result<serde_json::Value, String> {
    Ok(match result {
        PreviewResult::Ready {
            campaign_id,
            package_hash,
            target_kind,
            target_id,
            rng_seed,
            revision,
            pending_interaction_kind,
        } => json!({
            "status": "ready", "campaignId": campaign_id, "packageHash": package_hash, "targetKind": target_kind,
            "targetId": target_id, "rngSeed": rng_seed, "revision": revision, "pendingInteractionKind": pending_interaction_kind,
        }),
        PreviewResult::Failed {
            error_code,
            error_message,
            target_kind,
            target_id,
        } => json!({
            "status": "failed", "errorCode": error_code, "errorMessage": error_message, "targetKind": target_kind, "targetId": target_id,
        }),
    })
}

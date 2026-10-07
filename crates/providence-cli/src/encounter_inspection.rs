use crate::output::report_error;
use crate::output::{Inspection, finish_inspection, read_source};
use providence_core::codecs::decode_complex_encounters;
use providence_core::codecs::decode_extra_action_points;
use providence_core::codecs::decode_extra_codes;
use providence_core::codecs::decode_messages;
use providence_core::codecs::decode_rogue_encounters;
use providence_core::codecs::decode_simple_encounters;
use providence_core::codecs::decode_timed_encounters;
use providence_core::codecs::encode_complex_encounters;
use providence_core::codecs::encode_extra_action_points;
use providence_core::codecs::encode_extra_codes;
use providence_core::codecs::encode_messages;
use providence_core::codecs::encode_rogue_encounters;
use providence_core::codecs::encode_simple_encounters;
use providence_core::codecs::encode_timed_encounters;
use providence_core::model::ProjectSnapshot;
use providence_core::model::StableId;
use providence_core::rebuilt::project_rebuilt_v3_complex_encounters;
use providence_core::rebuilt::project_rebuilt_v3_rogue_encounters;
use providence_core::rebuilt::project_rebuilt_v3_simple_encounters;
use providence_core::rebuilt::project_rebuilt_v3_timed_encounters;
use serde_json::json;
use std::fs;
use std::process::ExitCode;

pub(crate) fn inspect_simple_catalog(encounter_path: &str, message_path: &str) -> ExitCode {
    let encounter_bytes = match fs::read(encounter_path) {
        Ok(bytes) => bytes,
        Err(error) => return report_error(format!("could not read Data ED: {error}")),
    };
    let message_bytes = match fs::read(message_path) {
        Ok(bytes) => bytes,
        Err(error) => return report_error(format!("could not read Data SD2: {error}")),
    };
    let encounters = decode_simple_encounters(&encounter_bytes);
    let messages = decode_messages(&message_bytes);
    let exact_encounters = encode_simple_encounters(&encounters.records, Some(&encounter_bytes))
        .is_ok_and(|encoded| encoded == encounter_bytes);
    let exact_messages = encode_messages(&messages.messages, Some(&message_bytes))
        .is_ok_and(|encoded| encoded == message_bytes);
    let encounter_trailing_bytes = encounters.trailing_bytes.len();
    let message_trailing_bytes = messages.trailing_bytes.len();
    let mut snapshot = ProjectSnapshot::new_authored(StableId("simple-catalog-probe".into()));
    snapshot.simple_encounters = encounters.records;
    snapshot.messages = messages.messages;
    match project_rebuilt_v3_simple_encounters(&snapshot) {
        Ok(projection) => {
            println!(
                "{}",
                serde_json::to_string_pretty(&json!({
                    "encounterPath": encounter_path,
                    "messagePath": message_path,
                    "encounterBytes": encounter_bytes.len(),
                    "messageBytes": message_bytes.len(),
                    "encounterTrailingBytes": encounter_trailing_bytes,
                    "messageTrailingBytes": message_trailing_bytes,
                    "messages": projection.messages.len(),
                    "simpleEncounters": projection.simple_encounters.len(),
                    "resultPrograms": projection.programs.len(),
                    "excludedNativeIds": projection.excluded_native_ids,
                    "exactEncounterRoundTrip": exact_encounters,
                    "exactMessageRoundTrip": exact_messages,
                    "projectionValid": true
                }))
                .expect("Simple Encounter catalog report serializes")
            );
            if exact_encounters && exact_messages {
                ExitCode::SUCCESS
            } else {
                ExitCode::FAILURE
            }
        }
        Err(error) => report_error(format!("Simple Encounter projection failed: {error}")),
    }
}

pub(crate) fn inspect_timed_catalog(timed_path: &str, macro_path: &str) -> ExitCode {
    let timed_bytes = match fs::read(timed_path) {
        Ok(bytes) => bytes,
        Err(error) => return report_error(format!("could not read Data TD3: {error}")),
    };
    let macro_bytes = match fs::read(macro_path) {
        Ok(bytes) => bytes,
        Err(error) => return report_error(format!("could not read Data ED3: {error}")),
    };
    let timed = decode_timed_encounters(&timed_bytes);
    let macros = decode_extra_action_points(&macro_bytes);
    let exact_timed = encode_timed_encounters(&timed.records, Some(&timed_bytes))
        .is_ok_and(|encoded| encoded == timed_bytes);
    let exact_macros = encode_extra_action_points(&macros.records, Some(&macro_bytes))
        .is_ok_and(|encoded| encoded == macro_bytes);
    let mut snapshot = ProjectSnapshot::new_authored(StableId("timed-catalog-probe".into()));
    snapshot.timed_encounters = timed.records;
    snapshot.extra_action_points = macros.records;
    match project_rebuilt_v3_timed_encounters(&snapshot) {
        Ok(projection) => {
            println!(
                "{}",
                serde_json::to_string_pretty(&json!({
                    "timedPath": timed_path,
                    "macroPath": macro_path,
                    "timedBytes": timed_bytes.len(),
                    "macroBytes": macro_bytes.len(),
                    "timedEncounters": projection.timed_encounters.len(),
                    "excludedNativeIds": projection.excluded_native_ids,
                    "exactTimedRoundTrip": exact_timed,
                    "exactMacroRoundTrip": exact_macros,
                    "projectionValid": true
                }))
                .expect("Timed Encounter catalog report serializes")
            );
            if exact_timed && exact_macros {
                ExitCode::SUCCESS
            } else {
                ExitCode::FAILURE
            }
        }
        Err(error) => report_error(format!("Timed Encounter projection failed: {error}")),
    }
}

pub(crate) fn inspect_rogue_catalog(path: &str) -> ExitCode {
    let bytes = match fs::read(path) {
        Ok(bytes) => bytes,
        Err(error) => return report_error(format!("could not read Data TD2: {error}")),
    };
    let decoded = decode_rogue_encounters(&bytes);
    let exact_round_trip = encode_rogue_encounters(&decoded.records, Some(&bytes))
        .is_ok_and(|encoded| encoded == bytes);
    let mut snapshot = ProjectSnapshot::new_authored(StableId("rogue-catalog-probe".into()));
    snapshot.rogue_encounters = decoded.records;
    match project_rebuilt_v3_rogue_encounters(&snapshot) {
        Ok(projection) => {
            println!(
                "{}",
                serde_json::to_string_pretty(&json!({
                    "path": path,
                    "bytes": bytes.len(),
                    "rogueEncounters": projection.len(),
                    "exactRoundTrip": exact_round_trip,
                    "projectionValid": true
                }))
                .expect("Rogue Encounter catalog report serializes")
            );
            if exact_round_trip {
                ExitCode::SUCCESS
            } else {
                ExitCode::FAILURE
            }
        }
        Err(error) => report_error(format!("Rogue Encounter projection failed: {error}")),
    }
}

pub(crate) fn inspect_complex_catalog(
    complex_path: &str,
    rogue_path: &str,
    extra_code_path: &str,
) -> ExitCode {
    finish_inspection(inspect_complex_catalog_report(
        complex_path,
        rogue_path,
        extra_code_path,
    ))
}

fn inspect_complex_catalog_report(
    complex_path: &str,
    rogue_path: &str,
    extra_code_path: &str,
) -> Result<Inspection, String> {
    let complex_bytes = read_source("Data ED2", complex_path)?;
    let rogue_bytes = read_source("Data TD2", rogue_path)?;
    let extra_code_bytes = read_source("Data EDCD", extra_code_path)?;
    let complex = decode_complex_encounters(&complex_bytes);
    let rogue = decode_rogue_encounters(&rogue_bytes);
    let extra_codes = decode_extra_codes(&extra_code_bytes);
    let exact_complex = encode_complex_encounters(&complex.records, Some(&complex_bytes))
        .is_ok_and(|encoded| encoded == complex_bytes);
    let exact_rogue = encode_rogue_encounters(&rogue.records, Some(&rogue_bytes))
        .is_ok_and(|encoded| encoded == rogue_bytes);
    let exact_extra_codes = encode_extra_codes(&extra_codes.rows, Some(&extra_code_bytes))
        .is_ok_and(|encoded| encoded == extra_code_bytes);
    let mut snapshot = ProjectSnapshot::new_authored(StableId("complex-catalog-probe".into()));
    snapshot.complex_encounters = complex.records;
    snapshot.rogue_encounters = rogue.records;
    snapshot.extra_codes = extra_codes.rows;

    let projection = project_rebuilt_v3_complex_encounters(&snapshot)
        .map_err(|error| format!("complex encounter projection failed: {error}"))?;
    Ok(Inspection {
        accepted: exact_complex && exact_rogue && exact_extra_codes,
        report: json!({
            "complexPath": complex_path,
            "roguePath": rogue_path,
            "extraCodePath": extra_code_path,
            "complexEncounters": projection.complex_encounters.len(),
            "resultPrograms": projection.programs.len(),
            "rogueDependencies": snapshot.rogue_encounters.len(),
            "extraCodeRows": snapshot.extra_codes.len(),
            "exactComplexRoundTrip": exact_complex,
            "exactRogueRoundTrip": exact_rogue,
            "exactExtraCodeRoundTrip": exact_extra_codes,
            "projectionValid": true
        }),
    })
}

use crate::output::report_error;
use crate::output::{Inspection, finish_inspection, read_source};
use providence_core::codecs::STANDARD_SPELL_BYTES;
use providence_core::codecs::decode_caste_rules;
use providence_core::codecs::decode_race_rules;
use providence_core::codecs::decode_rule_name_catalog;
use providence_core::codecs::decode_scenario_item_rules;
use providence_core::codecs::decode_standard_item_rules;
use providence_core::codecs::decode_standard_spells;
use providence_core::codecs::derive_caste_eligibility;
use providence_core::codecs::encode_caste_rules;
use providence_core::codecs::encode_race_rules;
use providence_core::codecs::encode_scenario_item_rules;
use providence_core::codecs::encode_standard_item_rules;
use providence_core::codecs::hydrate_standard_spell_names;
use providence_core::model::BlobId;
use providence_core::model::ProjectSnapshot;
use providence_core::model::StableId;
use providence_core::rebuilt::project_rebuilt_v3_rule_catalog;
use providence_core::rebuilt::project_rebuilt_v3_standard_spell_catalog;
use serde_json::json;
use std::fs;
use std::process::ExitCode;

pub(crate) fn inspect_standard_spells(path: &str, names_path: &str) -> ExitCode {
    let bytes = match fs::read(path) {
        Ok(bytes) => bytes,
        Err(error) => return report_error(format!("could not read Data S: {error}")),
    };
    let name_bytes = match fs::read(names_path) {
        Ok(bytes) => bytes,
        Err(error) => return report_error(format!("could not read Custom Names: {error}")),
    };
    if bytes.len() < STANDARD_SPELL_BYTES {
        return report_error(format!(
            "Data S requires at least {STANDARD_SPELL_BYTES} bytes; found {}",
            bytes.len()
        ));
    }
    let mut decoded = decode_standard_spells(&bytes, Some(BlobId("probe:data-s".into())));
    if let Err(error) = hydrate_standard_spell_names(
        &mut decoded.spells,
        &name_bytes,
        BlobId("probe:custom-names".into()),
    ) {
        return report_error(format!("standard spell names failed validation: {error}"));
    }
    let trailing_bytes = decoded.trailing_bytes.len();
    let mut snapshot = ProjectSnapshot::new_authored(StableId("standard-spell-probe".into()));
    snapshot.standard_spells = decoded.spells;
    match project_rebuilt_v3_standard_spell_catalog(&snapshot) {
        Ok(projection) => {
            println!(
                "{}",
                serde_json::to_string_pretty(&json!({
                    "dataPath": path,
                    "namesPath": names_path,
                    "dataBytes": bytes.len(),
                    "runtimePrefixBytes": STANDARD_SPELL_BYTES,
                    "trailingCompatibilityBytes": trailing_bytes,
                    "standardSpells": projection.len(),
                    "firstClassicId": projection.first().map(|spell| spell.classic_id),
                    "firstName": projection.first().map(|spell| spell.name.as_str()),
                    "magicDarts": projection.iter().find(|spell| spell.classic_id == 1108).map(|spell| spell.name.as_str()),
                    "blankFallback": projection.iter().find(|spell| spell.classic_id == 4610).map(|spell| spell.name.as_str()),
                    "lastClassicId": projection.last().map(|spell| spell.classic_id),
                    "nameFamilies": 28,
                    "projectionValid": true
                }))
                .expect("standard spell report serializes")
            );
            ExitCode::SUCCESS
        }
        Err(error) => report_error(format!("standard spell projection failed: {error}")),
    }
}

pub(crate) fn inspect_scenario_items(path: &str) -> ExitCode {
    let bytes = match fs::read(path) {
        Ok(bytes) => bytes,
        Err(error) => {
            eprintln!("could not read Data NI: {error}");
            return ExitCode::FAILURE;
        }
    };
    let placeholder = BlobId(format!("sha256:{}", "0".repeat(64)));
    let decoded = match decode_scenario_item_rules(&bytes, None, placeholder, None) {
        Ok(decoded) => decoded,
        Err(error) => {
            eprintln!("scenario item inspection failed: {error}");
            return ExitCode::FAILURE;
        }
    };
    let encoded = match encode_scenario_item_rules(&decoded.rules, &bytes) {
        Ok(encoded) => encoded,
        Err(error) => {
            eprintln!("scenario item re-encode failed: {error}");
            return ExitCode::FAILURE;
        }
    };
    println!(
        "{}",
        serde_json::to_string_pretty(&json!({
            "path": path,
            "bytes": bytes.len(),
            "definitions": decoded.rules.len(),
            "firstClassicId": decoded.rules.first().map(|rule| rule.definition.classic_id),
            "lastClassicId": decoded.rules.last().map(|rule| rule.definition.classic_id),
            "warnings": decoded.warnings,
            "exactRoundTrip": encoded == bytes,
        }))
        .expect("scenario item inspection serializes")
    );
    if decoded.rules.len() == 200 && encoded == bytes {
        ExitCode::SUCCESS
    } else {
        ExitCode::FAILURE
    }
}

pub(crate) fn inspect_standard_items(path: &str, text_path: &str) -> ExitCode {
    let bytes = match fs::read(path) {
        Ok(bytes) => bytes,
        Err(error) => {
            eprintln!("could not read Data ID: {error}");
            return ExitCode::FAILURE;
        }
    };
    let text_bytes = match fs::read(text_path) {
        Ok(bytes) => bytes,
        Err(error) => {
            eprintln!("could not read Data ID text resource: {error}");
            return ExitCode::FAILURE;
        }
    };
    let placeholder = || BlobId(format!("sha256:{}", "0".repeat(64)));
    let decoded =
        match decode_standard_item_rules(&bytes, &text_bytes, placeholder(), placeholder()) {
            Ok(decoded) => decoded,
            Err(error) => {
                eprintln!("standard item inspection failed: {error}");
                return ExitCode::FAILURE;
            }
        };
    let encoded = match encode_standard_item_rules(&decoded.rules, &bytes) {
        Ok(encoded) => encoded,
        Err(error) => {
            eprintln!("standard item re-encode failed: {error}");
            return ExitCode::FAILURE;
        }
    };
    println!(
        "{}",
        serde_json::to_string_pretty(&json!({
            "path": path,
            "textPath": text_path,
            "bytes": bytes.len(),
            "textBytes": text_bytes.len(),
            "definitions": decoded.rules.len(),
            "firstItem": decoded.rules.first().map(|rule| &rule.definition.name),
            "warnings": decoded.warnings,
            "exactRoundTrip": encoded == bytes,
        }))
        .expect("item inspection serializes")
    );
    if decoded.rules.len() == 799 && encoded == bytes {
        ExitCode::SUCCESS
    } else {
        ExitCode::FAILURE
    }
}

pub(crate) fn inspect_custom_names(path: &str) -> ExitCode {
    let bytes = match fs::read(path) {
        Ok(bytes) => bytes,
        Err(error) => {
            eprintln!("could not read Custom Names: {error}");
            return ExitCode::FAILURE;
        }
    };
    match decode_rule_name_catalog(
        &bytes,
        "Data Files/Custom Names.rsrc".into(),
        BlobId(format!("sha256:{}", "0".repeat(64))),
    ) {
        Ok(catalog) => {
            println!("{}", serde_json::to_string_pretty(&json!({
                "path": path,
                "bytes": bytes.len(),
                "raceResourceId": catalog.race_resource_id,
                "casteResourceId": catalog.caste_resource_id,
                "raceNames": catalog.race_names.len(),
                "casteNames": catalog.caste_names.len(),
                "populatedRaceNames": catalog.race_names.iter().filter(|name| !name.is_empty()).count(),
                "populatedCasteNames": catalog.caste_names.iter().filter(|name| !name.is_empty()).count(),
                "firstRace": catalog.race_names.first(),
                "firstCaste": catalog.caste_names.first(),
            })).expect("name inspection serializes"));
            ExitCode::SUCCESS
        }
        Err(error) => {
            eprintln!("Custom Names inspection failed: {error}");
            ExitCode::FAILURE
        }
    }
}

pub(crate) fn inspect_data_race(path: &str) -> ExitCode {
    let bytes = match fs::read(path) {
        Ok(bytes) => bytes,
        Err(error) => {
            eprintln!("could not read Data Race: {error}");
            return ExitCode::FAILURE;
        }
    };
    let decoded = decode_race_rules(&bytes, None);
    let encoded = match encode_race_rules(&decoded.rules, Some(&bytes)) {
        Ok(encoded) => encoded,
        Err(error) => {
            eprintln!("could not re-encode Data Race: {error}");
            return ExitCode::FAILURE;
        }
    };
    let report = json!({
        "path": path,
        "bytes": bytes.len(),
        "records": decoded.rules.len(),
        "trailingBytes": decoded.trailing_bytes.len(),
        "exactRoundTrip": encoded == bytes,
    });
    println!(
        "{}",
        serde_json::to_string_pretty(&report).expect("race inspection serializes")
    );
    if decoded.rules.len() == 30 && encoded == bytes {
        ExitCode::SUCCESS
    } else {
        ExitCode::FAILURE
    }
}

pub(crate) fn inspect_data_caste(path: &str) -> ExitCode {
    let bytes = match fs::read(path) {
        Ok(bytes) => bytes,
        Err(error) => {
            eprintln!("could not read Data Caste: {error}");
            return ExitCode::FAILURE;
        }
    };
    let decoded = decode_caste_rules(&bytes, None);
    let encoded = match encode_caste_rules(&decoded.rules, Some(&bytes)) {
        Ok(encoded) => encoded,
        Err(error) => {
            eprintln!("could not re-encode Data Caste: {error}");
            return ExitCode::FAILURE;
        }
    };
    let report = json!({
        "path": path,
        "bytes": bytes.len(),
        "records": decoded.rules.len(),
        "trailingBytes": decoded.trailing_bytes.len(),
        "exactRoundTrip": encoded == bytes,
    });
    println!(
        "{}",
        serde_json::to_string_pretty(&report).expect("caste inspection serializes")
    );
    if decoded.rules.len() == 30 && encoded == bytes {
        ExitCode::SUCCESS
    } else {
        ExitCode::FAILURE
    }
}

pub(crate) fn inspect_rule_catalog(
    race_path: &str,
    caste_path: &str,
    names_path: &str,
) -> ExitCode {
    finish_inspection(rule_catalog_report(race_path, caste_path, names_path))
}

fn rule_catalog_report(
    race_path: &str,
    caste_path: &str,
    names_path: &str,
) -> Result<Inspection, String> {
    let race_bytes = read_source("Data Race", race_path)?;
    let caste_bytes = read_source("Data Caste", caste_path)?;
    let names_bytes = read_source("Custom Names", names_path)?;
    let races = decode_race_rules(&race_bytes, None);
    let mut castes = decode_caste_rules(&caste_bytes, None);
    derive_caste_eligibility(&races.rules, &mut castes.rules)
        .map_err(|error| format!("could not derive rule eligibility: {error}"))?;
    let mut snapshot = ProjectSnapshot::new_authored(StableId("rule-catalog-probe".into()));
    snapshot.race_rules = races.rules;
    snapshot.caste_rules = castes.rules;
    snapshot.rule_names = Some(
        decode_rule_name_catalog(
            &names_bytes,
            "Data Files/Custom Names.rsrc".into(),
            BlobId(format!("sha256:{}", "0".repeat(64))),
        )
        .map_err(|error| format!("could not decode Custom Names: {error}"))?,
    );
    let catalog = project_rebuilt_v3_rule_catalog(&snapshot)
        .map_err(|error| format!("rule catalog projection failed: {error}"))?;
    Ok(Inspection {
        accepted: true,
        report: json!({
            "raceBytes": race_bytes.len(),
            "casteBytes": caste_bytes.len(),
            "races": catalog.races.len(),
            "castes": catalog.castes.len(),
            "firstRace": catalog.races.first().map(|rule| &rule.name),
            "firstCaste": catalog.castes.first().map(|rule| &rule.name),
            "projectionValid": true
        }),
    })
}

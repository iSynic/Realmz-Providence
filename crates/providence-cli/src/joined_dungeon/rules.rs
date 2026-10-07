use providence_core::codecs::SCENARIO_SPELL_BYTES;
use providence_core::codecs::STANDARD_SPELL_BYTES;
use providence_core::codecs::decode_scenario_item_rules;
use providence_core::codecs::decode_scenario_spells;
use providence_core::codecs::decode_standard_item_rules;
use providence_core::codecs::decode_standard_spells;
use providence_core::codecs::hydrate_scenario_spell_names;
use providence_core::codecs::hydrate_standard_spell_names;
use providence_core::model::BlobId;
use providence_core::model::ProjectSnapshot;
use sha2::Digest;
use sha2::Sha256;

use super::sources::{JoinedSources, ScenarioSources, SharedSources};
use providence_core::model::SourcedSpellDefinition;

pub(super) fn populate_items(
    snapshot: &mut ProjectSnapshot,
    sources: &JoinedSources,
) -> Result<(), String> {
    let ScenarioSources { data_ni, .. } = &sources.scenario;
    let SharedSources {
        standard_item_bytes,
        standard_item_text_bytes,
        ..
    } = &sources.shared;
    let data_ni_blob = BlobId(format!("sha256:{:x}", Sha256::digest(data_ni)));
    let scenario_items = match decode_scenario_item_rules(data_ni, None, data_ni_blob, None) {
        Ok(items) => items,
        Err(error) => return Err(error.to_string()),
    };
    let standard_item_blob = BlobId(format!("sha256:{:x}", Sha256::digest(standard_item_bytes)));
    let standard_item_text_blob = BlobId(format!(
        "sha256:{:x}",
        Sha256::digest(standard_item_text_bytes)
    ));
    let standard_items = match decode_standard_item_rules(
        standard_item_bytes,
        standard_item_text_bytes,
        standard_item_blob,
        standard_item_text_blob,
    ) {
        Ok(items) => items,
        Err(error) => return Err(error.to_string()),
    };

    snapshot.scenario_item_rules = scenario_items.rules;
    snapshot.item_rules = standard_items.rules;
    Ok(())
}

pub(super) fn decode_standard_spells_with_names(
    sources: &SharedSources,
) -> Result<Vec<SourcedSpellDefinition>, String> {
    let SharedSources {
        standard_spell_bytes,
        custom_names_bytes,
        ..
    } = sources;
    if standard_spell_bytes.len() < STANDARD_SPELL_BYTES {
        return Err(format!(
            "shared Data S requires at least {STANDARD_SPELL_BYTES} bytes; found {}",
            standard_spell_bytes.len()
        ));
    }
    let standard_spell_blob = BlobId(format!("sha256:{:x}", Sha256::digest(standard_spell_bytes)));
    let custom_names_blob = BlobId(format!("sha256:{:x}", Sha256::digest(custom_names_bytes)));
    let mut standard_spell_file =
        decode_standard_spells(standard_spell_bytes, Some(standard_spell_blob));
    if let Err(error) = hydrate_standard_spell_names(
        &mut standard_spell_file.spells,
        custom_names_bytes,
        custom_names_blob,
    ) {
        return Err(format!("standard spell names failed validation: {error}"));
    }

    Ok(standard_spell_file.spells)
}

pub(super) fn decode_scenario_spells_with_names(
    sources: &ScenarioSources,
) -> Result<(Vec<SourcedSpellDefinition>, Vec<String>), String> {
    let ScenarioSources {
        data_spell,
        data_spell_resources,
        ..
    } = sources;
    Ok(match data_spell.as_ref() {
        Some(bytes) => {
            if bytes.len() < SCENARIO_SPELL_BYTES {
                return Err(format!(
                    "Data Spell requires at least {SCENARIO_SPELL_BYTES} bytes when present; found {}",
                    bytes.len()
                ));
            }
            let source_blob = BlobId(format!("sha256:{:x}", Sha256::digest(bytes)));
            let mut decoded = decode_scenario_spells(bytes, Some(source_blob));
            let warnings = match data_spell_resources.as_ref() {
                Some(resource_bytes) => {
                    let resource_blob =
                        BlobId(format!("sha256:{:x}", Sha256::digest(resource_bytes)));
                    match hydrate_scenario_spell_names(
                        &mut decoded.spells,
                        resource_bytes,
                        resource_blob,
                    ) {
                        Ok(warnings) => warnings,
                        Err(error) => {
                            return Err(format!("scenario spell names failed validation: {error}"));
                        }
                    }
                }
                None => vec!["Data Spell is present without Data Spell.rsrc names".into()],
            };
            (decoded.spells, warnings)
        }
        None => (Vec::new(), Vec::new()),
    })
}

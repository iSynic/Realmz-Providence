use super::*;
use crate::{
    model::{ClassicRuleSelectionEvidence, ProjectSnapshot},
    rebuilt::{
        ResolvedClassicRules, canonical::canonical_json_bytes, project_rebuilt_rule_catalog,
        selected_classic_rule_sources,
    },
};
use sha2::{Digest, Sha256};

/// Binds the complete resolved catalog before either publication deduplication pass.
/// Object keys are canonical; array order and every serialized definition field remain significant.
pub fn project_rebuilt_v7_rule_selection(
    original: &ProjectSnapshot,
    selection: &ResolvedClassicRules,
) -> Result<NativeRuleSelectionFacts, String> {
    let context = original
        .classic_rule_selection
        .as_ref()
        .ok_or("selected rule facts require the original Classic selection context")?;
    context.validate_binding(original)?;
    if !matches!(
        context.evidence_origin,
        ClassicRuleSelectionEvidence::OwnerConfigured
    ) {
        return Err("captured native selection requires a verified runtime capture channel".into());
    }
    let sources = selected_classic_rule_sources(original)?;
    if context.identity() != selection.context_identity
        || sources != (selection.race_source, selection.caste_source)
        || original.project_id != selection.effective_snapshot.project_id
        || original.origin != selection.effective_snapshot.origin
        || original.classic_sources != selection.effective_snapshot.classic_sources
    {
        return Err("resolved Classic rules do not match the original selection binding".into());
    }
    let catalog = project_rebuilt_rule_catalog(&selection.effective_snapshot)
        .map_err(|error| error.to_string())?;
    Ok(NativeRuleSelectionFacts {
        native_menu_selection: context.native_menu_selection,
        captured_source_set_sha256: context.captured_source_set_sha256.clone(),
        race_source: source(sources.0)?,
        caste_source: source(sources.1)?,
        projected_rules: NativeProjectedRuleDigests {
            races: family_digests(
                original,
                "race",
                sources.0,
                crate::codecs::RACE_RECORD_BYTES,
                catalog.races.iter().map(|row| (row.classic_id, row)),
            )?,
            castes: family_digests(
                original,
                "caste",
                sources.1,
                crate::codecs::CASTE_RECORD_BYTES,
                catalog.castes.iter().map(|row| (row.classic_id, row)),
            )?,
        },
    })
}

fn source(value: &str) -> Result<NativeRuleSource, String> {
    match value {
        "scenario" => Ok(NativeRuleSource::Scenario),
        "application" => Ok(NativeRuleSource::Application),
        _ => Err("unknown selected Classic rule source".into()),
    }
}

fn family_digests<'a, T: Serialize + 'a>(
    original: &ProjectSnapshot,
    family: &str,
    source: &str,
    stride: usize,
    rows: impl Iterator<Item = (u8, &'a T)>,
) -> Result<Vec<NativeRuleRowDigest>, String> {
    let rows = rows.collect::<std::collections::BTreeMap<_, _>>();
    let path = if family == "race" {
        "Data Race"
    } else {
        "Data Caste"
    };
    let extent = original
        .classic_sources
        .iter()
        .find(|row| row.native_path == path)
        .map(|row| (row.byte_length / stride as u64).min(30) as u8);
    (1..=30)
        .map(|id| {
            let logical = format!("classic.{family}.{id}");
            if let Some(row) = rows.get(&id) {
                row_digest(&logical, row)
            } else if source == "scenario" && extent.is_some_and(|extent| id > extent) {
                Ok(NativeRuleRowDigest {
                    id: logical,
                    sha256: None,
                })
            } else {
                Err(format!("{path} complete selected row {id} is missing"))
            }
        })
        .collect()
}

fn row_digest(id: &str, row: &impl Serialize) -> Result<NativeRuleRowDigest, String> {
    let bytes = canonical_json_bytes(row).map_err(|error| error.to_string())?;
    Ok(NativeRuleRowDigest {
        id: id.into(),
        sha256: Some(format!("{:x}", Sha256::digest(bytes))),
    })
}

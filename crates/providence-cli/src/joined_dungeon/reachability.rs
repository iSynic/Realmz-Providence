use providence_core::model::ProjectSnapshot;
use providence_core::rebuilt::RebuiltV3ReachabilityRelation;
use providence_core::rebuilt::RebuiltV3ReachabilityTarget;
use providence_core::rebuilt::derive_rebuilt_v3_reachability;
use serde_json::json;
use sha2::Digest;
use sha2::Sha256;

use super::ProjectionCheck;
use providence_core::rebuilt::{
    RebuiltV3ReachabilityReport, RebuiltV3ReachableRuntimeError, RebuiltV3ReachableRuntimeSelection,
};

pub(super) fn reachability(snapshot: &ProjectSnapshot) -> ProjectionCheck {
    match derive_rebuilt_v3_reachability(snapshot) {
        Ok(report) => reachability_report(&report),
        Err(error) => ProjectionCheck {
            valid: false,
            report: json!({
                "valid": false, "programs": 0, "simpleEncounters": 0, "complexEncounters": 0,
                "battles": 0, "monsters": 0, "references": 0, "runtimeNoOps": 0,
                "sourceResolvedOpcodeNoOps": 0, "unresolved": [], "error": error.to_string(),
            }),
        },
    }
}

fn reachability_report(report: &RebuiltV3ReachabilityReport) -> ProjectionCheck {
    let runtime_noops = report
        .references
        .iter()
        .filter(|reference| reference.relation == RebuiltV3ReachabilityRelation::RuntimeNoOp)
        .count();
    let opcode_noops = report.references.iter().filter(|reference| {
        matches!(&reference.target, RebuiltV3ReachabilityTarget::RuntimeNoOp(label) if label.starts_with("opcode "))
    }).count();
    let valid = report.unresolved_references.is_empty();
    ProjectionCheck {
        valid,
        report: json!({
            "valid": valid,
            "programs": report.reachable_program_ids.len(),
            "simpleEncounters": report.reachable_simple_encounter_ids.len(),
            "complexEncounters": report.reachable_complex_encounter_ids.len(),
            "battles": report.reachable_battle_ids.len(),
            "monsters": report.reachable_monster_ids.len(),
            "references": report.references.len(),
            "runtimeNoOps": runtime_noops,
            "sourceResolvedOpcodeNoOps": opcode_noops,
            "unresolved": report.unresolved_references,
            "error": null,
        }),
    }
}

pub(super) fn runtime(
    snapshot: &ProjectSnapshot,
    runtime: &Result<RebuiltV3ReachableRuntimeSelection, RebuiltV3ReachableRuntimeError>,
) -> ProjectionCheck {
    match runtime {
        Ok(selection) => ProjectionCheck {
            valid: true,
            report: runtime_report(snapshot, selection),
        },
        Err(error) => ProjectionCheck {
            valid: false,
            report: failed_runtime_report(error.to_string()),
        },
    }
}

fn runtime_report(
    snapshot: &ProjectSnapshot,
    selection: &RebuiltV3ReachableRuntimeSelection,
) -> serde_json::Value {
    let bytes = serde_json::to_vec(selection).expect("runtime selection serializes");
    json!({
        "valid": true,
        "programs": selection.scenario.programs.len(),
        "simpleEncounters": selection.simple_encounters.len(),
        "complexEncounters": selection.complex_encounters.len(),
        "rogueEncounters": selection.rogue_encounters.len(),
        "messages": selection.messages.len(),
        "messageReferences": selection.message_references.len(),
        "timedEncounters": selection.timed_encounters.len(),
        "excludedTimedEncounters": selection.excluded_timed_encounter_ids.len(),
        "treasures": selection.treasures.len(),
        "shops": selection.shops.len(),
        "catalogReferences": selection.catalog_references.len(),
        "portableStandardItems": selection.item_spells.portable_standard_item_count,
        "portableStandardSpells": selection.item_spells.portable_standard_spell_count,
        "scenarioItems": selection.item_spells.reachable_scenario_item_ids.len(),
        "scenarioSpells": selection.item_spells.reachable_scenario_spell_ids.len(),
        "itemSpellReferences": selection.item_spells.references.len(),
        "textResources": selection.reachable_text_resource_ids.len(),
        "styleResources": selection.reachable_style_resource_ids.len(),
        "assets": selection.assets.assets.len(),
        "assetEvidence": runtime_asset_evidence(snapshot, selection),
        "sha256": format!("{:x}", Sha256::digest(&bytes)),
        "error": null,
        "packageOutputChanged": false,
    })
}

fn runtime_asset_evidence(
    snapshot: &ProjectSnapshot,
    selection: &RebuiltV3ReachableRuntimeSelection,
) -> Vec<serde_json::Value> {
    selection.assets.assets.iter().map(|asset| {
        let descriptor = snapshot.assets.iter().find(|candidate| candidate.identity == asset.id)
            .expect("selected asset retains its source descriptor");
        json!({
            "resourceType": asset.resource_type,
            "resourceId": asset.resource_id,
            "runtimeBytes": asset.bytes,
            "runtimeSha256": asset.sha256,
            "classicBytes": descriptor.classic_payload_byte_length,
            "classicSha256": descriptor.classic_payload_blob.as_ref().and_then(|blob| blob.0.strip_prefix("sha256:")),
        })
    }).collect()
}

fn failed_runtime_report(error: String) -> serde_json::Value {
    json!({
        "valid": false,
        "programs": 0,
        "simpleEncounters": 0,
        "complexEncounters": 0,
        "rogueEncounters": 0,
        "messages": 0,
        "messageReferences": 0,
        "timedEncounters": 0,
        "excludedTimedEncounters": 0,
        "treasures": 0,
        "shops": 0,
        "catalogReferences": 0,
        "portableStandardItems": 0,
        "portableStandardSpells": 0,
        "scenarioItems": 0,
        "scenarioSpells": 0,
        "itemSpellReferences": 0,
        "textResources": 0,
        "styleResources": 0,
        "assets": 0,
        "assetEvidence": [],
        "sha256": null,
        "error": error,
        "packageOutputChanged": false,
    })
}

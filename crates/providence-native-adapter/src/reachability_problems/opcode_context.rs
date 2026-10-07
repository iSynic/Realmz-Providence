use super::{
    actions::reachability_action_site, contracts::ReachabilityActionSite,
    navigation::reachability_document_kind,
};
use providence_core::{
    model::{ProjectSnapshot, StableId},
    references::{ByteProvenance, RepairAction},
};
use serde_json::{Value, json};
struct ContextRepair {
    field: String,
    runtime_field: String,
    byte_provenance: ByteProvenance,
    repair_actions: Vec<RepairAction>,
    repair: Option<Value>,
    repair_guidance: String,
}
pub(super) fn invalid_opcode_context_problem_projection(
    snapshot: &ProjectSnapshot,
    program: &StableId,
    local_slot: u8,
    result: i16,
) -> Option<Value> {
    let action = reachability_action_site(snapshot, program, local_slot)?;
    let invalid_result = program.0.starts_with("complex:");
    let ContextRepair {
        field,
        runtime_field,
        byte_provenance,
        repair_actions,
        repair,
        repair_guidance,
    } = context_repair(&action, local_slot, invalid_result);
    let message = if invalid_result {
        format!(
            "{} {} uses invalid Complex Encounter result {result}; expected 1 through 4.",
            action.source.0, field
        )
    } else {
        format!(
            "{} {} uses opcode 44 outside a Complex Encounter result; retargeting result {result} cannot repair the owner context.",
            action.source.0, field
        )
    };
    Some(json!({
        "id": format!("rebuilt-opcode-context|{}|{}|44", program.0, local_slot),
        "code": "rebuilt.opcode.invalid-context",
        "severity": "error",
        "message": message,
        "source": action.source,
        "field": field,
        "targetKind": "scenario-program-context",
        "targetId": "complex-encounter-result",
        "runtimeOpcode": 44,
        "runtimeResult": result,
        "runtimeSource": program,
        "runtimeField": runtime_field,
        "required": true,
        "repairActions": repair_actions,
        "byteProvenance": byte_provenance,
        "navigation": {
            "documentKind": reachability_document_kind(&action.source),
            "identity": action.source,
            "field": field,
        },
        "repair": repair,
        "repairGuidance": repair_guidance,
    }))
}
fn context_repair(
    action: &ReachabilityActionSite,
    local_slot: u8,
    invalid_result: bool,
) -> ContextRepair {
    if invalid_result {
        ContextRepair {
            field: format!("actions[{}].target", action.slot),
            runtime_field: format!("actions[{local_slot}].target"),
            byte_provenance: action.byte_provenance.clone(),
            repair_actions: vec![RepairAction::Retarget],
            repair: Some(json!({
                    "method": "action-reference.retarget",
                    "params": {"source": action.source, "slot": action.slot},
                    "targetParameter": "targetNativeId",
            })),
            repair_guidance: "Choose Complex Encounter result 1 through 4.".to_string(),
        }
    } else {
        ContextRepair {
            field: format!("actions[{}].opcode", action.slot),
            runtime_field: format!("actions[{local_slot}].opcode"),
            byte_provenance: action.opcode_byte_provenance.clone(),
            repair_actions: vec![RepairAction::EditSource],
            repair: Some(json!({
                    "method": "action.set-opcode",
                    "params": {"source": action.source, "slot": action.slot},
                    "targetParameter": "rawOpcode",
            })),
            repair_guidance: "Change opcode 44 to an opcode valid for this source action. Changing only its target does not repair the invalid owner context.".to_string(),
        }
    }
}

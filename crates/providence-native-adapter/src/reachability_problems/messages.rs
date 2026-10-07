use super::{
    actions::reachability_action_site,
    authoring::action_target_site,
    contracts::ReachabilityAuthoringSite,
    extra_code::message_extra_code_site,
    navigation::{
        reachability_action_slot, reachability_document_kind, reachability_repair_command,
    },
};
use providence_core::{
    model::ProjectSnapshot,
    rebuilt::RebuiltV3RuntimeMessageReference,
    references::{ReferenceDescriptor, RepairAction, TargetKind},
};
use serde_json::{Value, json};
pub(super) fn missing_runtime_message_problem_projection(
    snapshot: &ProjectSnapshot,
    references: &[ReferenceDescriptor],
    reference: &RebuiltV3RuntimeMessageReference,
) -> Value {
    let site = runtime_message_authoring_site(snapshot, references, reference);
    json!({
        "id": format!(
            "rebuilt-message|{}|{}|{}",
            reference.source.0, reference.field_path, reference.message_native_id
        ),
        "code": "rebuilt.message.missing-target",
        "severity": "error",
        "message": format!(
            "{} {} reaches missing message {}.",
            site.source.0, site.field, reference.message_native_id
        ),
        "source": site.source,
        "field": site.field,
        "targetKind": "message",
        "targetId": reference.message_native_id.to_string(),
        "rawNativeId": reference.raw_native_id,
        "runtimeOpcode": reference.runtime_opcode,
        "runtimeSource": reference.source,
        "runtimeField": reference.field_path,
        "required": true,
        "resolution": "missing",
        "repairActions": site.repair_actions,
        "byteProvenance": site.byte_provenance,
        "navigation": {
            "documentKind": reachability_document_kind(&site.source),
            "identity": site.source,
            "field": site.field,
        },
        "repair": site.repair,
    })
}
fn runtime_message_authoring_site(
    snapshot: &ProjectSnapshot,
    references: &[ReferenceDescriptor],
    reference: &RebuiltV3RuntimeMessageReference,
) -> ReachabilityAuthoringSite {
    if let Some(local_slot) = reachability_action_slot(&reference.field_path)
        && let Some(action) = reachability_action_site(snapshot, &reference.source, local_slot)
    {
        if let Some(site) = message_extra_code_site(&action, &reference.field_path) {
            return site;
        }
        if reference.field_path.ends_with(".targetNativeId") {
            return action_target_site(&action);
        }
    }

    if let Some(descriptor) = references.iter().find(|candidate| {
        candidate.source == reference.source
            && candidate.target_kind == TargetKind::Message
            && candidate.target_id == reference.message_native_id.to_string()
    }) {
        return ReachabilityAuthoringSite {
            source: descriptor.source.clone(),
            field: descriptor.field.0.clone(),
            byte_provenance: descriptor.byte_provenance.clone(),
            repair_actions: descriptor.repair_actions.clone(),
            repair: reachability_repair_command(&descriptor.source, &descriptor.field.0),
        };
    }

    ReachabilityAuthoringSite {
        source: reference.source.clone(),
        field: reference.field_path.clone(),
        byte_provenance: None,
        repair_actions: vec![RepairAction::Retarget, RepairAction::CreateTarget],
        repair: reachability_repair_command(&reference.source, &reference.field_path),
    }
}

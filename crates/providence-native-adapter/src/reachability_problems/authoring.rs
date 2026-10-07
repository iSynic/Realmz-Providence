use super::{
    actions::reachability_action_site,
    contracts::{ReachabilityActionSite, ReachabilityAuthoringSite},
    extra_code::{extra_code_site, inline_branch_site},
    navigation::{
        reachability_action_slot, reachability_range_provenance, reachability_repair_command,
    },
};
use providence_core::{
    codecs::ITEM_RECORD_BYTES,
    model::{ProjectSnapshot, StableId},
    rebuilt::{RebuiltV3ReachabilityReference, RebuiltV3ReachabilityTarget},
    references::{ByteProvenance, ReferenceDescriptor, RepairAction},
};
use serde_json::json;
pub(super) fn reachability_authoring_site(
    snapshot: &ProjectSnapshot,
    references: &[ReferenceDescriptor],
    reference: &RebuiltV3ReachabilityReference,
) -> ReachabilityAuthoringSite {
    if let Some(local_slot) = reachability_action_slot(&reference.field)
        && let Some(action) = reachability_action_site(snapshot, &reference.source, local_slot)
    {
        if reference.field.ends_with(".target") || reference.field.ends_with(".extraCode") {
            return action_target_site(&action);
        }
        if let Some(site) = inline_branch_site(&action, &reference.target) {
            return site;
        }
        if let Some(site) = extra_code_site(&action, &reference.field, &reference.target) {
            return site;
        }
    }

    if let Some(site) = door_item_site(snapshot, reference) {
        return site;
    }

    if let Some(descriptor) = references.iter().find(|candidate| {
        candidate.source == reference.source && candidate.field.0 == reference.field
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
        field: reference.field.clone(),
        byte_provenance: reachability_range_provenance(references, reference),
        repair_actions: vec![RepairAction::Retarget, RepairAction::CreateTarget],
        repair: reachability_repair_command(&reference.source, &reference.field),
    }
}
pub(super) fn action_target_site(action: &ReachabilityActionSite) -> ReachabilityAuthoringSite {
    ReachabilityAuthoringSite {
        source: action.source.clone(),
        field: format!("actions[{}].target", action.slot),
        byte_provenance: Some(action.byte_provenance.clone()),
        repair_actions: vec![RepairAction::Retarget, RepairAction::CreateTarget],
        repair: Some(json!({
            "method": "action-reference.retarget",
            "params": {"source": action.source, "slot": action.slot},
            "targetParameter": "targetNativeId",
        })),
    }
}
fn door_item_site(
    snapshot: &ProjectSnapshot,
    reference: &RebuiltV3ReachabilityReference,
) -> Option<ReachabilityAuthoringSite> {
    if reference.field == "special[4]"
        && let RebuiltV3ReachabilityTarget::Program(program) = &reference.target
        && let Some(native_id) = program
            .0
            .strip_prefix("xap:")
            .and_then(|value| value.parse::<u32>().ok())
        && let Some(byte_provenance) = door_item_provenance(snapshot, &reference.source)
    {
        return Some(ReachabilityAuthoringSite {
            source: reference.source.clone(),
            field: reference.field.clone(),
            byte_provenance: Some(byte_provenance),
            repair_actions: vec![RepairAction::CreateTarget],
            repair: Some(json!({
                "method": "extra-action-point.create",
                "params": {"nativeId": native_id},
            })),
        });
    }

    None
}
fn door_item_provenance(snapshot: &ProjectSnapshot, source: &StableId) -> Option<ByteProvenance> {
    const SPECIAL_FIVE_OFFSET: usize = 86 + 4 * 2;
    if let Some(rule) = snapshot
        .item_rules
        .iter()
        .find(|rule| &rule.definition.id == source)
    {
        let record_index = u32::try_from(rule.definition.classic_id).ok()?;
        let byte_start = record_index as usize * ITEM_RECORD_BYTES + SPECIAL_FIVE_OFFSET;
        return Some(ByteProvenance {
            native_path: "Data ID".into(),
            record_index,
            byte_start: byte_start as u32,
            byte_end: byte_start as u32 + 2,
        });
    }
    let rule = snapshot
        .scenario_item_rules
        .iter()
        .find(|rule| &rule.definition.id == source)?;
    let record_index = u32::from(rule.record_index);
    let byte_start = record_index as usize * ITEM_RECORD_BYTES + SPECIAL_FIVE_OFFSET;
    Some(ByteProvenance {
        native_path: "Data NI".into(),
        record_index,
        byte_start: byte_start as u32,
        byte_end: byte_start as u32 + 2,
    })
}

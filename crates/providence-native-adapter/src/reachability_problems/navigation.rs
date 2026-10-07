use providence_core::{
    model::StableId,
    rebuilt::{RebuiltV3ReachabilityReference, RebuiltV3ReachabilityTarget},
    references::{ByteProvenance, ReferenceDescriptor},
};
use serde_json::{Value, json};
pub(super) fn reachability_action_slot(field: &str) -> Option<u8> {
    field
        .strip_prefix("actions[")
        .and_then(|rest| rest.split_once(']'))
        .and_then(|(slot, _)| slot.parse().ok())
}

pub(super) fn reachability_result_program(source: &str, prefix: &str) -> Option<(u32, u8)> {
    let mut parts = source.strip_prefix(prefix)?.split(':');
    let id = parts.next()?.parse().ok()?;
    (parts.next()? == "result")
        .then(|| parts.next()?.parse().ok())
        .flatten()
        .map(|result| (id, result))
}

pub(super) fn reachability_target(target: &RebuiltV3ReachabilityTarget) -> (&'static str, String) {
    match target {
        RebuiltV3ReachabilityTarget::Program(id) => {
            id.0.strip_prefix("xap:")
                .map(|id| ("extra-action-point", id.into()))
                .unwrap_or_else(|| ("scenario-program", id.0.clone()))
        }
        RebuiltV3ReachabilityTarget::SimpleEncounter(id) => ("simple-encounter", id.to_string()),
        RebuiltV3ReachabilityTarget::ComplexEncounter(id) => ("complex-encounter", id.to_string()),
        RebuiltV3ReachabilityTarget::Battle(id) => ("battle", id.to_string()),
        RebuiltV3ReachabilityTarget::Monster(id) => ("monster", id.to_string()),
        RebuiltV3ReachabilityTarget::ExtraCode(id) => ("extra-code", id.to_string()),
        RebuiltV3ReachabilityTarget::RuntimeNoOp(value) => ("runtime-no-op", value.clone()),
        RebuiltV3ReachabilityTarget::Invalid(value) => ("unsafe-runtime-path", value.clone()),
    }
}

pub(super) fn reachability_repair_command(source: &StableId, field: &str) -> Option<Value> {
    if let Some(slot) = reachability_action_slot(field) {
        return Some(json!({
            "method": "action-reference.retarget",
            "params": {"source": source, "slot": slot},
            "targetParameter": "targetNativeId",
        }));
    }
    if source.0.starts_with("battle:") {
        return Some(json!({
            "method": "battle-reference.retarget",
            "params": {"source": source, "field": field},
            "targetParameter": "targetId",
        }));
    }
    if source.0.starts_with("monster:") {
        return Some(json!({
            "method": "monster-reference.retarget",
            "params": {"source": source, "field": field},
            "targetParameter": "targetId",
        }));
    }
    if source.0.starts_with("timed-encounter:") && field == "door" {
        return Some(json!({
            "method": "timed-encounter.reference.retarget",
            "params": {"source": source, "field": field},
            "targetParameter": "targetId",
        }));
    }
    if source.0.contains(":rect:") {
        if field == "battleRange" {
            return Some(json!({
                "method": "random-rectangle.battle-range.retarget",
                "params": {"source": source},
                "targetParameters": ["lowId", "highId"],
            }));
        }
        if let Some(slot) = field
            .strip_prefix("randomDoors[")
            .and_then(|value| value.strip_suffix(']'))
            .and_then(|value| value.parse::<u8>().ok())
        {
            return Some(json!({
                "method": "random-rectangle.reference.retarget",
                "params": {"source": source, "doorSlot": slot},
                "targetParameter": "targetNativeId",
            }));
        }
        if field.starts_with("battleRange[") {
            return Some(json!({
                "method": "random-rectangle.field.retarget",
                "params": {"source": source, "field": field},
                "targetParameter": "targetNativeId",
            }));
        }
    }
    None
}

pub(super) fn reachability_range_provenance(
    references: &[ReferenceDescriptor],
    reference: &RebuiltV3ReachabilityReference,
) -> Option<ByteProvenance> {
    let mut spans = references
        .iter()
        .filter(|candidate| {
            candidate.source == reference.source
                && reference.field == "battleRange"
                && candidate.field.0.starts_with("battleRange[")
        })
        .filter_map(|candidate| candidate.byte_provenance.as_ref());
    let first = spans.next()?.clone();
    Some(spans.fold(first, |mut range, span| {
        range.byte_start = range.byte_start.min(span.byte_start);
        range.byte_end = range.byte_end.max(span.byte_end);
        range
    }))
}

pub(super) fn reachability_document_kind(source: &StableId) -> &'static str {
    if source.0.starts_with("action-point:") {
        "action-point"
    } else if source.0.starts_with("extra-action-point:") {
        "extra-action-point"
    } else if source.0.starts_with("simple-encounter:") {
        "simple-encounter"
    } else if source.0.starts_with("complex-encounter:") {
        "complex-encounter"
    } else if source.0.starts_with("extra-code:") {
        "extra-code"
    } else if source.0.starts_with("battle:") {
        "battle"
    } else if source.0.starts_with("monster:") {
        "monster"
    } else if source.0.starts_with("timed-encounter:") {
        "timed-encounter"
    } else if source.0.starts_with("classic.item.") {
        "item"
    } else if source.0.contains(":rect:") {
        "random-rectangle"
    } else {
        "project-record"
    }
}

mod actions;
mod authoring;
mod catalog_items;
mod contracts;
mod extra_code;
mod messages;
mod navigation;
mod opcode_context;
use authoring::reachability_authoring_site;
use catalog_items::catalog_item_error_projection;
use messages::missing_runtime_message_problem_projection;
use navigation::{reachability_document_kind, reachability_target};
use opcode_context::invalid_opcode_context_problem_projection;
use providence_core::{
    model::ProjectSnapshot,
    rebuilt::{
        RebuiltV3ReachabilityReference, RebuiltV3ReachabilityTarget, RebuiltV3ReachableCombatError,
        RebuiltV3ReachableMessageError, RebuiltV3ReachableRuntimeError, RebuiltV3ScenarioError,
    },
    references::ReferenceDescriptor,
};
use serde_json::{Value, json};
pub(crate) fn reachability_problem_projection(
    snapshot: &ProjectSnapshot,
    references: &[ReferenceDescriptor],
    reference: &RebuiltV3ReachabilityReference,
) -> Value {
    let site = reachability_authoring_site(snapshot, references, reference);
    let (target_kind, target_id) = reachability_target(&reference.target);
    let target_json = serde_json::to_value(&reference.target).unwrap_or(Value::Null);
    let target_key = serde_json::to_string(&reference.target).unwrap_or_default();
    let code = if matches!(reference.target, RebuiltV3ReachabilityTarget::Invalid(_)) {
        "rebuilt.reachability.unsafe-path"
    } else {
        "rebuilt.reachability.missing-target"
    };
    let message = if code.ends_with("unsafe-path") {
        format!(
            "{} {} reaches an unsafe runtime path {}.",
            site.source.0, site.field, target_id
        )
    } else {
        format!(
            "{} {} reaches missing {} {}.",
            site.source.0, site.field, target_kind, target_id
        )
    };
    json!({
        "id": format!(
            "rebuilt-reachability|{}|{}|{}",
            reference.source.0, reference.field, target_key
        ),
        "code": code,
        "severity": "error",
        "message": message,
        "source": site.source,
        "field": site.field,
        "targetKind": target_kind,
        "targetId": target_id,
        "target": target_json,
        "runtimeSource": reference.source,
        "runtimeField": reference.field,
        "relation": reference.relation,
        "required": true,
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
pub(crate) fn runtime_selection_problem_projection(
    snapshot: &ProjectSnapshot,
    references: &[ReferenceDescriptor],
    error: &RebuiltV3ReachableRuntimeError,
) -> Option<Value> {
    match error {
        RebuiltV3ReachableRuntimeError::Message(
            RebuiltV3ReachableMessageError::MissingMessage(reference),
        ) => Some(missing_runtime_message_problem_projection(
            snapshot, references, reference,
        )),
        RebuiltV3ReachableRuntimeError::Scenario(
            RebuiltV3ScenarioError::InvalidEncounterResultOpcode {
                program,
                slot,
                result,
            },
        ) => invalid_opcode_context_problem_projection(snapshot, program, *slot, *result),
        RebuiltV3ReachableRuntimeError::Owner(error) => {
            catalog_item_error_projection(references, error)
        }
        _ => None,
    }
}
pub(crate) fn runtime_selection_problem_projections(
    snapshot: &ProjectSnapshot,
    references: &[ReferenceDescriptor],
    error: &RebuiltV3ReachableRuntimeError,
) -> Vec<Value> {
    if let RebuiltV3ReachableRuntimeError::Combat(
        RebuiltV3ReachableCombatError::UnresolvedReferences(unresolved),
    ) = error
    {
        return unresolved
            .iter()
            .map(|reference| reachability_problem_projection(snapshot, references, reference))
            .collect();
    }
    runtime_selection_problem_projection(snapshot, references, error)
        .into_iter()
        .collect()
}
#[cfg(test)]
mod tests;

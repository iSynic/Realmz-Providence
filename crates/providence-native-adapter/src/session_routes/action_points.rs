//! Native action points requests; decoding and bounded projections stay with this feature.

use crate::execute;
use crate::request_params::coerce_integral_numbers;
use crate::request_params::required_string;
use crate::request_params::required_u8;
use crate::request_params::required_u64;
use crate::request_params::required_value;
use providence_core::model::{ActionPoint, StableId};
use providence_core::session::ActionPointRecordDraft;
use providence_core::session::ActionStepEdit;
use providence_core::session::EditorCommand;
use providence_core::session::EditorSession;
use serde_json::Value;
use serde_json::json;

pub(super) fn dispatch(
    session: &mut EditorSession,
    method: &str,
    params: Value,
) -> Result<Value, String> {
    match method {
        "action-point.list" => super::action_point_catalog::list(session, params),
        "action-point.open" => action_point_open(session, params),
        "action-point.update" => action_point_update(session, params),
        "action-point.apply-draft" => action_point_apply_draft(session, params),
        "action-point.create" => action_point_create(session, params),
        "action-point.creation-review" => action_point_creation_review(session, params),
        "action-point.duplicate" => action_point_duplicate(session, params),
        "action-point.clear" => action_point_clear(session, params),
        "action-point.entry-marker" => action_point_entry_marker(session, params),
        "action-point.step.apply" => action_point_step_apply(session, params),
        "action-point.step.move" => action_point_step_move(session, params),
        "action-point.step.duplicate" => action_point_step_duplicate(session, params),
        "action-point.step.clear" => action_point_step_clear(session, params),
        _ => Err(format!("unknown method {method}")),
    }
}

fn action_point_apply_draft(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    let draft: ActionPointRecordDraft = serde_json::from_value(coerce_integral_numbers(
        required_value(&params, "draft")?.clone(),
    ))
    .map_err(|error| format!("invalid Action Point draft: {error}"))?;
    let source = draft.source.clone();
    execute_and_open(
        session,
        &params,
        EditorCommand::ApplyActionPointDraft { draft },
        source,
    )
}

fn action_point_open(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    let identity = StableId(required_string(&params, "identity")?);
    let row = session
        .snapshot()
        .world
        .action_points
        .iter()
        .find(|row| row.identity == identity)
        .ok_or_else(|| format!("Action Point {} was not found", identity.0))?;
    let map = session
        .snapshot()
        .world
        .maps
        .iter()
        .find(|map| map.level_type == row.level_type && map.native_index == row.level_index)
        .ok_or_else(|| format!("map for Action Point {} was not found", identity.0))?;
    let all_references = session.references();
    let references = all_references
        .iter()
        .filter(|reference| reference.source == identity)
        .cloned()
        .collect::<Vec<_>>();
    let used_by = action_point_used_by(session, row, all_references);
    let diagnostics = session
        .diagnostics()
        .into_iter()
        .filter(|diagnostic| diagnostic.entity.as_ref() == Some(&identity))
        .collect::<Vec<_>>();
    let steps = crate::session_routes::action_authoring::step_projections(session, &row.actions);
    let known_links = known_activation_links(session, &identity);
    Ok(json!({
        "revision": session.revision(),
        "map": {
            "identity": map.identity,
            "levelType": map.level_type,
            "nativeIndex": map.native_index,
            "name": map.name,
        },
        "actionPoint": action_point_document(row, descriptor(session, &row.identity), session.snapshot()),
        "references": references,
        "usedBy": used_by,
        "diagnostics": diagnostics,
        "steps": steps,
        "knownActivationLinks": known_links.iter().take(128).collect::<Vec<_>>(),
        "knownActivationLinksTotal": known_links.len(),
        "extraCodeAttachments": action_point_attachments(session, row),
    }))
}

fn known_activation_links<'a>(
    session: &'a EditorSession,
    identity: &StableId,
) -> Vec<&'a providence_core::discovery::DiscoveryLink> {
    use providence_core::discovery::RelationshipKind::{Call, StateChange};
    session
        .discovery()
        .incoming("action-point", &identity.0)
        .into_iter()
        .filter(|link| matches!(link.relationship, Call | StateChange))
        .collect()
}

fn action_point_used_by(
    session: &EditorSession,
    row: &ActionPoint,
    references: Vec<providence_core::references::ReferenceDescriptor>,
) -> Vec<providence_core::references::ReferenceDescriptor> {
    let map_sources = session
        .snapshot()
        .world
        .action_points
        .iter()
        .filter(|candidate| {
            candidate.level_type == row.level_type && candidate.level_index == row.level_index
        })
        .map(|candidate| candidate.identity.clone())
        .collect::<std::collections::BTreeSet<_>>();
    references
        .into_iter()
        .filter(|reference| {
            reference.target_kind == providence_core::references::TargetKind::ActionPoint
                && reference.target_id == row.record_index.to_string()
                && map_sources.contains(&reference.source)
        })
        .take(128)
        .collect()
}

fn action_point_update(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    let row: ActionPoint = serde_json::from_value(coerce_integral_numbers(
        required_value(&params, "actionPoint")?.clone(),
    ))
    .map_err(|error| format!("invalid Action Point: {error}"))?;
    execute(
        session,
        &params,
        EditorCommand::UpdateActionPoint {
            action_point: Box::new(row),
        },
    )
}

fn action_point_creation_review(session: &EditorSession, params: Value) -> Result<Value, String> {
    if required_u64(&params, "expectedRevision")? != session.revision().0 {
        return Err(
            "The project changed. Choose the map cell again before creating an Action Point."
                .into(),
        );
    }
    let map = StableId(required_string(&params, "mapIdentity")?);
    let coordinate = providence_core::model::MapCoordinate {
        x: required_u8(&params, "x")?,
        y: required_u8(&params, "y")?,
    };
    let row = session
        .action_point_creation_candidate(&map, coordinate)
        .map_err(|error| error.to_string())?;
    Ok(
        json!({"revision":session.revision(),"mapIdentity":map,"identity":row.identity,
        "recordIndex":row.record_index,"x":coordinate.x,"y":coordinate.y}),
    )
}

fn action_point_create(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    execute(
        session,
        &params,
        EditorCommand::CreateActionPoint {
            map: StableId(required_string(&params, "mapIdentity")?),
            coordinate: providence_core::model::MapCoordinate {
                x: required_u8(&params, "x")?,
                y: required_u8(&params, "y")?,
            },
        },
    )
}

fn action_point_duplicate(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    execute(
        session,
        &params,
        EditorCommand::DuplicateActionPoint {
            source: StableId(required_string(&params, "source")?),
            coordinate: providence_core::model::MapCoordinate {
                x: required_u8(&params, "x")?,
                y: required_u8(&params, "y")?,
            },
        },
    )
}

fn action_point_clear(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    execute(
        session,
        &params,
        EditorCommand::ClearActionPoint {
            source: StableId(required_string(&params, "source")?),
        },
    )
}

fn action_point_step_apply(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    let edit: ActionStepEdit = serde_json::from_value(coerce_integral_numbers(
        required_value(&params, "edit")?.clone(),
    ))
    .map_err(|error| format!("invalid Action Point step: {error}"))?;
    let source = edit.source.clone();
    execute_and_open(
        session,
        &params,
        EditorCommand::ApplyActionPointStep { edit },
        source,
    )
}

fn action_point_step_move(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    let source = StableId(required_string(&params, "source")?);
    execute_and_open(
        session,
        &params,
        EditorCommand::MoveActionPointStep {
            source: source.clone(),
            from_slot: required_u8(&params, "fromSlot")?,
            to_slot: required_u8(&params, "toSlot")?,
        },
        source,
    )
}

fn action_point_step_duplicate(
    session: &mut EditorSession,
    params: Value,
) -> Result<Value, String> {
    let source = StableId(required_string(&params, "source")?);
    execute_and_open(
        session,
        &params,
        EditorCommand::DuplicateActionPointStep {
            source: source.clone(),
            from_slot: required_u8(&params, "fromSlot")?,
            to_slot: required_u8(&params, "toSlot")?,
        },
        source,
    )
}

fn action_point_step_clear(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    let source = StableId(required_string(&params, "source")?);
    execute_and_open(
        session,
        &params,
        EditorCommand::ClearActionPointStep {
            source: source.clone(),
            slot: required_u8(&params, "slot")?,
        },
        source,
    )
}

fn execute_and_open(
    session: &mut EditorSession,
    params: &Value,
    command: EditorCommand,
    source: StableId,
) -> Result<Value, String> {
    let change = execute(session, params, command)?;
    let document = action_point_open(session, json!({ "identity": source.0 }))?;
    Ok(json!({ "change": change, "document": document }))
}

pub(super) fn descriptor<'a>(session: &'a EditorSession, source: &StableId) -> &'a str {
    session
        .snapshot()
        .script_descriptors
        .iter()
        .find(|item| item.source == *source)
        .map_or("", |item| item.text.as_str())
}

fn action_point_document(
    row: &ActionPoint,
    descriptor: &str,
    snapshot: &providence_core::model::ProjectSnapshot,
) -> Value {
    let mut value = serde_json::to_value(row).expect("Action Point serialization is infallible");
    value["descriptor"] = Value::String(descriptor.to_owned());
    value["activation"] = json!(providence_core::action_point_activation::project(
        snapshot, row
    ));
    value
}

fn action_point_entry_marker(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    let source = StableId(required_string(&params, "identity")?);
    let enabled = params
        .get("enabled")
        .and_then(Value::as_bool)
        .ok_or("enabled must be a boolean")?;
    let draft = session
        .action_point_entry_marker_draft(&source, enabled)
        .map_err(|error| error.to_string())?;
    execute_and_open(
        session,
        &params,
        EditorCommand::ApplyActionPointDraft { draft },
        source,
    )
}

fn action_point_attachments(session: &EditorSession, row: &ActionPoint) -> Vec<Value> {
    row.actions
        .iter()
        .filter(|action| action.opcode() == 92 && action.target_native_id >= 0)
        .map(|action| {
            let native_id = action.target_native_id as u32;
            let primary = session
                .snapshot()
                .extra_codes
                .iter()
                .find(|candidate| candidate.native_id.0 == native_id);
            let secondary = session
                .snapshot()
                .extra_codes
                .iter()
                .find(|candidate| candidate.native_id.0 == native_id + 1);
            json!({
                "slot": action.slot,
                "opcode": action.opcode(),
                "shape": "random-region-shape-mutation",
                "primary": primary,
                "secondary": secondary,
                "secondaryRequired": true,
            })
        })
        .collect::<Vec<_>>()
}

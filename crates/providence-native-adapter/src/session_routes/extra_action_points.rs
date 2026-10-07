//! Native extra action points requests; decoding and bounded projections stay with this feature.

use crate::execute;
use crate::request_params::coerce_integral_numbers;
use crate::request_params::required_string;
use crate::request_params::required_u8;
use crate::request_params::required_value;
use crate::session_routes::catalog_page::CatalogQuery;
use providence_core::model::ExtraActionPoint;
use providence_core::model::NativeRecordId;
use providence_core::model::StableId;
use providence_core::session::ActionStepEdit;
use providence_core::session::EditorCommand;
use providence_core::session::EditorSession;
use providence_core::session::ExtraActionPointRecordDraft;
use providence_core::validation::Severity;
use serde_json::Value;
use serde_json::json;

pub(super) fn dispatch(
    session: &mut EditorSession,
    method: &str,
    params: Value,
) -> Result<Value, String> {
    match method {
        "extra-action-point.list" => extra_action_point_list(session, params),
        "extra-action-point.open" => extra_action_point_open(session, params),
        "extra-action-point.update" => extra_action_point_update(session, params),
        "extra-action-point.apply-draft" => extra_action_point_apply_draft(session, params),
        "extra-action-point.create" => extra_action_point_create(session, params),
        "extra-action-point.duplicate" => extra_action_point_duplicate(session, params),
        "extra-action-point.delete" => extra_action_point_delete(session, params),
        "extra-action-point.step.apply" => extra_action_point_step_apply(session, params),
        "extra-action-point.step.move" => extra_action_point_step_move(session, params),
        "extra-action-point.step.duplicate" => extra_action_point_step_duplicate(session, params),
        "extra-action-point.step.clear" => extra_action_point_step_clear(session, params),
        _ => Err(format!("unknown method {method}")),
    }
}

fn extra_action_point_apply_draft(
    session: &mut EditorSession,
    params: Value,
) -> Result<Value, String> {
    let draft: ExtraActionPointRecordDraft = serde_json::from_value(coerce_integral_numbers(
        required_value(&params, "draft")?.clone(),
    ))
    .map_err(|error| format!("invalid Extra Action Point draft: {error}"))?;
    let source = draft.source.clone();
    execute_and_open(
        session,
        &params,
        EditorCommand::ApplyExtraActionPointDraft { draft },
        source,
    )
}

fn extra_action_point_list(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    let query = CatalogQuery::from_params(&params, 64);
    let diagnostics = session.diagnostics();
    let references = session.references();
    let all_items = session
        .snapshot()
        .extra_action_points
        .iter()
        .map(|row| {
            extra_action_catalog_row(
                row,
                descriptor(session, &row.identity),
                &diagnostics,
                &references,
            )
        })
        .collect::<Vec<_>>();
    let counts = json!({
        "all": all_items.len(),
        "macro": all_items.iter().filter(|item| item["macro"].as_bool() == Some(true)).count(),
        "battle": all_items.iter().filter(|item| item["battle"].as_bool() == Some(true)).count(),
        "monster": all_items.iter().filter(|item| item["monster"].as_bool() == Some(true)).count(),
        "noKnownCaller": all_items.iter().filter(|item| item["usedBy"].as_u64().unwrap_or(0) == 0).count(),
        "padding": all_items.iter().filter(|item| item["likelyPadding"].as_bool() == Some(true)).count(),
        "residue": all_items.iter().filter(|item| item["runtimeResidue"].as_bool() == Some(true)).count(),
        "authoredWithoutKnownCaller": all_items.iter().filter(|item| item["authoredWithoutKnownCaller"].as_bool() == Some(true)).count(),
        "trace": all_items.iter().filter(|item| item["needsTrace"].as_bool() == Some(true)).count(),
        "errors": all_items.iter().filter(|item| item["errors"].as_u64().unwrap_or(0) > 0).count(),
        "warnings": all_items.iter().filter(|item| item["warnings"].as_u64().unwrap_or(0) > 0).count(),
        "information": all_items.iter().filter(|item| item["information"].as_u64().unwrap_or(0) > 0).count(),
    });
    let filtered = all_items
        .into_iter()
        .filter(|item| extra_action_matches(item, &query))
        .collect::<Vec<_>>();
    let (items, offset, total) = query.page(filtered);
    Ok(json!({
        "items": items,
        "offset": offset,
        "limit": query.limit,
        "total": total,
        "counts": counts,
        "filter": query.filter,
        "search": query.search,
        "truncated": offset.saturating_add(query.limit) < total,
    }))
}

fn extra_action_catalog_row(
    row: &ExtraActionPoint,
    descriptor: &str,
    diagnostics: &[providence_core::validation::Diagnostic],
    references: &[providence_core::references::ReferenceDescriptor],
) -> Value {
    let related_diagnostics = diagnostics
        .iter()
        .filter(|diagnostic| diagnostic.entity.as_ref() == Some(&row.identity))
        .collect::<Vec<_>>();
    let problems = related_diagnostics.len();
    let error_count = related_diagnostics
        .iter()
        .filter(|diagnostic| diagnostic.severity == Severity::Error)
        .count();
    let warning_count = related_diagnostics
        .iter()
        .filter(|diagnostic| diagnostic.severity == Severity::Warning)
        .count();
    let information_count = related_diagnostics
        .iter()
        .filter(|diagnostic| diagnostic.severity == Severity::Information)
        .count();
    let used_by = references
        .iter()
        .filter(|reference| {
            reference.target_kind == providence_core::references::TargetKind::ExtraActionPoint
                && reference.target_id == row.native_id.0.to_string()
        })
        .count();
    let first_action = row.actions.first().and_then(|action| {
        providence_core::action_authoring::action_definition_for_opcode(action.raw_opcode)
    });
    let flags = extra_action_flags(row, used_by, problems);
    json!({
        "identity": row.identity,
        "nativeId": row.native_id,
        "descriptor": descriptor,
        "label": first_action.map_or_else(
            || format!("Extra Action Point {}", row.native_id.0),
            |action| format!("Extra Action Point {} · {}", row.native_id.0, action.label),
        ),
        "populatedActions": row.actions.len(),
        "usedBy": used_by,
        "problems": problems,
        "errors": error_count,
        "warnings": warning_count,
        "information": information_count,
        "reusable": extra_action_is_reusable(row),
        "macro": flags.macro_action,
        "battle": flags.battle_action,
        "monster": flags.monster_action,
        "likelyPadding": flags.likely_padding,
        "runtimeResidue": flags.runtime_residue,
        "authoredWithoutKnownCaller": flags.authored_without_known_caller,
        "needsTrace": flags.needs_trace,
    })
}

struct ExtraActionFlags {
    macro_action: bool,
    battle_action: bool,
    monster_action: bool,
    likely_padding: bool,
    runtime_residue: bool,
    authored_without_known_caller: bool,
    needs_trace: bool,
}

fn extra_action_flags(row: &ExtraActionPoint, used_by: usize, problems: usize) -> ExtraActionFlags {
    let has =
        |predicate: fn(i16) -> bool| row.actions.iter().any(|action| predicate(action.opcode()));
    let likely_padding = extra_action_is_reusable(row);
    ExtraActionFlags {
        macro_action: has(|opcode| opcode == 39),
        battle_action: has(|opcode| opcode == 2),
        monster_action: has(|opcode| matches!(opcode, 100 | 105 | 119..=127)),
        likely_padding,
        runtime_residue: row.actions.is_empty() && !likely_padding,
        authored_without_known_caller: !row.actions.is_empty() && used_by == 0,
        needs_trace: problems > 0 && !row.actions.is_empty(),
    }
}

fn extra_action_is_reusable(row: &ExtraActionPoint) -> bool {
    row.classic_door_id == 0
        && row.post_action_level == 0
        && row.post_action_x == 0
        && row.post_action_y == 0
        && row.chance_percent == 0
        && row.actions.is_empty()
}

fn extra_action_matches(item: &Value, query: &CatalogQuery) -> bool {
    let matches_filter = match query.filter.as_str() {
        "all" => true,
        "macro" => item["macro"].as_bool() == Some(true),
        "battle" => item["battle"].as_bool() == Some(true),
        "monster" => item["monster"].as_bool() == Some(true),
        "no-known-caller" => item["usedBy"].as_u64().unwrap_or(0) == 0,
        "padding" => item["likelyPadding"].as_bool() == Some(true),
        "residue" => item["runtimeResidue"].as_bool() == Some(true),
        "authored-without-known-caller" => {
            item["authoredWithoutKnownCaller"].as_bool() == Some(true)
        }
        "trace" => item["needsTrace"].as_bool() == Some(true),
        "errors" => item["errors"].as_u64().unwrap_or(0) > 0,
        "warnings" => item["warnings"].as_u64().unwrap_or(0) > 0,
        "information" => item["information"].as_u64().unwrap_or(0) > 0,
        _ => false,
    };
    matches_filter
        && (query.search.is_empty()
            || format!(
                "{} {}",
                item["nativeId"],
                item["label"].as_str().unwrap_or("")
            )
            .to_ascii_lowercase()
            .contains(&query.search))
}

fn extra_action_point_open(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    let identity = StableId(required_string(&params, "identity")?);
    let row = session
        .snapshot()
        .extra_action_points
        .iter()
        .find(|row| row.identity == identity)
        .ok_or_else(|| format!("Extra Action Point {} was not found", identity.0))?;
    let all_references = session.references();
    let references = all_references
        .iter()
        .filter(|reference| reference.source == identity)
        .cloned()
        .collect::<Vec<_>>();
    let used_by = all_references
        .into_iter()
        .filter(|reference| {
            reference.target_kind == providence_core::references::TargetKind::ExtraActionPoint
                && reference.target_id == row.native_id.0.to_string()
        })
        .take(128)
        .collect::<Vec<_>>();
    let diagnostics = session
        .diagnostics()
        .into_iter()
        .filter(|diagnostic| diagnostic.entity.as_ref() == Some(&identity))
        .collect::<Vec<_>>();
    let steps = crate::session_routes::action_authoring::step_projections(session, &row.actions);
    let attachments = extra_code_attachments(session, row);
    Ok(json!({
        "revision": session.revision(),
        "extraActionPoint": extra_action_point_document(row, descriptor(session, &row.identity)),
        "references": references,
        "usedBy": used_by,
        "diagnostics": diagnostics,
        "steps": steps,
        "extraCodeAttachments": attachments,
    }))
}

fn descriptor<'a>(session: &'a EditorSession, source: &StableId) -> &'a str {
    session
        .snapshot()
        .script_descriptors
        .iter()
        .find(|item| item.source == *source)
        .map_or("", |item| item.text.as_str())
}

fn extra_action_point_document(row: &ExtraActionPoint, descriptor: &str) -> Value {
    let mut value =
        serde_json::to_value(row).expect("Extra Action Point serialization is infallible");
    value["descriptor"] = Value::String(descriptor.to_owned());
    value
}

fn extra_code_attachments(session: &EditorSession, row: &ExtraActionPoint) -> Vec<Value> {
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
        .collect()
}

fn extra_action_point_update(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    let row: ExtraActionPoint = serde_json::from_value(coerce_integral_numbers(
        required_value(&params, "extraActionPoint")?.clone(),
    ))
    .map_err(|error| format!("invalid Extra Action Point: {error}"))?;
    execute(
        session,
        &params,
        EditorCommand::UpdateExtraActionPoint {
            extra_action_point: Box::new(row),
        },
    )
}

fn extra_action_point_create(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    let native_id = params
        .get("nativeId")
        .and_then(Value::as_u64)
        .map(|value| u32::try_from(value).map(NativeRecordId))
        .transpose()
        .map_err(|_| "nativeId is outside unsigned 32-bit range".to_owned())?;
    execute(
        session,
        &params,
        EditorCommand::CreateExtraActionPoint { native_id },
    )
}

fn extra_action_point_duplicate(
    session: &mut EditorSession,
    params: Value,
) -> Result<Value, String> {
    let source = StableId(required_string(&params, "source")?);
    let native_id = params
        .get("nativeId")
        .and_then(Value::as_u64)
        .map(|value| u32::try_from(value).map(NativeRecordId))
        .transpose()
        .map_err(|_| "nativeId is outside unsigned 32-bit range".to_owned())?;
    execute(
        session,
        &params,
        EditorCommand::DuplicateExtraActionPoint { source, native_id },
    )
}

fn extra_action_point_delete(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    let source = StableId(required_string(&params, "source")?);
    let used_by = session
        .references()
        .iter()
        .filter(|reference| {
            reference.target_kind == providence_core::references::TargetKind::ExtraActionPoint
                && reference.target_id == source.0.strip_prefix("extra-action-point:").unwrap_or("")
        })
        .count();
    if params.get("confirmed").and_then(Value::as_bool) != Some(true) {
        return Err(format!(
            "deleting {} requires confirmation; {used_by} existing use(s) will remain unresolved",
            source.0
        ));
    }
    execute(
        session,
        &params,
        EditorCommand::DeleteExtraActionPoint { source },
    )
}

fn extra_action_point_step_apply(
    session: &mut EditorSession,
    params: Value,
) -> Result<Value, String> {
    let edit: ActionStepEdit = serde_json::from_value(coerce_integral_numbers(
        required_value(&params, "edit")?.clone(),
    ))
    .map_err(|error| format!("invalid Extra Action Point step: {error}"))?;
    let source = edit.source.clone();
    execute_and_open(
        session,
        &params,
        EditorCommand::ApplyExtraActionPointStep { edit },
        source,
    )
}

fn extra_action_point_step_move(
    session: &mut EditorSession,
    params: Value,
) -> Result<Value, String> {
    let source = StableId(required_string(&params, "source")?);
    execute_and_open(
        session,
        &params,
        EditorCommand::MoveExtraActionPointStep {
            source: source.clone(),
            from_slot: required_u8(&params, "fromSlot")?,
            to_slot: required_u8(&params, "toSlot")?,
        },
        source,
    )
}

fn extra_action_point_step_duplicate(
    session: &mut EditorSession,
    params: Value,
) -> Result<Value, String> {
    let source = StableId(required_string(&params, "source")?);
    execute_and_open(
        session,
        &params,
        EditorCommand::DuplicateExtraActionPointStep {
            source: source.clone(),
            from_slot: required_u8(&params, "fromSlot")?,
            to_slot: required_u8(&params, "toSlot")?,
        },
        source,
    )
}

fn extra_action_point_step_clear(
    session: &mut EditorSession,
    params: Value,
) -> Result<Value, String> {
    let source = StableId(required_string(&params, "source")?);
    execute_and_open(
        session,
        &params,
        EditorCommand::ClearExtraActionPointStep {
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
    let document = extra_action_point_open(session, json!({ "identity": source.0 }))?;
    Ok(json!({ "change": change, "document": document }))
}

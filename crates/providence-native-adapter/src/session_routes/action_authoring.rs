//! Bounded semantic action catalog, target search, and selected-step projections.

use crate::request_params::{coerce_integral_numbers, required_value};
use providence_core::action_authoring::{
    ActionFormDescribeQuery, ActionTargetQuery, action_availability_reason,
    action_definition_for_opcode, action_semantic_coverage, catalog, decode_form_values,
    describe_action_form_with_application, form_definition, list_targets_with_application,
};
use providence_core::model::ClassicAction;
use providence_core::rebuilt::ApplicationMediaCatalog;
use providence_core::session::EditorSession;
use serde_json::{Value, json};
use std::collections::BTreeSet;

pub(super) fn dispatch(
    session: &mut EditorSession,
    method: &str,
    params: Value,
) -> Result<Value, String> {
    dispatch_with_application(session, None, method, params)
}

pub(crate) fn dispatch_with_application(
    session: &mut EditorSession,
    application: Option<&ApplicationMediaCatalog>,
    method: &str,
    params: Value,
) -> Result<Value, String> {
    match method {
        "action-definition.list" => list_definitions(params),
        "action-form.describe" => describe_form(session, application, params),
        "action-form.coverage" => semantic_coverage(session),
        "action-form.shared-impact" => shared_impact(session, params),
        "action-target.list" => list_action_targets(session, application, params),
        _ => Err(format!("unknown method {method}")),
    }
}

fn shared_impact(session: &EditorSession, params: Value) -> Result<Value, String> {
    let query = serde_json::from_value(coerce_integral_numbers(
        required_value(&params, "query")?.clone(),
    ))
    .map_err(|error| format!("invalid settings impact query: {error}"))?;
    let impact = session
        .action_settings_impact(query)
        .map_err(|error| error.to_string())?;
    serde_json::to_value(impact).map_err(|error| error.to_string())
}

fn describe_form(
    session: &EditorSession,
    application: Option<&ApplicationMediaCatalog>,
    params: Value,
) -> Result<Value, String> {
    let query: ActionFormDescribeQuery = serde_json::from_value(coerce_integral_numbers(
        required_value(&params, "query")?.clone(),
    ))
    .map_err(|error| format!("invalid action form query: {error}"))?;
    serde_json::to_value(describe_action_form_with_application(
        session.snapshot(),
        application,
        &query,
    )?)
    .map_err(|error| error.to_string())
}

fn semantic_coverage(session: &EditorSession) -> Result<Value, String> {
    serde_json::to_value(action_semantic_coverage(session.snapshot()))
        .map_err(|error| error.to_string())
}

fn list_definitions(params: Value) -> Result<Value, String> {
    let offset = params
        .get("cursor")
        .and_then(Value::as_str)
        .unwrap_or("0")
        .parse::<usize>()
        .map_err(|_| "action definition cursor is invalid".to_owned())?;
    let limit = params
        .get("limit")
        .and_then(Value::as_u64)
        .unwrap_or(64)
        .clamp(1, 128) as usize;
    let query = params
        .get("search")
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim()
        .to_ascii_lowercase();
    let category = params.get("category").and_then(Value::as_str).unwrap_or("");
    definition_page(offset, limit, &query, category)
}

fn definition_page(
    offset: usize,
    limit: usize,
    query: &str,
    category: &str,
) -> Result<Value, String> {
    let catalog = catalog();
    let filtered = catalog
        .actions
        .into_iter()
        .filter(|action| category.is_empty() || action.category.eq_ignore_ascii_case(category))
        .filter(|action| {
            query.is_empty()
                || format!(
                    "{} {} {} {} {}",
                    action.opcode,
                    action.identity,
                    action.label,
                    action.category,
                    action.description
                )
                .to_ascii_lowercase()
                .contains(query)
        })
        .collect::<Vec<_>>();
    let total = filtered.len();
    let items = filtered
        .into_iter()
        .skip(offset)
        .take(limit)
        .collect::<Vec<_>>();
    let wanted_forms = wanted_forms(&items);
    let items = items
        .iter()
        .map(definition_with_availability)
        .collect::<Result<Vec<_>, _>>()?;
    let forms = catalog
        .forms
        .into_iter()
        .filter(|form| wanted_forms.contains(&form.identity))
        .collect::<Vec<_>>();
    let next_cursor = offset
        .checked_add(items.len())
        .filter(|next| *next < total)
        .map(|next| next.to_string());
    Ok(json!({
        "items": items,
        "forms": forms,
        "total": total,
        "nextCursor": next_cursor,
        "documentedActionCount": 120,
        "settingsOpcodeCount": 70,
        "settingsLayoutCount": 61,
    }))
}

fn definition_with_availability(
    action: &providence_core::action_authoring::ActionDefinition,
) -> Result<Value, String> {
    let mut value = serde_json::to_value(action).map_err(|error| error.to_string())?;
    let availability = [
        "action-point",
        "extra-action-point",
        "simple-encounter",
        "complex-encounter",
    ]
    .into_iter()
    .map(|kind| {
        let reason = action_availability_reason(action.opcode, kind);
        (
            kind.to_owned(),
            json!({"available": reason.is_none(), "reason": reason}),
        )
    })
    .collect::<serde_json::Map<_, _>>();
    value["availabilityByScriptKind"] = Value::Object(availability);
    Ok(value)
}

fn wanted_forms(items: &[providence_core::action_authoring::ActionDefinition]) -> BTreeSet<String> {
    items
        .iter()
        .filter_map(|action| action.form_id.as_deref())
        .flat_map(|form| {
            let definition = form_definition(form);
            [
                Some(form.to_owned()),
                definition.and_then(|form| form.companion_form_id),
            ]
        })
        .flatten()
        .collect()
}

fn list_action_targets(
    session: &EditorSession,
    application: Option<&ApplicationMediaCatalog>,
    params: Value,
) -> Result<Value, String> {
    let query: ActionTargetQuery = serde_json::from_value(coerce_integral_numbers(
        required_value(&params, "query")?.clone(),
    ))
    .map_err(|error| format!("invalid action target query: {error}"))?;
    serde_json::to_value(list_targets_with_application(
        session.snapshot(),
        application,
        &query,
    )?)
    .map_err(|error| error.to_string())
}

pub(super) fn step_projections(session: &EditorSession, actions: &[ClassicAction]) -> Vec<Value> {
    let usages = providence_core::validation::action_settings::usages(session.snapshot());
    actions
        .iter()
        .map(|action| {
            let definition = action_definition_for_opcode(action.raw_opcode);
            let primary = definition
                .as_ref()
                .and_then(|definition| definition.form_id.as_deref())
                .and_then(|form_id| {
                    let native_id = u32::try_from(action.target_native_id).ok()?;
                    let row = unique_row(session, native_id)?;
                    Some(json!({
                        "nativeId": row.native_id,
                        "values": row.values,
                        "typedValues": decode_form_values(form_id, row.values),
                    }))
                });
            let secondary = definition
                .as_ref()
                .and_then(|definition| definition.form_id.as_deref())
                .and_then(form_definition)
                .and_then(|form| form.companion_form_id)
                .and_then(|companion| {
                    let native_id = u32::try_from(action.target_native_id)
                        .ok()?
                        .checked_add(1)?;
                    let row = unique_row(session, native_id)?;
                    Some(json!({
                        "nativeId": row.native_id,
                        "values": row.values,
                        "typedValues": decode_form_values(&companion, row.values),
                        "formId": companion,
                    }))
                });
            let form_id = definition
                .as_ref()
                .and_then(|action| action.form_id.as_deref());
            let (primary_usage, secondary_usage) =
                step_settings_usage(&usages, form_id, action.target_native_id);
            json!({
                "slot": action.slot,
                "rawOpcode": action.raw_opcode,
                "opcode": action.opcode(),
                "targetNativeId": action.target_native_id,
                "definition": definition,
                "primarySettings": primary,
                "secondarySettings": secondary,
                "primaryUsage": primary_usage,
                "secondaryUsage": secondary_usage,
            })
        })
        .collect()
}

fn step_settings_usage(
    usages: &[providence_core::validation::action_settings::RowUsage],
    form_id: Option<&str>,
    target: i16,
) -> (Option<Value>, Option<Value>) {
    let Some(form) = form_id.and_then(form_definition) else {
        return (None, None);
    };
    let Ok(native_id) = u32::try_from(target) else {
        return (None, None);
    };
    let primary = usage_projection(usages, native_id);
    let secondary = form
        .companion_form_id
        .and_then(|_| native_id.checked_add(1))
        .and_then(|id| usage_projection(usages, id));
    (primary, secondary)
}

fn usage_projection(
    usages: &[providence_core::validation::action_settings::RowUsage],
    native_id: u32,
) -> Option<Value> {
    let usage = usages
        .iter()
        .find(|usage| usage.row_id == i64::from(native_id))?;
    let status = match usage.status {
        providence_core::validation::action_settings::UsageStatus::InUse => "in-use",
        providence_core::validation::action_settings::UsageStatus::Shared => "shared",
        providence_core::validation::action_settings::UsageStatus::Unused => "unused",
        providence_core::validation::action_settings::UsageStatus::Missing => "missing",
    };
    Some(json!({"status": status, "callerCount": usage.callers.len()}))
}

fn unique_row(
    session: &EditorSession,
    native_id: u32,
) -> Option<&providence_core::model::ExtraCodeRow> {
    let mut rows = session
        .snapshot()
        .extra_codes
        .iter()
        .filter(|row| row.native_id.0 == native_id);
    let row = rows.next()?;
    rows.next().is_none().then_some(row)
}

//! Native rules requests; decoding and bounded projections stay with this feature.

use crate::execute;
use crate::request_params::required_string;
use crate::request_params::required_value;
use providence_core::model::SourcedCasteRule;
use providence_core::model::SourcedRaceRule;
use providence_core::model::StableId;
use providence_core::references::TargetKind;
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
        "race-rule.list" => race_rule_list(session, params),
        "race-rule.open" => race_rule_open(session, params),
        "caste-rule.list" => caste_rule_list(session, params),
        "caste-rule.open" => caste_rule_open(session, params),
        "rule-names.get" => {
            serde_json::to_value(&session.snapshot().rule_names).map_err(|error| error.to_string())
        }
        "race-rule.upsert" => race_rule_upsert(session, params),
        "caste-rule.upsert" => caste_rule_upsert(session, params),
        _ => Err(format!("unknown method {method}")),
    }
}

fn race_rule_list(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    let offset = params.get("offset").and_then(Value::as_u64).unwrap_or(0) as usize;
    let limit = params
        .get("limit")
        .and_then(Value::as_u64)
        .unwrap_or(30)
        .clamp(1, 128) as usize;
    let total = session.snapshot().race_rules.len();
    let references = session.references();
    let diagnostics = session.diagnostics();
    let items = session
        .snapshot()
        .race_rules
        .iter()
        .skip(offset)
        .take(limit)
        .map(|rule| {
            let definition = &rule.definition;
            let display_name = session
                .snapshot()
                .rule_names
                .as_ref()
                .and_then(|catalog| {
                    catalog
                        .race_names
                        .get(usize::from(definition.classic_id.saturating_sub(1)))
                })
                .filter(|name| !name.trim().is_empty())
                .unwrap_or(&definition.name);
            json!({
                "identity": definition.id,
                "classicId": definition.classic_id,
                "authorId": providence_core::rule_presentation::author_number(definition.classic_id),
                "name": display_name,
                "displayName": providence_core::rule_presentation::record_label(providence_core::session::rule_authoring::RuleKind::Race, definition.classic_id, display_name),
                "eligibleCastes": definition.eligible_caste_ids.len(),
                "baseMovement": definition.base_movement,
                "maximumAge": definition.maximum_age,
                "usedBy": references.iter().filter(|reference| {
                    reference.target_kind == TargetKind::Race
                        && reference.target_id == definition.id.0
                }).count(),
                "problems": diagnostics.iter().filter(|diagnostic| {
                    diagnostic.entity.as_ref() == Some(&definition.id)
                }).count(),
            })
        })
        .collect::<Vec<_>>();
    Ok(json!({
        "revision": session.revision(),
        "items": items,
        "offset": offset,
        "limit": limit,
        "total": total,
        "truncated": offset.saturating_add(limit) < total,
    }))
}

fn race_rule_open(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    let identity = StableId(required_string(&params, "identity")?);
    let rule = session
        .snapshot()
        .race_rules
        .iter()
        .find(|rule| rule.definition.id == identity)
        .ok_or_else(|| format!("race rule {} was not found", identity.0))?;
    let references = session.references();
    let outgoing = references
        .iter()
        .filter(|reference| reference.source == identity)
        .cloned()
        .collect::<Vec<_>>();
    let used_by = references
        .into_iter()
        .filter(|reference| {
            reference.target_kind == TargetKind::Race && reference.target_id == identity.0
        })
        .collect::<Vec<_>>();
    let diagnostics = session
        .diagnostics()
        .into_iter()
        .filter(|diagnostic| diagnostic.entity.as_ref() == Some(&identity))
        .collect::<Vec<_>>();
    Ok(json!({
        "revision": session.revision(),
        "rule": rule.definition,
        "source": {
            "nativePath": rule.source,
            "retained": rule.source_blob.is_some(),
        },
        "references": outgoing,
        "usedBy": used_by,
        "diagnostics": diagnostics,
    }))
}

fn caste_rule_list(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    let offset = params.get("offset").and_then(Value::as_u64).unwrap_or(0) as usize;
    let limit = params
        .get("limit")
        .and_then(Value::as_u64)
        .unwrap_or(30)
        .clamp(1, 128) as usize;
    let total = session.snapshot().caste_rules.len();
    let references = session.references();
    let diagnostics = session.diagnostics();
    let items = session
        .snapshot()
        .caste_rules
        .iter()
        .skip(offset)
        .take(limit)
        .map(|rule| {
            let definition = &rule.definition;
            let display_name = session
                .snapshot()
                .rule_names
                .as_ref()
                .and_then(|catalog| {
                    catalog
                        .caste_names
                        .get(usize::from(definition.classic_id.saturating_sub(1)))
                })
                .filter(|name| !name.trim().is_empty())
                .unwrap_or(&definition.name);
            json!({
                "identity": definition.id,
                "classicId": definition.classic_id,
                "authorId": providence_core::rule_presentation::author_number(definition.classic_id),
                "name": display_name,
                "displayName": providence_core::rule_presentation::record_label(providence_core::session::rule_authoring::RuleKind::Caste, definition.classic_id, display_name),
                "eligibleRaces": definition.eligible_race_ids.len(),
                "startingItems": definition.starting_item_ids.len(),
                "casteClass": definition.caste_class,
                "movementBonus": definition.movement_bonus,
                "usedBy": references.iter().filter(|reference| {
                    reference.target_kind == TargetKind::Caste
                        && reference.target_id == definition.id.0
                }).count(),
                "problems": diagnostics.iter().filter(|diagnostic| {
                    diagnostic.entity.as_ref() == Some(&definition.id)
                }).count(),
            })
        })
        .collect::<Vec<_>>();
    Ok(json!({
        "revision": session.revision(),
        "items": items,
        "offset": offset,
        "limit": limit,
        "total": total,
        "truncated": offset.saturating_add(limit) < total,
    }))
}

fn caste_rule_open(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    let identity = StableId(required_string(&params, "identity")?);
    let rule = session
        .snapshot()
        .caste_rules
        .iter()
        .find(|rule| rule.definition.id == identity)
        .ok_or_else(|| format!("caste rule {} was not found", identity.0))?;
    let references = session.references();
    let outgoing = references
        .iter()
        .filter(|reference| reference.source == identity)
        .cloned()
        .collect::<Vec<_>>();
    let used_by = references
        .into_iter()
        .filter(|reference| {
            reference.target_kind == TargetKind::Caste && reference.target_id == identity.0
        })
        .collect::<Vec<_>>();
    let diagnostics = session
        .diagnostics()
        .into_iter()
        .filter(|diagnostic| diagnostic.entity.as_ref() == Some(&identity))
        .collect::<Vec<_>>();
    Ok(json!({
        "revision": session.revision(),
        "rule": rule.definition,
        "source": {
            "nativePath": rule.source,
            "retained": rule.source_blob.is_some(),
        },
        "references": outgoing,
        "usedBy": used_by,
        "diagnostics": diagnostics,
    }))
}

fn race_rule_upsert(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    let rule = required_value(&params, "rule")?;
    let rule: SourcedRaceRule = serde_json::from_value(rule.clone())
        .map_err(|error| format!("invalid race rule: {error}"))?;
    execute(
        session,
        &params,
        EditorCommand::UpsertRaceRule {
            rule: Box::new(rule),
        },
    )
}

fn caste_rule_upsert(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    let rule = required_value(&params, "rule")?;
    let rule: SourcedCasteRule = serde_json::from_value(rule.clone())
        .map_err(|error| format!("invalid caste rule: {error}"))?;
    execute(
        session,
        &params,
        EditorCommand::UpsertCasteRule {
            rule: Box::new(rule),
        },
    )
}

//! Native story labels requests; decoding and bounded projections stay with this feature.

use crate::execute;
use crate::request_params::coerce_integral_numbers;
use crate::request_params::required_u32;
use crate::request_params::required_value;
use providence_core::model::OptionLabelRecord;
use providence_core::model::QuestLabel;
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
        "option-label.list" => option_label_list(session, params),
        "option-label.open" => option_label_open(session, params),
        "option-label.update" => option_label_update(session, params),
        "option-label.create" => execute(session, &params, EditorCommand::CreateOptionLabel),
        "option-label.duplicate" => option_label_duplicate(session, params),
        "quest.list" => quest_list(session, params),
        "quest.open" => quest_open(session, params),
        "quest-label.upsert" => quest_label_upsert(session, params),
        "quest-label.delete" => quest_label_delete(session, params),
        _ => Err(format!("unknown method {method}")),
    }
}

fn option_label_list(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    let offset = params.get("offset").and_then(Value::as_u64).unwrap_or(0) as usize;
    let limit = params
        .get("limit")
        .and_then(Value::as_u64)
        .unwrap_or(64)
        .clamp(1, 128) as usize;
    let query = params
        .get("query")
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim()
        .to_lowercase();
    let matches = session
        .snapshot()
        .option_labels
        .iter()
        .filter(|label| {
            query.is_empty()
                || label.native_id.0.to_string().contains(&query)
                || label.text.to_lowercase().contains(&query)
        })
        .collect::<Vec<_>>();
    let total = matches.len();
    let offset = if total == 0 {
        0
    } else {
        offset.min((total - 1) / limit * limit)
    };
    let items = matches.into_iter().skip(offset).take(limit).map(|label| json!({"identity":label.identity,"nativeId":label.native_id,"text":label.text,"authored":label.authored})).collect::<Vec<_>>();
    Ok(
        json!({"revision":session.revision(),"items":items,"offset":offset,"limit":limit,"total":total,"truncated":offset + limit < total,
        "optionLabelsPresent":providence_core::text_authoring::option_labels_present(session.snapshot())}),
    )
}

fn option_label_open(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    let native_id = required_u32(&params, "nativeId")?;
    let label = session
        .snapshot()
        .option_labels
        .iter()
        .find(|label| label.native_id.0 == native_id)
        .ok_or_else(|| format!("option label {native_id} was not found"))?;
    let uses = session
        .references()
        .into_iter()
        .filter(|reference| {
            reference.target_kind == TargetKind::OptionLabel
                && reference.target_id == native_id.to_string()
        })
        .collect::<Vec<_>>();
    let diagnostics = session
        .diagnostics()
        .into_iter()
        .filter(|diagnostic| diagnostic.entity.as_ref() == Some(&label.identity))
        .collect::<Vec<_>>();
    Ok(
        json!({"revision": session.revision(), "optionLabel": label, "index":session.snapshot().option_labels.iter().position(|row| row.identity == label.identity), "usedBy": uses.iter().take(128).collect::<Vec<_>>(), "usedByTotal":uses.len(), "usedByTruncated":uses.len()>128, "diagnostics": diagnostics, "feedback":providence_core::codecs::inspect_classic_text(&label.text, Some(24))}),
    )
}

fn option_label_update(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    let label: OptionLabelRecord = serde_json::from_value(coerce_integral_numbers(
        required_value(&params, "optionLabel")?.clone(),
    ))
    .map_err(|error| format!("invalid option-label record: {error}"))?;
    execute(session, &params, EditorCommand::UpdateOptionLabel { label })
}

fn option_label_duplicate(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    let native_id = required_u32(&params, "nativeId")?;
    execute(
        session,
        &params,
        EditorCommand::DuplicateOptionLabel {
            source: providence_core::model::StableId(format!("option-label:{native_id}")),
        },
    )
}

fn quest_list(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    let offset = params.get("offset").and_then(Value::as_u64).unwrap_or(0) as usize;
    let limit = params
        .get("limit")
        .and_then(Value::as_u64)
        .unwrap_or(64)
        .clamp(1, 126) as usize;
    let references = session.references();
    let items = (providence_core::model::CLASSIC_QUEST_FLAG_MIN
        ..=providence_core::model::CLASSIC_QUEST_FLAG_MAX)
        .skip(offset)
        .take(limit)
        .map(|id| {
            let label = session
                .snapshot()
                .quest_labels
                .iter()
                .find(|label| label.id == id);
            let used_by = references
                .iter()
                .filter(|reference| {
                    reference.target_kind == TargetKind::QuestFlag
                        && reference.target_id == id.to_string()
                })
                .count();
            let flow: Vec<_> = session.discovery().quests.iter().filter(|r| r.quest_id == i16::from(id)).collect();
            json!({
                "identity": format!("quest:{id}"),
                "id": id,
                "label": label.map(|label| label.label.clone()).unwrap_or_else(|| format!("Quest {id}")),
                "note": label.map(|label| label.note.clone()).unwrap_or_default(),
                "authored": label.is_some(),
                "usedBy": used_by,
                "checks": flow.iter().filter(|r| r.checks).count(),
                "changes": flow.iter().filter(|r| r.changes).count(),
                "occurrences": flow.iter().filter(|r| r.checks || r.changes).count(),
            })
        })
        .collect::<Vec<_>>();
    Ok(json!({
        "revision": session.revision(),
        "items": items,
        "offset": offset,
        "limit": limit,
        "total": 126,
        "truncated": offset.saturating_add(limit) < 126,
    }))
}

fn quest_open(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    let id = required_u32(&params, "id")?;
    let id = u8::try_from(id).map_err(|_| "quest id must fit in u8".to_string())?;
    if !(providence_core::model::CLASSIC_QUEST_FLAG_MIN
        ..=providence_core::model::CLASSIC_QUEST_FLAG_MAX)
        .contains(&id)
    {
        return Err("quest id must be in the authorable Classic range 1 through 126".into());
    }
    let label = session
        .snapshot()
        .quest_labels
        .iter()
        .find(|label| label.id == id);
    let used_by = session
        .references()
        .into_iter()
        .filter(|reference| {
            reference.target_kind == TargetKind::QuestFlag && reference.target_id == id.to_string()
        })
        .collect::<Vec<_>>();
    let flow: Vec<_> = session
        .discovery()
        .quests
        .iter()
        .filter(|r| r.quest_id == i16::from(id))
        .collect();
    Ok(json!({
        "revision": session.revision(),
        "quest": {
            "identity": format!("quest:{id}"),
            "id": id,
            "label": label.map(|label| label.label.clone()).unwrap_or_else(|| format!("Quest {id}")),
            "note": label.map(|label| label.note.clone()).unwrap_or_default(),
            "authored": label.is_some(),
        },
        "usedBy": used_by.iter().take(64).collect::<Vec<_>>(),
        "usedByTotal": used_by.len(),
        "checks": {"items": flow.iter().filter(|r| r.checks).take(64).collect::<Vec<_>>(), "total": flow.iter().filter(|r| r.checks).count(), "offset": 0, "limit": 64},
        "changes": {"items": flow.iter().filter(|r| r.changes).take(64).collect::<Vec<_>>(), "total": flow.iter().filter(|r| r.changes).count(), "offset": 0, "limit": 64},
        "occurrences": flow.iter().filter(|r| r.checks || r.changes).count(),
        "retainedOperands": flow.iter().filter(|r| !r.checks && !r.changes).count(),
    }))
}

fn quest_label_upsert(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    let label: QuestLabel = serde_json::from_value(coerce_integral_numbers(
        required_value(&params, "questLabel")?.clone(),
    ))
    .map_err(|error| format!("invalid quest label: {error}"))?;
    execute(session, &params, EditorCommand::UpsertQuestLabel { label })
}

fn quest_label_delete(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    let id = required_u32(&params, "id")?;
    let id = u8::try_from(id).map_err(|_| "quest id must fit in u8".to_string())?;
    execute(session, &params, EditorCommand::DeleteQuestLabel { id })
}

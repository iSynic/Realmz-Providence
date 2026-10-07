//! Native text requests; decoding and bounded projections stay with this feature.

use crate::execute;
use crate::request_params::required_string;
use crate::request_params::required_u32;
use crate::text_export::text_export_check_projection;
use crate::text_resources::text_resource_projection;
use providence_core::model::NativeRecordId;
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
        "text.find" | "text.find-long" | "text.allocate" | "text.linked-sounds" => {
            super::string_navigation::dispatch(session, method, &params)
        }
        "text-resource.list" => text_resource_list(session, params),
        "text.apply-draft" => {
            let draft = serde_json::from_value(crate::request_params::coerce_integral_numbers(
                params.get("draft").cloned().ok_or("missing draft")?,
            ))
            .map_err(|error| format!("invalid string draft: {error}"))?;
            execute(
                session,
                &params,
                EditorCommand::AuthorStrings(providence_core::text_authoring::StringEdit::Draft {
                    draft,
                }),
            )
        }
        "message.list" => message_list(session, params),
        "message.open" => message_open(session, params),
        "text.export-check" => text_export_check_projection(session, &params),
        "message.update" => message_update(session, params),
        "message.create" => message_create(session, params),
        "text.export-file" | "text.import-review" | "text.import-inspect" | "text.import-apply" => {
            crate::text_interchange::dispatch(session, method, params)
        }
        "text.inspect-draft" => {
            let text = required_string(&params, "text")?;
            let limit = if params.get("family").and_then(Value::as_str) == Some("option-label") {
                24
            } else {
                255
            };
            Ok(
                json!({"revision":session.revision(), "feedback":providence_core::codecs::inspect_classic_text(&text, Some(limit))}),
            )
        }
        _ => Err(format!("unknown method {method}")),
    }
}

fn text_resource_list(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    let offset = params.get("offset").and_then(Value::as_u64).unwrap_or(0) as usize;
    let limit = params
        .get("limit")
        .and_then(Value::as_u64)
        .unwrap_or(64)
        .clamp(1, 128) as usize;
    let resources = session
        .snapshot()
        .assets
        .iter()
        .filter(|asset| asset.kind == "text-resource")
        .collect::<Vec<_>>();
    let items = resources
        .iter()
        .skip(offset)
        .take(limit)
        .map(|asset| text_resource_projection(session, asset))
        .collect::<Vec<_>>();
    Ok(json!({
        "items": items,
        "offset": offset,
        "limit": limit,
        "total": resources.len(),
        "revision": session.revision(),
    }))
}

fn message_list(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    let query = params
        .get("query")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .trim()
        .to_lowercase();
    let matches = session
        .snapshot()
        .messages
        .iter()
        .filter(|message| {
            query.is_empty()
                || message.native_id.0.to_string().contains(&query)
                || message.text.to_lowercase().contains(&query)
        })
        .collect::<Vec<_>>();
    let total = matches.len();
    let offset = params.get("offset").and_then(Value::as_u64).unwrap_or(0) as usize;
    let limit = params
        .get("limit")
        .and_then(Value::as_u64)
        .unwrap_or(64)
        .clamp(1, 128) as usize;
    let offset = if total == 0 {
        0
    } else {
        offset.min((total - 1) / limit * limit)
    };
    let items = matches.into_iter().skip(offset).take(limit).map(|row| json!({
        "identity":row.identity,"nativeId":row.native_id,"text":row.text.chars().take(160).collect::<String>(),"authored":row.authored
    })).collect::<Vec<_>>();
    Ok(json!({
        "revision": session.revision(),
        "items": items,
        "offset": offset,
        "limit": limit,
        "total": total,
        "truncated": offset.saturating_add(limit) < total,
        "optionLabelsPresent": providence_core::text_authoring::option_labels_present(session.snapshot()),
    }))
}

fn message_open(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    let native_id = NativeRecordId(required_u32(&params, "nativeId")?);
    let (index, message) = session
        .snapshot()
        .messages
        .iter()
        .enumerate()
        .find(|(_, message)| message.native_id == native_id)
        .ok_or_else(|| format!("Message {} was not found", native_id.0))?;
    let target_id = native_id.0.to_string();
    let references = session.references();
    let linked_sounds =
        providence_core::text_authoring::linked_message_sounds(&references, native_id.0)
            .collect::<Vec<_>>();
    let used_by_count = references
        .iter()
        .filter(|reference| {
            reference.target_kind == TargetKind::Message && reference.target_id == target_id
        })
        .count();
    let diagnostics = session
        .diagnostics()
        .into_iter()
        .filter(|diagnostic| diagnostic.entity.as_ref() == Some(&message.identity))
        .collect::<Vec<_>>();
    Ok(json!({
        "revision": session.revision(),
        "index": index,
        "message": message,
        "usedByCount": used_by_count,
        "linkedSounds":{"items":linked_sounds.iter().take(128).collect::<Vec<_>>(),"total":linked_sounds.len(),"truncated":linked_sounds.len()>128},
        "diagnostics": diagnostics,
        "feedback": providence_core::text_authoring::message_draft_feedback(&message.text),
    }))
}

fn message_update(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    execute(
        session,
        &params,
        EditorCommand::UpdateMessageText {
            identity: StableId(required_string(&params, "identity")?),
            text: required_string(&params, "text")?,
        },
    )
}

fn message_create(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    execute(
        session,
        &params,
        EditorCommand::CreateMessage {
            native_id: NativeRecordId(required_u32(&params, "nativeId")?),
            text: required_string(&params, "text")?,
        },
    )
}

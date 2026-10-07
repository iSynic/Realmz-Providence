use providence_core::session::EditorSession;
use providence_core::text_authoring::{find_text_occurrence, option_labels_present};
use serde_json::{Value, json};

pub(super) fn dispatch(
    session: &EditorSession,
    method: &str,
    params: &Value,
) -> Result<Value, String> {
    let labels = params.get("family").and_then(Value::as_str) == Some("option-label");
    if labels && !option_labels_present(session.snapshot()) {
        return Err("This scenario has no Option Labels.".into());
    }
    match method {
        "text.linked-sounds" => {
            let native_id = crate::request_params::required_u32(params, "nativeId")?;
            let references = session.references();
            let matched =
                providence_core::text_authoring::linked_message_sounds(&references, native_id)
                    .collect::<Vec<_>>();
            Ok(
                json!({"revision":session.revision(),"items":matched.iter().take(128).collect::<Vec<_>>(),"total":matched.len(),"truncated":matched.len()>128}),
            )
        }
        "text.find" => find(session, params, labels),
        "text.find-long" => find_long(session, params, labels),
        "text.allocate" => allocate(session, labels),
        _ => Err(format!("unknown string navigation method {method}")),
    }
}

fn find(session: &EditorSession, params: &Value, labels: bool) -> Result<Value, String> {
    let query = params.get("query").and_then(Value::as_str).unwrap_or("");
    let after = params.get("afterId").and_then(Value::as_u64).map(|id| {
        (
            id,
            params
                .get("afterCharacterIndex")
                .and_then(Value::as_u64)
                .unwrap_or(0),
        )
    });
    let found = if labels {
        find_text_occurrence(
            session
                .snapshot()
                .option_labels
                .iter()
                .map(|row| (&row.identity, row.native_id, row.text.as_str())),
            query,
            after,
        )
    } else {
        find_text_occurrence(
            session
                .snapshot()
                .messages
                .iter()
                .map(|row| (&row.identity, row.native_id, row.text.as_str())),
            query,
            after,
        )
    };
    Ok(
        json!({"revision":session.revision(), "query":query, "total":found.total, "next":found.next, "wrapped":found.wrapped}),
    )
}

fn find_long(session: &EditorSession, params: &Value, labels: bool) -> Result<Value, String> {
    let minimum = if labels { 24 } else { 255 };
    let mut ids = if labels {
        session
            .snapshot()
            .option_labels
            .iter()
            .filter(|row| row.text.chars().count() >= minimum)
            .map(|row| row.native_id.0)
            .collect::<Vec<_>>()
    } else {
        session
            .snapshot()
            .messages
            .iter()
            .filter(|row| row.text.chars().count() >= minimum)
            .map(|row| row.native_id.0)
            .collect::<Vec<_>>()
    };
    ids.sort_unstable();
    let after = params.get("afterId").and_then(Value::as_u64);
    let next = ids
        .iter()
        .find(|id| after.is_none_or(|after| u64::from(**id) > after))
        .or_else(|| ids.first());
    Ok(json!({"revision":session.revision(), "total":ids.len(), "nativeId":next}))
}

fn allocate(session: &EditorSession, labels: bool) -> Result<Value, String> {
    let family = if labels {
        providence_core::text_authoring::StringFamily::OptionLabel
    } else {
        providence_core::text_authoring::StringFamily::Message
    };
    let id = providence_core::text_authoring::next_string_id(session.snapshot(), &family);
    Ok(
        json!({"revision":session.revision(), "nativeId":id, "available":id.is_some(),
        "reason":if id.is_some() {""} else {"Every addressable string slot is occupied."}}),
    )
}

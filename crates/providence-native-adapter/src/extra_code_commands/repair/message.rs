use super::*;

type MessageDraft = RepairDraft<repair::RandomMessageInput>;

pub(super) fn view(
    session: &EditorSession,
    draft: MessageDraft,
    offset: usize,
) -> Result<Value, String> {
    let mut value = serde_json::to_value(repair::preview_random_message(
        session.snapshot(),
        session.revision(),
        &draft,
        offset,
    ))
    .map_err(|error| error.to_string())?;
    value["sessionToken"] = session_token().into();
    value["family"] = "random-message".into();
    Ok(value)
}

pub(super) fn dispatch(
    session: &mut EditorSession,
    method: &str,
    params: &Value,
    mut draft: MessageDraft,
) -> Result<Value, String> {
    match method {
        "action-settings.change-repair" => {
            repair::change(
                session.snapshot(),
                &mut draft,
                &required_string(params, "field")?,
                &required_string(params, "value")?,
            )?;
            view(session, draft, 0)
        }
        "action-settings.choose-repair-message" => choose(session, params, draft),
        "action-settings.peek-repair-message" => {
            repair::uses(session.snapshot(), session.revision(), &draft, 0, 1)?;
            let identity = StableId(required_string(params, "identity")?);
            serde_json::to_value(repair::peek_message(session.snapshot(), &identity)?)
                .map_err(|error| error.to_string())
        }
        "action-settings.preview-repair" => view(session, draft, paging(params).0),
        "action-settings.compare-repair" => serde_json::to_value(repair::compare_random_message(
            session.snapshot(),
            session.revision(),
            &draft,
        ))
        .map_err(|error| error.to_string()),
        "action-settings.rebase-repair" => {
            current_revision(session, Revision(required_u64(params, "expectedRevision")?))?;
            view(
                session,
                repair::rebase(session.snapshot(), session.revision(), &draft)?,
                0,
            )
        }
        "action-settings.repair-uses" => {
            let (offset, limit) = paging(params);
            let (items, total) = repair::uses(
                session.snapshot(),
                session.revision(),
                &draft,
                offset,
                limit,
            )?;
            Ok(
                json!({"items":items,"total":total,"offset":offset,"limit":limit,"revision":session.revision()}),
            )
        }
        "action-settings.repair-choices" => choices(session, params, &draft),
        "action-settings.commit-repair" => commit(session, params, &draft),
        _ => Err(format!("unsupported message repair command: {method}")),
    }
}

fn choose(
    session: &EditorSession,
    params: &Value,
    mut draft: MessageDraft,
) -> Result<Value, String> {
    repair::uses(session.snapshot(), session.revision(), &draft, 0, 1)?;
    let identity = match required_value(params, "identity")? {
        Value::Null => None,
        Value::String(value) => Some(StableId(value.clone())),
        _ => {
            return Err(
                "The selected message identity must be a string or explicit no message.".into(),
            );
        }
    };
    let waits = match params.get("waitsForClick") {
        None | Some(Value::Null) => None,
        Some(Value::Bool(value)) => Some(*value),
        _ => return Err("The wait choice must be true or false.".into()),
    };
    repair::choose_message(
        session.snapshot(),
        &mut draft,
        &required_string(params, "field")?,
        identity.as_ref(),
        waits,
    )?;
    view(session, draft, 0)
}

fn choices(session: &EditorSession, params: &Value, draft: &MessageDraft) -> Result<Value, String> {
    repair::uses(session.snapshot(), session.revision(), draft, 0, 1)?;
    let field = required_string(params, "field")?;
    if !matches!(field.as_str(), "message" | "firstMessage" | "lastMessage") {
        return Err("Choose a message endpoint.".into());
    }
    let query = params.get("query").and_then(Value::as_str).unwrap_or("");
    if query.len() > 512 {
        return Err("The search query is too long.".into());
    }
    let (offset, limit) = paging(params);
    let mut value = serde_json::to_value(repair::message_choices(
        session.snapshot(),
        query,
        offset,
        limit,
    ))
    .map_err(|error| error.to_string())?;
    value["revision"] = json!(session.revision());
    Ok(value)
}

use std::sync::OnceLock;
use std::time::{SystemTime, UNIX_EPOCH};

use providence_core::action_settings_repair::{self as repair, RepairDraft, RepairIntent};
use serde::de::DeserializeOwned;

use crate::execute;
use crate::request_params::coerce_integral_numbers;
use crate::request_params::required_string;
use crate::request_params::required_u8;
use crate::request_params::required_u64;
use crate::request_params::required_value;
use crate::session_summary::session_projection;
use providence_core::model::StableId;
use providence_core::session::EditorCommand;
use providence_core::session::EditorSession;
use providence_core::session::Revision;
use serde_json::Value;
use serde_json::json;

fn session_token() -> &'static str {
    static TOKEN: OnceLock<String> = OnceLock::new();
    TOKEN.get_or_init(|| {
        format!(
            "{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos()
        )
    })
}

fn payload<T: DeserializeOwned>(params: &Value, field: &str) -> Result<T, String> {
    let value = required_value(params, field)?;
    if serde_json::to_vec(value)
        .map_err(|error| error.to_string())?
        .len()
        > 16_384
    {
        return Err("The repair draft exceeds its bounded request size.".into());
    }
    serde_json::from_value(coerce_integral_numbers(value.clone()))
        .map_err(|error| format!("invalid repair {field}: {error}"))
}

fn current_revision(session: &EditorSession, revision: Revision) -> Result<(), String> {
    if session.revision() == revision {
        Ok(())
    } else {
        Err(format!(
            "revision conflict: expected {}, current {}",
            revision.0,
            session.revision().0
        ))
    }
}

fn view(session: &EditorSession, draft: RepairDraft) -> Result<Value, String> {
    let mut value = serde_json::to_value(repair::preview(
        session.snapshot(),
        session.revision(),
        &draft,
    ))
    .map_err(|error| error.to_string())?;
    value["sessionToken"] = session_token().into();
    Ok(value)
}

pub(super) fn dispatch(
    session: &mut EditorSession,
    method: &str,
    params: &Value,
) -> Result<Value, String> {
    match method {
        "action-settings.prepare-repair" => {
            current_revision(session, Revision(required_u64(params, "expectedRevision")?))?;
            let draft = repair::prepare(
                session.snapshot(),
                session.revision(),
                StableId(required_string(params, "source")?),
                required_u8(params, "slot")?,
            )?;
            view(session, draft)
        }
        "action-settings.reconcile-repair" => {
            let intent: RepairIntent = payload(params, "intent")?;
            let same_session = required_string(params, "sessionToken")? == session_token();
            Ok(json!({
                "outcome": repair::reconcile(session.snapshot(), session.revision(), &intent, same_session),
                "projection": session_projection(session),
                "sessionToken": session_token(),
            }))
        }
        _ => dispatch_draft(session, method, params),
    }
}

fn dispatch_draft(
    session: &mut EditorSession,
    method: &str,
    params: &Value,
) -> Result<Value, String> {
    let mut draft: RepairDraft = payload(params, "draft")?;
    match method {
        "action-settings.change-repair" => {
            repair::change(
                session.snapshot(),
                &mut draft,
                &required_string(params, "field")?,
                &required_string(params, "value")?,
            )?;
            view(session, draft)
        }
        "action-settings.preview-repair" => view(session, draft),
        "action-settings.compare-repair" => serde_json::to_value(repair::compare(
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
                json!({"items": items, "total": total, "offset": offset, "limit": limit, "revision": session.revision()}),
            )
        }
        "action-settings.repair-choices" => choices(session, params, &draft),
        "action-settings.commit-repair" => {
            let expected_revision = Revision(required_u64(params, "expectedRevision")?);
            current_revision(session, expected_revision)?;
            if draft.revision != expected_revision {
                return Err("The repair draft must be reviewed at the current revision.".into());
            }
            let (edit, _) = repair::plan(session.snapshot(), session.revision(), &draft)?;
            execute(session, params, EditorCommand::ApplyActionSettings { edit })
        }
        _ => Err(format!("unsupported action settings command: {method}")),
    }
}

fn paging(params: &Value) -> (usize, usize) {
    (
        params
            .get("offset")
            .and_then(Value::as_u64)
            .unwrap_or(0)
            .min(usize::MAX as u64) as usize,
        params
            .get("limit")
            .and_then(Value::as_u64)
            .unwrap_or(3)
            .clamp(1, 128) as usize,
    )
}

fn choices(session: &EditorSession, params: &Value, draft: &RepairDraft) -> Result<Value, String> {
    repair::uses(session.snapshot(), session.revision(), draft, 0, 1)?;
    let field = required_string(params, "field")?;
    let query = params.get("query").and_then(Value::as_str).unwrap_or("");
    if query.len() > 512 {
        return Err("The search query is too long.".into());
    }
    let (offset, limit) = paging(params);
    let page = match field.as_str() {
        "map" => repair::map_choices(
            session.snapshot(),
            &draft.input.map_kind,
            query,
            offset,
            limit,
        ),
        "area" => repair::area_choices(
            session.snapshot(),
            &draft.input.map_kind,
            &draft.input.map,
            query,
            offset,
            limit,
        ),
        _ => return Err("Choose a map or an area.".into()),
    };
    let mut value = serde_json::to_value(page).map_err(|error| error.to_string())?;
    value["revision"] = json!(session.revision());
    Ok(value)
}

#[cfg(test)]
mod tests;

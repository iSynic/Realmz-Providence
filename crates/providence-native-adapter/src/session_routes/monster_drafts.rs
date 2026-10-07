use providence_core::session::{EditorCommand, EditorSession, MonsterRecordDraft};
use serde_json::{Value, json};

use crate::request_params::{coerce_integral_numbers, required_u64, required_value};

pub(super) fn dispatch(
    session: &mut EditorSession,
    method: &str,
    params: Value,
) -> Result<Value, String> {
    let expected = required_u64(&params, "expectedRevision")?;
    if expected != session.revision().0 {
        return Err(format!(
            "project revision changed: expected {expected}, current {}",
            session.revision().0
        ));
    }
    let draft: MonsterRecordDraft = serde_json::from_value(coerce_integral_numbers(
        required_value(&params, "draft")?.clone(),
    ))
    .map_err(|error| format!("invalid Monster draft: {error}"))?;
    if method == "monster.draft.prepare" {
        let issues = session.monster_draft_issues(&draft);
        if !issues.is_empty() {
            return Ok(json!({"revision": session.revision(), "valid": false, "issues": issues}));
        }
    }
    let changes = session
        .monster_draft_changes(&draft)
        .map_err(|error| error.to_string())?;
    if method == "monster.draft.prepare" {
        return Ok(json!({"revision": session.revision(), "changes": changes,
            "nativeId": draft.native_id, "setId": draft.set_id, "valid": true}));
    }
    let destination = json!({"setId": draft.set_id, "nativeId": draft.native_id});
    let change = crate::execute(session, &params, EditorCommand::ApplyMonsterDraft { draft })?;
    let document = super::monsters::monster_open(session, destination)?;
    Ok(json!({"change": change, "document": document, "changes": changes}))
}

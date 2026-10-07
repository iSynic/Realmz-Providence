use crate::{
    execute,
    request_params::{coerce_integral_numbers, required_string, required_value},
};
use providence_core::{
    model::{RogueEncounter, StableId, TimedEncounter},
    session::{EditorCommand, EditorSession},
};
use serde_json::{Value, json};

#[cfg(test)]
mod tests;

pub(super) fn dispatch(
    session: &mut EditorSession,
    method: &str,
    params: Value,
) -> Result<Value, String> {
    match method {
        "encounter.apply-rogue-draft" => {
            let row: RogueEncounter = serde_json::from_value(coerce_integral_numbers(
                required_value(&params, "draft")?.clone(),
            ))
            .map_err(|e| e.to_string())?;
            let identity = row.identity.clone();
            let change = execute(
                session,
                &params,
                EditorCommand::ApplyRogueEncounterDraft {
                    encounter: Box::new(row),
                },
            )?;
            reopen(session, "rogue", &identity.0, change)
        }
        "encounter.apply-timed-draft" => {
            let row: TimedEncounter = serde_json::from_value(coerce_integral_numbers(
                required_value(&params, "draft")?.clone(),
            ))
            .map_err(|e| e.to_string())?;
            let identity = row.identity.clone();
            let change = execute(
                session,
                &params,
                EditorCommand::ApplyTimedEncounterDraft {
                    encounter: Box::new(row),
                },
            )?;
            reopen(session, "timed", &identity.0, change)
        }
        "encounter.create-rogue" => create(session, "rogue", None, &params),
        "encounter.copy-rogue" => create(
            session,
            "rogue",
            Some(StableId(required_string(&params, "source")?)),
            &params,
        ),
        "encounter.create-timed" => create(session, "timed", None, &params),
        "encounter.copy-timed" => create(
            session,
            "timed",
            Some(StableId(required_string(&params, "source")?)),
            &params,
        ),
        "encounter.prepare-create" => prepare_create(session, params),
        "encounter.prepare-string" => prepare_string(session),
        "encounter.rogue-callers" => rogue_callers(session, params),
        "encounter.reconcile-draft" => reconcile(session, params),
        _ => Err(format!("unknown method {method}")),
    }
}

fn create(
    session: &mut EditorSession,
    kind: &str,
    source: Option<StableId>,
    params: &Value,
) -> Result<Value, String> {
    let command = match (kind, source) {
        ("rogue", None) => EditorCommand::CreateRogueEncounter,
        ("rogue", Some(source)) => EditorCommand::CopyRogueEncounter { source },
        (_, None) => EditorCommand::CreateTimedEncounter,
        (_, Some(source)) => EditorCommand::CopyTimedEncounter { source },
    };
    let change = execute(session, params, command)?;
    let identity = change["changedEntities"]
        .as_array()
        .and_then(|v| v.first())
        .and_then(Value::as_str)
        .ok_or("Encounter creation returned no identity")?;
    reopen(session, kind, identity, change.clone())
}

fn open(session: &mut EditorSession, kind: &str, identity: &str) -> Result<Value, String> {
    match kind {
        "rogue" => super::encounters::encounter_open_rogue(session, json!({"identity": identity})),
        "timed" => super::encounters::encounter_open_timed(session, json!({"identity": identity})),
        _ => Err("Choose Rogue or Timed encounter kind".into()),
    }
}
fn reopen(
    session: &mut EditorSession,
    kind: &str,
    identity: &str,
    change: Value,
) -> Result<Value, String> {
    Ok(json!({"change": change, "document": open(session, kind, identity)?}))
}

fn prepare_create(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    let kind = required_string(&params, "kind")?;
    let source = params
        .get("source")
        .and_then(Value::as_str)
        .map(|s| StableId(s.into()));
    // A scratch session computes exactly the core's allocation and row defaults,
    // without reserving an ID or publishing any state.
    let mut scratch = EditorSession::new(session.snapshot().clone());
    let command = match (kind.as_str(), source) {
        ("rogue", None) => EditorCommand::CreateRogueEncounter,
        ("rogue", Some(source)) => EditorCommand::CopyRogueEncounter { source },
        ("timed", None) => EditorCommand::CreateTimedEncounter,
        ("timed", Some(source)) => EditorCommand::CopyTimedEncounter { source },
        _ => return Err("Choose Rogue or Timed encounter kind".into()),
    };
    let change = execute(&mut scratch, &json!({"expectedRevision": 0}), command)?;
    let identity = change["changedEntities"][0]
        .as_str()
        .ok_or("No encounter identity")?;
    let document = open(&mut scratch, &kind, identity)?;
    Ok(
        json!({"revision": session.revision(), "identity": identity, "encounter": document["encounter"]}),
    )
}

fn reconcile(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    let projection = json!({"revision": session.revision(), "canUndo": session.can_undo(), "canRedo": session.can_redo(), "changedEntities": [], "affectedEntities": [], "referenceChanges": [], "affectedDiagnostics": []});
    let kind = required_string(&params, "kind")?;
    let identity = required_string(&params, "identity")?;
    if kind == "message" {
        let text = required_string(&params, "text")?;
        let row = session
            .snapshot()
            .messages
            .iter()
            .find(|row| row.identity.0 == identity);
        return Ok(
            json!({"projection": projection, "revision": session.revision(), "outcome": match row { None => "not-applied", Some(row) if row.text == text => "matches-draft", Some(_) => "different" }, "nativeId": row.map(|row| row.native_id.0)}),
        );
    }
    let mut submitted = coerce_integral_numbers(required_value(&params, "draft")?.clone());
    let result = open(session, &kind, &identity);
    let document = match result {
        Ok(document) => document,
        Err(_) if params.get("creating").and_then(Value::as_bool) == Some(true) => {
            return Ok(
                json!({"projection": projection, "revision": session.revision(), "outcome": "not-applied"}),
            );
        }
        Err(error) => return Err(error),
    };
    let mut current = document["encounter"].clone();
    if let Some(v) = submitted.as_object_mut() {
        v.remove("authored");
    }
    if let Some(v) = current.as_object_mut() {
        v.remove("authored");
    }
    let outcome = if current == submitted {
        "matches-draft"
    } else {
        "different"
    };
    Ok(
        json!({"projection": projection, "revision": session.revision(), "outcome": outcome, "document": document}),
    )
}

fn prepare_string(session: &EditorSession) -> Result<Value, String> {
    let native_id = (1..=i16::MAX as u32)
        .find(|id| {
            !session
                .snapshot()
                .messages
                .iter()
                .any(|row| row.native_id.0 == *id)
        })
        .ok_or("All scenario string IDs are in use")?;
    Ok(json!({"revision": session.revision(), "nativeId": native_id}))
}

fn rogue_callers(session: &EditorSession, params: Value) -> Result<Value, String> {
    let identity = required_string(&params, "identity")?;
    let rogue = session
        .snapshot()
        .rogue_encounters
        .iter()
        .find(|row| row.identity.0 == identity)
        .ok_or("Rogue encounter not found")?;
    let items = session
        .snapshot()
        .complex_encounters
        .iter()
        .filter(|row| row.thief && i32::from(row.thief_success) == rogue.native_id.0 as i32)
        .collect::<Vec<_>>();
    let offset = params.get("offset").and_then(Value::as_u64).unwrap_or(0) as usize;
    let total = items.len();
    let page = items
        .into_iter()
        .skip(offset)
        .take(128)
        .map(|row| json!({"identity": row.identity, "nativeId": row.native_id}))
        .collect::<Vec<_>>();
    Ok(json!({"revision": session.revision(), "items": page, "offset": offset, "total": total}))
}

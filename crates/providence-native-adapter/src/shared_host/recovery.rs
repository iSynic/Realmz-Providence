//! Reconciliation never repeats an uncertain operation or fabricates its result.
use super::{receipts, state::failure};
use providence_core::session::EditorSession;
use providence_storage::ProjectStore;
use serde_json::{Value, json};

pub(super) fn reconcile(
    store: &ProjectStore,
    session: &EditorSession,
    params: &Value,
) -> Result<Value, String> {
    let operation = params["operationId"]
        .as_str()
        .ok_or("operationId is required")?;
    let path = receipts::path(store, operation)?;
    let mut receipt: Value =
        serde_json::from_slice(&std::fs::read(&path).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;
    if !matches!(receipt["state"].as_str(), Some("pending" | "unknown")) {
        return Ok(receipt);
    }
    let method = receipt["method"]
        .as_str()
        .ok_or("receipt method is missing")?;
    let project_edit = matches!(method, "changes.commit" | "history.undo" | "history.redo")
        || providence_session_client::capabilities::by_method(method).is_some_and(|r| r.mutation);
    if !project_edit {
        return Err("operation-unresolved: external publication requires artifact inspection; project revision cannot prove its outcome".into());
    }
    let (state, revision) = project_outcome(store, session, &receipt, operation)?;
    receipt["state"] = json!(state);
    receipt["reconciliation"] = json!({"revision":revision,"currentRevision":session.revision(),"originalResultUnavailable":true,"refreshRequired":true,"safeToReplay":false});
    receipt["response"] = serde_json::to_value(failure(0,format!("operation-reconciled: {state}; inspect current records and use a new operation ID, never replay this request"))).map_err(|e|e.to_string())?;
    receipts::write(&path, &receipt)?;
    Ok(receipt)
}
fn project_outcome(
    store: &ProjectStore,
    session: &EditorSession,
    receipt: &Value,
    operation: &str,
) -> Result<(&'static str, u64), String> {
    let expected = receipt["expectedRevision"]
        .as_u64()
        .ok_or("receipt revision is missing")?;
    let journal = store.journal().map_err(|e| e.to_string())?;
    let witnessed = journal
        .iter()
        .find(|(_, entry, _)| entry["params"]["operationId"] == operation);
    let history_witness = session
        .undo_history()
        .last()
        .and_then(|r| r.attribution.as_ref())
        .is_some_and(|r| r.operation_id == operation);
    let committed = witnessed.map(|(r, _, _)| r.0).or_else(|| {
        (history_witness && expected.checked_add(1) == Some(session.revision().0))
            .then_some(session.revision().0)
    });
    if let Some(revision) = committed {
        return Ok(("committed-recovered", revision));
    }
    if session.revision().0 == expected {
        return Ok(("no-project-change", expected));
    }
    Err("operation-unresolved: current project and retained history do not establish this operation's outcome".into())
}

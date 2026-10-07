use providence_core::session::EditorSession;
use serde_json::Value;
use serde_json::json;
use std::path::PathBuf;

pub(crate) const ADAPTER_PROTOCOL_VERSION: u64 = 2;

pub(crate) fn session_projection(session: &EditorSession) -> Value {
    json!({
        "adapterProtocol": ADAPTER_PROTOCOL_VERSION,
        "revision": session.revision(),
        "canUndo": session.can_undo(),
        "canRedo": session.can_redo(),
        "projectId": session.snapshot().project_id,
        "campaign": session.snapshot().campaign,
        "startLocation": session.snapshot().start_location,
        "scenarioApplication": session.snapshot().scenario_application,
        "counts": {
            "messages": session.snapshot().messages.len(),
            "maps": session.snapshot().world.maps.len(),
            "actionPoints": session.snapshot().world.action_points.len(),
            "assets": session.snapshot().assets.len(),
        },
    })
}

pub(crate) fn clean_summary_text(value: &str) -> Option<String> {
    if value
        .chars()
        .any(|character| character.is_control() && !character.is_whitespace())
    {
        return None;
    }
    let normalized = value.split_whitespace().collect::<Vec<_>>().join(" ");
    (!normalized.is_empty()).then_some(normalized)
}

pub(crate) fn user_visible_path(path: PathBuf) -> PathBuf {
    let text = path.to_string_lossy();
    if let Some(rest) = text.strip_prefix(r"\\?\UNC\") {
        return PathBuf::from(format!(r"\\{rest}"));
    }
    if let Some(rest) = text.strip_prefix(r"\\?\") {
        return PathBuf::from(rest);
    }
    path
}

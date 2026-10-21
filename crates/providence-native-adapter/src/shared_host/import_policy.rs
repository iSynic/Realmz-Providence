//! Whole-scenario import establishes a baseline, never an ordinary replacement edit.
use providence_core::{model::ProjectOrigin, session::EditorSession};
pub(super) fn guard(session: &EditorSession, method: &str, kind: &str) -> Result<(), String> {
    if kind != "mcp" || method != "project.import-classic-scenario.begin" {
        return Ok(());
    }
    let snapshot = session.snapshot();
    if session.revision().0 != 0
        || !session.undo_history().is_empty()
        || !session.redo_history().is_empty()
        || !matches!(snapshot.origin, ProjectOrigin::Authored)
        || snapshot.start_location.is_some()
        || snapshot.startup_authoring.is_some()
        || !snapshot.world.maps.is_empty()
        || !snapshot.world.action_points.is_empty()
        || !snapshot.messages.is_empty()
        || !snapshot.simple_encounters.is_empty()
        || !snapshot.complex_encounters.is_empty()
        || !snapshot.rogue_encounters.is_empty()
        || !snapshot.timed_encounters.is_empty()
        || !snapshot.battles.is_empty()
        || !snapshot.treasures.is_empty()
        || !snapshot.shops.is_empty()
    {
        return Err("import-baseline-required: create a new unedited project before importing; existing authored scenarios cannot be replaced through MCP".into());
    }
    Ok(())
}

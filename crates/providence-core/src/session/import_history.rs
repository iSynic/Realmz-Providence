use super::{PersistedSessionState, ProjectOrigin, ProjectSnapshot, StableId};

pub(super) fn is_legacy_import(
    before: &ProjectSnapshot,
    after: &ProjectSnapshot,
    changed_entities: &[StableId],
) -> bool {
    // Legacy history has no command tag; only a project-wide provenance transition identifies import.
    changed_entities == std::slice::from_ref(&after.project_id)
        && before.project_id == after.project_id
        && matches!(after.origin, ProjectOrigin::Imported { .. })
        && (before.origin != after.origin || before.classic_sources != after.classic_sources)
}

pub(super) fn retain_post_import_undo(state: &mut PersistedSessionState) {
    let mut after = &state.snapshot;
    let mut boundary = None;
    for (index, entry) in state.undo.iter().enumerate().rev() {
        if is_legacy_import(&entry.snapshot, after, &entry.changed_entities) {
            boundary = Some(index);
            break;
        }
        after = &entry.snapshot;
    }
    if let Some(index) = boundary {
        state.undo.drain(..=index);
    }
}

#[cfg(test)]
mod tests;

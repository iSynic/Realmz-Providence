//! These feature APIs already own library revisions; project transfers keep project guards.
use crate::monster_operation_receipts;

pub(super) fn library_owned(method: &str) -> bool {
    method.starts_with("personal-library.")
        || (monster_operation_receipts::library_mutation(method)
            && method != "monster.copy-to-library")
        || matches!(
            method,
            "monster-library.operation.prepare"
                | "monster-library.draft.prepare"
                | "monster-library.import-built-ins"
                | "monster-library.create"
        )
}
pub(super) fn review(method: &str) -> bool {
    matches!(
        method,
        "monster-library.operation.prepare"
            | "monster-library.draft.prepare"
            | "paint-resources.list"
            | "paint-resources.allocate"
            | "paint-resources.open"
            | "paint-resources.capture"
            | "paint-resources.preview"
            | "paint-resources.preview-features"
            | "paint-resources.geometry"
            | "paint-resources.operation-status"
    )
}
pub(super) fn label(method: &str) -> &'static str {
    if method == "project.import-classic-scenario.begin" {
        "private import preparation; no project Undo entry"
    } else if method == "project.import-classic-scenario.commit" {
        "initial imported baseline; no Undo entry"
    } else if method == "export.inspect-artifact" {
        "artifact inspection; no project Undo entry"
    } else if method.starts_with("export.") {
        "export job; filesystem publication outside project Undo/Redo"
    } else if method.starts_with("paint-resources.") {
        "local paint resources; outside project Undo/Redo"
    } else if method == "project.save" {
        "project checkpoint; no Undo entry"
    } else if method == "project.save-as" || method.starts_with("project.compile-") {
        "filesystem publication; outside project Undo/Redo"
    } else if method.starts_with("validation.") || method.starts_with("readiness.") {
        "derived job or diagnostics; no project Undo entry"
    } else if method == "changes.prepare" {
        "private preview; no project Undo entry"
    } else if method.starts_with("personal-library.") {
        "personal-library; separate history"
    } else if library_owned(method) {
        "monster-library; separate Undo/Redo"
    } else if providence_session_client::capabilities::by_method(method)
        .is_some_and(|capability| !capability.mutation && !capability.external_effect)
    {
        "read-only; no Undo entry"
    } else {
        "project; shared Undo/Redo"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn publication_checkpoint_and_library_effects_never_claim_project_undo() {
        assert_eq!(label("project.save"), "project checkpoint; no Undo entry");
        for method in [
            "project.compile-classic-slice",
            "project.compile-rebuilt-package",
            "project.save-as",
        ] {
            assert_eq!(
                label(method),
                "filesystem publication; outside project Undo/Redo"
            );
        }
        assert_eq!(
            label("validation.cancel"),
            "derived job or diagnostics; no project Undo entry"
        );
        assert_eq!(
            label("monster-library.undo"),
            "monster-library; separate Undo/Redo"
        );
        assert_eq!(label("map.create"), "project; shared Undo/Redo");
        for method in [
            "message.open",
            "level-settings.preview",
            "map.region",
            "discovery.flow",
        ] {
            assert_eq!(label(method), "read-only; no Undo entry");
        }
    }
}

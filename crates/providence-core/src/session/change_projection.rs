//! Bounded view changes derived after a canonical session mutation.

use std::collections::BTreeSet;

use super::{
    CHANGE_PROJECTION_LIMIT, ChangeProjection, EditorSession, Revision,
    diagnostics::{battle_diagnostics, diagnostics_from_references},
    projections::references_for,
    reference_targets::reference_target_identity,
};
use crate::{
    model::{ProjectSnapshot, StableId},
    references::ReferenceDescriptor,
    validation::{Diagnostic, action_settings},
};

pub(super) fn build(
    session: &EditorSession,
    previous_revision: Revision,
    mut changed_entities: Vec<StableId>,
    references_unchanged: bool,
    settings_affected: BTreeSet<StableId>,
) -> ChangeProjection {
    let changed = changed_entities.iter().cloned().collect::<BTreeSet<_>>();
    let (mut references, mut diagnostics) = if references_unchanged {
        (Vec::new(), Vec::new())
    } else {
        affected_views(session.snapshot(), &changed, &settings_affected)
    };
    let reference_changes_total = references.len();
    let affected_diagnostics_total = diagnostics.len();
    references.truncate(CHANGE_PROJECTION_LIMIT);
    diagnostics.truncate(CHANGE_PROJECTION_LIMIT);
    let mut affected = changed;
    affected.extend(settings_affected);
    // Preserve the existing bounded projection contract: only emitted reference
    // sources expand the affected-entity list.
    affected.extend(references.iter().map(|reference| reference.source.clone()));
    let affected_entities_total = affected.len();
    let changed_entities_total = changed_entities.len();
    changed_entities.truncate(CHANGE_PROJECTION_LIMIT);
    let affected_entities = affected.into_iter().take(CHANGE_PROJECTION_LIMIT).collect();
    ChangeProjection {
        previous_revision,
        revision: session.revision(),
        changed_entities,
        changed_entities_total,
        affected_entities,
        affected_entities_total,
        reference_changes: references,
        affected_diagnostics: diagnostics,
        reference_changes_total,
        affected_diagnostics_total,
        references_unchanged,
        truncated: [
            changed_entities_total,
            affected_entities_total,
            reference_changes_total,
            affected_diagnostics_total,
        ]
        .into_iter()
        .any(|total| total > CHANGE_PROJECTION_LIMIT),
        can_undo: session.can_undo(),
        can_redo: session.can_redo(),
    }
}

fn affected_views(
    snapshot: &ProjectSnapshot,
    changed: &BTreeSet<StableId>,
    settings_affected: &BTreeSet<StableId>,
) -> (Vec<ReferenceDescriptor>, Vec<Diagnostic>) {
    let references = references_for(snapshot)
        .into_iter()
        .filter(|reference| {
            changed.contains(&reference.source)
                || changed.contains(&reference_target_identity(reference))
                || settings_affected.contains(&reference.source)
        })
        .collect::<Vec<_>>();
    let mut diagnostics = diagnostics_from_references(snapshot, &references);
    diagnostics.extend(
        action_settings::diagnostics(snapshot)
            .into_iter()
            .filter(|diagnostic| {
                diagnostic
                    .entity
                    .as_ref()
                    .is_some_and(|id| changed.contains(id) || settings_affected.contains(id))
            }),
    );
    diagnostics.extend(
        battle_diagnostics(snapshot)
            .into_iter()
            .filter(|diagnostic| {
                diagnostic
                    .entity
                    .as_ref()
                    .is_some_and(|id| changed.contains(id))
            }),
    );
    (references, diagnostics)
}

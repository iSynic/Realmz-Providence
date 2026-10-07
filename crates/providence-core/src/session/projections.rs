//! Disposable derived views for one unchanged session state; never serialized or copied as truth.

use std::sync::OnceLock;

use crate::application_references::references_for_application;
use crate::references::FieldPath;
use crate::references::RepairAction;
use crate::references::ResolutionState;
use crate::references::TargetKind;
use crate::rule_references::references_for_rules;
use crate::session::action_references::action_point_references;
use crate::session::action_references::extra_action_point_references;
use crate::session::action_references::random_rectangle_references;
use crate::session::action_references::settings_action_references;
use crate::session::combat_references::battle_references;
use crate::session::combat_references::monster_references;
use crate::session::diagnostics::diagnostics_with_references;
use crate::session::economy_references::option_label_program_references;
use crate::session::economy_references::shop_program_references;
use crate::session::economy_references::shop_references;
use crate::session::economy_references::treasure_references;
use crate::session::encounter_references::complex_encounter_references;
use crate::session::encounter_references::rogue_encounter_references;
use crate::session::encounter_references::simple_encounter_references;
use crate::session::encounter_references::timed_encounter_references;
use crate::session::quest_references::quest_references;
use crate::session::reference_targets::reference_descriptor;
use crate::session::world_references::land_layout_references;
use crate::session::world_references::map_landlook_references;
use crate::session::world_references::player_map_references;
use crate::session::world_references::special_land_tile_references;
use crate::{model::ProjectSnapshot, references::ReferenceDescriptor, validation::Diagnostic};
use std::collections::BTreeSet;

#[derive(Debug, Default)]
pub(super) struct SessionProjections {
    references: OnceLock<Vec<ReferenceDescriptor>>,
    diagnostics: OnceLock<Vec<Diagnostic>>,
    discovery: OnceLock<crate::discovery::DiscoveryIndex>,
    pub(super) monster_transfer:
        std::sync::Mutex<Option<super::monster_library_transfers::CachedTransferReview>>,
}

impl Clone for SessionProjections {
    fn clone(&self) -> Self {
        Self::default()
    }
}

impl SessionProjections {
    pub(super) fn invalidate_discovery(&mut self) {
        self.discovery.take();
    }
    pub(super) fn discovery(
        &self,
        snapshot: &ProjectSnapshot,
    ) -> &crate::discovery::DiscoveryIndex {
        self.discovery.get_or_init(|| {
            crate::discovery::DiscoveryIndex::build(snapshot, self.references(snapshot))
        })
    }
    pub(super) fn references(&self, snapshot: &ProjectSnapshot) -> &[ReferenceDescriptor] {
        self.references.get_or_init(|| references_for(snapshot))
    }

    pub(super) fn diagnostics(&self, snapshot: &ProjectSnapshot) -> &[Diagnostic] {
        self.diagnostics
            .get_or_init(|| diagnostics_with_references(snapshot, self.references(snapshot)))
    }

    pub(super) fn cached_diagnostics(&self) -> Option<&[Diagnostic]> {
        self.diagnostics.get().map(Vec::as_slice)
    }

    pub(super) fn cached_references(&self) -> Option<&[ReferenceDescriptor]> {
        self.references.get().map(Vec::as_slice)
    }
}

pub fn references_for(snapshot: &ProjectSnapshot) -> Vec<ReferenceDescriptor> {
    let target_ids = snapshot
        .messages
        .iter()
        .map(|message| message.native_id)
        .collect::<BTreeSet<_>>();
    let mut references = snapshot
        .message_references
        .iter()
        .map(|reference| reference_descriptor(reference, &target_ids))
        .collect::<Vec<_>>();
    references.extend(start_location_reference(snapshot));
    references.extend(land_layout_references(snapshot));
    references.extend(map_landlook_references(snapshot));
    references.extend(player_map_references(snapshot));
    references.extend(action_point_references(snapshot));
    references.extend(random_rectangle_references(snapshot));
    references.extend(extra_action_point_references(snapshot));
    references.extend(settings_action_references(snapshot));
    references.extend(simple_encounter_references(snapshot));
    references.extend(complex_encounter_references(snapshot));
    references.extend(rogue_encounter_references(snapshot));
    references.extend(timed_encounter_references(snapshot));
    references.extend(special_land_tile_references(snapshot));
    references.extend(monster_references(snapshot));
    references.extend(battle_references(snapshot));
    references.extend(treasure_references(snapshot));
    references.extend(shop_references(snapshot));
    references.extend(shop_program_references(snapshot));
    references.extend(option_label_program_references(snapshot));
    references.extend(quest_references(snapshot));
    references.extend(references_for_rules(snapshot));
    references.extend(crate::item_artwork::references(snapshot));
    references.extend(super::spell_references::references(snapshot));
    references.extend(references_for_application(snapshot));
    references.sort_by_key(|reference| (reference.source.clone(), reference.field.clone()));
    references
}

fn start_location_reference(snapshot: &ProjectSnapshot) -> Option<ReferenceDescriptor> {
    let start = snapshot.start_location.as_ref()?;
    let resolved = snapshot
        .world
        .maps
        .iter()
        .any(|map| map.identity == start.map);
    Some(ReferenceDescriptor {
        source: snapshot.project_id.clone(),
        field: FieldPath("startLocation.map".into()),
        target_kind: TargetKind::Map,
        target_id: start.map.0.clone(),
        required: true,
        stock_fallback: None,
        resolution: if resolved {
            ResolutionState::Resolved
        } else {
            ResolutionState::Missing
        },
        repair_actions: if resolved {
            vec![RepairAction::Retarget]
        } else {
            vec![RepairAction::Retarget, RepairAction::CreateTarget]
        },
        byte_provenance: None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        model::{LevelType, StableId},
        session::{
            EditorCommand, EditorSession, ExpectedRevisionCommand, LandMapCellPaint,
            diagnostics_for,
        },
    };

    fn check(session: &EditorSession) {
        assert_eq!(session.references(), references_for(session.snapshot()));
        assert_eq!(session.diagnostics(), diagnostics_for(session.snapshot()));
        assert!(session.projections.references.get().is_some());
        assert!(session.projections.diagnostics.get().is_some());
    }

    #[test]
    fn derived_views_track_commands_undo_redo_and_reopen_without_entering_persisted_state() {
        let mut session = EditorSession::new(ProjectSnapshot::new_authored(StableId(
            "cached-views".into(),
        )));
        check(&session);
        for command in [
            EditorCommand::CreateMap {
                level_type: LevelType::Land,
            },
            EditorCommand::Undo,
            EditorCommand::Redo,
        ] {
            session
                .execute(ExpectedRevisionCommand {
                    expected_revision: session.revision(),
                    command,
                })
                .unwrap();
            assert!(session.projections.references.get().is_none());
            check(&session);
            let reopened = EditorSession::from_persisted_state(session.persisted_state());
            assert!(reopened.projections.references.get().is_none());
            check(&reopened);
        }
        let clone = session.clone();
        assert!(clone.projections.references.get().is_none());
        assert_eq!(clone.persisted_state(), session.persisted_state());
    }

    #[test]
    fn reference_free_edits_and_history_keep_valid_derived_views() {
        let mut session = EditorSession::new(ProjectSnapshot::new_authored(StableId(
            "cached-paint".into(),
        )));
        session
            .execute(ExpectedRevisionCommand {
                expected_revision: session.revision(),
                command: EditorCommand::CreateMap {
                    level_type: LevelType::Land,
                },
            })
            .unwrap();
        check(&session);
        let references = session.references();
        let diagnostics = session.diagnostics();
        session
            .execute(ExpectedRevisionCommand {
                expected_revision: session.revision(),
                command: EditorCommand::PaintLandMapCells {
                    identity: StableId("land:0".into()),
                    cells: vec![LandMapCellPaint {
                        x: 2,
                        y: 3,
                        tile: 1,
                    }],
                },
            })
            .unwrap();
        assert_eq!(session.references(), references);
        assert_eq!(session.diagnostics(), diagnostics);
        check(&session);
        for command in [EditorCommand::Undo, EditorCommand::Redo] {
            let projection = session
                .execute(ExpectedRevisionCommand {
                    expected_revision: session.revision(),
                    command,
                })
                .unwrap();
            assert!(projection.references_unchanged);
            assert_eq!(session.references(), references);
            assert_eq!(session.diagnostics(), diagnostics);
            check(&session);
        }
    }
}

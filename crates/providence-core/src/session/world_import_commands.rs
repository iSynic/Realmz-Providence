use crate::model::ActionPoint;
use crate::model::BlobId;
use crate::model::ClassicSourceBlob;
use crate::model::LevelType;
use crate::model::MapLevel;
use crate::model::ProjectOrigin;
use crate::model::StableId;
use crate::session::EditorSession;
use crate::session::commands::EditorCommand;
use crate::session::errors::SessionError;
use std::collections::BTreeSet;

mod dungeon;
mod land;

use land::ClassicLandImportView;

impl EditorSession {
    pub(super) fn import_classic_land_slice(
        &mut self,
        command: EditorCommand,
    ) -> Result<Vec<StableId>, SessionError> {
        let EditorCommand::ImportClassicLandSlice {
            annex_blob,
            sources,
            maps,
            action_points,
            messages,
            simple_encounters,
            extra_codes,
            extra_action_points,
            global_macro_hooks,
            land_layout,
        } = command
        else {
            unreachable!("command routed by variant");
        };
        let input = ClassicLandImportView {
            sources: &sources,
            maps: &maps,
            action_points: &action_points,
            messages: &messages,
            simple_encounters: &simple_encounters,
            extra_codes: &extra_codes,
            extra_action_points: &extra_action_points,
            global_macro_hooks: global_macro_hooks.as_deref(),
            land_layout: land_layout.as_ref(),
        };
        land::validate(input)?;
        let mut identities = self.land_import_changed_identities(input);
        self.snapshot.origin = ProjectOrigin::Imported {
            compatibility_annex: annex_blob,
        };
        self.snapshot.classic_sources = sources;
        self.replace_imported_levels(LevelType::Land, maps, action_points);
        self.snapshot.messages = messages;
        self.snapshot.message_references.clear();
        self.snapshot.simple_encounters = simple_encounters;
        self.snapshot.extra_codes = extra_codes;
        self.snapshot.extra_action_points = extra_action_points;
        self.snapshot.world.land_layout = land_layout;
        if let Some(contract) = global_macro_hooks {
            self.snapshot.scenario_application = Some(*contract);
        }
        self.snapshot.normalize();
        identities.remove(&self.snapshot.project_id);
        Ok(std::iter::once(self.snapshot.project_id.clone())
            .chain(identities)
            .collect())
    }

    fn land_import_changed_identities(
        &self,
        input: ClassicLandImportView<'_>,
    ) -> BTreeSet<StableId> {
        let snapshot = &self.snapshot;
        let mut identities = BTreeSet::from([snapshot.project_id.clone()]);
        identities.extend(
            snapshot
                .world
                .maps
                .iter()
                .filter(|map| map.level_type == LevelType::Land)
                .chain(input.maps.iter())
                .map(|map| map.identity.clone()),
        );
        identities.extend(
            snapshot
                .world
                .action_points
                .iter()
                .filter(|row| row.level_type == LevelType::Land)
                .chain(input.action_points.iter())
                .map(|row| row.identity.clone()),
        );
        identities.extend(
            snapshot
                .messages
                .iter()
                .chain(input.messages.iter())
                .map(|row| row.identity.clone()),
        );
        identities.extend(
            snapshot
                .simple_encounters
                .iter()
                .chain(input.simple_encounters.iter())
                .map(|row| row.identity.clone()),
        );
        identities.extend(
            snapshot
                .extra_codes
                .iter()
                .chain(input.extra_codes.iter())
                .map(|row| StableId(format!("extra-code:{}", row.native_id.0))),
        );
        identities.extend(
            snapshot
                .extra_action_points
                .iter()
                .chain(input.extra_action_points.iter())
                .map(|row| row.identity.clone()),
        );
        identities
    }

    pub(super) fn import_classic_dungeon_slice(
        &mut self,
        annex_blob: BlobId,
        sources: Vec<ClassicSourceBlob>,
        maps: Vec<MapLevel>,
        action_points: Vec<ActionPoint>,
    ) -> Result<Vec<StableId>, SessionError> {
        dungeon::validate(&sources, &maps, &action_points)?;
        let identities = std::iter::once(self.snapshot.project_id.clone())
            .chain(
                self.snapshot
                    .world
                    .maps
                    .iter()
                    .filter(|map| map.level_type == LevelType::Dungeon)
                    .chain(maps.iter())
                    .map(|map| map.identity.clone()),
            )
            .chain(
                self.snapshot
                    .world
                    .action_points
                    .iter()
                    .filter(|row| row.level_type == LevelType::Dungeon)
                    .chain(action_points.iter())
                    .map(|row| row.identity.clone()),
            )
            .collect::<BTreeSet<_>>();
        self.snapshot.origin = ProjectOrigin::Imported {
            compatibility_annex: annex_blob,
        };
        self.snapshot.classic_sources = sources;
        self.replace_imported_levels(LevelType::Dungeon, maps, action_points);
        self.snapshot.normalize();
        Ok(identities.into_iter().collect())
    }

    fn replace_imported_levels(
        &mut self,
        level_type: LevelType,
        maps: Vec<MapLevel>,
        action_points: Vec<ActionPoint>,
    ) {
        self.snapshot
            .world
            .maps
            .retain(|map| map.level_type != level_type);
        self.snapshot.world.maps.extend(maps);
        self.snapshot
            .world
            .action_points
            .retain(|row| row.level_type != level_type);
        self.snapshot.world.action_points.extend(action_points);
    }
}

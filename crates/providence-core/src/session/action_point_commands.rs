use crate::codecs::ACTION_POINTS_PER_LEVEL;
use crate::model::ActionPoint;
use crate::model::MapCoordinate;
use crate::model::StableId;
use crate::session::EditorSession;
use crate::session::action_point_records::action_point_identity;
use crate::session::action_point_records::append_changed_map;
use crate::session::action_point_records::new_action_point;
use crate::session::action_point_records::refresh_action_point_marker;
use crate::session::action_point_records::reusable_action_point_slot;
use crate::session::action_point_records::upsert_action_point;
use crate::session::action_point_records::validate_action_point_draft;
use crate::session::action_point_records::validate_action_point_map_cell;
use crate::session::action_point_records::{
    validate_action_point_replacement, validate_action_point_trigger,
    validate_new_action_point_position,
};
use crate::session::errors::SessionError;

impl EditorSession {
    pub(super) fn update_action_point(
        &mut self,
        action_point: ActionPoint,
    ) -> Result<Vec<StableId>, SessionError> {
        replace_action_point(&mut self.snapshot, action_point)
    }

    pub(super) fn create_action_point(
        &mut self,
        map: StableId,
        coordinate: MapCoordinate,
    ) -> Result<Vec<StableId>, SessionError> {
        let row = self.action_point_creation_candidate(&map, coordinate)?;
        let level_type = row.level_type;
        let level_index = row.level_index;
        let mut changed = vec![row.identity.clone()];
        upsert_action_point(&mut self.snapshot, row);
        append_changed_map(
            &mut changed,
            refresh_action_point_marker(&mut self.snapshot, level_type, level_index, coordinate)?,
        );
        Ok(changed)
    }

    /// Reviews the same allocation used by creation without changing history or source truth.
    pub fn action_point_creation_candidate(
        &self,
        map: &StableId,
        coordinate: MapCoordinate,
    ) -> Result<ActionPoint, SessionError> {
        let map_level = self
            .snapshot
            .world
            .maps
            .iter()
            .find(|candidate| &candidate.identity == map)
            .ok_or_else(|| SessionError::MapNotFound(map.clone()))?;
        let identity_hint = action_point_identity(map_level.level_type, map_level.native_index, 0);
        validate_new_action_point_position(
            &self.snapshot,
            map_level.level_type,
            map_level.native_index,
            coordinate,
            &identity_hint,
        )?;
        let record_index = reusable_action_point_slot(
            &self.snapshot,
            map_level.level_type,
            map_level.native_index,
        )
        .ok_or_else(|| SessionError::InvalidActionPoint {
            identity: map.clone(),
            reason: format!(
                "all {ACTION_POINTS_PER_LEVEL} Classic Action Point slots are occupied"
            ),
        })?;
        let identity =
            action_point_identity(map_level.level_type, map_level.native_index, record_index);
        new_action_point(
            identity,
            map_level.level_type,
            map_level.native_index,
            record_index,
            coordinate,
            Vec::new(),
            100,
        )
    }

    pub(super) fn duplicate_action_point(
        &mut self,
        source: StableId,
        coordinate: MapCoordinate,
    ) -> Result<Vec<StableId>, SessionError> {
        let original = self
            .snapshot
            .world
            .action_points
            .iter()
            .find(|candidate| candidate.identity == source)
            .cloned()
            .ok_or_else(|| SessionError::ActionPointNotFound(source.clone()))?;
        if original.coordinate.is_none() || original.chance_percent < 1 {
            return Err(SessionError::InvalidActionPoint {
                identity: source,
                reason: "only an active, placed Action Point can be duplicated".into(),
            });
        }
        validate_new_action_point_position(
            &self.snapshot,
            original.level_type,
            original.level_index,
            coordinate,
            &original.identity,
        )?;
        let record_index =
            reusable_action_point_slot(&self.snapshot, original.level_type, original.level_index)
                .ok_or_else(|| SessionError::InvalidActionPoint {
                identity: original.identity.clone(),
                reason: format!(
                    "all {ACTION_POINTS_PER_LEVEL} Classic Action Point slots are occupied"
                ),
            })?;
        let identity =
            action_point_identity(original.level_type, original.level_index, record_index);
        let duplicate = new_action_point(
            identity.clone(),
            original.level_type,
            original.level_index,
            record_index,
            coordinate,
            original.actions,
            original.chance_percent,
        )?;
        upsert_action_point(&mut self.snapshot, duplicate);
        let mut changed = vec![identity];
        append_changed_map(
            &mut changed,
            refresh_action_point_marker(
                &mut self.snapshot,
                original.level_type,
                original.level_index,
                coordinate,
            )?,
        );
        Ok(changed)
    }

    pub(super) fn clear_action_point(
        &mut self,
        source: StableId,
    ) -> Result<Vec<StableId>, SessionError> {
        let existing_index = self
            .snapshot
            .world
            .action_points
            .iter()
            .position(|candidate| candidate.identity == source)
            .ok_or_else(|| SessionError::ActionPointNotFound(source.clone()))?;
        let original = self.snapshot.world.action_points[existing_index].clone();
        if let Some(coordinate) = original.coordinate {
            validate_action_point_map_cell(
                &self.snapshot,
                original.level_type,
                original.level_index,
                coordinate,
            )?;
        }
        self.snapshot.world.action_points[existing_index] = ActionPoint {
            identity: original.identity.clone(),
            level_type: original.level_type,
            level_index: original.level_index,
            record_index: original.record_index,
            classic_door_id: 0,
            coordinate: None,
            post_action_level: 0,
            post_action_x: 0,
            post_action_y: 0,
            chance_percent: 0,
            actions: Vec::new(),
        };
        let mut changed = vec![original.identity];
        if let Some(coordinate) = original.coordinate {
            append_changed_map(
                &mut changed,
                refresh_action_point_marker(
                    &mut self.snapshot,
                    original.level_type,
                    original.level_index,
                    coordinate,
                )?,
            );
        }
        Ok(changed)
    }
}

pub(super) fn replace_action_point(
    snapshot: &mut crate::model::ProjectSnapshot,
    action_point: ActionPoint,
) -> Result<Vec<StableId>, SessionError> {
    validate_action_point_draft(&action_point)?;
    let identity = action_point.identity.clone();
    let existing_index = snapshot
        .world
        .action_points
        .iter()
        .position(|candidate| candidate.identity == identity)
        .ok_or_else(|| SessionError::ActionPointNotFound(identity.clone()))?;
    let existing = snapshot.world.action_points[existing_index].clone();
    validate_action_point_replacement(snapshot, &action_point, existing_index)?;
    validate_action_point_trigger(snapshot, &existing)?;
    validate_action_point_trigger(snapshot, &action_point)?;
    snapshot.world.action_points[existing_index] = action_point;
    let mut changed = vec![identity];
    if let Some(coordinate) = existing.coordinate {
        append_changed_map(
            &mut changed,
            refresh_action_point_marker(
                snapshot,
                existing.level_type,
                existing.level_index,
                coordinate,
            )?,
        );
    }
    let updated = &snapshot.world.action_points[existing_index];
    let (level_type, level_index, coordinate) =
        (updated.level_type, updated.level_index, updated.coordinate);
    if let Some(coordinate) = coordinate {
        append_changed_map(
            &mut changed,
            refresh_action_point_marker(snapshot, level_type, level_index, coordinate)?,
        );
    }
    Ok(changed)
}

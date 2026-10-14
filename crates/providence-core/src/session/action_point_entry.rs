use super::action_point_records::write_action_point_marker;
use super::{ActionPointHeaderDraft, ActionPointRecordDraft, EditorSession, SessionError};
use crate::{
    action_point_activation,
    model::{LevelType, MapCoordinate, ProjectSnapshot, StableId},
};

impl EditorSession {
    /// Prepares the existing atomic draft command without rewriting instructions or descriptors.
    pub fn action_point_entry_marker_draft(
        &self,
        source: &StableId,
        enabled: bool,
    ) -> Result<ActionPointRecordDraft, SessionError> {
        let row = self
            .snapshot
            .world
            .action_points
            .iter()
            .find(|row| row.identity == *source)
            .ok_or_else(|| SessionError::ActionPointNotFound(source.clone()))?;
        Ok(ActionPointRecordDraft {
            source: source.clone(),
            descriptor: self
                .snapshot
                .script_descriptors
                .iter()
                .find(|row| row.source == *source)
                .map_or_else(String::new, |row| row.text.clone()),
            header: ActionPointHeaderDraft {
                coordinate: row.coordinate,
                post_action_level: row.post_action_level,
                post_action_x: row.post_action_x,
                post_action_y: row.post_action_y,
                chance_percent: row.chance_percent,
            },
            entry_marker: Some(enabled),
            steps: Vec::new(),
        })
    }
}

pub(super) fn set_marker(
    snapshot: &mut ProjectSnapshot,
    source: &StableId,
    enabled: bool,
) -> Result<Vec<StableId>, SessionError> {
    let (kind, index, cell) = marker_placement(snapshot, source)?;
    let map = write_action_point_marker(snapshot, kind, index, cell, enabled)?;
    let mut changed = map.into_iter().collect::<Vec<_>>();
    // The marker belongs to the cell, so every co-located record needs a refresh.
    changed.extend(
        snapshot
            .world
            .action_points
            .iter()
            .filter(|other| {
                other.level_type == kind
                    && other.level_index == index
                    && other.coordinate == Some(cell)
            })
            .map(|other| other.identity.clone()),
    );
    Ok(changed)
}

fn marker_placement(
    snapshot: &ProjectSnapshot,
    source: &StableId,
) -> Result<(LevelType, u32, MapCoordinate), SessionError> {
    let row = snapshot
        .world
        .action_points
        .iter()
        .find(|row| row.identity == *source)
        .ok_or_else(|| SessionError::ActionPointNotFound(source.clone()))?;
    let status = action_point_activation::project(snapshot, row);
    let invalid = || SessionError::InvalidActionPoint {
        identity: source.clone(),
        reason: status.marker_reason.into(),
    };
    if !status.marker_editable {
        return Err(invalid());
    }
    let cell = row.coordinate.ok_or_else(invalid)?;
    Ok((row.level_type, row.level_index, cell))
}

use crate::model::ExtraActionPoint;
use crate::model::NativeRecordId;
use crate::model::StableId;
use crate::session::EditorSession;
use crate::session::errors::SessionError;
use std::collections::BTreeSet;

impl EditorSession {
    pub(super) fn update_extra_action_point(
        &mut self,
        extra_action_point: Box<ExtraActionPoint>,
    ) -> Result<Vec<StableId>, SessionError> {
        validate_extra_action_point_draft(&extra_action_point)?;
        let identity = extra_action_point.identity.clone();
        let existing = self
            .snapshot
            .extra_action_points
            .iter_mut()
            .find(|candidate| candidate.identity == identity)
            .ok_or_else(|| SessionError::ExtraActionPointNotFound(identity.clone()))?;
        if existing.native_id != extra_action_point.native_id {
            return Err(SessionError::InvalidExtraActionPoint {
                identity,
                reason: format!(
                    "native ID {} cannot replace native ID {}",
                    extra_action_point.native_id.0, existing.native_id.0
                ),
            });
        }
        *existing = *extra_action_point;
        Ok(vec![identity])
    }

    pub(super) fn create_extra_action_point(
        &mut self,
        native_id: Option<NativeRecordId>,
    ) -> Result<Vec<StableId>, SessionError> {
        let native_id = allocate_extra_action_point_id(&self.snapshot, native_id)?;
        materialize_extra_action_point(&mut self.snapshot, native_id, None)
    }

    pub(super) fn duplicate_extra_action_point(
        &mut self,
        source: StableId,
        native_id: Option<NativeRecordId>,
    ) -> Result<Vec<StableId>, SessionError> {
        let original = self
            .snapshot
            .extra_action_points
            .iter()
            .find(|row| row.identity == source)
            .cloned()
            .ok_or_else(|| SessionError::ExtraActionPointNotFound(source.clone()))?;
        if extra_action_point_is_reusable(&original) {
            return Err(SessionError::InvalidExtraActionPoint {
                identity: source,
                reason: "an empty reusable row cannot be duplicated".into(),
            });
        }
        let native_id = allocate_extra_action_point_id(&self.snapshot, native_id)?;
        materialize_extra_action_point(&mut self.snapshot, native_id, Some(&original))
    }

    pub(super) fn delete_extra_action_point(
        &mut self,
        source: StableId,
    ) -> Result<Vec<StableId>, SessionError> {
        let row = self
            .snapshot
            .extra_action_points
            .iter_mut()
            .find(|row| row.identity == source)
            .ok_or_else(|| SessionError::ExtraActionPointNotFound(source.clone()))?;
        *row = blank_extra_action_point(row.native_id.0);
        Ok(vec![source])
    }
}

fn allocate_extra_action_point_id(
    snapshot: &crate::model::ProjectSnapshot,
    requested: Option<NativeRecordId>,
) -> Result<NativeRecordId, SessionError> {
    let native_id = requested.unwrap_or_else(|| {
        snapshot
            .extra_action_points
            .iter()
            .find(|row| extra_action_point_is_reusable(row))
            .map(|row| row.native_id)
            .unwrap_or_else(|| {
                NativeRecordId(
                    snapshot
                        .extra_action_points
                        .iter()
                        .map(|row| row.native_id.0)
                        .max()
                        .map_or(0, |id| id + 1),
                )
            })
    });
    let identity = StableId(format!("extra-action-point:{}", native_id.0));
    if let Some(limit) = certified_extra_action_point_limit(snapshot)
        && native_id.0 as usize >= limit
    {
        return Err(SessionError::InvalidExtraActionPoint {
            identity,
            reason: format!(
                "native ID {} would overwrite a certified foreign Data ED3 suffix; reuse an empty record below {}",
                native_id.0, limit
            ),
        });
    }
    if native_id.0 > i16::MAX as u32 {
        return Err(SessionError::InvalidExtraActionPoint {
            identity,
            reason: format!(
                "native ID {} is outside the nonnegative Classic signed-short range",
                native_id.0
            ),
        });
    }
    if snapshot
        .extra_action_points
        .iter()
        .any(|row| row.native_id == native_id && !extra_action_point_is_reusable(row))
    {
        return Err(SessionError::InvalidExtraActionPoint {
            identity,
            reason: format!("native ID {} already exists", native_id.0),
        });
    }
    Ok(native_id)
}

fn certified_extra_action_point_limit(snapshot: &crate::model::ProjectSnapshot) -> Option<usize> {
    let source = snapshot
        .classic_sources
        .iter()
        .find(|source| source.native_path == "Data ED3")?;
    crate::codecs::certified_extra_action_point_source(&source.blob.0, source.byte_length as usize)
        .map(|extent| extent.authored_records)
}

fn materialize_extra_action_point(
    snapshot: &mut crate::model::ProjectSnapshot,
    native_id: NativeRecordId,
    source: Option<&ExtraActionPoint>,
) -> Result<Vec<StableId>, SessionError> {
    let existing = snapshot
        .extra_action_points
        .iter()
        .map(|row| row.native_id.0)
        .collect::<BTreeSet<_>>();
    let upper = snapshot
        .extra_action_points
        .iter()
        .map(|row| row.native_id.0)
        .max()
        .unwrap_or(0)
        .max(native_id.0);
    let created = (0..=upper)
        .filter(|id| !existing.contains(id))
        .map(blank_extra_action_point)
        .collect::<Vec<_>>();
    let mut changed = created
        .iter()
        .map(|row| row.identity.clone())
        .collect::<Vec<_>>();
    snapshot.extra_action_points.extend(created);
    let destination = snapshot
        .extra_action_points
        .iter_mut()
        .find(|row| row.native_id == native_id)
        .expect("requested row was existing or materialized");
    *destination = source.map_or_else(
        || active_extra_action_point(native_id.0),
        |source| ExtraActionPoint {
            identity: StableId(format!("extra-action-point:{}", native_id.0)),
            native_id,
            classic_door_id: source.classic_door_id,
            post_action_level: source.post_action_level,
            post_action_x: source.post_action_x,
            post_action_y: source.post_action_y,
            chance_percent: source.chance_percent,
            actions: source.actions.clone(),
        },
    );
    if !changed.contains(&destination.identity) {
        changed.push(destination.identity.clone());
    }
    snapshot.normalize();
    Ok(changed)
}

pub(super) fn validate_extra_action_point_draft(
    row: &ExtraActionPoint,
) -> Result<(), SessionError> {
    let expected_identity = StableId(format!("extra-action-point:{}", row.native_id.0));
    if row.identity != expected_identity {
        return Err(SessionError::InvalidExtraActionPoint {
            identity: row.identity.clone(),
            reason: format!(
                "native ID {} requires identity {}",
                row.native_id.0, expected_identity.0
            ),
        });
    }
    let mut slots = BTreeSet::new();
    for action in &row.actions {
        if action.slot >= 8 {
            return Err(SessionError::InvalidExtraActionPoint {
                identity: row.identity.clone(),
                reason: format!("action slot {} is outside 0 through 7", action.slot),
            });
        }
        if !slots.insert(action.slot) {
            return Err(SessionError::InvalidExtraActionPoint {
                identity: row.identity.clone(),
                reason: format!("action slot {} is duplicated", action.slot),
            });
        }
        if !(i8::MIN as i16..=i8::MAX as i16).contains(&action.raw_opcode) {
            return Err(SessionError::InvalidExtraActionPoint {
                identity: row.identity.clone(),
                reason: format!(
                    "action opcode {} is outside signed-byte range",
                    action.raw_opcode
                ),
            });
        }
    }
    Ok(())
}

pub(super) fn blank_extra_action_point(native_id: u32) -> ExtraActionPoint {
    ExtraActionPoint {
        identity: StableId(format!("extra-action-point:{native_id}")),
        native_id: NativeRecordId(native_id),
        classic_door_id: 0,
        post_action_level: 0,
        post_action_x: 0,
        post_action_y: 0,
        chance_percent: 0,
        actions: Vec::new(),
    }
}

fn active_extra_action_point(native_id: u32) -> ExtraActionPoint {
    ExtraActionPoint {
        chance_percent: 100,
        ..blank_extra_action_point(native_id)
    }
}

pub(super) fn extra_action_point_is_reusable(row: &ExtraActionPoint) -> bool {
    row.classic_door_id == 0
        && row.post_action_level == 0
        && row.post_action_x == 0
        && row.post_action_y == 0
        && row.chance_percent == 0
        && row.actions.is_empty()
}

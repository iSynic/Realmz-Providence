use crate::model::{ActionPoint, LevelType, ProjectSnapshot, StableId};

pub(super) fn action_point_id(point: &ActionPoint) -> StableId {
    let source = match point.level_type {
        LevelType::Land => "Data DD",
        LevelType::Dungeon => "Data DDD",
    };
    StableId(format!(
        "{source}:{}:{}",
        point.level_index, point.record_index
    ))
}

pub(super) fn action_point_program_id(point: &ActionPoint) -> StableId {
    StableId(format!("trigger:{}", action_point_id(point).0))
}

pub fn rebuilt_v3_action_point_owner<'a>(
    snapshot: &'a ProjectSnapshot,
    program_id: &StableId,
) -> Option<&'a ActionPoint> {
    snapshot
        .world
        .action_points
        .iter()
        .find(|point| action_point_program_id(point) == *program_id)
}

pub(super) fn extra_action_point_owner_id(native_id: u32) -> StableId {
    StableId(format!("Data ED3:macro:{native_id}"))
}

pub(crate) fn application_program_id(snapshot: &ProjectSnapshot, id: &StableId) -> StableId {
    if let Some(native_id) = id.0.strip_prefix("extra-action-point:")
        && let Ok(native_id) = native_id.parse::<u32>()
    {
        return StableId(format!("xap:{native_id}"));
    }
    if let Some(identity) = id.0.strip_prefix("trigger:")
        && let Some(point) = snapshot
            .world
            .action_points
            .iter()
            .find(|point| point.identity.0 == identity)
    {
        return action_point_program_id(point);
    }
    id.clone()
}

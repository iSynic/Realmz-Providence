use crate::codecs::{
    ACTION_POINT_LEVEL_BYTES, ACTION_POINTS_PER_LEVEL, MAP_LEVEL_BYTES,
    encode_dungeon_action_points, encode_dungeon_maps, encode_dungeon_random_levels,
};
use crate::model::{ActionPoint, ClassicSourceBlob, LevelType, MapLevel};
use crate::session::errors::SessionError;
use std::collections::BTreeSet;

pub(super) fn validate(
    sources: &[ClassicSourceBlob],
    maps: &[MapLevel],
    action_points: &[ActionPoint],
) -> Result<(), SessionError> {
    let mut source_paths = BTreeSet::new();
    for source in sources {
        if !source_paths.insert(source.native_path.as_str()) {
            return Err(SessionError::InvalidClassicImport(format!(
                "duplicate source {}",
                source.native_path
            )));
        }
    }
    let source = |path: &str| {
        sources
            .iter()
            .find(|source| source.native_path == path)
            .ok_or_else(|| {
                SessionError::InvalidClassicImport(format!("missing required source {path}"))
            })
    };
    let data_dl = source("Data DL")?;
    let data_ddd = source("Data DDD")?;
    let data_rdd = source("Data RDD")?;
    validate_maps(data_dl, data_rdd, maps)?;
    validate_runtime_geometry(data_rdd, maps)?;
    validate_action_points(data_ddd, maps.len(), action_points)
}

fn validate_maps(
    data_dl: &ClassicSourceBlob,
    data_rdd: &ClassicSourceBlob,
    maps: &[MapLevel],
) -> Result<(), SessionError> {
    if maps.is_empty() {
        return Err(SessionError::InvalidClassicImport(
            "Data DL must contain at least one dungeon level".into(),
        ));
    }
    if data_dl.byte_length as usize != maps.len() * MAP_LEVEL_BYTES
        || encode_dungeon_maps(maps, None)
            .map_err(|error| SessionError::InvalidClassicImport(error.to_string()))?
            .len()
            != data_dl.byte_length as usize
    {
        return Err(SessionError::InvalidClassicImport(
            "Data DL geometry does not match the decoded dungeon-map count".into(),
        ));
    }
    for (index, map) in maps.iter().enumerate() {
        if map.level_type != LevelType::Dungeon
            || map.native_index != index as u32
            || map.identity.0 != format!("dungeon:{index}")
            || map.tiles.len() != crate::model::CLASSIC_MAP_SIZE * crate::model::CLASSIC_MAP_SIZE
        {
            return Err(SessionError::InvalidClassicImport(format!(
                "Data DL row {index} does not have canonical dungeon identity and geometry"
            )));
        }
        let Some(runtime) = map.runtime.as_ref() else {
            return Err(SessionError::InvalidClassicImport(format!(
                "dungeon map {} lacks its Data RDD runtime record",
                map.identity.0
            )));
        };
        if runtime.source != "Data RDD"
            || runtime.source_blob.as_ref() != Some(&data_rdd.blob)
            || runtime.landlook.is_none()
            || runtime.base_scale.is_some()
            || runtime.base_tile.is_some()
            || runtime.tileset_id.0 != "dungeon-top-down-302"
        {
            return Err(SessionError::InvalidClassicImport(format!(
                "dungeon map {} has invalid Data RDD attribution or metadata",
                map.identity.0
            )));
        }
    }
    Ok(())
}

fn validate_runtime_geometry(
    data_rdd: &ClassicSourceBlob,
    maps: &[MapLevel],
) -> Result<(), SessionError> {
    if data_rdd.byte_length as usize != maps.len() * crate::codecs::RANDOM_LEVEL_RECORD_BYTES
        || encode_dungeon_random_levels(maps, None)
            .map_err(|error| SessionError::InvalidClassicImport(error.to_string()))?
            .len()
            != data_rdd.byte_length as usize
    {
        return Err(SessionError::InvalidClassicImport(
            "Data RDD geometry does not match the decoded dungeon-map count".into(),
        ));
    }
    Ok(())
}

fn validate_action_points(
    data_ddd: &ClassicSourceBlob,
    map_count: usize,
    action_points: &[ActionPoint],
) -> Result<(), SessionError> {
    if data_ddd.byte_length as usize != map_count * ACTION_POINT_LEVEL_BYTES
        || action_points.len() != map_count * ACTION_POINTS_PER_LEVEL
        || encode_dungeon_action_points(action_points, map_count, None)
            .map_err(|error| SessionError::InvalidClassicImport(error.to_string()))?
            .len()
            != data_ddd.byte_length as usize
    {
        return Err(SessionError::InvalidClassicImport(
            "Data DDD geometry does not match the decoded dungeon-map count".into(),
        ));
    }
    for (index, action_point) in action_points.iter().enumerate() {
        let level_index = index / ACTION_POINTS_PER_LEVEL;
        let record_index = index % ACTION_POINTS_PER_LEVEL;
        if action_point.level_type != LevelType::Dungeon
            || action_point.level_index != level_index as u32
            || action_point.record_index != record_index as u8
            || action_point.identity.0
                != format!("action-point:dungeon:{level_index}:{record_index}")
        {
            return Err(SessionError::InvalidClassicImport(format!(
                "Data DDD row {index} does not have canonical level and record identity"
            )));
        }
    }
    Ok(())
}

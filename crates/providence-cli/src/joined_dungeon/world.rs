use providence_core::codecs::ACTION_POINT_LEVEL_BYTES;
use providence_core::codecs::MAP_LEVEL_BYTES;
use providence_core::codecs::RANDOM_LEVEL_RECORD_BYTES;
use providence_core::codecs::decode_dungeon_action_points;
use providence_core::codecs::decode_dungeon_maps;
use providence_core::codecs::decode_dungeon_random_levels;
use providence_core::codecs::decode_land_action_points;
use providence_core::codecs::decode_land_maps;
use providence_core::codecs::decode_land_random_levels;

use super::sources::ScenarioSources;
use providence_core::model::{ActionPoint, MapLevel};

pub(super) struct WorldRows {
    pub(super) maps: Vec<MapLevel>,
    pub(super) action_points: Vec<ActionPoint>,
}

pub(super) fn decode_dungeon(sources: &ScenarioSources) -> Result<WorldRows, String> {
    let ScenarioSources {
        data_dl,
        data_ddd,
        data_rdd,
        ..
    } = sources;
    let mut maps = decode_dungeon_maps(data_dl);
    if maps.records.is_empty() || !maps.trailing_bytes.is_empty() {
        return Err(format!(
            "Data DL must contain one or more complete {MAP_LEVEL_BYTES}-byte dungeon levels"
        ));
    }
    let action_points = decode_dungeon_action_points(data_ddd);
    if !action_points.trailing_bytes.is_empty()
        || data_ddd.len() != maps.records.len() * ACTION_POINT_LEVEL_BYTES
    {
        return Err("Data DDD must contain exactly 100 records for every Data DL level".into());
    }
    let random_levels = decode_dungeon_random_levels(data_rdd);
    if !random_levels.trailing_bytes.is_empty()
        || data_rdd.len() != maps.records.len() * RANDOM_LEVEL_RECORD_BYTES
    {
        return Err(
            "Data RDD must contain exactly one 644-byte record for every Data DL level".into(),
        );
    }
    for (map, runtime) in maps.records.iter_mut().zip(random_levels.records) {
        if map.native_index != runtime.native_index {
            return Err("Data RDD record order does not match Data DL level order".into());
        }
        map.runtime = Some(runtime.runtime);
    }

    Ok(WorldRows {
        maps: maps.records,
        action_points: action_points.records,
    })
}

pub(super) fn decode_land(sources: &ScenarioSources) -> Result<WorldRows, String> {
    let ScenarioSources {
        data_ld,
        data_dd,
        data_rd,
        ..
    } = sources;
    let land_action_points = decode_land_action_points(data_dd);
    let mut land_maps = decode_land_maps(data_ld);
    if land_maps.records.is_empty()
        || !land_maps.trailing_bytes.is_empty()
        || !land_action_points.trailing_bytes.is_empty()
        || data_ld.len() != land_maps.records.len() * MAP_LEVEL_BYTES
        || data_dd.len() != land_maps.records.len() * ACTION_POINT_LEVEL_BYTES
    {
        return Err(
            "Data LD must contain exactly one complete map for every 100 Data DD records".into(),
        );
    }
    let land_random_levels = decode_land_random_levels(data_rd);
    if !land_random_levels.trailing_bytes.is_empty()
        || data_rd.len() != land_maps.records.len() * RANDOM_LEVEL_RECORD_BYTES
    {
        return Err(
            "Data RD must contain exactly one 644-byte record for every Data LD level".into(),
        );
    }
    for (map, runtime) in land_maps.records.iter_mut().zip(land_random_levels.records) {
        if map.native_index != runtime.native_index {
            return Err("Data RD record order does not match Data LD level order".into());
        }
        map.runtime = Some(runtime.runtime);
    }

    Ok(WorldRows {
        maps: land_maps.records,
        action_points: land_action_points.records,
    })
}

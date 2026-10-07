use super::scenario_resolution::{push_asset_of_kind, push_resource, push_sound};
use super::{RebuiltV3MediaRelation, RebuiltV3MediaRequirement, RebuiltV3RuntimeMediaReference};
use crate::model::{ProjectSnapshot, StableId};
use crate::{
    codecs::normalize_special_land_resource_id,
    model::{LevelType, MapLevel},
};

pub(super) fn append_maps(
    references: &mut Vec<RebuiltV3RuntimeMediaReference>,
    snapshot: &ProjectSnapshot,
) {
    for map in &snapshot.world.maps {
        append_runtime(references, snapshot, map);
        append_overlays(references, snapshot, map);
    }
}

fn append_runtime(
    references: &mut Vec<RebuiltV3RuntimeMediaReference>,
    snapshot: &ProjectSnapshot,
    map: &MapLevel,
) {
    if let Some(runtime) = &map.runtime {
        push_asset_of_kind(
            references,
            snapshot,
            map.identity.clone(),
            "runtime.tilesetId".into(),
            RebuiltV3MediaRelation::MapTileset,
            RebuiltV3MediaRequirement::ApplicationRequired,
            runtime.tileset_id.clone(),
            "tileset",
        );
        for (index, rectangle) in runtime.random_rectangles.iter().enumerate() {
            push_sound(
                references,
                snapshot,
                rectangle.identity.clone(),
                format!("randomRectangles[{index}].soundId"),
                rectangle.sound_id,
                RebuiltV3MediaRelation::TerrainSound,
            );
        }
    }
}

fn append_overlays(
    references: &mut Vec<RebuiltV3RuntimeMediaReference>,
    snapshot: &ProjectSnapshot,
    map: &MapLevel,
) {
    if map.level_type == LevelType::Land {
        for (index, tile) in map.tiles.iter().copied().enumerate() {
            if let Some(resource_id) = normalize_special_land_resource_id(tile) {
                push_resource(
                    references,
                    snapshot,
                    map.identity.clone(),
                    format!("tiles[{index}].specialLand"),
                    RebuiltV3MediaRelation::SpecialLandOverlay,
                    RebuiltV3MediaRequirement::ApplicationRequired,
                    "cicn",
                    i32::from(resource_id),
                );
            }
        }
    }
}

pub(super) fn append_terrain(
    references: &mut Vec<RebuiltV3RuntimeMediaReference>,
    snapshot: &ProjectSnapshot,
) {
    for profile in &snapshot.terrain_catalog {
        if let Some(sound_id) = profile.movement_sound_id {
            push_sound(
                references,
                snapshot,
                StableId(format!(
                    "terrain:{}:{}",
                    profile
                        .landlook
                        .map_or_else(|| "dungeon".into(), |value| value.to_string()),
                    profile.tile
                )),
                "movementSoundId".into(),
                sound_id,
                RebuiltV3MediaRelation::TerrainSound,
            );
        }
    }
}

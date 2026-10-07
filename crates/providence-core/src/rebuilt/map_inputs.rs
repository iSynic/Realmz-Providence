use super::terrain::{
    RebuiltV3BattleTerrainSet, RebuiltV3TerrainSetInput, project_rebuilt_v3_battle_terrain_sets,
    terrain_sets,
};
use crate::model::{
    CLASSIC_MAP_SIZE, LevelType, MapLevel, ProjectOrigin, ProjectSnapshot, RandomRectangle,
    StableId,
};
use serde::{Deserialize, Serialize};
#[cfg(test)]
mod tests;
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RebuiltV3MapMetadata {
    pub dark: bool,
    pub uses_los: bool,
    pub landlook: Option<i8>,
    pub base_scale: Option<i16>,
    pub battle_terrain_set_id: Option<StableId>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RebuiltV3MapCompilerInput {
    pub id: StableId,
    pub metadata: RebuiltV3MapMetadata,
    pub tileset_id: StableId,
    pub base_tile: Option<i16>,
    pub random_rectangles: Vec<RebuiltV3RandomRectangle>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RebuiltV3RandomRectangle {
    pub id: StableId,
    pub top: u8,
    pub left: u8,
    pub bottom: u8,
    pub right: u8,
    pub chance_ten_thousand: i16,
    pub battle_range: [i16; 2],
    pub random_doors: [i16; 3],
    pub random_door_percent: [i16; 3],
    pub only: bool,
    pub option: i16,
    pub sound_id: i16,
    pub text_id: i16,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RebuiltV3MapInputs {
    pub maps: Vec<RebuiltV3MapCompilerInput>,
    pub terrain_sets: Vec<RebuiltV3TerrainSetInput>,
    pub battle_terrain_sets: Vec<RebuiltV3BattleTerrainSet>,
}

pub fn project_rebuilt_v3_random_rectangle(
    rectangle: &RandomRectangle,
) -> Option<RebuiltV3RandomRectangle> {
    let maximum = i16::try_from(CLASSIC_MAP_SIZE - 1).ok()?;
    let top = rectangle.top.max(0);
    let left = rectangle.left.max(0);
    let bottom = rectangle.bottom.min(maximum);
    let right = rectangle.right.min(maximum);
    if top > bottom || left > right {
        return None;
    }
    Some(RebuiltV3RandomRectangle {
        id: rectangle.identity.clone(),
        top: u8::try_from(top).ok()?,
        left: u8::try_from(left).ok()?,
        bottom: u8::try_from(bottom).ok()?,
        right: u8::try_from(right).ok()?,
        chance_ten_thousand: rectangle.chance_ten_thousand,
        battle_range: rectangle.battle_range,
        random_doors: rectangle.random_doors,
        random_door_percent: rectangle.random_door_percent,
        only: rectangle.only,
        option: rectangle.option,
        sound_id: rectangle.sound_id,
        text_id: rectangle.text_id,
    })
}

pub fn project_rebuilt_v3_map_inputs(snapshot: &ProjectSnapshot) -> Option<RebuiltV3MapInputs> {
    if snapshot.terrain_catalog.is_empty()
        && snapshot
            .world
            .maps
            .iter()
            .any(|map| map.level_type == LevelType::Land)
    {
        return None;
    }
    let battle_terrain_sets = project_rebuilt_v3_battle_terrain_sets(snapshot).ok()?;
    let has_battle_terrain = !battle_terrain_sets.is_empty();
    let quarantine = matches!(snapshot.origin, ProjectOrigin::Imported { .. });
    let mut maps = snapshot
        .world
        .maps
        .iter()
        .map(|map| project_map(map, has_battle_terrain, quarantine))
        .collect::<Option<Vec<_>>>()?;
    maps.sort_by_key(|map| map.id.clone());
    Some(RebuiltV3MapInputs {
        maps,
        terrain_sets: terrain_sets(snapshot),
        battle_terrain_sets,
    })
}

fn project_map(
    map: &MapLevel,
    has_battle_terrain: bool,
    quarantine: bool,
) -> Option<RebuiltV3MapCompilerInput> {
    let runtime = map.runtime.as_ref()?;
    let (landlook, base_scale, base_tile) = match map.level_type {
        LevelType::Land => (runtime.landlook, runtime.base_scale, runtime.base_tile),
        LevelType::Dungeon => (None, None, None),
    };
    Some(RebuiltV3MapCompilerInput {
        id: map.identity.clone(),
        metadata: RebuiltV3MapMetadata {
            dark: runtime.dark,
            uses_los: runtime.uses_los,
            landlook,
            base_scale,
            battle_terrain_set_id: if !has_battle_terrain {
                None
            } else {
                match map.level_type {
                    LevelType::Land => runtime
                        .landlook
                        .map(|look| StableId(format!("classic.battle-terrain.landlook.{look}"))),
                    LevelType::Dungeon => Some(StableId("classic.battle-terrain.dungeon".into())),
                }
            },
        },
        tileset_id: runtime.tileset_id.clone(),
        base_tile,
        random_rectangles: project_rectangles(&runtime.random_rectangles, quarantine)?,
    })
}

fn project_rectangles(
    rectangles: &[RandomRectangle],
    quarantine: bool,
) -> Option<Vec<RebuiltV3RandomRectangle>> {
    if quarantine {
        Some(
            rectangles
                .iter()
                .filter_map(project_rebuilt_v3_random_rectangle)
                .collect(),
        )
    } else {
        rectangles
            .iter()
            .map(project_rebuilt_v3_random_rectangle)
            .collect()
    }
}

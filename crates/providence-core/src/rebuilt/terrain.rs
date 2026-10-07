use crate::model::{LevelType, ProjectSnapshot, StableId, TerrainProfile};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
#[cfg(test)]
mod tests;
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RebuiltV3TerrainTile {
    pub tile: i16,
    pub sound: i16,
    pub time: i16,
    pub solid: i16,
    pub shore: bool,
    pub need_boat: i16,
    pub is_path: bool,
    pub los: bool,
    pub fly_float: bool,
    pub forest: i16,
    pub combat_build: [[i16; 3]; 3],
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RebuiltV3BattleTerrainSet {
    pub id: StableId,
    pub landlook: Option<i8>,
    pub base_tile: Option<i16>,
    pub tiles: Vec<RebuiltV3TerrainTile>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RebuiltV3BattleTerrainError {
    MissingMapRuntime(StableId),
    MissingMapLandlook(StableId),
    InvalidLandlook {
        map: StableId,
        landlook: i8,
    },
    MissingBaseTile {
        map: StableId,
        landlook: i8,
    },
    AmbiguousBaseTile {
        landlook: i8,
        values: Vec<i16>,
    },
    IncompleteProfiles {
        landlook: i8,
        first_tile: i16,
        last_tile: i16,
        actual: usize,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RebuiltV3TerrainSetInput {
    pub landlook: Option<i8>,
    pub tiles: Vec<RebuiltV3TerrainTile>,
}

impl std::fmt::Display for RebuiltV3BattleTerrainError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::MissingMapRuntime(map) => write!(
                formatter,
                "map '{}' lacks runtime metadata required by battle terrain",
                map.0
            ),
            Self::MissingMapLandlook(map) => write!(
                formatter,
                "land map '{}' lacks an effective landlook required by battle terrain",
                map.0
            ),
            Self::InvalidLandlook { map, landlook } => write!(
                formatter,
                "land map '{}' uses invalid battle-terrain landlook {landlook}",
                map.0
            ),
            Self::MissingBaseTile { map, landlook } => write!(
                formatter,
                "land map '{}' has no battle base tile for landlook {landlook}",
                map.0
            ),
            Self::AmbiguousBaseTile { landlook, values } => write!(
                formatter,
                "landlook {landlook} has conflicting battle base tiles {}",
                values
                    .iter()
                    .map(i16::to_string)
                    .collect::<Vec<_>>()
                    .join(", ")
            ),
            Self::IncompleteProfiles {
                landlook,
                first_tile,
                last_tile,
                actual,
            } => write!(
                formatter,
                "battle terrain landlook {landlook} requires every tile {first_tile} through {last_tile}; found {actual} exact profiles"
            ),
        }
    }
}

impl std::error::Error for RebuiltV3BattleTerrainError {}

pub fn project_rebuilt_v3_battle_terrain_sets(
    snapshot: &ProjectSnapshot,
) -> Result<Vec<RebuiltV3BattleTerrainSet>, RebuiltV3BattleTerrainError> {
    if snapshot.battles.is_empty() {
        return Ok(Vec::new());
    }
    let combat_profiles = exact_battle_terrain_profiles(snapshot, -1, 200, 400)?;
    let combat_tiles = combat_profiles
        .iter()
        .map(|profile| terrain_projection(profile))
        .collect::<Vec<_>>();
    let mut sets = vec![RebuiltV3BattleTerrainSet {
        id: StableId("classic.battle-terrain.dungeon".into()),
        landlook: None,
        base_tile: None,
        tiles: combat_tiles.clone(),
    }];
    let landlook_base_tiles = landlook_base_tiles(snapshot)?;
    for (landlook, base_tiles) in landlook_base_tiles {
        if base_tiles.len() != 1 {
            return Err(RebuiltV3BattleTerrainError::AmbiguousBaseTile {
                landlook,
                values: base_tiles.into_iter().collect(),
            });
        }
        let base_tile = *base_tiles.iter().next().expect("one base tile");
        let land_profiles = exact_battle_terrain_profiles(snapshot, landlook, 0, 200)?;
        let mut tiles = land_profiles
            .iter()
            .map(|profile| terrain_projection(profile))
            .collect::<Vec<_>>();
        tiles.extend(
            combat_profiles
                .iter()
                .filter(|profile| profile.tile > 200)
                .map(|profile| terrain_projection(profile)),
        );
        sets.push(RebuiltV3BattleTerrainSet {
            id: StableId(format!("classic.battle-terrain.landlook.{landlook}")),
            landlook: Some(landlook),
            base_tile: Some(base_tile),
            tiles,
        });
    }
    Ok(sets)
}

fn landlook_base_tiles(
    snapshot: &ProjectSnapshot,
) -> Result<BTreeMap<i8, BTreeSet<i16>>, RebuiltV3BattleTerrainError> {
    let mut landlook_base_tiles = BTreeMap::<i8, BTreeSet<i16>>::new();
    for map in snapshot
        .world
        .maps
        .iter()
        .filter(|map| map.level_type == LevelType::Land)
    {
        let runtime = map
            .runtime
            .as_ref()
            .ok_or_else(|| RebuiltV3BattleTerrainError::MissingMapRuntime(map.identity.clone()))?;
        let landlook = runtime
            .landlook
            .ok_or_else(|| RebuiltV3BattleTerrainError::MissingMapLandlook(map.identity.clone()))?;
        if landlook < 0 {
            return Err(RebuiltV3BattleTerrainError::InvalidLandlook {
                map: map.identity.clone(),
                landlook,
            });
        }
        let base_tile =
            runtime
                .base_tile
                .ok_or_else(|| RebuiltV3BattleTerrainError::MissingBaseTile {
                    map: map.identity.clone(),
                    landlook,
                })?;
        landlook_base_tiles
            .entry(landlook)
            .or_default()
            .insert(base_tile);
    }
    Ok(landlook_base_tiles)
}
fn exact_battle_terrain_profiles(
    snapshot: &ProjectSnapshot,
    landlook: i8,
    first_tile: i16,
    last_tile: i16,
) -> Result<Vec<&TerrainProfile>, RebuiltV3BattleTerrainError> {
    let mut profiles = snapshot
        .terrain_catalog
        .iter()
        .filter(|profile| {
            profile.landlook == Some(landlook)
                && profile.tile >= first_tile
                && profile.tile <= last_tile
        })
        .collect::<Vec<_>>();
    profiles.sort_by_key(|profile| profile.tile);
    let expected = usize::try_from(last_tile - first_tile + 1).unwrap_or_default();
    if profiles.len() != expected
        || profiles
            .iter()
            .enumerate()
            .any(|(index, profile)| profile.tile != first_tile + index as i16)
    {
        return Err(RebuiltV3BattleTerrainError::IncompleteProfiles {
            landlook,
            first_tile,
            last_tile,
            actual: profiles.len(),
        });
    }
    Ok(profiles)
}

pub(super) fn terrain_projection(profile: &TerrainProfile) -> RebuiltV3TerrainTile {
    RebuiltV3TerrainTile {
        tile: profile.tile,
        sound: profile.movement_sound_id.unwrap_or(0),
        time: profile.movement_cost,
        solid: profile.solid_type,
        shore: profile.shore,
        need_boat: profile.boat_requirement,
        is_path: profile.path,
        los: profile.blocks_los,
        fly_float: profile.fly_float,
        forest: profile.forest_type,
        combat_build: profile.combat_build,
    }
}

pub(super) fn terrain_sets(snapshot: &ProjectSnapshot) -> Vec<RebuiltV3TerrainSetInput> {
    let mut grouped = BTreeMap::<Option<i8>, Vec<RebuiltV3TerrainTile>>::new();
    for profile in &snapshot.terrain_catalog {
        grouped
            .entry(profile.landlook)
            .or_default()
            .push(terrain_projection(profile));
    }
    grouped
        .into_iter()
        .map(|(landlook, mut tiles)| {
            tiles.sort_by_key(|tile| tile.tile);
            RebuiltV3TerrainSetInput { landlook, tiles }
        })
        .collect()
}

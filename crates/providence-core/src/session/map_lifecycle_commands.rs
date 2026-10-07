use crate::codecs::apply_dungeon_primitive;
use crate::codecs::clear_action_point_marker;
use crate::model::LandlookCatalogMetadata;
use crate::model::LevelType;
use crate::model::MapLevel;
use crate::model::MapRuntimeMetadata;
use crate::model::ProjectSnapshot;
use crate::model::StableId;
use crate::session::EditorSession;
use crate::session::errors::SessionError;

impl EditorSession {
    pub fn preview_map_creation(
        &self,
        level_type: LevelType,
        source: Option<&StableId>,
    ) -> Result<crate::map_lifecycle::MapCreationPlan, SessionError> {
        let original = source
            .map(|identity| {
                self.snapshot
                    .world
                    .maps
                    .iter()
                    .find(|map| map.identity == *identity)
                    .ok_or_else(|| SessionError::MapNotFound(identity.clone()))
            })
            .transpose()?;
        if let Some(map) = original
            && map.level_type != level_type
        {
            return Err(SessionError::InvalidMapKind {
                identity: map.identity.clone(),
                expected: level_type,
            });
        }
        let native_index = next_map_index(&self.snapshot, level_type)?;
        Ok(crate::map_lifecycle::MapCreationPlan {
            identity: map_identity(level_type, native_index),
            name: format!("{} level {}", map_kind_label(level_type), native_index),
            level_type,
            source: source.cloned(),
            copied_cells: original.map_or(0, |map| map.tiles.len()),
            cleared_markers: original.map_or(0, |map| {
                map.tiles
                    .iter()
                    .filter(|tile| clear_action_point_marker(**tile, level_type) != **tile)
                    .count()
            }),
            reset_regions: original
                .and_then(|map| map.runtime.as_ref())
                .map_or(0, |runtime| runtime.random_rectangles.len()),
            copied_action_points: 0,
            dark: false,
            uses_los: false,
        })
    }

    pub(super) fn create_map(
        &mut self,
        level_type: LevelType,
    ) -> Result<Vec<StableId>, SessionError> {
        let native_index = next_map_index(&self.snapshot, level_type)?;
        let landlook_catalog = (level_type == LevelType::Land)
            .then(|| {
                self.snapshot
                    .landlook_catalogs
                    .iter()
                    .find(|catalog| catalog.landlook == 0)
            })
            .flatten();
        let map = new_map_level(level_type, native_index, landlook_catalog);
        let identity = map.identity.clone();
        self.snapshot.world.maps.push(map);
        self.snapshot.normalize();
        Ok(vec![identity])
    }

    pub(super) fn duplicate_map(
        &mut self,
        source: StableId,
    ) -> Result<Vec<StableId>, SessionError> {
        let original = self
            .snapshot
            .world
            .maps
            .iter()
            .find(|candidate| candidate.identity == source)
            .cloned()
            .ok_or_else(|| SessionError::MapNotFound(source.clone()))?;
        let native_index = next_map_index(&self.snapshot, original.level_type)?;
        let identity = map_identity(original.level_type, native_index);
        let tiles = original
            .tiles
            .into_iter()
            .map(|tile| clear_action_point_marker(tile, original.level_type))
            .collect();
        let runtime = original.runtime.map(|runtime| MapRuntimeMetadata {
            source: map_runtime_source(original.level_type).into(),
            source_blob: None,
            dark: false,
            uses_los: false,
            landlook: runtime.landlook,
            base_scale: runtime.base_scale,
            tileset_id: runtime.tileset_id,
            base_tile: runtime.base_tile,
            random_rectangles: Vec::new(),
        });
        self.snapshot.world.maps.push(MapLevel {
            identity: identity.clone(),
            level_type: original.level_type,
            native_index,
            name: format!(
                "{} level {}",
                map_kind_label(original.level_type),
                native_index
            ),
            tiles,
            runtime,
        });
        self.snapshot.normalize();
        Ok(vec![identity])
    }

    pub(super) fn update_land_map_cell(
        &mut self,
        identity: StableId,
        x: u8,
        y: u8,
        tile: i16,
    ) -> Result<Vec<StableId>, SessionError> {
        if x as usize >= crate::model::CLASSIC_MAP_SIZE
            || y as usize >= crate::model::CLASSIC_MAP_SIZE
        {
            return Err(SessionError::MapCoordinateOutOfRange { x, y });
        }
        let map = self
            .snapshot
            .world
            .maps
            .iter_mut()
            .find(|map| map.identity == identity)
            .ok_or_else(|| SessionError::MapNotFound(identity.clone()))?;
        if map.level_type != LevelType::Land {
            return Err(SessionError::InvalidMapKind {
                identity,
                expected: LevelType::Land,
            });
        }
        map.tiles[y as usize * crate::model::CLASSIC_MAP_SIZE + x as usize] = tile;
        Ok(vec![identity])
    }

    pub(super) fn update_dungeon_map_primitive(
        &mut self,
        identity: StableId,
        x: u8,
        y: u8,
        primitive: crate::codecs::DungeonPrimitive,
        enabled: bool,
    ) -> Result<Vec<StableId>, SessionError> {
        if x as usize >= crate::model::CLASSIC_MAP_SIZE
            || y as usize >= crate::model::CLASSIC_MAP_SIZE
        {
            return Err(SessionError::MapCoordinateOutOfRange { x, y });
        }
        let map = self
            .snapshot
            .world
            .maps
            .iter_mut()
            .find(|map| map.identity == identity)
            .ok_or_else(|| SessionError::MapNotFound(identity.clone()))?;
        if map.level_type != LevelType::Dungeon {
            return Err(SessionError::InvalidMapKind {
                identity,
                expected: LevelType::Dungeon,
            });
        }
        let index = y as usize * crate::model::CLASSIC_MAP_SIZE + x as usize;
        map.tiles[index] =
            apply_dungeon_primitive(map.tiles[index], primitive, enabled).map_err(|reason| {
                SessionError::InvalidDungeonPrimitive {
                    identity: identity.clone(),
                    primitive,
                    reason: reason.into(),
                }
            })?;
        Ok(vec![identity])
    }
}

pub(super) fn next_map_index(
    snapshot: &ProjectSnapshot,
    level_type: LevelType,
) -> Result<u32, SessionError> {
    let mut indexes = snapshot
        .world
        .maps
        .iter()
        .filter(|map| map.level_type == level_type)
        .map(|map| map.native_index)
        .collect::<Vec<_>>();
    indexes.sort_unstable();
    for (expected, actual) in indexes.iter().copied().enumerate() {
        let expected = u32::try_from(expected).map_err(|_| SessionError::InvalidMapCatalog {
            level_type,
            reason: "map count exceeds the native index range".into(),
        })?;
        if actual != expected {
            return Err(SessionError::InvalidMapCatalog {
                level_type,
                reason: format!(
                    "native indexes must be dense from zero; expected {expected}, found {actual}"
                ),
            });
        }
    }
    u32::try_from(indexes.len()).map_err(|_| SessionError::InvalidMapCatalog {
        level_type,
        reason: "map count exceeds the native index range".into(),
    })
}

pub(super) fn map_identity(level_type: LevelType, native_index: u32) -> StableId {
    StableId(format!(
        "{}:{native_index}",
        match level_type {
            LevelType::Land => "land",
            LevelType::Dungeon => "dungeon",
        }
    ))
}

pub(super) fn map_kind_label(level_type: LevelType) -> &'static str {
    match level_type {
        LevelType::Land => "Land",
        LevelType::Dungeon => "Dungeon",
    }
}

pub(super) fn map_runtime_source(level_type: LevelType) -> &'static str {
    match level_type {
        LevelType::Land => "Data RD",
        LevelType::Dungeon => "Data RDD",
    }
}

pub(super) fn new_map_level(
    level_type: LevelType,
    native_index: u32,
    landlook_catalog: Option<&LandlookCatalogMetadata>,
) -> MapLevel {
    let (base_tile, landlook, base_scale, tileset_id, runtime_base_tile) = match level_type {
        LevelType::Land => {
            let base_tile = landlook_catalog.map_or(156, |catalog| catalog.base_tile);
            (
                base_tile,
                Some(0),
                landlook_catalog.map(|catalog| catalog.base_scale),
                StableId("classic.landlook.0".into()),
                Some(base_tile),
            )
        }
        LevelType::Dungeon => (
            1,
            Some(-1),
            None,
            StableId("dungeon-top-down-302".into()),
            None,
        ),
    };
    MapLevel {
        identity: map_identity(level_type, native_index),
        level_type,
        native_index,
        name: format!("{} level {}", map_kind_label(level_type), native_index),
        tiles: vec![base_tile; crate::model::CLASSIC_MAP_SIZE * crate::model::CLASSIC_MAP_SIZE],
        runtime: Some(MapRuntimeMetadata {
            source: map_runtime_source(level_type).into(),
            source_blob: None,
            dark: false,
            uses_los: false,
            landlook,
            base_scale,
            tileset_id,
            base_tile: runtime_base_tile,
            random_rectangles: Vec::new(),
        }),
    }
}

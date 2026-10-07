use super::{ActionPoint, BlobId, NativeRecordId, StableId};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum LevelType {
    Land,
    Dungeon,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MapCoordinate {
    pub x: u8,
    pub y: u8,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartLocation {
    pub map: StableId,
    pub coordinate: MapCoordinate,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RandomRectangle {
    pub identity: StableId,
    pub top: i16,
    pub left: i16,
    pub bottom: i16,
    pub right: i16,
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
pub struct MapRuntimeMetadata {
    pub source: String,
    pub source_blob: Option<BlobId>,
    pub dark: bool,
    pub uses_los: bool,
    pub landlook: Option<i8>,
    pub base_scale: Option<i16>,
    pub tileset_id: StableId,
    pub base_tile: Option<i16>,
    pub random_rectangles: Vec<RandomRectangle>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MapLevel {
    pub identity: StableId,
    pub level_type: LevelType,
    pub native_index: u32,
    pub name: String,
    pub tiles: Vec<i16>,
    #[serde(default)]
    pub runtime: Option<MapRuntimeMetadata>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LandLayout {
    pub cells: Vec<i16>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerMapMarker {
    pub icon_id: i16,
    pub x: i16,
    pub y: i16,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerMapRect {
    pub top: i16,
    pub left: i16,
    pub bottom: i16,
    pub right: i16,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerMapRecord {
    pub identity: StableId,
    pub native_id: NativeRecordId,
    pub markers: Vec<PlayerMapMarker>,
    pub start_x: i16,
    pub start_y: i16,
    pub level: i16,
    pub picture_id: i16,
    pub icon_size: i16,
    pub show: i16,
    pub is_dungeon: bool,
    pub picture_rect: PlayerMapRect,
    pub note: String,
    #[serde(default)]
    pub authored: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerMapNameCatalog {
    #[serde(default)]
    pub source_blob: Option<BlobId>,
    #[serde(default)]
    pub available_names: Vec<String>,
    #[serde(default)]
    pub unavailable_names: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpecialLandSolidityCatalog {
    pub source: String,
    pub source_blob: BlobId,
    pub solid: Vec<bool>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorldModel {
    #[serde(default)]
    pub maps: Vec<MapLevel>,
    #[serde(default)]
    pub action_points: Vec<ActionPoint>,
    #[serde(default)]
    pub land_layout: Option<LandLayout>,
    #[serde(default)]
    pub player_maps: Vec<PlayerMapRecord>,
    #[serde(default)]
    pub special_land_solidity: Option<SpecialLandSolidityCatalog>,
}

impl WorldModel {
    pub(super) fn normalize_map_order(&mut self) {
        self.maps
            .sort_by_key(|map| (map.level_type as u8, map.native_index));
        self.player_maps
            .sort_by_key(|record| (record.native_id, record.identity.clone()));
    }

    // Rectangles retain lexical snapshot order; native export resolves slot IDs.
    pub(super) fn normalize_trigger_order(&mut self) {
        for map in &mut self.maps {
            if let Some(runtime) = &mut map.runtime {
                runtime
                    .random_rectangles
                    .sort_by_key(|rectangle| rectangle.identity.clone());
            }
        }
        self.action_points.sort_by_key(|action_point| {
            (
                action_point.level_type as u8,
                action_point.level_index,
                action_point.record_index,
            )
        });
    }
}

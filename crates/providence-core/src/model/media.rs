use super::{BlobId, StableId};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClassicResourceKey {
    pub resource_type: String,
    pub resource_id: i32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetDescriptor {
    pub identity: StableId,
    pub label: String,
    pub kind: String,
    pub mime_type: Option<String>,
    pub classic_resource: Option<ClassicResourceKey>,
    pub scenario_music_slot: Option<u8>,
    pub blob: BlobId,
    pub byte_length: u64,
    #[serde(default)]
    pub classic_payload_blob: Option<BlobId>,
    #[serde(default)]
    pub classic_payload_byte_length: Option<u64>,
    pub extension: Option<String>,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub duration_ms: Option<u32>,
    pub sample_rate: Option<u32>,
    pub channels: Option<u16>,
    pub tile_width: Option<u32>,
    pub tile_height: Option<u32>,
    pub columns: Option<u32>,
    pub rows: Option<u32>,
    pub landlook: Option<i8>,
    pub base_tile: Option<i16>,
    pub source: String,
}

pub(super) fn normalize(assets: &mut [AssetDescriptor], removals: &mut Vec<ClassicResourceKey>) {
    assets.sort_by_key(|asset| asset.identity.clone());
    removals.sort();
    removals.dedup();
}

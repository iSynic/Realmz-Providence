use super::{NativeRecordId, StableId};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TreasureRecord {
    pub identity: StableId,
    pub native_id: NativeRecordId,
    pub item_ids: Vec<i16>,
    pub experience: i16,
    pub gold: i16,
    pub gems: i16,
    pub jewelry: i16,
    #[serde(default)]
    pub authored: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShopRecord {
    pub identity: StableId,
    pub native_id: NativeRecordId,
    pub item_ids: Vec<i16>,
    pub quantities: Vec<u8>,
    pub inflation: i16,
    #[serde(default)]
    pub authored: bool,
}

pub(super) fn normalize(treasures: &mut [TreasureRecord], shops: &mut [ShopRecord]) {
    treasures.sort_by_key(|treasure| (treasure.native_id, treasure.identity.clone()));
    shops.sort_by_key(|shop| (shop.native_id, shop.identity.clone()));
}

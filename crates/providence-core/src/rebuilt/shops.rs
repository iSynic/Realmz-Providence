use std::collections::BTreeSet;

use serde::{Deserialize, Serialize};

use crate::{
    codecs::{SHOP_CATEGORY_SIZE, SHOP_ITEM_SLOTS},
    model::{ProjectSnapshot, ShopRecord, StableId},
};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RebuiltV3ShopStock {
    pub slot: u16,
    pub item_id: StableId,
    pub quantity: u16,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RebuiltV3ShopDefinition {
    pub id: StableId,
    pub classic_id: u32,
    pub inflation_percent: i32,
    pub stock: Vec<RebuiltV3ShopStock>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RebuiltV3ShopError {
    MissingRequested(u32),
    DuplicateClassicId(u32),
    InvalidIdentity {
        classic_id: u32,
        actual: StableId,
    },
    InvalidItemSlotCount {
        classic_id: u32,
        actual: usize,
    },
    InvalidQuantitySlotCount {
        classic_id: u32,
        actual: usize,
    },
    InvalidItem {
        classic_id: u32,
        slot: usize,
        item_id: i16,
    },
    MissingItem {
        classic_id: u32,
        slot: usize,
        item_id: i16,
    },
}

impl std::fmt::Display for RebuiltV3ShopError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::MissingRequested(id) => {
                write!(f, "requested Classic shop {id} is unavailable")
            }
            Self::DuplicateClassicId(id) => write!(f, "duplicate Classic shop id {id}"),
            Self::InvalidIdentity { classic_id, actual } => write!(
                f,
                "Classic shop {classic_id} has identity '{}'; expected 'shop:{classic_id}'",
                actual.0
            ),
            Self::InvalidItemSlotCount { classic_id, actual } => write!(
                f,
                "Classic shop {classic_id} has {actual} item slots; expected {SHOP_ITEM_SLOTS}"
            ),
            Self::InvalidQuantitySlotCount { classic_id, actual } => write!(
                f,
                "Classic shop {classic_id} has {actual} quantity slots; expected {SHOP_ITEM_SLOTS}"
            ),
            Self::InvalidItem {
                classic_id,
                slot,
                item_id,
            } => write!(
                f,
                "Classic shop {classic_id} slot {slot} contains out-of-range item {item_id}"
            ),
            Self::MissingItem {
                classic_id,
                slot,
                item_id,
            } => write!(
                f,
                "Classic shop {classic_id} slot {slot} targets missing item {item_id}"
            ),
        }
    }
}
impl std::error::Error for RebuiltV3ShopError {}

pub fn project_rebuilt_v3_shops(
    snapshot: &ProjectSnapshot,
    item_ids: &BTreeSet<StableId>,
) -> Result<Vec<RebuiltV3ShopDefinition>, RebuiltV3ShopError> {
    project_rebuilt_v3_shops_filtered(snapshot, item_ids, None)
}

pub(crate) fn project_rebuilt_v3_selected_shops(
    snapshot: &ProjectSnapshot,
    item_ids: &BTreeSet<StableId>,
    shop_ids: &BTreeSet<u32>,
) -> Result<Vec<RebuiltV3ShopDefinition>, RebuiltV3ShopError> {
    project_rebuilt_v3_shops_filtered(snapshot, item_ids, Some(shop_ids))
}

fn project_rebuilt_v3_shops_filtered(
    snapshot: &ProjectSnapshot,
    item_ids: &BTreeSet<StableId>,
    shop_ids: Option<&BTreeSet<u32>>,
) -> Result<Vec<RebuiltV3ShopDefinition>, RebuiltV3ShopError> {
    let mut records = snapshot
        .shops
        .iter()
        .filter(|record| shop_ids.is_none_or(|ids| ids.contains(&record.native_id.0)))
        .collect::<Vec<_>>();
    records.sort_by_key(|record| record.native_id);
    let mut seen = BTreeSet::new();
    let mut projected = Vec::with_capacity(records.len());
    for record in records {
        validate_record(record, &mut seen)?;
        let mut stock = Vec::new();
        for category_start in (0..SHOP_ITEM_SLOTS).step_by(SHOP_CATEGORY_SIZE) {
            for slot in category_start..category_start + SHOP_CATEGORY_SIZE {
                let item_id = record.item_ids[slot];
                if item_id < 0 {
                    break;
                }
                if item_id == 0 {
                    continue;
                }
                if item_id > 999 {
                    return Err(RebuiltV3ShopError::InvalidItem {
                        classic_id: record.native_id.0,
                        slot,
                        item_id,
                    });
                }
                let stable_id = StableId(format!("classic.item.{item_id}"));
                if !item_ids.contains(&stable_id) {
                    return Err(RebuiltV3ShopError::MissingItem {
                        classic_id: record.native_id.0,
                        slot,
                        item_id,
                    });
                }
                stock.push(RebuiltV3ShopStock {
                    slot: slot as u16,
                    item_id: stable_id,
                    quantity: u16::from(record.quantities[slot]),
                });
            }
        }
        projected.push(RebuiltV3ShopDefinition {
            id: StableId(format!("classic.shop.{}", record.native_id.0)),
            classic_id: record.native_id.0,
            inflation_percent: i32::from(record.inflation),
            stock,
        });
    }
    if let Some(requested) = shop_ids
        && let Some(missing) = requested.iter().find(|id| !seen.contains(id))
    {
        return Err(RebuiltV3ShopError::MissingRequested(*missing));
    }
    Ok(projected)
}

fn validate_record(
    record: &ShopRecord,
    seen: &mut BTreeSet<u32>,
) -> Result<(), RebuiltV3ShopError> {
    if !seen.insert(record.native_id.0) {
        return Err(RebuiltV3ShopError::DuplicateClassicId(record.native_id.0));
    }
    if record.identity.0 != format!("shop:{}", record.native_id.0) {
        return Err(RebuiltV3ShopError::InvalidIdentity {
            classic_id: record.native_id.0,
            actual: record.identity.clone(),
        });
    }
    if record.item_ids.len() != SHOP_ITEM_SLOTS {
        return Err(RebuiltV3ShopError::InvalidItemSlotCount {
            classic_id: record.native_id.0,
            actual: record.item_ids.len(),
        });
    }
    if record.quantities.len() != SHOP_ITEM_SLOTS {
        return Err(RebuiltV3ShopError::InvalidQuantitySlotCount {
            classic_id: record.native_id.0,
            actual: record.quantities.len(),
        });
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::NativeRecordId;

    fn shop() -> ShopRecord {
        let mut item_ids = vec![-1; SHOP_ITEM_SLOTS];
        let mut quantities = vec![0; SHOP_ITEM_SLOTS];
        item_ids[0] = 7;
        item_ids[1] = 0;
        item_ids[2] = -1;
        item_ids[3] = 8;
        item_ids[200] = 7;
        quantities[0] = 3;
        quantities[200] = 255;
        ShopRecord {
            identity: StableId("shop:4".into()),
            native_id: NativeRecordId(4),
            item_ids,
            quantities,
            inflation: 125,
            authored: true,
        }
    }

    #[test]
    fn projection_obeys_each_category_terminator_and_preserves_quantity_bytes() {
        let mut snapshot = ProjectSnapshot::new_authored(StableId("shops".into()));
        snapshot.shops.push(shop());
        let items = BTreeSet::from([
            StableId("classic.item.7".into()),
            StableId("classic.item.8".into()),
        ]);
        let projected = project_rebuilt_v3_shops(&snapshot, &items).unwrap();
        assert_eq!(projected[0].stock.len(), 2);
        assert_eq!(projected[0].stock[0].slot, 0);
        assert_eq!(projected[0].stock[1].slot, 200);
        assert_eq!(projected[0].stock[1].quantity, 255);
    }

    #[test]
    fn active_out_of_range_item_is_not_silently_dropped() {
        let mut record = shop();
        record.item_ids[0] = 1000;
        let mut snapshot = ProjectSnapshot::new_authored(StableId("shops".into()));
        snapshot.shops.push(record);
        assert!(matches!(
            project_rebuilt_v3_shops(&snapshot, &BTreeSet::new()),
            Err(RebuiltV3ShopError::InvalidItem { slot: 0, .. })
        ));
    }

    #[test]
    fn selected_projection_requires_exact_ids_and_ignores_unselected_invalid_rows() {
        let mut snapshot = ProjectSnapshot::new_authored(StableId("shops".into()));
        snapshot.shops.push(shop());
        let mut invalid = shop();
        invalid.native_id = NativeRecordId(9);
        invalid.identity = StableId("invalid-unselected-shop".into());
        snapshot.shops.push(invalid);
        let items = BTreeSet::from([
            StableId("classic.item.7".into()),
            StableId("classic.item.8".into()),
        ]);

        let selected = project_rebuilt_v3_selected_shops(&snapshot, &items, &BTreeSet::from([4]))
            .expect("selected shop");
        assert_eq!(selected.len(), 1);
        assert_eq!(selected[0].classic_id, 4);
        assert_eq!(
            project_rebuilt_v3_selected_shops(&snapshot, &items, &BTreeSet::from([5])),
            Err(RebuiltV3ShopError::MissingRequested(5))
        );
    }
}

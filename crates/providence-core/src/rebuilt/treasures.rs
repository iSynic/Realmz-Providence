use std::collections::BTreeSet;

use serde::{Deserialize, Serialize};

use crate::model::{ProjectSnapshot, StableId, TreasureRecord};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RebuiltV3TreasureDefinition {
    pub id: StableId,
    pub classic_id: u32,
    pub item_ids: Vec<StableId>,
    pub experience: i32,
    pub gold: i32,
    pub gems: i32,
    pub jewelry: i32,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RebuiltV3TreasureError {
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
    MissingItem {
        classic_id: u32,
        slot: usize,
        item_id: i16,
    },
}

impl std::fmt::Display for RebuiltV3TreasureError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::MissingRequested(id) => {
                write!(formatter, "requested Classic treasure {id} is unavailable")
            }
            Self::DuplicateClassicId(id) => write!(formatter, "duplicate Classic treasure id {id}"),
            Self::InvalidIdentity { classic_id, actual } => write!(
                formatter,
                "Classic treasure {classic_id} has identity '{}'; expected 'treasure:{classic_id}'",
                actual.0
            ),
            Self::InvalidItemSlotCount { classic_id, actual } => write!(
                formatter,
                "Classic treasure {classic_id} has {actual} item slots; expected 20"
            ),
            Self::MissingItem {
                classic_id,
                slot,
                item_id,
            } => write!(
                formatter,
                "Classic treasure {classic_id} item slot {slot} targets missing item {item_id}"
            ),
        }
    }
}

impl std::error::Error for RebuiltV3TreasureError {}

pub fn project_rebuilt_v3_treasures(
    snapshot: &ProjectSnapshot,
    item_ids: &BTreeSet<StableId>,
) -> Result<Vec<RebuiltV3TreasureDefinition>, RebuiltV3TreasureError> {
    project_rebuilt_v3_treasures_filtered(snapshot, item_ids, None)
}

pub(crate) fn project_rebuilt_v3_selected_treasures(
    snapshot: &ProjectSnapshot,
    item_ids: &BTreeSet<StableId>,
    treasure_ids: &BTreeSet<u32>,
) -> Result<Vec<RebuiltV3TreasureDefinition>, RebuiltV3TreasureError> {
    project_rebuilt_v3_treasures_filtered(snapshot, item_ids, Some(treasure_ids))
}

fn project_rebuilt_v3_treasures_filtered(
    snapshot: &ProjectSnapshot,
    item_ids: &BTreeSet<StableId>,
    treasure_ids: Option<&BTreeSet<u32>>,
) -> Result<Vec<RebuiltV3TreasureDefinition>, RebuiltV3TreasureError> {
    let mut records = snapshot
        .treasures
        .iter()
        .filter(|record| treasure_ids.is_none_or(|ids| ids.contains(&record.native_id.0)))
        .collect::<Vec<_>>();
    records.sort_by_key(|record| record.native_id);
    let mut seen = BTreeSet::new();
    let mut projected = Vec::with_capacity(records.len());
    for record in records {
        validate_record(record, &mut seen)?;
        let mut projected_items = Vec::new();
        for (slot, item_id) in record.item_ids.iter().copied().enumerate() {
            if item_id <= 0 {
                continue;
            }
            let stable_id = StableId(format!("classic.item.{item_id}"));
            if !item_ids.contains(&stable_id) {
                return Err(RebuiltV3TreasureError::MissingItem {
                    classic_id: record.native_id.0,
                    slot,
                    item_id,
                });
            }
            projected_items.push(stable_id);
        }
        projected.push(RebuiltV3TreasureDefinition {
            id: StableId(format!("classic.treasure.{}", record.native_id.0)),
            classic_id: record.native_id.0,
            item_ids: projected_items,
            experience: i32::from(record.experience),
            gold: i32::from(record.gold),
            gems: i32::from(record.gems),
            jewelry: i32::from(record.jewelry),
        });
    }
    if let Some(requested) = treasure_ids
        && let Some(missing) = requested.iter().find(|id| !seen.contains(id))
    {
        return Err(RebuiltV3TreasureError::MissingRequested(*missing));
    }
    Ok(projected)
}

fn validate_record(
    record: &TreasureRecord,
    seen: &mut BTreeSet<u32>,
) -> Result<(), RebuiltV3TreasureError> {
    if !seen.insert(record.native_id.0) {
        return Err(RebuiltV3TreasureError::DuplicateClassicId(
            record.native_id.0,
        ));
    }
    if record.identity.0 != format!("treasure:{}", record.native_id.0) {
        return Err(RebuiltV3TreasureError::InvalidIdentity {
            classic_id: record.native_id.0,
            actual: record.identity.clone(),
        });
    }
    if record.item_ids.len() != 20 {
        return Err(RebuiltV3TreasureError::InvalidItemSlotCount {
            classic_id: record.native_id.0,
            actual: record.item_ids.len(),
        });
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::NativeRecordId;

    fn treasure() -> TreasureRecord {
        let mut item_ids = vec![0; 20];
        item_ids[0] = 7;
        item_ids[1] = -8;
        item_ids[2] = 7;
        TreasureRecord {
            identity: StableId("treasure:3".into()),
            native_id: NativeRecordId(3),
            item_ids,
            experience: -100,
            gold: 50,
            gems: -2,
            jewelry: 1,
            authored: true,
        }
    }

    #[test]
    fn projects_exact_runtime_shape_and_positive_items_only() {
        let mut snapshot = ProjectSnapshot::new_authored(StableId("treasure-test".into()));
        snapshot.treasures.push(treasure());
        let items = BTreeSet::from([StableId("classic.item.7".into())]);
        let projected = project_rebuilt_v3_treasures(&snapshot, &items).unwrap();
        assert_eq!(projected[0].id.0, "classic.treasure.3");
        assert_eq!(
            projected[0].item_ids,
            [
                StableId("classic.item.7".into()),
                StableId("classic.item.7".into())
            ]
        );
        assert_eq!(projected[0].experience, -100);
    }

    #[test]
    fn rejects_a_positive_missing_item() {
        let mut snapshot = ProjectSnapshot::new_authored(StableId("treasure-test".into()));
        snapshot.treasures.push(treasure());
        assert!(matches!(
            project_rebuilt_v3_treasures(&snapshot, &BTreeSet::new()),
            Err(RebuiltV3TreasureError::MissingItem {
                slot: 0,
                item_id: 7,
                ..
            })
        ));
    }

    #[test]
    fn selected_projection_requires_exact_ids_and_ignores_unselected_invalid_rows() {
        let mut snapshot = ProjectSnapshot::new_authored(StableId("treasure-test".into()));
        snapshot.treasures.push(treasure());
        let mut invalid = treasure();
        invalid.native_id = NativeRecordId(9);
        invalid.identity = StableId("invalid-unselected-treasure".into());
        snapshot.treasures.push(invalid);
        let items = BTreeSet::from([StableId("classic.item.7".into())]);

        let selected =
            project_rebuilt_v3_selected_treasures(&snapshot, &items, &BTreeSet::from([3]))
                .expect("selected treasure");
        assert_eq!(selected.len(), 1);
        assert_eq!(selected[0].classic_id, 3);
        assert_eq!(
            project_rebuilt_v3_selected_treasures(&snapshot, &items, &BTreeSet::from([4])),
            Err(RebuiltV3TreasureError::MissingRequested(4))
        );
    }
}

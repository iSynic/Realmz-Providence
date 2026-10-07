use super::{RebuiltV3RuntimeCatalogKind, RebuiltV3RuntimeCatalogReference};
use crate::model::{ProjectOrigin, ProjectSnapshot, StableId};
use std::collections::BTreeSet;

pub(super) struct CatalogInputs {
    pub item_ids: BTreeSet<StableId>,
    pub reachable_treasure_ids: BTreeSet<u32>,
    pub reachable_shop_ids: BTreeSet<u32>,
}

impl CatalogInputs {
    pub(super) fn new(
        snapshot: &ProjectSnapshot,
        references: &[RebuiltV3RuntimeCatalogReference],
    ) -> Self {
        let requested_treasure_ids =
            requested_ids(references, RebuiltV3RuntimeCatalogKind::Treasure);
        let requested_shop_ids = requested_ids(references, RebuiltV3RuntimeCatalogKind::Shop);
        let item_ids = snapshot
            .item_rules
            .iter()
            .map(|item| item.definition.id.clone())
            .chain(
                snapshot
                    .scenario_item_rules
                    .iter()
                    .map(|item| item.definition.id.clone()),
            )
            .collect::<BTreeSet<_>>();
        let allow_deferred = matches!(snapshot.origin, ProjectOrigin::Imported { .. });
        let available_treasure_ids = snapshot
            .treasures
            .iter()
            .map(|record| record.native_id.0)
            .collect::<BTreeSet<_>>();
        let available_shop_ids = snapshot
            .shops
            .iter()
            .map(|record| record.native_id.0)
            .collect::<BTreeSet<_>>();
        let reachable_treasure_ids = if allow_deferred {
            requested_treasure_ids
                .intersection(&available_treasure_ids)
                .copied()
                .collect()
        } else {
            requested_treasure_ids
        };
        let reachable_shop_ids = if allow_deferred {
            requested_shop_ids
                .intersection(&available_shop_ids)
                .copied()
                .collect()
        } else {
            requested_shop_ids
        };
        Self {
            item_ids,
            reachable_treasure_ids,
            reachable_shop_ids,
        }
    }
}

fn requested_ids(
    references: &[RebuiltV3RuntimeCatalogReference],
    kind: RebuiltV3RuntimeCatalogKind,
) -> BTreeSet<u32> {
    references
        .iter()
        .filter(|reference| reference.target_kind == kind)
        .map(|reference| reference.target_native_id)
        .collect()
}

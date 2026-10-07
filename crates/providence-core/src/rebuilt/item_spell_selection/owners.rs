use super::{
    RebuiltV3ReachableItemSpellError as Error, RebuiltV3ReachableOwnerSelection,
    RebuiltV3RuntimeDefinitionRelation as Relation, selection::Selection,
};
use crate::model::{ProjectSnapshot, StableId};

pub(super) fn collect(
    snapshot: &ProjectSnapshot,
    owners: &RebuiltV3ReachableOwnerSelection,
    selection: &mut Selection,
) -> Result<(), Error> {
    for encounter in &owners.timed_encounters {
        if encounter.required_item_id > 0 {
            selection.item(
                StableId(format!("timed-encounter:{}", encounter.id)),
                "requiredItemId".into(),
                encounter.required_item_id,
                Relation::TimedRequirement,
            )?;
        }
    }
    collect_stock(owners, selection)?;
    for caste in &snapshot.caste_rules {
        for (slot, target) in caste.definition.starting_item_ids.iter().enumerate() {
            selection.stable_item(
                caste.definition.id.clone(),
                format!("startingItemIds[{slot}]"),
                target,
                Relation::CasteStartingItem,
            )?;
        }
    }
    Ok(())
}

fn collect_stock(
    owners: &RebuiltV3ReachableOwnerSelection,
    selection: &mut Selection,
) -> Result<(), Error> {
    for treasure in &owners.treasures {
        for (slot, target) in treasure.item_ids.iter().enumerate() {
            selection.stable_item(
                treasure.id.clone(),
                format!("itemIds[{slot}]"),
                target,
                Relation::TreasureStock,
            )?;
        }
    }
    for shop in &owners.shops {
        for stock in &shop.stock {
            selection.stable_item(
                shop.id.clone(),
                format!("stock[{}].itemId", stock.slot),
                &stock.item_id,
                Relation::ShopStock,
            )?;
        }
    }
    Ok(())
}

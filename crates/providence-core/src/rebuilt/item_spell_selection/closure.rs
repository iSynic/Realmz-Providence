use super::{
    RebuiltV3ItemDefinition, RebuiltV3ReachableItemSpellError as Error,
    RebuiltV3RuntimeDefinitionKind as Kind, RebuiltV3RuntimeDefinitionRelation as Relation,
    selection::Selection,
};
use crate::{model::ProjectSnapshot, rebuilt::project_rebuilt_v3_selected_scenario_item_catalog};
use std::collections::{BTreeMap, BTreeSet};

pub(super) fn collect(
    snapshot: &ProjectSnapshot,
    selection: &mut Selection,
) -> Result<BTreeMap<i16, RebuiltV3ItemDefinition>, Error> {
    let mut projected = BTreeMap::new();
    let mut pending = selection.item_queue();
    let mut visited = BTreeSet::new();
    while let Some(classic_id) = pending.pop_front() {
        if !visited.insert(classic_id) {
            continue;
        }
        let item = if let Some(item) = selection.standard_item(classic_id) {
            item.clone()
        } else {
            let item = project_rebuilt_v3_selected_scenario_item_catalog(
                snapshot,
                &BTreeSet::from([classic_id]),
            )
            .map_err(Error::ItemCatalog)?
            .pop()
            .expect("one selected item projects exactly once");
            projected.insert(classic_id, item.clone());
            item
        };
        if let Some(target) = &item.cursed_item_id {
            let before = selection.selected_item_count();
            selection.stable_item(
                item.id.clone(),
                "cursedItemId".into(),
                target,
                Relation::CursedPresentation,
            )?;
            if selection.selected_item_count() != before {
                pending.extend(selection.selected_item_ids());
            }
        }
        spell_effect(&item, selection)?;
    }
    Ok(projected)
}

fn spell_effect(item: &RebuiltV3ItemDefinition, selection: &mut Selection) -> Result<(), Error> {
    if item.special[1] > 1100 {
        let id = i16::try_from(item.special[1]).map_err(|_| Error::MissingDefinition {
            source: item.id.clone(),
            field_path: "special[1]".into(),
            target_kind: Kind::Spell,
            classic_id: i16::MAX,
        })?;
        selection.spell(
            item.id.clone(),
            "special[1]".into(),
            id,
            Relation::ItemSpellEffect,
        )?;
    }
    Ok(())
}

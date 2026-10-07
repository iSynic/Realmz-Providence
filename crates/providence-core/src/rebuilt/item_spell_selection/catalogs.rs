use super::{
    RebuiltV3ItemDefinition, RebuiltV3ReachableItemSpellError as Error,
    RebuiltV3RuntimeDefinitionKind as Kind, RebuiltV3SpellDefinition,
};
use crate::{
    codecs::{SCENARIO_SPELL_RECORDS, scenario_spell_classic_id},
    model::ProjectSnapshot,
    rebuilt::{project_rebuilt_v3_item_catalog, project_rebuilt_v3_standard_spell_catalog},
};
use std::collections::{BTreeMap, BTreeSet};

pub(super) struct Catalogs {
    pub standard_items: Vec<RebuiltV3ItemDefinition>,
    pub standard_spells: Vec<RebuiltV3SpellDefinition>,
    pub item_ids: BTreeSet<i16>,
    pub spell_ids: BTreeSet<i16>,
    pub scenario_spell_ids: BTreeSet<i16>,
    pub available_items: BTreeSet<i16>,
    pub available_spells: BTreeSet<i16>,
    pub items_by_id: BTreeMap<i16, RebuiltV3ItemDefinition>,
}

impl Catalogs {
    pub fn project(snapshot: &ProjectSnapshot) -> Result<Self, Error> {
        let standard_items =
            project_rebuilt_v3_item_catalog(snapshot).map_err(Error::ItemCatalog)?;
        let standard_spells =
            project_rebuilt_v3_standard_spell_catalog(snapshot).map_err(Error::SpellCatalog)?;
        Ok(Self {
            item_ids: standard_items.iter().map(|item| item.classic_id).collect(),
            spell_ids: standard_spells
                .iter()
                .map(|spell| spell.classic_id)
                .collect(),
            scenario_spell_ids: (0..SCENARIO_SPELL_RECORDS)
                .filter_map(|index| scenario_spell_classic_id(index as u16))
                .collect(),
            available_items: snapshot
                .scenario_item_rules
                .iter()
                .map(|item| item.definition.classic_id)
                .collect(),
            available_spells: snapshot
                .scenario_spells
                .iter()
                .filter_map(|spell| scenario_spell_classic_id(spell.definition.record_index))
                .collect(),
            items_by_id: standard_items
                .iter()
                .map(|item| (item.classic_id, item.clone()))
                .collect(),
            standard_items,
            standard_spells,
        })
    }

    pub fn missing(&self, kind: Kind, id: i16) -> bool {
        match kind {
            Kind::Item => !self.item_ids.contains(&id) && !self.available_items.contains(&id),
            Kind::Spell => !self.spell_ids.contains(&id) && !self.available_spells.contains(&id),
        }
    }
}

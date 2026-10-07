use super::{
    RebuiltV3ItemDefinition, RebuiltV3ReachableItemSpellError as Error,
    RebuiltV3ReachableItemSpellSelection, RebuiltV3RuntimeDefinitionKind as Kind,
    RebuiltV3RuntimeDefinitionReference as Reference,
    RebuiltV3RuntimeDefinitionRelation as Relation, catalogs::Catalogs,
};
use crate::{
    model::{ProjectOrigin, ProjectSnapshot, StableId},
    rebuilt::project_rebuilt_v3_selected_scenario_spell_catalog,
};
use std::collections::{BTreeMap, BTreeSet, VecDeque};

/// Local dependency closure; catalog ownership never changes the authored snapshot.
pub(super) struct Selection {
    catalogs: Catalogs,
    selected_items: BTreeSet<i16>,
    selected_spells: BTreeSet<i16>,
    references: BTreeSet<Reference>,
    allow_deferred: bool,
}

impl Selection {
    pub fn new(snapshot: &ProjectSnapshot) -> Result<Self, Error> {
        Ok(Self {
            catalogs: Catalogs::project(snapshot)?,
            selected_items: BTreeSet::new(),
            selected_spells: BTreeSet::new(),
            references: BTreeSet::new(),
            allow_deferred: matches!(snapshot.origin, ProjectOrigin::Imported { .. }),
        })
    }

    pub fn defers_missing(&self) -> bool {
        self.allow_deferred
    }

    pub fn item(
        &mut self,
        source: StableId,
        field_path: String,
        raw_id: i16,
        relation: Relation,
    ) -> Result<(), Error> {
        let classic_id = numeric_id(&source, &field_path, Kind::Item, raw_id)?;
        if !self.catalogs.item_ids.contains(&classic_id) && (800..=999).contains(&classic_id) {
            self.selected_items.insert(classic_id);
        }
        self.references.insert(Reference {
            source,
            field_path,
            target_kind: Kind::Item,
            relation,
            classic_id,
            target_id: StableId(format!("classic.item.{classic_id}")),
        });
        Ok(())
    }

    pub fn spell(
        &mut self,
        source: StableId,
        field_path: String,
        raw_id: i16,
        relation: Relation,
    ) -> Result<(), Error> {
        let classic_id = numeric_id(&source, &field_path, Kind::Spell, raw_id)?;
        if !self.catalogs.spell_ids.contains(&classic_id)
            && self.catalogs.scenario_spell_ids.contains(&classic_id)
        {
            self.selected_spells.insert(classic_id);
        }
        self.references.insert(Reference {
            source,
            field_path,
            target_kind: Kind::Spell,
            relation,
            classic_id,
            target_id: StableId(format!("classic.spell.{classic_id}")),
        });
        Ok(())
    }

    pub fn stable_item(
        &mut self,
        source: StableId,
        field: String,
        target: &StableId,
        relation: Relation,
    ) -> Result<(), Error> {
        let id = stable_id(&source, &field, target, "classic.item.")?;
        self.item(source, field, id, relation)
    }

    pub fn stable_spell(
        &mut self,
        source: StableId,
        field: String,
        target: &StableId,
        relation: Relation,
    ) -> Result<(), Error> {
        let id = stable_id(&source, &field, target, "classic.spell.")?;
        self.spell(source, field, id, relation)
    }

    pub fn item_gate(&mut self, source: StableId, field: String, raw_id: i16) -> Result<(), Error> {
        let Ok(id) = i16::try_from(i32::from(raw_id).unsigned_abs()) else {
            return Ok(());
        };
        // Encounter comparison literals outside the domain never load a definition.
        if !self.catalogs.item_ids.contains(&id) && !(800..=999).contains(&id) {
            return Ok(());
        }
        self.item(source, field, id, Relation::EncounterGate)
    }

    pub fn spell_gate(
        &mut self,
        source: StableId,
        field: String,
        raw_id: i16,
    ) -> Result<(), Error> {
        let Ok(id) = i16::try_from(i32::from(raw_id).unsigned_abs()) else {
            return Ok(());
        };
        if !self.catalogs.spell_ids.contains(&id) && !self.catalogs.scenario_spell_ids.contains(&id)
        {
            return Ok(());
        }
        self.spell(source, field, id, Relation::EncounterGate)
    }

    pub fn reconcile_roots(&mut self) -> Result<(), Error> {
        if self.allow_deferred {
            self.selected_items
                .retain(|id| self.catalogs.available_items.contains(id));
            self.selected_spells
                .retain(|id| self.catalogs.available_spells.contains(id));
        } else if let Some(reference) = self.references.iter().find(|reference| {
            self.catalogs
                .missing(reference.target_kind, reference.classic_id)
        }) {
            return Err(missing(reference));
        }
        Ok(())
    }

    pub fn reconcile_effects(&mut self) -> Result<(), Error> {
        if self.allow_deferred {
            self.selected_spells
                .retain(|id| self.catalogs.available_spells.contains(id));
        } else if let Some(reference) = self.references.iter().find(|reference| {
            reference.target_kind == Kind::Spell
                && self.catalogs.missing(Kind::Spell, reference.classic_id)
        }) {
            return Err(missing(reference));
        }
        Ok(())
    }

    pub fn item_queue(&self) -> VecDeque<i16> {
        self.catalogs
            .item_ids
            .iter()
            .chain(&self.selected_items)
            .copied()
            .collect()
    }

    pub fn selected_item_count(&self) -> usize {
        self.selected_items.len()
    }
    pub fn selected_item_ids(&self) -> impl Iterator<Item = i16> + '_ {
        self.selected_items.iter().copied()
    }
    pub fn standard_item(&self, id: i16) -> Option<&RebuiltV3ItemDefinition> {
        self.catalogs.items_by_id.get(&id)
    }

    pub fn project(
        self,
        snapshot: &ProjectSnapshot,
        custom_items: BTreeMap<i16, RebuiltV3ItemDefinition>,
    ) -> Result<RebuiltV3ReachableItemSpellSelection, Error> {
        let mut items = self.catalogs.standard_items;
        items.extend(custom_items.into_values());
        let mut spells = self.catalogs.standard_spells;
        spells.extend(
            project_rebuilt_v3_selected_scenario_spell_catalog(snapshot, &self.selected_spells)
                .map_err(Error::SpellCatalog)?,
        );
        Ok(RebuiltV3ReachableItemSpellSelection {
            portable_standard_item_count: self.catalogs.item_ids.len(),
            portable_standard_spell_count: self.catalogs.spell_ids.len(),
            reachable_scenario_item_ids: self.selected_items.into_iter().collect(),
            reachable_scenario_spell_ids: self.selected_spells.into_iter().collect(),
            references: self.references.into_iter().collect(),
            items,
            spells,
        })
    }
}

fn stable_id(
    source: &StableId,
    field: &str,
    target: &StableId,
    prefix: &str,
) -> Result<i16, Error> {
    target
        .0
        .strip_prefix(prefix)
        .and_then(|value| value.parse().ok())
        .ok_or_else(|| Error::InvalidStableTarget {
            source: source.clone(),
            field_path: field.into(),
            target: target.clone(),
        })
}

fn numeric_id(source: &StableId, field: &str, kind: Kind, raw: i16) -> Result<i16, Error> {
    i16::try_from(i32::from(raw).unsigned_abs()).map_err(|_| Error::MissingDefinition {
        source: source.clone(),
        field_path: field.into(),
        target_kind: kind,
        classic_id: raw,
    })
}

fn missing(reference: &Reference) -> Error {
    Error::MissingDefinition {
        source: reference.source.clone(),
        field_path: reference.field_path.clone(),
        target_kind: reference.target_kind,
        classic_id: reference.classic_id,
    }
}

use crate::{
    model::{ItemRuleDefinition, ProjectOrigin, ProjectSnapshot, SpellDefinition, StableId},
    references::{ReferenceDescriptor, TargetKind},
};
use std::collections::{BTreeMap, BTreeSet};

/// Verified application definitions supplied by the caller, never portable authority.
#[derive(Clone, Copy, Default)]
pub struct StandardCatalog<'a> {
    pub items: &'a [ItemRuleDefinition],
    pub spells: &'a [SpellDefinition],
}

pub(super) fn unused_defaults(
    snapshot: &ProjectSnapshot,
    references: &[ReferenceDescriptor],
    stock: StandardCatalog<'_>,
) -> BTreeSet<StableId> {
    if !matches!(snapshot.origin, ProjectOrigin::Authored) {
        return BTreeSet::new();
    }
    let called = references
        .iter()
        .map(|reference| (&reference.target_kind, reference.target_id.as_str()))
        .collect::<BTreeSet<_>>();
    let items = stock
        .items
        .iter()
        .map(|row| (&row.id, row))
        .collect::<BTreeMap<_, _>>();
    let spells = stock
        .spells
        .iter()
        .map(|row| (&row.id, row))
        .collect::<BTreeMap<_, _>>();
    let has_source = |path: &str| {
        snapshot
            .classic_sources
            .iter()
            .any(|row| row.native_path == path)
    };
    let mut unused = BTreeSet::new();
    // Explicit scenario imports and changed definitions remain actionable even
    // without callers. Only copied application defaults qualify here.
    if !has_source("Data ID") {
        for row in &snapshot.item_rules {
            let item = &row.definition;
            if items.get(&item.id).is_some_and(|stock| **stock == *item)
                && !called.contains(&(&TargetKind::Item, item.id.0.as_str()))
                && !called.contains(&(&TargetKind::Item, item.classic_id.to_string().as_str()))
            {
                unused.insert(item.id.clone());
            }
        }
    }
    if !has_source("Data S") {
        for row in &snapshot.standard_spells {
            let spell = &row.definition;
            if spells.get(&spell.id).is_some_and(|stock| **stock == *spell)
                && !called.contains(&(&TargetKind::Spell, spell.id.0.as_str()))
                && !called.contains(&(&TargetKind::Spell, spell.classic_id.to_string().as_str()))
            {
                unused.insert(spell.id.clone());
            }
        }
    }
    unused
}

pub(super) fn is_dependency(finding: &super::Diagnostic, unused: &BTreeSet<StableId>) -> bool {
    matches!(
        finding.code.as_str(),
        "reference.extra-action-point.missing" | "reference.monster.missing"
    ) && finding
        .entity
        .as_ref()
        .is_some_and(|id| unused.contains(id))
}

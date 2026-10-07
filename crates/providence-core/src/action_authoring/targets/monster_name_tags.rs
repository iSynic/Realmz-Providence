use super::{ActionTarget, ActionTargetStatus};
use crate::model::{ProjectSnapshot, StableId};
use std::collections::{BTreeMap, BTreeSet};

pub(super) fn targets(snapshot: &ProjectSnapshot) -> Vec<ActionTarget> {
    let mut names: BTreeMap<u8, BTreeSet<String>> = BTreeMap::new();
    let mut counts: BTreeMap<u8, usize> = BTreeMap::new();
    for monster in snapshot
        .monster_sets
        .iter()
        .flat_map(|set| set.monsters.iter())
    {
        *counts.entry(monster.name_id).or_default() += 1;
        let name = monster.display_name.trim();
        if !name.is_empty() {
            names
                .entry(monster.name_id)
                .or_default()
                .insert(name.to_owned());
        }
    }
    counts
        .into_iter()
        .map(|(tag, count)| {
            let representatives = names
                .remove(&tag)
                .unwrap_or_default()
                .into_iter()
                .take(3)
                .collect::<Vec<_>>();
            let sample = if representatives.is_empty() {
                "unnamed monsters".to_owned()
            } else {
                representatives.join(", ")
            };
            ActionTarget {
                identity: StableId(format!("monster-name-tag:{tag}")),
                value: i32::from(tag),
                label: format!("Tag {tag} · {sample}"),
                detail: format!(
                    "{count} monster definition{} use{} this name tag",
                    if count == 1 { "" } else { "s" },
                    if count == 1 { "s" } else { "" }
                ),
                status: ActionTargetStatus::Resolved,
                preview: None,
            }
        })
        .collect()
}

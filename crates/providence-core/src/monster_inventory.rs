use std::collections::{BTreeMap, BTreeSet};

use serde::Serialize;

use crate::model::{MonsterRecord, MonsterSet, ProjectSnapshot, StableId};

const SETS: [i16; 3] = [0, 1, -1];

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MonsterInventoryRow {
    pub native_id: u32,
    pub display_name: String,
    pub display_set_id: i16,
    pub hit_dice: u8,
    pub armor: i8,
    pub agility: u8,
    pub icon_id: i16,
    pub selected_identity: Option<StableId>,
    pub available_sets: Vec<i16>,
    pub normal_not_on_menu: Option<bool>,
    pub battle_placements: usize,
}

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MonsterInventoryPage {
    pub selected_set_id: i16,
    pub present_sets: Vec<i16>,
    pub items: Vec<MonsterInventoryRow>,
    pub offset: usize,
    pub limit: usize,
    pub total: usize,
    pub truncated: bool,
}

/// Author-facing catalog only. Filtering never removes records from project truth or export.
pub fn inventory(
    snapshot: &ProjectSnapshot,
    selected_set: i16,
    query: &str,
    offset: usize,
    limit: usize,
) -> Result<MonsterInventoryPage, String> {
    if !SETS.contains(&selected_set) {
        return Err(format!("unsupported monster set {selected_set}"));
    }
    let sets: Vec<&MonsterSet> = SETS
        .iter()
        .filter_map(|id| snapshot.monster_sets.iter().find(|set| set.set_id == *id))
        .collect();
    let index = InventoryIndex::new(&sets, snapshot);
    let needle = query.trim().to_lowercase();
    let limit = limit.clamp(1, 128);
    let mut items = Vec::new();
    let mut total = 0;
    for id in index.ids.iter().copied() {
        let display_set = [selected_set, 0, 1, -1]
            .into_iter()
            .find(|set| index.records.contains_key(&(*set, id)))
            .expect("inventory IDs originate in an existing record");
        let display = index.records[&(display_set, id)];
        let available_sets: Vec<i16> = SETS
            .into_iter()
            .filter(|set| index.records.contains_key(&(*set, id)))
            .collect();
        let searchable = format!(
            "{id} {} icon {} hd {} normal {} monster {} mega {}",
            display.display_name,
            display.icon_id,
            display.hit_dice,
            available_sets.contains(&0),
            available_sets.contains(&1),
            available_sets.contains(&-1)
        )
        .to_lowercase();
        if !searchable.contains(&needle) {
            continue;
        }
        if total >= offset && items.len() < limit {
            items.push(index.row(id, selected_set, display_set, display, available_sets));
        }
        total += 1;
    }
    Ok(MonsterInventoryPage {
        selected_set_id: selected_set,
        present_sets: sets.iter().map(|set| set.set_id).collect(),
        items,
        offset,
        limit,
        total,
        truncated: offset.saturating_add(limit) < total,
    })
}

struct InventoryIndex<'a> {
    ids: BTreeSet<u32>,
    records: BTreeMap<(i16, u32), &'a MonsterRecord>,
    placements: BTreeMap<u32, usize>,
}

impl<'a> InventoryIndex<'a> {
    fn new(sets: &[&'a MonsterSet], snapshot: &ProjectSnapshot) -> Self {
        let called: BTreeSet<u32> = crate::monster_uses::monster_uses(snapshot)
            .into_iter()
            .map(|usage| usage.target_id)
            .collect();
        let normal_terminator = sets
            .iter()
            .find(|set| set.set_id == 0)
            .and_then(|set| terminator(set));
        let mut placements = BTreeMap::<u32, usize>::new();
        for value in snapshot.battles.iter().flat_map(|battle| &battle.grid) {
            if *value != 0 {
                *placements
                    .entry(u32::from(value.unsigned_abs()))
                    .or_default() += 1;
            }
        }
        let mut ids = BTreeSet::new();
        let mut records = BTreeMap::new();
        for set in sets {
            let boundary = normal_terminator.into_iter().chain(terminator(set)).min();
            for record in &set.monsters {
                let id = record.native_id.0;
                records.insert((set.set_id, id), record);
                if called.contains(&id)
                    || (record.authored && !is_blank(record))
                    || boundary.is_none_or(|boundary| id < boundary)
                {
                    ids.insert(id);
                }
            }
        }
        Self {
            ids,
            records,
            placements,
        }
    }

    fn row(
        &self,
        id: u32,
        selected_set: i16,
        display_set: i16,
        display: &MonsterRecord,
        available_sets: Vec<i16>,
    ) -> MonsterInventoryRow {
        MonsterInventoryRow {
            native_id: id,
            display_name: display.display_name.clone(),
            display_set_id: display_set,
            hit_dice: display.hit_dice,
            armor: display.armor,
            agility: display.agility,
            icon_id: display.icon_id,
            selected_identity: self
                .records
                .get(&(selected_set, id))
                .map(|record| record.identity.clone()),
            available_sets,
            normal_not_on_menu: self.records.get(&(0, id)).map(|record| record.not_on_menu),
            battle_placements: self.placements.get(&id).copied().unwrap_or(0),
        }
    }
}

fn terminator(set: &MonsterSet) -> Option<u32> {
    set.monsters
        .iter()
        .filter(|record| record.hit_dice == 255 && !record.not_on_menu)
        .map(|record| record.native_id.0)
        .min()
}

fn is_blank(record: &MonsterRecord) -> bool {
    record.hit_dice == 0
        && record.agility == 0
        && record.movement_max == 0
        && record.attack_count == 0
        && record.display_name.trim().is_empty()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::codecs::decode_monster_set;
    use crate::model::{BattleRecord, NativeRecordId};

    fn project() -> ProjectSnapshot {
        ProjectSnapshot::new_authored(StableId("inventory-test".into()))
    }

    #[test]
    fn hidden_hd_255_is_not_a_bestiary_terminator() {
        let mut snapshot = project();
        let mut normal = decode_monster_set(&[0; 630], "Data MD", 0);
        normal.monsters[1].hit_dice = 255;
        normal.monsters[1].not_on_menu = true;
        snapshot.monster_sets.push(normal);
        assert_eq!(inventory(&snapshot, 0, "", 0, 64).unwrap().total, 3);
    }

    #[test]
    fn script_referenced_tail_ids_remain_selectable() {
        let normal = decode_monster_set(&[0; 840], "Data MD", 0);
        let mut snapshot = project();
        snapshot.monster_sets.push(normal);
        snapshot.monster_sets[0].monsters[1].hit_dice = 255;
        snapshot.extra_action_points = crate::codecs::decode_extra_action_points(&[0; 40]).records;
        snapshot.extra_action_points[0].actions = vec![crate::model::ClassicAction {
            slot: 0,
            raw_opcode: 89,
            target_native_id: 3,
        }];
        let page = inventory(&snapshot, 0, "", 0, 64).unwrap();
        assert_eq!(
            page.items
                .iter()
                .map(|row| row.native_id)
                .collect::<Vec<_>>(),
            [0, 3]
        );
    }

    #[test]
    fn union_keeps_exact_selection_separate_from_fallback_labels() {
        let mut project = project();
        let mut normal = decode_monster_set(&[0; 420], "Data MD", 0);
        normal.monsters[1].display_name = "Normal guard".into();
        normal.monsters[1].not_on_menu = true;
        let mut variant = normal.clone();
        variant.set_id = 1;
        variant.monsters.retain(|record| record.native_id.0 == 0);
        project.monster_sets = vec![variant, normal];
        let result = inventory(&project, -1, "guard", 0, 64).unwrap();
        assert_eq!(result.present_sets, [0, 1]);
        assert_eq!(result.items[0].available_sets, [0]);
        assert_eq!(result.items[0].display_set_id, 0);
        assert_eq!(result.items[0].selected_identity, None);
        assert_eq!(result.items[0].normal_not_on_menu, Some(true));
        assert!(inventory(&project, 2, "", 0, 64).is_err());
    }

    #[test]
    fn earliest_terminators_preserve_authored_and_signed_battle_exceptions() {
        let mut project = project();
        let mut normal = decode_monster_set(&[0; 2100], "Data MD", 0);
        normal.monsters[3].hit_dice = 255;
        normal.monsters[5].authored = true;
        normal.monsters[5].display_name = "Authored tail".into();
        normal.monsters[6].authored = true;
        normal.monsters[6].display_name.clear();
        let mut variant = decode_monster_set(&[0; 2100], "Data MD1", 1);
        variant.monsters[1].hit_dice = 255;
        project.monster_sets = vec![variant, normal];
        project.battles.push(BattleRecord {
            identity: StableId("battle:0".into()),
            native_id: NativeRecordId(0),
            grid: vec![-8, 8, 0, i16::MIN],
            distance: 0,
            message_before: 0,
            message_after: 0,
            battle_macro: 0,
            authored: false,
        });
        let before = project.clone();
        let result = inventory(&project, 1, "", 0, 64).unwrap();
        assert_eq!(
            result
                .items
                .iter()
                .map(|row| row.native_id)
                .collect::<Vec<_>>(),
            [0, 1, 2, 5, 8]
        );
        assert_eq!(result.items.last().unwrap().battle_placements, 2);
        assert_eq!(project, before);
    }

    #[test]
    fn search_precedes_bounded_paging_and_empty_sets_remain_explicit() {
        let mut project = project();
        assert!(
            inventory(&project, 0, "", 0, 64)
                .unwrap()
                .present_sets
                .is_empty()
        );
        let mut set = decode_monster_set(&vec![0; 210 * 300], "Data MD-1", -1);
        set.monsters[299].display_name = "Last dragon".into();
        project.monster_sets.push(set);
        let page = inventory(&project, -1, "", 0, usize::MAX).unwrap();
        assert_eq!(page.limit, 128);
        assert_eq!(page.items.len(), 128);
        assert_eq!(page.total, 300);
        assert!(page.truncated);
        let page = inventory(&project, -1, " LAST DRAGON ", 0, 0).unwrap();
        assert_eq!(page.total, 1);
        assert_eq!(page.items[0].native_id, 299);
        assert!(page.items[0].selected_identity.is_some());
        assert!(
            inventory(&project, -1, "", usize::MAX, 1)
                .unwrap()
                .items
                .is_empty()
        );
    }

    #[test]
    fn selected_set_then_normal_monster_mega_controls_display_provenance() {
        let mut project = project();
        for id in SETS {
            let mut set = decode_monster_set(&[0; 210], "controlled", id);
            set.monsters[0].display_name = format!("Set {id}");
            set.monsters[0].icon_id = id;
            project.monster_sets.push(set);
        }
        for id in SETS {
            let page = inventory(&project, id, "", 0, 1).unwrap();
            assert_eq!(page.items[0].display_name, format!("Set {id}"));
            assert_eq!(page.items[0].display_set_id, id);
            assert_eq!(page.items[0].icon_id, id);
        }
        project.monster_sets.retain(|set| set.set_id != -1);
        assert_eq!(
            inventory(&project, -1, "", 0, 1).unwrap().items[0].display_set_id,
            0
        );
        project.monster_sets.retain(|set| set.set_id != 0);
        assert_eq!(
            inventory(&project, -1, "", 0, 1).unwrap().items[0].display_set_id,
            1
        );
        project.monster_sets[0].set_id = -1;
        assert_eq!(
            inventory(&project, 0, "", 0, 1).unwrap().items[0].display_set_id,
            -1
        );
    }
}

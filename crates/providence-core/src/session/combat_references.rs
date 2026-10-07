use crate::codecs::BATTLE_RECORD_BYTES;
use crate::codecs::MONSTER_RECORD_BYTES;
use crate::codecs::scenario_spell_classic_id;
use crate::model::ProjectSnapshot;
use crate::model::StableId;
use crate::model::{BattleRecord, MonsterRecord, MonsterSet};
use crate::references::ByteProvenance;
use crate::references::FieldPath;
use crate::references::ReferenceDescriptor;
use crate::references::RepairAction;
use crate::references::ResolutionState;
use crate::references::TargetKind;
use crate::session::monster_records::monster_record_is_active;

pub(super) fn monster_references(snapshot: &ProjectSnapshot) -> Vec<ReferenceDescriptor> {
    let mut references = Vec::new();
    for set in &snapshot.monster_sets {
        for monster in &set.monsters {
            append_monster_equipment(snapshot, set, monster, &mut references);
            append_monster_spells(snapshot, set, monster, &mut references);
            append_monster_icon(snapshot, set, monster, &mut references);
            append_monster_death_macro(snapshot, set, monster, &mut references);
        }
    }
    references
}

pub(super) fn monster_item_reference(
    snapshot: &ProjectSnapshot,
    source: StableId,
    field: String,
    classic_id: i16,
    native_path: &str,
    record_index: u32,
    byte_start: usize,
) -> ReferenceDescriptor {
    let random_weapon_fallback =
        (field == "weapon" && classic_id < 0).then(|| "Classic random weapon category".to_string());
    let byte_width = if field == "requiredWeapon" { 1 } else { 2 };
    let target_classic_id = if field.starts_with("items[") {
        i16::try_from(i32::from(classic_id).unsigned_abs()).unwrap_or(classic_id)
    } else {
        classic_id
    };
    let resolved = snapshot
        .item_rules
        .iter()
        .find(|rule| rule.definition.classic_id == target_classic_id)
        .map(|rule| rule.definition.id.0.clone())
        .or_else(|| {
            snapshot
                .scenario_item_rules
                .iter()
                .find(|rule| rule.definition.classic_id == target_classic_id)
                .map(|rule| rule.definition.id.0.clone())
        });
    let stock_fallback = random_weapon_fallback.or_else(|| {
        (resolved.is_none() && (1..800).contains(&target_classic_id))
            .then(|| "Classic stock item catalog".into())
    });
    let resolution = if stock_fallback.is_some() {
        ResolutionState::StockFallback
    } else if resolved.is_some() {
        ResolutionState::Resolved
    } else {
        ResolutionState::Missing
    };
    ReferenceDescriptor {
        source,
        field: FieldPath(field),
        target_kind: TargetKind::Item,
        target_id: resolved.unwrap_or_else(|| target_classic_id.to_string()),
        required: true,
        stock_fallback: stock_fallback.clone(),
        resolution,
        repair_actions: vec![RepairAction::Retarget, RepairAction::ImportTarget],
        byte_provenance: Some(ByteProvenance {
            native_path: native_path.into(),
            record_index,
            byte_start: byte_start as u32,
            byte_end: byte_start as u32 + byte_width,
        }),
    }
}

pub(super) fn spell_reference(
    snapshot: &ProjectSnapshot,
    source: StableId,
    field: String,
    classic_id: i16,
    required: bool,
    fallback_label: &str,
    byte_provenance: ByteProvenance,
) -> ReferenceDescriptor {
    let normalized_id = i32::from(classic_id).unsigned_abs();
    let resolved = snapshot
        .standard_spells
        .iter()
        .chain(snapshot.scenario_spells.iter())
        .find(|spell| u32::from(spell.definition.classic_id.unsigned_abs()) == normalized_id);
    let is_custom_scenario_id = (0..crate::codecs::SCENARIO_SPELL_RECORDS)
        .filter_map(|record_index| scenario_spell_classic_id(record_index as u16))
        .any(|candidate| u32::from(candidate.unsigned_abs()) == normalized_id);
    let stock_fallback =
        (resolved.is_none() && !is_custom_scenario_id).then(|| fallback_label.to_string());
    let mut repair_actions = vec![RepairAction::Retarget, RepairAction::ImportTarget];
    if !required {
        repair_actions.push(RepairAction::ClearOptional);
    }
    ReferenceDescriptor {
        source,
        field: FieldPath(field),
        target_kind: TargetKind::Spell,
        target_id: resolved
            .map(|spell| spell.definition.id.0.clone())
            .unwrap_or_else(|| normalized_id.to_string()),
        required,
        stock_fallback: stock_fallback.clone(),
        resolution: if resolved.is_some() {
            ResolutionState::Resolved
        } else if stock_fallback.is_some() {
            ResolutionState::StockFallback
        } else {
            ResolutionState::Missing
        },
        repair_actions,
        byte_provenance: Some(byte_provenance),
    }
}

pub(super) fn battle_references(snapshot: &ProjectSnapshot) -> Vec<ReferenceDescriptor> {
    let normal_monsters = snapshot
        .monster_sets
        .iter()
        .find(|set| set.set_id == 0 && set.native_path == "Data MD");
    let mut references = Vec::new();
    for battle in &snapshot.battles {
        append_battle_monsters(normal_monsters, battle, &mut references);
        append_battle_messages(snapshot, battle, &mut references);
        append_battle_macro(snapshot, battle, &mut references);
    }
    references
}

fn append_monster_equipment(
    snapshot: &ProjectSnapshot,
    set: &MonsterSet,
    monster: &MonsterRecord,
    references: &mut Vec<ReferenceDescriptor>,
) {
    let row_start = monster.native_id.0 as usize * MONSTER_RECORD_BYTES;
    for (index, item_id) in monster.items.iter().copied().enumerate() {
        if item_id != 0 {
            references.push(monster_item_reference(
                snapshot,
                monster.identity.clone(),
                format!("items[{index}]"),
                item_id,
                &set.native_path,
                monster.native_id.0,
                row_start + 84 + index * 2,
            ));
        }
    }
    if monster.weapon != 0 {
        references.push(monster_item_reference(
            snapshot,
            monster.identity.clone(),
            "weapon".into(),
            monster.weapon,
            &set.native_path,
            monster.native_id.0,
            row_start + 96,
        ));
    }
    if monster.required_weapon > 0 {
        references.push(monster_item_reference(
            snapshot,
            monster.identity.clone(),
            "requiredWeapon".into(),
            i16::from(monster.required_weapon),
            &set.native_path,
            monster.native_id.0,
            row_start + 7,
        ));
    }
}

fn append_monster_spells(
    snapshot: &ProjectSnapshot,
    set: &MonsterSet,
    monster: &MonsterRecord,
    references: &mut Vec<ReferenceDescriptor>,
) {
    let row_start = monster.native_id.0 as usize * MONSTER_RECORD_BYTES;
    for (index, spell_id) in monster.spells.iter().copied().enumerate() {
        if spell_id <= 0 {
            continue;
        }
        references.push(spell_reference(
            snapshot,
            monster.identity.clone(),
            format!("spells[{index}]"),
            spell_id,
            true,
            "Classic stock spell catalog",
            ByteProvenance {
                native_path: set.native_path.clone(),
                record_index: monster.native_id.0,
                byte_start: (row_start + 64 + index * 2) as u32,
                byte_end: (row_start + 66 + index * 2) as u32,
            },
        ));
    }
}

fn append_monster_icon(
    snapshot: &ProjectSnapshot,
    set: &MonsterSet,
    monster: &MonsterRecord,
    references: &mut Vec<ReferenceDescriptor>,
) {
    let row_start = monster.native_id.0 as usize * MONSTER_RECORD_BYTES;
    if monster.icon_id != 0 {
        let icon_id = i32::from(monster.icon_id);
        let valid_runtime_id = icon_id > 0
            && icon_id + crate::monster_appearance::MONSTER_ICON_PAIR_OFFSET <= i32::from(i16::MAX);
        let resolved_asset = valid_runtime_id
            .then(|| {
                snapshot.assets.iter().find(|asset| {
                    asset.classic_resource.as_ref().is_some_and(|resource| {
                        resource.resource_type == "cicn" && resource.resource_id == icon_id
                    })
                })
            })
            .flatten();
        references.push(ReferenceDescriptor {
            source: monster.identity.clone(),
            field: FieldPath("icon".into()),
            target_kind: TargetKind::Icon,
            target_id: resolved_asset
                .map(|asset| asset.identity.0.clone())
                .unwrap_or_else(|| monster.icon_id.to_string()),
            required: true,
            stock_fallback: (valid_runtime_id && resolved_asset.is_none())
                .then(|| "Classic actor/creature icon catalog".into()),
            resolution: if resolved_asset.is_some() {
                ResolutionState::Resolved
            } else if valid_runtime_id {
                ResolutionState::StockFallback
            } else {
                ResolutionState::Missing
            },
            repair_actions: vec![RepairAction::Retarget, RepairAction::ImportTarget],
            byte_provenance: Some(ByteProvenance {
                native_path: set.native_path.clone(),
                record_index: monster.native_id.0,
                byte_start: (row_start + 98) as u32,
                byte_end: (row_start + 100) as u32,
            }),
        });
    }
}

fn append_monster_death_macro(
    snapshot: &ProjectSnapshot,
    set: &MonsterSet,
    monster: &MonsterRecord,
    references: &mut Vec<ReferenceDescriptor>,
) {
    let row_start = monster.native_id.0 as usize * MONSTER_RECORD_BYTES;
    if monster.death_macro != 0 {
        let target_id = i32::from(monster.death_macro).unsigned_abs();
        let resolved = snapshot
            .extra_action_points
            .iter()
            .any(|row| row.native_id.0 == target_id);
        references.push(ReferenceDescriptor {
            source: monster.identity.clone(),
            field: FieldPath("deathMacro".into()),
            target_kind: TargetKind::ExtraActionPoint,
            target_id: target_id.to_string(),
            required: true,
            stock_fallback: None,
            resolution: if resolved {
                ResolutionState::Resolved
            } else {
                ResolutionState::Missing
            },
            repair_actions: if resolved {
                vec![RepairAction::Retarget, RepairAction::ClearOptional]
            } else {
                vec![
                    RepairAction::Retarget,
                    RepairAction::CreateTarget,
                    RepairAction::ClearOptional,
                ]
            },
            byte_provenance: Some(ByteProvenance {
                native_path: set.native_path.clone(),
                record_index: monster.native_id.0,
                byte_start: (row_start + 166) as u32,
                byte_end: (row_start + 168) as u32,
            }),
        });
    }
}

fn append_battle_monsters(
    normal_monsters: Option<&MonsterSet>,
    battle: &BattleRecord,
    references: &mut Vec<ReferenceDescriptor>,
) {
    let row_start = battle.native_id.0 as usize * BATTLE_RECORD_BYTES;
    for (slot, raw_id) in battle.grid.iter().copied().enumerate() {
        if raw_id == 0 {
            continue;
        }
        let target_native_id = i32::from(raw_id).unsigned_abs();
        let resolved = normal_monsters.is_some_and(|set| {
            set.monsters.iter().any(|monster| {
                monster.native_id.0 == target_native_id && monster_record_is_active(monster)
            })
        });
        references.push(ReferenceDescriptor {
            source: battle.identity.clone(),
            field: FieldPath(format!("grid[{slot}].monster")),
            target_kind: TargetKind::Monster,
            target_id: format!("monster:0:{target_native_id}"),
            required: true,
            stock_fallback: None,
            resolution: if resolved {
                ResolutionState::Resolved
            } else {
                ResolutionState::Missing
            },
            repair_actions: if resolved {
                vec![RepairAction::Retarget]
            } else {
                vec![RepairAction::Retarget, RepairAction::CreateTarget]
            },
            byte_provenance: Some(ByteProvenance {
                native_path: "Data BD".into(),
                record_index: battle.native_id.0,
                byte_start: (row_start + slot * 2) as u32,
                byte_end: (row_start + slot * 2 + 2) as u32,
            }),
        });
    }
}

fn append_battle_messages(
    snapshot: &ProjectSnapshot,
    battle: &BattleRecord,
    references: &mut Vec<ReferenceDescriptor>,
) {
    let row_start = battle.native_id.0 as usize * BATTLE_RECORD_BYTES;
    for (field, target_id, offset) in [
        ("messageBefore", battle.message_before, 340usize),
        ("messageAfter", battle.message_after, 342usize),
    ] {
        if target_id == 0 {
            continue;
        }
        let target_native_id = i32::from(target_id).unsigned_abs();
        let resolved = snapshot
            .messages
            .iter()
            .any(|message| message.native_id.0 == target_native_id);
        references.push(ReferenceDescriptor {
            source: battle.identity.clone(),
            field: FieldPath(field.into()),
            target_kind: TargetKind::Message,
            target_id: target_native_id.to_string(),
            required: false,
            stock_fallback: None,
            resolution: if resolved {
                ResolutionState::Resolved
            } else {
                ResolutionState::Missing
            },
            repair_actions: if resolved {
                vec![RepairAction::Retarget, RepairAction::ClearOptional]
            } else {
                vec![
                    RepairAction::Retarget,
                    RepairAction::CreateTarget,
                    RepairAction::ClearOptional,
                ]
            },
            byte_provenance: Some(ByteProvenance {
                native_path: "Data BD".into(),
                record_index: battle.native_id.0,
                byte_start: (row_start + offset) as u32,
                byte_end: (row_start + offset + 2) as u32,
            }),
        });
    }
}

fn append_battle_macro(
    snapshot: &ProjectSnapshot,
    battle: &BattleRecord,
    references: &mut Vec<ReferenceDescriptor>,
) {
    let row_start = battle.native_id.0 as usize * BATTLE_RECORD_BYTES;
    if battle.battle_macro != 0 {
        let target_id = i32::from(battle.battle_macro).unsigned_abs();
        let resolved = snapshot
            .extra_action_points
            .iter()
            .any(|row| row.native_id.0 == target_id);
        references.push(ReferenceDescriptor {
            source: battle.identity.clone(),
            field: FieldPath("battleMacro".into()),
            target_kind: TargetKind::ExtraActionPoint,
            target_id: target_id.to_string(),
            required: false,
            stock_fallback: None,
            resolution: if resolved {
                ResolutionState::Resolved
            } else {
                ResolutionState::Missing
            },
            repair_actions: if resolved {
                vec![RepairAction::Retarget, RepairAction::ClearOptional]
            } else {
                vec![
                    RepairAction::Retarget,
                    RepairAction::CreateTarget,
                    RepairAction::ClearOptional,
                ]
            },
            byte_provenance: Some(ByteProvenance {
                native_path: "Data BD".into(),
                record_index: battle.native_id.0,
                byte_start: (row_start + 344) as u32,
                byte_end: (row_start + 346) as u32,
            }),
        });
    }
}

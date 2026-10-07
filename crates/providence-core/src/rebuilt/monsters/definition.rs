use super::{RebuiltV3MonsterAttack, RebuiltV3MonsterDefinition, RebuiltV3MonsterDescription};
use crate::model::{MonsterRecord, StableId};
use std::collections::BTreeMap;

pub(super) fn definition(
    monster: &MonsterRecord,
    set_id: i16,
    descriptions: &BTreeMap<u32, RebuiltV3MonsterDescription>,
    random_weapon_table: u32,
) -> RebuiltV3MonsterDefinition {
    RebuiltV3MonsterDefinition {
        id: id(monster, set_id),
        classic_id: monster.native_id.0,
        classic_name_id: monster.name_id,
        name: name(monster),
        description: description(monster, set_id, descriptions),
        not_on_menu: monster.not_on_menu,
        hit_dice: monster.hit_dice,
        stamina_bonus: monster.stamina_bonus,
        agility: monster.agility,
        movement_maximum: monster.movement_max,
        armor: monster.armor,
        magic_resistance: monster.magic_resistance,
        required_weapon: monster.required_weapon,
        magic_to_hit: monster.magic_to_hit,
        traitor: monster.traitor != 0,
        size: monster.size,
        type_flags: monster.type_flags.clone(),
        attack_count: monster.attack_count,
        magic_attack_count: monster.magic_attack_count,
        attacks: attacks(monster),
        damage_bonus: monster.damage_bonus,
        cast_percent: monster.cast_percent,
        run_percent: monster.run_percent,
        surrender_percent: monster.surrender_percent,
        missile_percent: monster.missile_percent,
        can_summon: monster.can_summon,
        saves: monster.saves.clone(),
        spell_immunities: monster.spell_immunities.clone(),
        conditions: monster.conditions.clone(),
        money: monster.money.clone(),
        spell_ids: spell_ids(monster),
        item_ids: item_ids(monster),
        weapon_id: if monster.weapon > 0 {
            format!("classic.item.{}", monster.weapon)
        } else {
            String::new()
        },
        random_weapon_table,
        icon_id: monster.icon_id,
        spell_points: monster.spell_points,
        experience: monster.experience,
        death_macro: monster.death_macro,
    }
}

fn id(monster: &MonsterRecord, set_id: i16) -> StableId {
    if set_id == 0 {
        StableId(format!("classic.monster.{}", monster.native_id.0))
    } else {
        StableId(format!(
            "classic.monster-set.{set_id}.{}",
            monster.native_id.0
        ))
    }
}

fn name(monster: &MonsterRecord) -> String {
    if monster.display_name.is_empty() {
        format!("Monster {}", monster.native_id.0)
    } else {
        monster.display_name.clone()
    }
}

fn description(
    monster: &MonsterRecord,
    set_id: i16,
    descriptions: &BTreeMap<u32, RebuiltV3MonsterDescription>,
) -> String {
    if set_id == 0 {
        descriptions
            .get(&monster.native_id.0)
            .map(|description| description.text.clone())
            .unwrap_or_default()
    } else {
        String::new()
    }
}

fn attacks(monster: &MonsterRecord) -> Vec<RebuiltV3MonsterAttack> {
    monster
        .attacks
        .iter()
        .map(|attack| RebuiltV3MonsterAttack {
            damage_min: attack[0],
            damage_max: attack[1],
            sound_or_type: attack[2],
            special: attack[3],
        })
        .collect()
}

fn spell_ids(monster: &MonsterRecord) -> Vec<String> {
    monster
        .spells
        .iter()
        .map(|id| {
            if *id > 1100 {
                format!("classic.spell.{id}")
            } else {
                String::new()
            }
        })
        .collect()
}

fn item_ids(monster: &MonsterRecord) -> Vec<String> {
    monster
        .items
        .iter()
        .map(|id| {
            if *id == 0 {
                String::new()
            } else {
                format!("classic.item.{}", signed_magnitude(*id))
            }
        })
        .collect()
}

pub(super) fn signed_magnitude(value: i16) -> u32 {
    i32::from(value).unsigned_abs()
}

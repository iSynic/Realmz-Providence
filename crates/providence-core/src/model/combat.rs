use super::{NativeRecordId, StableId};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MonsterRecord {
    pub identity: StableId,
    pub native_id: NativeRecordId,
    pub hit_dice: u8,
    pub stamina_bonus: u8,
    pub agility: u8,
    pub name_id: u8,
    pub movement_max: u8,
    pub armor: i8,
    pub magic_resistance: i8,
    pub required_weapon: i8,
    pub traitor: i8,
    pub size: i8,
    pub type_flags: Vec<i8>,
    pub attack_count: i8,
    pub magic_attack_count: i8,
    pub attacks: Vec<Vec<i8>>,
    pub damage_bonus: i8,
    pub cast_percent: i8,
    pub run_percent: i8,
    pub surrender_percent: i8,
    pub missile_percent: i8,
    pub can_summon: i8,
    pub saves: Vec<i8>,
    pub spell_immunities: Vec<i8>,
    pub money: Vec<i16>,
    pub spells: Vec<i16>,
    pub items: Vec<i16>,
    pub weapon: i16,
    pub icon_id: i16,
    pub spell_points: i16,
    pub experience: i16,
    pub stamina: i16,
    pub stamina_max: i16,
    pub underneath: Vec<i16>,
    pub target: i8,
    pub guarding: i8,
    pub not_on_menu: bool,
    pub been_attacked: i8,
    pub movement: i8,
    pub magic_to_hit: i8,
    pub conditions: Vec<i8>,
    pub left_right: i8,
    pub up_down: i8,
    pub attack_number: i8,
    pub bonus_attack: i8,
    pub death_macro: i16,
    pub max_spell_points: i16,
    pub display_name: String,
    #[serde(default)]
    pub authored: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MonsterSet {
    pub set_id: i16,
    pub native_path: String,
    pub monsters: Vec<MonsterRecord>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MonsterDescription {
    pub identity: StableId,
    pub native_id: NativeRecordId,
    pub text: String,
    #[serde(default)]
    pub authored: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BattleRecord {
    pub identity: StableId,
    pub native_id: NativeRecordId,
    pub grid: Vec<i16>,
    pub distance: i8,
    pub message_before: i16,
    pub message_after: i16,
    pub battle_macro: i16,
    #[serde(default)]
    pub authored: bool,
}

pub(super) fn normalize(
    sets: &mut [MonsterSet],
    descriptions: &mut [MonsterDescription],
    battles: &mut [BattleRecord],
) {
    for set in &mut *sets {
        set.monsters
            .sort_by_key(|monster| (monster.native_id, monster.identity.clone()));
    }
    sets.sort_by_key(|set| (set.set_id, set.native_path.clone()));
    descriptions.sort_by_key(|description| (description.native_id, description.identity.clone()));
    battles.sort_by_key(|battle| (battle.native_id, battle.identity.clone()));
}

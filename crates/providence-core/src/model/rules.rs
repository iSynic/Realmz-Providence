use serde::{Deserialize, Serialize};

use super::{BlobId, StableId};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuleNameCatalog {
    pub source: String,
    pub source_blob: BlobId,
    pub race_resource_id: i16,
    pub caste_resource_id: i16,
    pub race_names: Vec<String>,
    pub caste_names: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ItemRuleDefinition {
    pub id: StableId,
    pub classic_id: i16,
    pub name: String,
    pub unidentified_name: String,
    pub description: String,
    pub icon_id: i32,
    pub item_type: i32,
    pub strength_bonus: i32,
    pub blunt: i32,
    pub hands: i32,
    pub luck_bonus: i32,
    pub movement_bonus: i32,
    pub armor_bonus: i32,
    pub magic_resistance_bonus: i32,
    pub damage_bonus: i32,
    pub spell_point_bonus: i32,
    pub sound_id: i32,
    pub weight: i32,
    pub cost: i32,
    pub initial_charges: i32,
    pub cursed_item_id: Option<StableId>,
    pub magical: bool,
    pub item_category_mask_low: i32,
    pub item_category_mask_high: i32,
    pub race_restrictions: i32,
    pub caste_restrictions: i32,
    pub specific_race_id: Option<StableId>,
    pub specific_caste_id: Option<StableId>,
    pub race_class_only: i32,
    pub caste_class_only: i32,
    pub versus_small: i32,
    pub versus_large: i32,
    pub heat: i32,
    pub cold: i32,
    pub electric: i32,
    pub versus_undead: i32,
    pub versus_demon_devil: i32,
    pub versus_evil: i32,
    pub special: [i32; 5],
    pub weight_per_charge: i32,
    pub drop_on_empty: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourcedItemRule {
    pub source: String,
    pub source_blob: BlobId,
    pub text_source_blob: BlobId,
    pub definition: ItemRuleDefinition,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourcedScenarioItemRule {
    pub record_index: u16,
    pub source: String,
    pub source_blob: BlobId,
    pub text_source_blob: Option<BlobId>,
    pub definition: ItemRuleDefinition,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RaceRuleDefinition {
    pub id: StableId,
    pub classic_id: u8,
    pub name: String,
    pub description: String,
    pub eligible_caste_ids: Vec<StableId>,
    pub hit_modifiers: Vec<i32>,
    pub ability_bonuses: Vec<i32>,
    pub save_bonuses: Vec<i32>,
    pub attribute_bonuses: Vec<i32>,
    pub attribute_limits: Vec<i32>,
    pub condition_levels: Vec<i32>,
    pub age_ranges: Vec<Vec<i32>>,
    pub age_changes: Vec<Vec<i32>>,
    pub maximum_age: i32,
    pub does_not_die: bool,
    pub base_movement: i32,
    pub magic_resistance: i32,
    pub two_hand_bonus: i32,
    pub missile_bonus: i32,
    pub base_attacks: i32,
    pub maximum_attacks: i32,
    pub can_regenerate: bool,
    pub default_icon_set: i32,
    pub item_category_masks: Vec<i32>,
    pub descriptor_flags: i32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CasteRuleDefinition {
    pub id: StableId,
    pub classic_id: u8,
    pub name: String,
    pub description: String,
    pub eligible_race_ids: Vec<StableId>,
    pub initial_ability_values: Vec<i32>,
    pub level_ability_dice: Vec<i32>,
    pub victory_thresholds: Vec<i32>,
    pub save_bonuses: Vec<i32>,
    pub attribute_bonuses: Vec<i32>,
    pub attribute_limits: Vec<i32>,
    pub condition_levels: Vec<i32>,
    pub stamina_dice: Vec<i32>,
    pub strength_values: Vec<i32>,
    pub dodge_values: Vec<i32>,
    pub to_hit_values: Vec<i32>,
    pub missile_values: Vec<i32>,
    pub hand_to_hand_values: Vec<i32>,
    pub spellcaster_rows: Vec<Vec<i32>>,
    pub attack_levels: Vec<i32>,
    pub starting_item_ids: Vec<StableId>,
    pub caste_class: i32,
    pub minimum_age_group: i32,
    pub movement_bonus: i32,
    pub magic_resistance_multiplier: i32,
    pub two_hand_bonus: i32,
    pub maximum_stamina_bonus: i32,
    pub bonus_attacks: i32,
    pub maximum_attacks: i32,
    pub start_money: i32,
    pub can_use_missile: bool,
    pub gets_missile_bonus: bool,
    pub default_icon: i32,
    pub item_category_masks: Vec<i32>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourcedRaceRule {
    pub source: String,
    pub source_blob: Option<BlobId>,
    pub definition: RaceRuleDefinition,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourcedCasteRule {
    pub source: String,
    pub source_blob: Option<BlobId>,
    pub definition: CasteRuleDefinition,
}

pub(super) fn normalize(
    races: &mut [SourcedRaceRule],
    castes: &mut [SourcedCasteRule],
    items: &mut [SourcedItemRule],
    scenario_items: &mut [SourcedScenarioItemRule],
) {
    races.sort_by_key(|rule| (rule.definition.classic_id, rule.definition.id.clone()));
    castes.sort_by_key(|rule| (rule.definition.classic_id, rule.definition.id.clone()));
    items.sort_by_key(|rule| (rule.definition.classic_id, rule.definition.id.clone()));
    scenario_items.sort_by_key(|rule| rule.record_index);
}

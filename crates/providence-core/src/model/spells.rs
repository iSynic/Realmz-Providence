use super::{BlobId, StableId};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpellDefinition {
    pub id: StableId,
    pub classic_id: i16,
    pub record_index: u16,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub description: String,
    pub range_min: u8,
    pub range_max: u8,
    pub queue_icon: u8,
    pub to_hit_bonus: i8,
    pub save_bonus: i8,
    pub fixed_target_count: u8,
    pub can_rotate: u8,
    pub save_adjust: i8,
    pub cannot: u8,
    pub resistance_adjust: i8,
    pub cost: u8,
    pub damage_min: u8,
    pub damage_max: u8,
    pub power_damage_min: u8,
    pub power_damage_max: u8,
    pub duration_min: u8,
    pub duration_max: u8,
    pub power_duration_min: u8,
    pub power_duration_max: u8,
    pub look_start: u8,
    pub look_end: u8,
    pub sound_start: u8,
    pub sound_end: u8,
    pub target_type: u8,
    pub size: u8,
    pub special: u8,
    pub damage_type: u8,
    pub spell_class: u8,
    pub in_combat: bool,
    pub in_camp: bool,
    #[serde(default)]
    pub authored: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourcedSpellDefinition {
    pub source: String,
    pub source_blob: Option<BlobId>,
    #[serde(default)]
    pub text_source_blob: Option<BlobId>,
    #[serde(default)]
    pub name_authored: bool,
    pub definition: SpellDefinition,
}

pub(super) fn normalize(
    standard: &mut [SourcedSpellDefinition],
    scenario: &mut [SourcedSpellDefinition],
) {
    standard.sort_by_key(|spell| (spell.definition.record_index, spell.definition.id.clone()));
    scenario.sort_by_key(|spell| (spell.definition.record_index, spell.definition.id.clone()));
}

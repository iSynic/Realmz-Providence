use super::contracts::*;
use crate::model::SpellDefinition;

pub fn default_scenario_spell_name(record_index: u16) -> String {
    format!("Custom Spell {record_index}")
}

pub fn default_standard_spell_name(classic_id: i16) -> String {
    format!("Unnamed Classic spell {classic_id}")
}

pub fn standard_spell_classic_id(record_index: u16) -> Option<i16> {
    if usize::from(record_index) >= STANDARD_SPELL_RECORDS {
        return None;
    }
    standard_spell_physical_classic_id(usize::from(record_index))
}

pub fn scenario_spell_classic_id(record_index: u16) -> Option<i16> {
    if usize::from(record_index) >= SCENARIO_SPELL_RECORDS {
        return None;
    }
    scenario_spell_physical_classic_id(usize::from(record_index))
}

pub(super) fn validate_spell(
    spell: &SpellDefinition,
    classic_id_for_record: fn(u16) -> Option<i16>,
) -> Result<(), SpellCodecError> {
    let expected = classic_id_for_record(spell.record_index)
        .ok_or(SpellCodecError::RecordIndexOutOfRange(spell.record_index))?;
    if spell.classic_id != expected {
        return Err(SpellCodecError::InvalidClassicId {
            record_index: spell.record_index,
            expected,
            actual: spell.classic_id,
        });
    }
    if spell.id.0 != format!("classic.spell.{expected}") {
        return Err(SpellCodecError::InvalidStableId {
            classic_id: expected,
            actual: spell.id.clone(),
        });
    }
    Ok(())
}

pub(super) fn standard_spell_physical_classic_id(record_index: usize) -> Option<i16> {
    let class = record_index / SPELLS_PER_CLASS + 1;
    let within_class = record_index % SPELLS_PER_CLASS;
    let level = within_class / SPELL_NAMES_PER_RESOURCE + 1;
    let slot = within_class % SPELL_NAMES_PER_RESOURCE + 1;
    i16::try_from(
        class
            .checked_mul(1000)?
            .checked_add(level.checked_mul(100)?)?
            .checked_add(slot)?,
    )
    .ok()
}

pub(crate) fn scenario_spell_physical_classic_id(record_index: usize) -> Option<i16> {
    let level = record_index / SPELL_NAMES_PER_RESOURCE + 1;
    let slot = record_index % SPELL_NAMES_PER_RESOURCE + 1;
    i16::try_from(
        5000usize
            .checked_add(level.checked_mul(100)?)?
            .checked_add(slot)?,
    )
    .ok()
}

pub fn scenario_spell_is_runtime_addressable(spell: &SpellDefinition) -> bool {
    scenario_spell_classic_id(spell.record_index) == Some(spell.classic_id)
        && spell.id.0 == format!("classic.spell.{}", spell.classic_id)
}

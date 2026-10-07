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
    let class = usize::from(record_index) / SPELLS_PER_CLASS + 1;
    let within_class = usize::from(record_index) % SPELLS_PER_CLASS;
    let level = within_class / SPELL_NAMES_PER_RESOURCE + 1;
    let slot = within_class % SPELL_NAMES_PER_RESOURCE + 1;
    i16::try_from(class * 1000 + level * 100 + slot).ok()
}

pub fn scenario_spell_classic_id(record_index: u16) -> Option<i16> {
    if usize::from(record_index) >= SCENARIO_SPELL_RECORDS {
        return None;
    }
    let level = record_index / 15 + 1;
    let slot = record_index % 15 + 1;
    Some(5000 + i16::try_from(level).ok()? * 100 + i16::try_from(slot).ok()?)
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

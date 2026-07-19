use crate::error::{ProvidenceError, Result};
use crate::project::{ScenarioCasteOverride, ScenarioRaceOverride};

use super::{CASTE_BYTES, RACE_BYTES};

pub(super) fn validate_compatibility_storage(
    label: &str,
    id: usize,
    raw_bytes: &[u8],
    record_bytes: usize,
) -> Result<()> {
    if !raw_bytes.is_empty() && raw_bytes.len() != record_bytes {
        return Err(ProvidenceError::message(format!(
            "{label} {id} has invalid compatibility byte storage"
        )));
    }
    Ok(())
}

fn validate_exact_length(
    label: &str,
    id: usize,
    field: &str,
    actual: usize,
    expected: usize,
) -> Result<()> {
    if actual != expected {
        return Err(ProvidenceError::message(format!(
            "{label} {id} must have exactly {expected} {field}"
        )));
    }
    Ok(())
}

pub(super) fn validate_race_storage(record: &ScenarioRaceOverride) -> Result<()> {
    validate_compatibility_storage("Race override", record.id, &record.raw_bytes, RACE_BYTES)?;
    for (field, actual, expected) in [
        ("to-hit adjustments", record.plus_minus_to_hit.len(), 8),
        ("special abilities", record.special_ability.len(), 14),
        ("defense bonuses", record.drv_bonus.len(), 8),
        ("attack bonuses", record.att_bonus.len(), 6),
        ("attribute bounds", record.min_max.len(), 12),
        ("conditions", record.conditions.len(), 40),
        ("attack-count bounds", record.num_of_attacks.len(), 2),
        ("caste permissions", record.can_caste.len(), 30),
        ("age ranges", record.age_range.len(), 5),
        ("age changes", record.age_change.len(), 5),
        ("item-type words", record.item_types.len(), 2),
    ] {
        validate_exact_length("Race override", record.id, field, actual, expected)?;
    }
    if record.age_range.iter().any(|row| row.len() != 2) {
        return Err(ProvidenceError::message(format!(
            "Race override {} age ranges must have exactly 2 values",
            record.id
        )));
    }
    if record.age_change.iter().any(|row| row.len() != 15) {
        return Err(ProvidenceError::message(format!(
            "Race override {} age changes must have exactly 15 values",
            record.id
        )));
    }
    if let Some(spare) = &record.spare {
        validate_exact_length("Race override", record.id, "spare words", spare.len(), 8)?;
    }
    if let Some(spacer) = &record.spacer {
        validate_exact_length("Race override", record.id, "spacer words", spacer.len(), 31)?;
    }
    Ok(())
}

pub(super) fn validate_caste_storage(record: &ScenarioCasteOverride) -> Result<()> {
    validate_compatibility_storage("Caste override", record.id, &record.raw_bytes, CASTE_BYTES)?;
    for (field, actual, expected) in [
        ("special-ability rows", record.special_ability.len(), 2),
        ("defense bonuses", record.drv_bonus.len(), 8),
        ("attack bonuses", record.att_bonus.len(), 6),
        ("spellcaster rows", record.spellcasters.len(), 4),
        ("attribute bounds", record.min_max.len(), 12),
        ("conditions", record.conditions.len(), 40),
        ("stamina bounds", record.stamina.len(), 2),
        ("strength bounds", record.strength.len(), 2),
        ("dodge bounds", record.dodge.len(), 2),
        ("to-hit bounds", record.to_hit.len(), 2),
        ("missile bounds", record.missile.len(), 2),
        ("hand-to-hand bounds", record.hand2_hand.len(), 2),
        ("victory values", record.victory.len(), 30),
        ("starting items", record.start_items.len(), 20),
        ("bonus attack rounds", record.attacks.len(), 10),
        ("item-type words", record.item_types.len(), 2),
    ] {
        validate_exact_length("Caste override", record.id, field, actual, expected)?;
    }
    if record.special_ability.iter().any(|row| row.len() != 14) {
        return Err(ProvidenceError::message(format!(
            "Caste override {} special-ability rows must have exactly 14 values",
            record.id
        )));
    }
    if record.spellcasters.iter().any(|row| row.len() != 3) {
        return Err(ProvidenceError::message(format!(
            "Caste override {} spellcaster rows must have exactly 3 values",
            record.id
        )));
    }
    for (field, values, expected) in [
        ("spare1 words", record.spare1.as_ref(), 2),
        ("spare2 words", record.spare2.as_ref(), 2),
        ("spacer words", record.spacer.as_ref(), 63),
    ] {
        if let Some(values) = values {
            validate_exact_length("Caste override", record.id, field, values.len(), expected)?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::super::{
        parse_caste_overrides, parse_race_overrides, parse_spell_overrides, write_caste_overrides,
        write_race_overrides, write_spell_overrides, CASTE_BYTES, RACE_BYTES, SPELL_BYTES,
    };

    #[test]
    fn rule_writers_reject_malformed_compatibility_and_fixed_arrays() {
        let mut spell = parse_spell_overrides(&vec![0; SPELL_BYTES]).remove(0);
        spell.raw_bytes = vec![1];
        assert!(write_spell_overrides(&[spell]).is_err());

        let mut race = parse_race_overrides(&vec![0; RACE_BYTES]).remove(0);
        race.plus_minus_to_hit.pop();
        assert!(write_race_overrides(&[race]).is_err());

        let mut caste = parse_caste_overrides(&vec![0; CASTE_BYTES]).remove(0);
        caste.spellcasters.pop();
        assert!(write_caste_overrides(&[caste]).is_err());
    }
}

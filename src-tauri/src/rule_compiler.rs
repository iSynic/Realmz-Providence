use crate::error::{ProvidenceError, Result};
use crate::project::{ScenarioCasteOverride, ScenarioRaceOverride, ScenarioSpellOverride};
use crate::realmz::{
    write_caste_overrides, write_race_overrides, write_spell_overrides, CASTE_BYTES,
    CASTE_OVERRIDE_RECORDS, RACE_BYTES, RACE_OVERRIDE_RECORDS, SPELL_BYTES, SPELL_OVERRIDE_RECORDS,
};
use base64::{engine::general_purpose::STANDARD, Engine as _};

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct RulesCompilerBaseline {
    schema_version: usize,
    race: RulesCompilerBaselineFamily,
    caste: RulesCompilerBaselineFamily,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct RulesCompilerBaselineFamily {
    record_bytes: usize,
    records: usize,
    bytes_base64: String,
}

pub fn write_fresh_spell_overrides(records: &[ScenarioSpellOverride]) -> Result<Vec<u8>> {
    if let Some(record) = records
        .iter()
        .find(|record| record.id >= SPELL_OVERRIDE_RECORDS)
    {
        return Err(ProvidenceError::message(format!(
            "Custom spell {} is outside Data Spell's 0..104 custom slot range.",
            record.id
        )));
    }
    let overlay = write_spell_overrides(records)?;
    if overlay.is_empty() {
        return Ok(Vec::new());
    }
    let mut output = vec![0; SPELL_OVERRIDE_RECORDS * SPELL_BYTES];
    output[..overlay.len()].copy_from_slice(&overlay);
    Ok(output)
}

pub fn write_fresh_race_overrides(records: &[ScenarioRaceOverride]) -> Result<Vec<u8>> {
    write_fresh_rule_overrides(
        "Data Race",
        RACE_BYTES,
        RACE_OVERRIDE_RECORDS,
        records,
        |record| record.id,
        write_race_overrides,
    )
}

pub fn write_fresh_caste_overrides(records: &[ScenarioCasteOverride]) -> Result<Vec<u8>> {
    write_fresh_rule_overrides(
        "Data Caste",
        CASTE_BYTES,
        CASTE_OVERRIDE_RECORDS,
        records,
        |record| record.id,
        write_caste_overrides,
    )
}

fn write_fresh_rule_overrides<T>(
    name: &str,
    record_bytes: usize,
    records: usize,
    values: &[T],
    id: impl Fn(&T) -> usize,
    writer: impl Fn(&[T]) -> Result<Vec<u8>>,
) -> Result<Vec<u8>> {
    if values.is_empty() {
        return Ok(Vec::new());
    }
    if let Some(value) = values.iter().find(|value| id(value) >= records) {
        return Err(ProvidenceError::message(format!(
            "{name} record {} is outside the fresh 0..{} scenario slot range.",
            id(value),
            records - 1
        )));
    }
    let encoded = writer(values)?;
    let mut output = rule_compiler_baseline_bytes(name, record_bytes, records)?;
    for value in values {
        let start = id(value) * record_bytes;
        output[start..start + record_bytes].copy_from_slice(&encoded[start..start + record_bytes]);
    }
    Ok(output)
}

pub fn rule_compiler_baseline_bytes(
    name: &str,
    record_bytes: usize,
    records: usize,
) -> Result<Vec<u8>> {
    let baseline: RulesCompilerBaseline =
        serde_json::from_str(include_str!("../../src/shared/rulesCompilerBaseline.json")).map_err(
            |error| ProvidenceError::message(format!("Invalid rules compiler baseline: {error}")),
        )?;
    if baseline.schema_version != 1 {
        return Err(ProvidenceError::message(format!(
            "Unsupported rules compiler baseline schema {}.",
            baseline.schema_version
        )));
    }
    let family = match name {
        "Data Race" => baseline.race,
        "Data Caste" => baseline.caste,
        _ => {
            return Err(ProvidenceError::message(format!(
                "No rules compiler baseline exists for {name}."
            )))
        }
    };
    if family.record_bytes != record_bytes || family.records != records {
        return Err(ProvidenceError::message(format!(
            "Rules compiler baseline metadata for {name} is invalid."
        )));
    }
    let bytes = STANDARD.decode(&family.bytes_base64).map_err(|error| {
        ProvidenceError::message(format!(
            "Rules compiler baseline for {name} is not base64: {error}"
        ))
    })?;
    if bytes.len() != record_bytes * records {
        return Err(ProvidenceError::message(format!(
            "Rules compiler baseline for {name} has {} bytes; expected {}.",
            bytes.len(),
            record_bytes * records
        )));
    }
    Ok(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::realmz::{
        i16_be, parse_caste_overrides, parse_race_overrides, parse_spell_overrides,
    };

    #[test]
    fn fresh_rule_writers_use_fixed_capacity_without_raw_record_identity() {
        let mut spell = parse_spell_overrides(&vec![0; SPELL_BYTES]).remove(0);
        spell.id = 16;
        spell.cost = 41;
        let spell_bytes = write_fresh_spell_overrides(&[spell]).unwrap();
        assert_eq!(spell_bytes.len(), SPELL_OVERRIDE_RECORDS * SPELL_BYTES);
        assert_eq!(spell_bytes[16 * SPELL_BYTES + 10], 41);

        let mut race = parse_race_overrides(&vec![0; RACE_BYTES]).remove(0);
        race.id = 2;
        race.base_move = 13;
        let race_bytes = write_fresh_race_overrides(&[race]).unwrap();
        assert_eq!(race_bytes.len(), RACE_OVERRIDE_RECORDS * RACE_BYTES);
        assert_eq!(i16_be(&race_bytes, 2 * RACE_BYTES + 196), 13);
        assert_ne!(race_bytes[2 * RACE_BYTES], 0xA5);

        let mut caste = parse_caste_overrides(&vec![0; CASTE_BYTES]).remove(0);
        caste.id = 3;
        caste.start_money = 222;
        caste.raw_bytes.fill(0xA5);
        let caste_bytes = write_fresh_caste_overrides(&[caste]).unwrap();
        assert_eq!(caste_bytes.len(), CASTE_OVERRIDE_RECORDS * CASTE_BYTES);
        assert_eq!(i16_be(&caste_bytes, 3 * CASTE_BYTES + 384), 222);
        assert_ne!(caste_bytes[3 * CASTE_BYTES], 0xA5);
    }
}

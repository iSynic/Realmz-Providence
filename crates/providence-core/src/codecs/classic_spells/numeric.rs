use super::{contracts::*, identity::*};
use crate::model::{BlobId, SourcedSpellDefinition, SpellDefinition, StableId};
use std::collections::BTreeSet;

pub fn decode_scenario_spells(bytes: &[u8], source_blob: Option<BlobId>) -> DecodedSpellFile {
    let rows = (bytes.len() / SPELL_RECORD_BYTES).min(SCENARIO_SPELL_RECORDS);
    let body_bytes = rows * SPELL_RECORD_BYTES;
    let spells = bytes[..body_bytes]
        .chunks_exact(SPELL_RECORD_BYTES)
        .enumerate()
        .map(|(index, row)| SourcedSpellDefinition {
            source: format!("Data Spell record {index}"),
            source_blob: source_blob.clone(),
            text_source_blob: None,
            name_authored: false,
            definition: decode_spell(
                index as u16,
                scenario_spell_classic_id(index as u16).expect("decoded row is bounded"),
                default_scenario_spell_name(index as u16),
                row,
            ),
        })
        .collect();
    DecodedSpellFile {
        spells,
        trailing_bytes: bytes[body_bytes..].to_vec(),
    }
}

pub fn decode_standard_spells(bytes: &[u8], source_blob: Option<BlobId>) -> DecodedSpellFile {
    let rows = (bytes.len() / SPELL_RECORD_BYTES).min(STANDARD_SPELL_RECORDS);
    let body_bytes = rows * SPELL_RECORD_BYTES;
    let spells = bytes[..body_bytes]
        .chunks_exact(SPELL_RECORD_BYTES)
        .enumerate()
        .map(|(index, row)| {
            let record_index = index as u16;
            let classic_id =
                standard_spell_classic_id(record_index).expect("decoded row is bounded");
            SourcedSpellDefinition {
                source: format!("Data S record {index}"),
                source_blob: source_blob.clone(),
                text_source_blob: None,
                name_authored: false,
                definition: decode_spell(
                    record_index,
                    classic_id,
                    default_standard_spell_name(classic_id),
                    row,
                ),
            }
        })
        .collect();
    DecodedSpellFile {
        spells,
        trailing_bytes: bytes[body_bytes..].to_vec(),
    }
}

pub fn encode_scenario_spells(
    spells: &[SourcedSpellDefinition],
    compatibility_source: Option<&[u8]>,
) -> Result<Vec<u8>, SpellCodecError> {
    encode_spell_rows(
        spells,
        compatibility_source,
        SCENARIO_SPELL_RECORDS,
        SCENARIO_SPELL_BYTES,
        scenario_spell_classic_id,
    )
}

pub fn encode_standard_spells(
    spells: &[SourcedSpellDefinition],
    compatibility_source: Option<&[u8]>,
) -> Result<Vec<u8>, SpellCodecError> {
    encode_spell_rows(
        spells,
        compatibility_source,
        STANDARD_SPELL_RECORDS,
        STANDARD_SPELL_BYTES,
        standard_spell_classic_id,
    )
}

fn encode_spell_rows(
    spells: &[SourcedSpellDefinition],
    compatibility_source: Option<&[u8]>,
    maximum_records: usize,
    fresh_bytes: usize,
    classic_id_for_record: fn(u16) -> Option<i16>,
) -> Result<Vec<u8>, SpellCodecError> {
    let mut selected = spells.iter().collect::<Vec<_>>();
    selected.sort_by_key(|spell| spell.definition.record_index);
    let mut seen = BTreeSet::new();
    for spell in &selected {
        validate_spell(&spell.definition, classic_id_for_record)?;
        if !seen.insert(spell.definition.record_index) {
            return Err(SpellCodecError::DuplicateRecordIndex(
                spell.definition.record_index,
            ));
        }
    }

    let source_rows = compatibility_source
        .map(|source| (source.len() / SPELL_RECORD_BYTES).min(maximum_records))
        .unwrap_or(0);
    let source_body_bytes = source_rows * SPELL_RECORD_BYTES;
    let mut output = compatibility_source
        .map(|source| source[..source_body_bytes].to_vec())
        .unwrap_or_default();
    if compatibility_source.is_none() && !selected.is_empty() {
        output.resize(fresh_bytes, 0);
    }
    if let Some(last) = selected.last() {
        output.resize(
            output
                .len()
                .max((usize::from(last.definition.record_index) + 1) * SPELL_RECORD_BYTES),
            0,
        );
    }

    for spell in selected {
        write_spell_row(&mut output, spell, source_rows);
    }
    if let Some(source) = compatibility_source {
        output.extend_from_slice(&source[source_body_bytes..]);
    }
    Ok(output)
}

fn write_spell_row(output: &mut [u8], spell: &SourcedSpellDefinition, source_rows: usize) {
    let index = usize::from(spell.definition.record_index);
    let start = index * SPELL_RECORD_BYTES;
    let end = start + SPELL_RECORD_BYTES;
    if index < source_rows
        && same_native_semantics(
            &decode_spell(
                spell.definition.record_index,
                spell.definition.classic_id,
                spell.definition.name.clone(),
                &output[start..end],
            ),
            &spell.definition,
        )
    {
        return;
    }
    let availability = [output[start + 28], output[start + 29]];
    encode_spell(&spell.definition, &mut output[start..end]);
    if index < source_rows {
        for (offset, selected) in [
            (28, spell.definition.in_combat),
            (29, spell.definition.in_camp),
        ] {
            let original = availability[offset - 28];
            if (original != 0) == selected {
                output[start + offset] = original;
            }
        }
    }
}

fn decode_spell(record_index: u16, classic_id: i16, name: String, row: &[u8]) -> SpellDefinition {
    SpellDefinition {
        id: StableId(format!("classic.spell.{classic_id}")),
        classic_id,
        record_index,
        name,
        description: String::new(),
        range_min: row[0],
        range_max: row[1],
        queue_icon: row[2],
        to_hit_bonus: row[3] as i8,
        save_bonus: row[4] as i8,
        fixed_target_count: row[5],
        can_rotate: row[6],
        save_adjust: row[7] as i8,
        cannot: row[8],
        resistance_adjust: row[9] as i8,
        cost: row[10],
        damage_min: row[11],
        damage_max: row[12],
        power_damage_min: row[13],
        power_damage_max: row[14],
        duration_min: row[15],
        duration_max: row[16],
        power_duration_min: row[17],
        power_duration_max: row[18],
        look_start: row[19],
        look_end: row[20],
        sound_start: row[21],
        sound_end: row[22],
        target_type: row[23],
        size: row[24],
        special: row[25],
        damage_type: row[26],
        spell_class: row[27],
        in_combat: row[28] != 0,
        in_camp: row[29] != 0,
        authored: false,
    }
}

pub fn spell_has_empty_native_values(spell: &SpellDefinition) -> bool {
    let blank = decode_spell(
        spell.record_index,
        spell.classic_id,
        String::new(),
        &[0; SPELL_RECORD_BYTES],
    );
    same_native_semantics(spell, &blank)
}

fn same_native_semantics(left: &SpellDefinition, right: &SpellDefinition) -> bool {
    let mut left = left.clone();
    let mut right = right.clone();
    left.name.clear();
    left.description.clear();
    left.authored = false;
    right.name.clear();
    right.description.clear();
    right.authored = false;
    left == right
}

fn encode_spell(spell: &SpellDefinition, row: &mut [u8]) {
    row.copy_from_slice(&[
        spell.range_min,
        spell.range_max,
        spell.queue_icon,
        spell.to_hit_bonus as u8,
        spell.save_bonus as u8,
        spell.fixed_target_count,
        spell.can_rotate,
        spell.save_adjust as u8,
        spell.cannot,
        spell.resistance_adjust as u8,
        spell.cost,
        spell.damage_min,
        spell.damage_max,
        spell.power_damage_min,
        spell.power_damage_max,
        spell.duration_min,
        spell.duration_max,
        spell.power_duration_min,
        spell.power_duration_max,
        spell.look_start,
        spell.look_end,
        spell.sound_start,
        spell.sound_end,
        spell.target_type,
        spell.size,
        spell.special,
        spell.damage_type,
        spell.spell_class,
        u8::from(spell.in_combat),
        u8::from(spell.in_camp),
    ]);
}

use std::collections::BTreeSet;

use crate::model::{BlobId, RaceRuleDefinition, SourcedRaceRule, StableId};

pub const RACE_RECORD_BYTES: usize = 408;
pub const CLASSIC_RACE_RECORDS: usize = 30;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DecodedRaceRuleFile {
    pub rules: Vec<SourcedRaceRule>,
    pub trailing_bytes: Vec<u8>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RaceCodecError {
    DuplicateClassicId(u8),
    ClassicIdOutOfRange(u8),
    InvalidStableId {
        classic_id: u8,
        actual: StableId,
    },
    InvalidVector {
        classic_id: u8,
        field: &'static str,
        expected: usize,
        actual: usize,
    },
    InvalidEligibleCaste {
        classic_id: u8,
        target: StableId,
    },
    IntegerOutOfRange {
        classic_id: u8,
        field: &'static str,
        value: i32,
    },
}

impl std::fmt::Display for RaceCodecError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::DuplicateClassicId(id) => write!(formatter, "duplicate Data Race ID {id}"),
            Self::ClassicIdOutOfRange(id) => {
                write!(formatter, "Data Race ID {id} is outside 1..=30")
            }
            Self::InvalidStableId { classic_id, actual } => write!(
                formatter,
                "Data Race {classic_id} must use stable ID 'classic.race.{classic_id}', not '{}'",
                actual.0
            ),
            Self::InvalidVector {
                classic_id,
                field,
                expected,
                actual,
            } => write!(
                formatter,
                "Data Race {classic_id} field {field} has {actual} values; expected {expected}"
            ),
            Self::InvalidEligibleCaste { classic_id, target } => write!(
                formatter,
                "Data Race {classic_id} has invalid eligible caste ID '{}'",
                target.0
            ),
            Self::IntegerOutOfRange {
                classic_id,
                field,
                value,
            } => write!(
                formatter,
                "Data Race {classic_id} field {field} value {value} is outside signed 16-bit range"
            ),
        }
    }
}

impl std::error::Error for RaceCodecError {}

pub fn decode_race_rules(bytes: &[u8], source_blob: Option<BlobId>) -> DecodedRaceRuleFile {
    let count = (bytes.len() / RACE_RECORD_BYTES).min(CLASSIC_RACE_RECORDS);
    let body_bytes = count * RACE_RECORD_BYTES;
    let rules = bytes[..body_bytes]
        .chunks_exact(RACE_RECORD_BYTES)
        .enumerate()
        .map(|(index, row)| SourcedRaceRule {
            source: format!("Data Race record {index}"),
            source_blob: source_blob.clone(),
            definition: decode_definition(index as u8 + 1, row),
        })
        .collect();
    DecodedRaceRuleFile {
        rules,
        trailing_bytes: bytes[body_bytes..].to_vec(),
    }
}

pub fn encode_race_rules(
    rules: &[SourcedRaceRule],
    compatibility_source: Option<&[u8]>,
) -> Result<Vec<u8>, RaceCodecError> {
    let mut selected = rules.iter().collect::<Vec<_>>();
    selected.sort_by_key(|rule| rule.definition.classic_id);
    let mut seen = BTreeSet::new();
    for rule in &selected {
        validate_definition(&rule.definition)?;
        if !seen.insert(rule.definition.classic_id) {
            return Err(RaceCodecError::DuplicateClassicId(
                rule.definition.classic_id,
            ));
        }
    }

    let source_rows = compatibility_source
        .map(|source| (source.len() / RACE_RECORD_BYTES).min(CLASSIC_RACE_RECORDS))
        .unwrap_or(0);
    let source_body_bytes = source_rows * RACE_RECORD_BYTES;
    let required_rows = selected
        .last()
        .map(|rule| usize::from(rule.definition.classic_id))
        .unwrap_or(0);
    let mut output = compatibility_source
        .map(|source| source[..source_body_bytes].to_vec())
        .unwrap_or_default();
    output.resize(output.len().max(required_rows * RACE_RECORD_BYTES), 0);

    for rule in selected {
        let row_index = usize::from(rule.definition.classic_id - 1);
        let start = row_index * RACE_RECORD_BYTES;
        let end = start + RACE_RECORD_BYTES;
        if row_index < source_rows {
            let source = &output[start..end];
            let decoded = decode_definition(rule.definition.classic_id, source);
            if same_native_semantics(&decoded, &rule.definition) {
                continue;
            }
        }
        encode_definition(&mut output[start..end], &rule.definition)?;
    }

    if let Some(source) = compatibility_source {
        output.extend_from_slice(&source[source_body_bytes..]);
    }
    Ok(output)
}

fn decode_definition(classic_id: u8, row: &[u8]) -> RaceRuleDefinition {
    RaceRuleDefinition {
        id: StableId(format!("classic.race.{classic_id}")),
        classic_id,
        name: String::new(),
        description: String::new(),
        eligible_caste_ids: row[208..238]
            .iter()
            .enumerate()
            .filter(|(_, value)| **value != 0)
            .map(|(index, _)| StableId(format!("classic.caste.{}", index + 1)))
            .collect(),
        hit_modifiers: read_i16_values(row, 0, 8),
        ability_bonuses: read_i16_values(row, 16, 14),
        save_bonuses: read_i16_values(row, 44, 8),
        attribute_bonuses: read_i16_values(row, 60, 6),
        attribute_limits: read_i16_values(row, 72, 12),
        condition_levels: read_i16_values(row, 112, 40),
        age_ranges: (0..5)
            .map(|band| read_i16_values(row, 238 + band * 4, 2))
            .collect(),
        age_changes: (0..5)
            .map(|band| {
                row[258 + band * 15..258 + (band + 1) * 15]
                    .iter()
                    .map(|value| i32::from(*value as i8))
                    .collect()
            })
            .collect(),
        maximum_age: read_i16(row, 192),
        does_not_die: read_i16(row, 194) != 0,
        base_movement: read_i16(row, 196),
        magic_resistance: read_i16(row, 198),
        two_hand_bonus: read_i16(row, 200),
        missile_bonus: read_i16(row, 202),
        base_attacks: read_i16(row, 204),
        maximum_attacks: read_i16(row, 206),
        can_regenerate: row[333] != 0,
        default_icon_set: read_i16(row, 334),
        item_category_masks: vec![read_i32(row, 336), read_i32(row, 340)],
        descriptor_flags: read_i16(row, 344),
    }
}

fn encode_definition(
    row: &mut [u8],
    definition: &RaceRuleDefinition,
) -> Result<(), RaceCodecError> {
    let id = definition.classic_id;
    write_i16_values(row, 0, &definition.hit_modifiers, id, "hitModifiers")?;
    write_i16_values(row, 16, &definition.ability_bonuses, id, "abilityBonuses")?;
    write_i16_values(row, 44, &definition.save_bonuses, id, "saveBonuses")?;
    write_i16_values(
        row,
        60,
        &definition.attribute_bonuses,
        id,
        "attributeBonuses",
    )?;
    write_i16_values(row, 72, &definition.attribute_limits, id, "attributeLimits")?;
    write_i16_values(
        row,
        112,
        &definition.condition_levels,
        id,
        "conditionLevels",
    )?;
    write_i16(row, 192, definition.maximum_age, id, "maximumAge")?;
    if (read_i16(row, 194) != 0) != definition.does_not_die {
        write_i16(
            row,
            194,
            i32::from(definition.does_not_die),
            id,
            "doesNotDie",
        )?;
    }
    write_i16(row, 196, definition.base_movement, id, "baseMovement")?;
    write_i16(row, 198, definition.magic_resistance, id, "magicResistance")?;
    write_i16(row, 200, definition.two_hand_bonus, id, "twoHandBonus")?;
    write_i16(row, 202, definition.missile_bonus, id, "missileBonus")?;
    write_i16(row, 204, definition.base_attacks, id, "baseAttacks")?;
    write_i16(row, 206, definition.maximum_attacks, id, "maximumAttacks")?;
    encode_eligibility(row, definition)?;
    encode_age(row, definition)?;
    if (row[333] != 0) != definition.can_regenerate {
        row[333] = u8::from(definition.can_regenerate);
    }
    write_i16(row, 334, definition.default_icon_set, id, "defaultIconSet")?;
    write_i32(row, 336, definition.item_category_masks[0]);
    write_i32(row, 340, definition.item_category_masks[1]);
    write_i16(row, 344, definition.descriptor_flags, id, "descriptorFlags")?;
    Ok(())
}

fn encode_eligibility(
    row: &mut [u8],
    definition: &RaceRuleDefinition,
) -> Result<(), RaceCodecError> {
    let id = definition.classic_id;
    let original = row[208..238].to_vec();
    row[208..238].fill(0);
    for target in &definition.eligible_caste_ids {
        let Some(value) = target.0.strip_prefix("classic.caste.") else {
            return Err(RaceCodecError::InvalidEligibleCaste {
                classic_id: id,
                target: target.clone(),
            });
        };
        let Ok(caste_id) = value.parse::<u8>() else {
            return Err(RaceCodecError::InvalidEligibleCaste {
                classic_id: id,
                target: target.clone(),
            });
        };
        if !(1..=30).contains(&caste_id) || row[207 + usize::from(caste_id)] != 0 {
            return Err(RaceCodecError::InvalidEligibleCaste {
                classic_id: id,
                target: target.clone(),
            });
        }
        row[207 + usize::from(caste_id)] = original[usize::from(caste_id - 1)].max(1);
    }
    Ok(())
}

fn encode_age(row: &mut [u8], definition: &RaceRuleDefinition) -> Result<(), RaceCodecError> {
    let id = definition.classic_id;
    for (band, values) in definition.age_ranges.iter().enumerate() {
        write_i16_values(row, 238 + band * 4, values, id, "ageRanges")?;
    }
    for (band, values) in definition.age_changes.iter().enumerate() {
        for (index, value) in values.iter().copied().enumerate() {
            let value = i8::try_from(value).map_err(|_| RaceCodecError::IntegerOutOfRange {
                classic_id: id,
                field: "ageChanges",
                value,
            })?;
            row[258 + band * 15 + index] = value as u8;
        }
    }
    Ok(())
}

fn validate_definition(definition: &RaceRuleDefinition) -> Result<(), RaceCodecError> {
    let id = definition.classic_id;
    if !(1..=30).contains(&id) {
        return Err(RaceCodecError::ClassicIdOutOfRange(id));
    }
    let expected_id = StableId(format!("classic.race.{id}"));
    if definition.id != expected_id {
        return Err(RaceCodecError::InvalidStableId {
            classic_id: id,
            actual: definition.id.clone(),
        });
    }
    for (field, actual, expected) in [
        ("hitModifiers", definition.hit_modifiers.len(), 8),
        ("abilityBonuses", definition.ability_bonuses.len(), 14),
        ("saveBonuses", definition.save_bonuses.len(), 8),
        ("attributeBonuses", definition.attribute_bonuses.len(), 6),
        ("attributeLimits", definition.attribute_limits.len(), 12),
        ("conditionLevels", definition.condition_levels.len(), 40),
        ("ageRanges", definition.age_ranges.len(), 5),
        ("ageChanges", definition.age_changes.len(), 5),
        ("itemCategoryMasks", definition.item_category_masks.len(), 2),
    ] {
        if actual != expected {
            return Err(RaceCodecError::InvalidVector {
                classic_id: id,
                field,
                expected,
                actual,
            });
        }
    }
    for values in &definition.age_ranges {
        if values.len() != 2 {
            return Err(RaceCodecError::InvalidVector {
                classic_id: id,
                field: "ageRanges[]",
                expected: 2,
                actual: values.len(),
            });
        }
    }
    for values in &definition.age_changes {
        if values.len() != 15 {
            return Err(RaceCodecError::InvalidVector {
                classic_id: id,
                field: "ageChanges[]",
                expected: 15,
                actual: values.len(),
            });
        }
    }
    Ok(())
}

fn same_native_semantics(left: &RaceRuleDefinition, right: &RaceRuleDefinition) -> bool {
    left.eligible_caste_ids == right.eligible_caste_ids
        && left.hit_modifiers == right.hit_modifiers
        && left.ability_bonuses == right.ability_bonuses
        && left.save_bonuses == right.save_bonuses
        && left.attribute_bonuses == right.attribute_bonuses
        && left.attribute_limits == right.attribute_limits
        && left.condition_levels == right.condition_levels
        && left.age_ranges == right.age_ranges
        && left.age_changes == right.age_changes
        && left.maximum_age == right.maximum_age
        && left.does_not_die == right.does_not_die
        && left.base_movement == right.base_movement
        && left.magic_resistance == right.magic_resistance
        && left.two_hand_bonus == right.two_hand_bonus
        && left.missile_bonus == right.missile_bonus
        && left.base_attacks == right.base_attacks
        && left.maximum_attacks == right.maximum_attacks
        && left.can_regenerate == right.can_regenerate
        && left.default_icon_set == right.default_icon_set
        && left.item_category_masks == right.item_category_masks
        && left.descriptor_flags == right.descriptor_flags
}

fn read_i16(row: &[u8], offset: usize) -> i32 {
    i32::from(i16::from_be_bytes([row[offset], row[offset + 1]]))
}

fn read_i16_values(row: &[u8], offset: usize, count: usize) -> Vec<i32> {
    (0..count)
        .map(|index| read_i16(row, offset + index * 2))
        .collect()
}

fn read_i32(row: &[u8], offset: usize) -> i32 {
    i32::from_be_bytes([
        row[offset],
        row[offset + 1],
        row[offset + 2],
        row[offset + 3],
    ])
}

fn write_i16(
    row: &mut [u8],
    offset: usize,
    value: i32,
    classic_id: u8,
    field: &'static str,
) -> Result<(), RaceCodecError> {
    let value = i16::try_from(value).map_err(|_| RaceCodecError::IntegerOutOfRange {
        classic_id,
        field,
        value,
    })?;
    row[offset..offset + 2].copy_from_slice(&value.to_be_bytes());
    Ok(())
}

fn write_i16_values(
    row: &mut [u8],
    offset: usize,
    values: &[i32],
    classic_id: u8,
    field: &'static str,
) -> Result<(), RaceCodecError> {
    for (index, value) in values.iter().copied().enumerate() {
        write_i16(row, offset + index * 2, value, classic_id, field)?;
    }
    Ok(())
}

fn write_i32(row: &mut [u8], offset: usize, value: i32) {
    row[offset..offset + 4].copy_from_slice(&value.to_be_bytes());
}

#[cfg(test)]
mod tests {
    use super::*;

    fn changed_offsets(before: &[u8], after: &[u8]) -> Vec<usize> {
        before
            .iter()
            .zip(after)
            .enumerate()
            .filter_map(|(offset, (before, after))| (before != after).then_some(offset))
            .collect()
    }

    #[test]
    fn bundled_races_use_castle_record_stride_and_preserve_file_residue() {
        let input = include_bytes!("../../../../godot/bundled/realmz-reference/Data Race");
        let mut decoded = decode_race_rules(input, None);
        // Castle structs.h/loadprofile read 408-byte rows; its menus use 30 races.
        let expected = [
            (70, 12, 2, 1),
            (250, 13, 2, 2),
            (250, 13, 2, 3),
            (55, 14, 2, 4),
            (130, 10, 3, 5),
            (190, 10, 2, 6),
            (210, 10, 2, 7),
            (150, 12, 2, 8),
            (55, 13, 2, 9),
            (45, 14, 3, 10),
            (60, 11, 3, 11),
            (45, 13, 4, 12),
            (300, 18, 3, 13),
            (45, 12, 2, 14),
            (70, 14, 4, 15),
            (300, 24, 4, 16),
            (90, 14, 3, 17),
            (120, 10, 3, 18),
            (65, 15, 4, 19),
            (18, 12, 1, 8),
            (18, 12, 2, 0),
            (18, 12, 2, 0),
            (18, 12, 2, 0),
            (18, 12, 2, 0),
            (18, 12, 2, 0),
            (18, 12, 2, 0),
            (18, 12, 2, 0),
            (18, 12, 2, 0),
            (18, 12, 2, 0),
            (18, 12, 2, 0),
        ];
        assert_eq!(decoded.rules.len(), expected.len());
        for (rule, expected) in decoded.rules.iter().zip(expected) {
            let race = &rule.definition;
            assert_eq!(
                (
                    race.maximum_age,
                    race.base_movement,
                    race.base_attacks,
                    race.default_icon_set
                ),
                expected,
                "{}",
                race.id.0
            );
        }
        assert_eq!(decoded.trailing_bytes, input[30 * 408..]);
        assert_eq!(
            encode_race_rules(&decoded.rules, Some(input)).unwrap(),
            input
        );
        decoded.rules[3].definition.base_movement = 16;
        let output = encode_race_rules(&decoded.rules, Some(input)).unwrap();
        assert_eq!(changed_offsets(input, &output), [3 * 408 + 197]);
    }

    #[test]
    fn no_edit_round_trip_preserves_unowned_bytes_and_trailing_residue() {
        let mut input = vec![0x5a; RACE_RECORD_BYTES * 2 + 7];
        input[0..RACE_RECORD_BYTES * 2].fill(0);
        input[96..112].fill(0xa5);
        input[346..RACE_RECORD_BYTES].fill(0xc3);
        input[RACE_RECORD_BYTES + 194..RACE_RECORD_BYTES + 196]
            .copy_from_slice(&2i16.to_be_bytes());
        input[RACE_RECORD_BYTES + 208] = 7;
        input[RACE_RECORD_BYTES + 333] = 9;

        let decoded = decode_race_rules(&input, None);
        assert_eq!(decoded.rules.len(), 2);
        assert_eq!(decoded.trailing_bytes, vec![0x5a; 7]);
        assert!(decoded.rules[1].definition.does_not_die);
        assert!(decoded.rules[1].definition.can_regenerate);
        assert_eq!(
            decoded.rules[1].definition.eligible_caste_ids,
            [StableId("classic.caste.1".into())]
        );
        assert_eq!(
            encode_race_rules(&decoded.rules, Some(&input)).expect("re-encode"),
            input
        );
    }

    #[test]
    fn edited_field_changes_only_its_declared_owned_big_endian_short() {
        let mut input = vec![0u8; RACE_RECORD_BYTES];
        input[96..112].fill(0xa5);
        input[346..].fill(0xc3);
        input[196..198].copy_from_slice(&14i16.to_be_bytes());
        let mut decoded = decode_race_rules(&input, None);
        decoded.rules[0].definition.base_movement = 16;

        let output = encode_race_rules(&decoded.rules, Some(&input)).expect("encode edit");
        assert_eq!(changed_offsets(&input, &output), vec![197]);
        assert_eq!(&output[96..112], &input[96..112]);
        assert_eq!(&output[346..], &input[346..]);
    }
}

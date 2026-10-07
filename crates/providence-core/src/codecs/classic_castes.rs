use std::collections::BTreeSet;

use crate::model::{BlobId, CasteRuleDefinition, SourcedCasteRule, StableId};

pub const CASTE_RECORD_BYTES: usize = 576;
pub const CLASSIC_CASTE_RECORDS: usize = 30;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DecodedCasteRuleFile {
    pub rules: Vec<SourcedCasteRule>,
    pub trailing_bytes: Vec<u8>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CasteCodecError {
    DuplicateClassicId(u8),
    MissingEligibilityTarget { race: StableId, caste: StableId },
    InvalidDefinition { classic_id: u8, reason: String },
}

impl std::fmt::Display for CasteCodecError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::DuplicateClassicId(id) => write!(formatter, "duplicate Data Caste ID {id}"),
            Self::MissingEligibilityTarget { race, caste } => write!(
                formatter,
                "race '{}' grants eligibility to missing caste '{}'",
                race.0, caste.0
            ),
            Self::InvalidDefinition { classic_id, reason } => {
                write!(formatter, "Data Caste {classic_id} is invalid: {reason}")
            }
        }
    }
}

impl std::error::Error for CasteCodecError {}

pub fn derive_caste_eligibility(
    races: &[crate::model::SourcedRaceRule],
    castes: &mut [SourcedCasteRule],
) -> Result<(), CasteCodecError> {
    for caste in castes.iter_mut() {
        caste.definition.eligible_race_ids.clear();
    }
    for race in races {
        for caste_id in &race.definition.eligible_caste_ids {
            let caste = castes
                .iter_mut()
                .find(|caste| caste.definition.id == *caste_id)
                .ok_or_else(|| CasteCodecError::MissingEligibilityTarget {
                    race: race.definition.id.clone(),
                    caste: caste_id.clone(),
                })?;
            if !caste
                .definition
                .eligible_race_ids
                .contains(&race.definition.id)
            {
                caste
                    .definition
                    .eligible_race_ids
                    .push(race.definition.id.clone());
            }
        }
    }
    for caste in castes {
        caste.definition.eligible_race_ids.sort();
    }
    Ok(())
}

pub fn decode_caste_rules(bytes: &[u8], source_blob: Option<BlobId>) -> DecodedCasteRuleFile {
    let count = (bytes.len() / CASTE_RECORD_BYTES).min(CLASSIC_CASTE_RECORDS);
    let body_bytes = count * CASTE_RECORD_BYTES;
    let rules = bytes[..body_bytes]
        .chunks_exact(CASTE_RECORD_BYTES)
        .enumerate()
        .map(|(index, row)| SourcedCasteRule {
            source: format!("Data Caste record {index}"),
            source_blob: source_blob.clone(),
            definition: decode_definition(index as u8 + 1, row),
        })
        .collect();
    DecodedCasteRuleFile {
        rules,
        trailing_bytes: bytes[body_bytes..].to_vec(),
    }
}

pub fn encode_caste_rules(
    rules: &[SourcedCasteRule],
    compatibility_source: Option<&[u8]>,
) -> Result<Vec<u8>, CasteCodecError> {
    let mut selected = rules.iter().collect::<Vec<_>>();
    selected.sort_by_key(|rule| rule.definition.classic_id);
    let mut seen = BTreeSet::new();
    for rule in &selected {
        validate_definition(&rule.definition)?;
        if !seen.insert(rule.definition.classic_id) {
            return Err(CasteCodecError::DuplicateClassicId(
                rule.definition.classic_id,
            ));
        }
    }

    let source_rows = compatibility_source
        .map(|source| (source.len() / CASTE_RECORD_BYTES).min(CLASSIC_CASTE_RECORDS))
        .unwrap_or(0);
    let source_body_bytes = source_rows * CASTE_RECORD_BYTES;
    let required_rows = selected
        .last()
        .map(|rule| usize::from(rule.definition.classic_id))
        .unwrap_or(0);
    let mut output = compatibility_source
        .map(|source| source[..source_body_bytes].to_vec())
        .unwrap_or_default();
    output.resize(output.len().max(required_rows * CASTE_RECORD_BYTES), 0);

    for rule in selected {
        let row_index = usize::from(rule.definition.classic_id - 1);
        let start = row_index * CASTE_RECORD_BYTES;
        let end = start + CASTE_RECORD_BYTES;
        if row_index < source_rows {
            let decoded = decode_definition(rule.definition.classic_id, &output[start..end]);
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

fn decode_definition(classic_id: u8, row: &[u8]) -> CasteRuleDefinition {
    CasteRuleDefinition {
        id: StableId(format!("classic.caste.{classic_id}")),
        classic_id,
        name: String::new(),
        description: String::new(),
        eligible_race_ids: Vec::new(),
        initial_ability_values: read_i16_values(row, 0, 14),
        level_ability_dice: read_i16_values(row, 28, 14),
        victory_thresholds: read_i32_values(row, 264, 30),
        save_bonuses: read_i16_values(row, 56, 8),
        attribute_bonuses: read_i16_values(row, 72, 6),
        attribute_limits: read_i16_values(row, 108, 12),
        condition_levels: read_i16_values(row, 132, 40),
        stamina_dice: read_i16_values(row, 216, 2),
        strength_values: read_i16_values(row, 220, 2),
        dodge_values: read_i16_values(row, 224, 2),
        to_hit_values: read_i16_values(row, 228, 2),
        missile_values: read_i16_values(row, 232, 2),
        hand_to_hand_values: read_i16_values(row, 236, 2),
        spellcaster_rows: (0..4)
            .map(|index| read_i16_values(row, 84 + index * 6, 3))
            .collect(),
        attack_levels: row[426..436]
            .iter()
            .map(|value| i32::from(*value as i8))
            .collect(),
        starting_item_ids: read_i16_values(row, 386, 20)
            .into_iter()
            .filter(|id| *id != 0)
            .map(|id| StableId(format!("classic.item.{id}")))
            .collect(),
        caste_class: read_i16(row, 248),
        minimum_age_group: read_i16(row, 250),
        movement_bonus: read_i16(row, 252),
        magic_resistance_multiplier: read_i16(row, 254),
        two_hand_bonus: read_i16(row, 256),
        maximum_stamina_bonus: read_i16(row, 258),
        bonus_attacks: read_i16(row, 260),
        maximum_attacks: read_i16(row, 262),
        start_money: read_i16(row, 384),
        can_use_missile: read_i16(row, 212) != 0,
        gets_missile_bonus: read_i16(row, 214) != 0,
        default_icon: read_i16(row, 444),
        item_category_masks: vec![read_i32(row, 436), read_i32(row, 440)],
    }
}

fn encode_definition(
    row: &mut [u8],
    definition: &CasteRuleDefinition,
) -> Result<(), CasteCodecError> {
    encode_modifiers(row, definition)?;
    encode_general(row, definition)?;
    encode_equipment(row, definition)
}

fn encode_modifiers(
    row: &mut [u8],
    definition: &CasteRuleDefinition,
) -> Result<(), CasteCodecError> {
    let id = definition.classic_id;
    for (offset, values, field) in [
        (
            0,
            definition.initial_ability_values.as_slice(),
            "initialAbilityValues",
        ),
        (
            28,
            definition.level_ability_dice.as_slice(),
            "levelAbilityDice",
        ),
        (56, definition.save_bonuses.as_slice(), "saveBonuses"),
        (
            72,
            definition.attribute_bonuses.as_slice(),
            "attributeBonuses",
        ),
        (
            108,
            definition.attribute_limits.as_slice(),
            "attributeLimits",
        ),
        (
            132,
            definition.condition_levels.as_slice(),
            "conditionLevels",
        ),
        (216, definition.stamina_dice.as_slice(), "staminaDice"),
        (220, definition.strength_values.as_slice(), "strengthValues"),
        (224, definition.dodge_values.as_slice(), "dodgeValues"),
        (228, definition.to_hit_values.as_slice(), "toHitValues"),
        (232, definition.missile_values.as_slice(), "missileValues"),
        (
            236,
            definition.hand_to_hand_values.as_slice(),
            "handToHandValues",
        ),
    ] {
        write_i16_values(row, offset, values, id, field)?;
    }
    for (index, values) in definition.spellcaster_rows.iter().enumerate() {
        write_i16_values(row, 84 + index * 6, values, id, "spellcasterRows")?;
    }
    Ok(())
}

fn encode_general(row: &mut [u8], definition: &CasteRuleDefinition) -> Result<(), CasteCodecError> {
    let id = definition.classic_id;
    for (offset, value, field) in [
        (212, definition.can_use_missile, "canUseMissile"),
        (214, definition.gets_missile_bonus, "getsMissileBonus"),
    ] {
        if (read_i16(row, offset) != 0) != value {
            write_i16(row, offset, i32::from(value), id, field)?;
        }
    }
    for (offset, value, field) in [
        (248, definition.caste_class, "casteClass"),
        (250, definition.minimum_age_group, "minimumAgeGroup"),
        (252, definition.movement_bonus, "movementBonus"),
        (
            254,
            definition.magic_resistance_multiplier,
            "magicResistanceMultiplier",
        ),
        (256, definition.two_hand_bonus, "twoHandBonus"),
        (258, definition.maximum_stamina_bonus, "maximumStaminaBonus"),
        (260, definition.bonus_attacks, "bonusAttacks"),
        (262, definition.maximum_attacks, "maximumAttacks"),
        (384, definition.start_money, "startMoney"),
        (444, definition.default_icon, "defaultIcon"),
    ] {
        write_i16(row, offset, value, id, field)?;
    }
    for (index, value) in definition.victory_thresholds.iter().copied().enumerate() {
        write_i32(row, 264 + index * 4, value);
    }
    Ok(())
}

fn encode_equipment(
    row: &mut [u8],
    definition: &CasteRuleDefinition,
) -> Result<(), CasteCodecError> {
    let id = definition.classic_id;
    // The list projection omits empty slots; an unrelated edit must not pack them.
    if decode_definition(id, row).starting_item_ids != definition.starting_item_ids {
        row[386..426].fill(0);
        for (index, target) in definition.starting_item_ids.iter().enumerate() {
            let value = parse_item_id(id, target)?;
            write_i16(row, 386 + index * 2, value, id, "startingItemIds")?;
        }
    }
    for (index, value) in definition.attack_levels.iter().copied().enumerate() {
        row[426 + index] = i8::try_from(value)
            .map_err(|_| invalid(id, format!("attackLevels value {value} is outside i8")))?
            as u8;
    }
    write_i32(row, 436, definition.item_category_masks[0]);
    write_i32(row, 440, definition.item_category_masks[1]);
    Ok(())
}

fn validate_definition(definition: &CasteRuleDefinition) -> Result<(), CasteCodecError> {
    let id = definition.classic_id;
    if !(1..=30).contains(&id) {
        return Err(invalid(id, "Classic ID is outside 1..=30"));
    }
    if definition.id.0 != format!("classic.caste.{id}") {
        return Err(invalid(id, "stable ID does not match the Classic ID"));
    }
    for (field, actual, expected) in [
        (
            "initialAbilityValues",
            definition.initial_ability_values.len(),
            14,
        ),
        ("levelAbilityDice", definition.level_ability_dice.len(), 14),
        ("victoryThresholds", definition.victory_thresholds.len(), 30),
        ("saveBonuses", definition.save_bonuses.len(), 8),
        ("attributeBonuses", definition.attribute_bonuses.len(), 6),
        ("attributeLimits", definition.attribute_limits.len(), 12),
        ("conditionLevels", definition.condition_levels.len(), 40),
        ("staminaDice", definition.stamina_dice.len(), 2),
        ("strengthValues", definition.strength_values.len(), 2),
        ("dodgeValues", definition.dodge_values.len(), 2),
        ("toHitValues", definition.to_hit_values.len(), 2),
        ("missileValues", definition.missile_values.len(), 2),
        ("handToHandValues", definition.hand_to_hand_values.len(), 2),
        ("spellcasterRows", definition.spellcaster_rows.len(), 4),
        ("attackLevels", definition.attack_levels.len(), 10),
        ("itemCategoryMasks", definition.item_category_masks.len(), 2),
    ] {
        if actual != expected {
            return Err(invalid(
                id,
                format!("{field} has {actual} values; expected {expected}"),
            ));
        }
    }
    if definition.spellcaster_rows.iter().any(|row| row.len() != 3) {
        return Err(invalid(
            id,
            "spellcasterRows must contain four 3-value rows",
        ));
    }
    if definition.starting_item_ids.len() > 20 {
        return Err(invalid(id, "startingItemIds exceeds 20 native slots"));
    }
    Ok(())
}

fn same_native_semantics(left: &CasteRuleDefinition, right: &CasteRuleDefinition) -> bool {
    left.initial_ability_values == right.initial_ability_values
        && left.level_ability_dice == right.level_ability_dice
        && left.victory_thresholds == right.victory_thresholds
        && left.save_bonuses == right.save_bonuses
        && left.attribute_bonuses == right.attribute_bonuses
        && left.attribute_limits == right.attribute_limits
        && left.condition_levels == right.condition_levels
        && left.stamina_dice == right.stamina_dice
        && left.strength_values == right.strength_values
        && left.dodge_values == right.dodge_values
        && left.to_hit_values == right.to_hit_values
        && left.missile_values == right.missile_values
        && left.hand_to_hand_values == right.hand_to_hand_values
        && left.spellcaster_rows == right.spellcaster_rows
        && left.attack_levels == right.attack_levels
        && left.starting_item_ids == right.starting_item_ids
        && left.caste_class == right.caste_class
        && left.minimum_age_group == right.minimum_age_group
        && left.movement_bonus == right.movement_bonus
        && left.magic_resistance_multiplier == right.magic_resistance_multiplier
        && left.two_hand_bonus == right.two_hand_bonus
        && left.maximum_stamina_bonus == right.maximum_stamina_bonus
        && left.bonus_attacks == right.bonus_attacks
        && left.maximum_attacks == right.maximum_attacks
        && left.start_money == right.start_money
        && left.can_use_missile == right.can_use_missile
        && left.gets_missile_bonus == right.gets_missile_bonus
        && left.default_icon == right.default_icon
        && left.item_category_masks == right.item_category_masks
}

fn invalid(classic_id: u8, reason: impl Into<String>) -> CasteCodecError {
    CasteCodecError::InvalidDefinition {
        classic_id,
        reason: reason.into(),
    }
}

fn parse_item_id(classic_id: u8, target: &StableId) -> Result<i32, CasteCodecError> {
    target
        .0
        .strip_prefix("classic.item.")
        .and_then(|value| value.parse::<i16>().ok())
        .filter(|value| *value != 0)
        .map(i32::from)
        .ok_or_else(|| {
            invalid(
                classic_id,
                format!("invalid starting item ID '{}'", target.0),
            )
        })
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
fn read_i32_values(row: &[u8], offset: usize, count: usize) -> Vec<i32> {
    (0..count)
        .map(|index| read_i32(row, offset + index * 4))
        .collect()
}
fn write_i16(
    row: &mut [u8],
    offset: usize,
    value: i32,
    classic_id: u8,
    field: &'static str,
) -> Result<(), CasteCodecError> {
    let value = i16::try_from(value)
        .map_err(|_| invalid(classic_id, format!("{field} value {value} is outside i16")))?;
    row[offset..offset + 2].copy_from_slice(&value.to_be_bytes());
    Ok(())
}
fn write_i16_values(
    row: &mut [u8],
    offset: usize,
    values: &[i32],
    classic_id: u8,
    field: &'static str,
) -> Result<(), CasteCodecError> {
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
    fn no_edit_round_trip_preserves_duplicate_items_unowned_ranges_and_residue() {
        let mut input = vec![0u8; CASTE_RECORD_BYTES + 5];
        input[240..248].fill(0xa5);
        input[446..CASTE_RECORD_BYTES].fill(0xc3);
        input[212..214].copy_from_slice(&7i16.to_be_bytes());
        input[386..388].copy_from_slice(&37i16.to_be_bytes());
        input[388..390].copy_from_slice(&37i16.to_be_bytes());
        input[CASTE_RECORD_BYTES..].fill(0x5a);

        let decoded = decode_caste_rules(&input, None);
        assert_eq!(decoded.trailing_bytes, vec![0x5a; 5]);
        assert!(decoded.rules[0].definition.can_use_missile);
        assert_eq!(
            decoded.rules[0].definition.starting_item_ids,
            [
                StableId("classic.item.37".into()),
                StableId("classic.item.37".into())
            ]
        );
        assert_eq!(
            encode_caste_rules(&decoded.rules, Some(&input)).unwrap(),
            input
        );
    }

    #[test]
    fn edited_field_changes_only_its_owned_big_endian_short() {
        let mut input = vec![0u8; CASTE_RECORD_BYTES];
        input[240..248].fill(0xa5);
        input[446..].fill(0xc3);
        input[252..254].copy_from_slice(&2i16.to_be_bytes());
        let mut decoded = decode_caste_rules(&input, None);
        decoded.rules[0].definition.movement_bonus = 4;

        let output = encode_caste_rules(&decoded.rules, Some(&input)).unwrap();
        assert_eq!(changed_offsets(&input, &output), vec![253]);
        assert_eq!(&output[240..248], &input[240..248]);
        assert_eq!(&output[446..], &input[446..]);
    }

    #[test]
    fn reciprocal_eligibility_is_derived_from_the_native_race_owner() {
        let mut castes = decode_caste_rules(&vec![0; CASTE_RECORD_BYTES * 30], None).rules;
        let mut races =
            crate::codecs::decode_race_rules(&vec![0; crate::codecs::RACE_RECORD_BYTES * 30], None)
                .rules;
        races[0]
            .definition
            .eligible_caste_ids
            .push(StableId("classic.caste.2".into()));

        derive_caste_eligibility(&races, &mut castes).expect("derive eligibility");
        assert_eq!(
            castes[1].definition.eligible_race_ids,
            [StableId("classic.race.1".into())]
        );
        assert!(castes[0].definition.eligible_race_ids.is_empty());
    }
}

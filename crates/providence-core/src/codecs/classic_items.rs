use std::collections::{BTreeMap, BTreeSet};

use crate::model::{
    BlobId, ItemRuleDefinition, SourcedItemRule, SourcedScenarioItemRule, StableId,
};

use super::classic_item_text::{decode_item_texts, decode_item_texts_for_bases};

use super::{ResourceForkError, RuleNameCodecError, parse_resource_entries_preserving_duplicates};

pub const ITEM_RECORD_BYTES: usize = 100;
pub const STANDARD_ITEM_RECORDS: usize = 800;
pub const STANDARD_ITEM_DEFINITIONS: usize = 799;
pub const SCENARIO_ITEM_DEFINITIONS: usize = 200;

pub fn new_scenario_item_definition(
    record_index: u16,
) -> Result<ItemRuleDefinition, ItemCodecError> {
    if usize::from(record_index) >= SCENARIO_ITEM_DEFINITIONS {
        return Err(invalid(0, "Scenario item record must be from 0 to 199"));
    }
    Ok(decode_definition(
        800 + record_index as i16,
        &[0; ITEM_RECORD_BYTES],
        [String::new(), String::new(), String::new()],
    ))
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DecodedItemRuleFile {
    pub rules: Vec<SourcedItemRule>,
    pub trailing_bytes: Vec<u8>,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DecodedScenarioItemFile {
    pub rules: Vec<SourcedScenarioItemRule>,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ItemCodecError {
    InvalidBinaryLength(usize),
    InvalidScenarioBinaryLength(usize),
    InvalidTextResource(RuleNameCodecError),
    ResourceFork(ResourceForkError),
    MissingTextFamily(i16),
    DuplicateClassicId(i16),
    TextTooLong {
        classic_id: i16,
        field: &'static str,
    },
    UnsupportedTextCharacter {
        classic_id: i16,
        field: &'static str,
    },
    InvalidDefinition {
        classic_id: i16,
        reason: String,
    },
}

impl std::fmt::Display for ItemCodecError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InvalidBinaryLength(actual) => write!(
                formatter,
                "Data ID has {actual} bytes; expected exactly 80,000"
            ),
            Self::InvalidScenarioBinaryLength(actual) => write!(
                formatter,
                "Data NI has {actual} bytes; expected exactly 20,000"
            ),
            Self::InvalidTextResource(error) => {
                write!(formatter, "Data ID text resource is invalid: {error}")
            }
            Self::ResourceFork(error) => {
                write!(formatter, "item text resource is invalid: {error}")
            }
            Self::MissingTextFamily(id) => {
                write!(formatter, "item text resource is missing STR# {id}")
            }
            Self::DuplicateClassicId(id) => write!(formatter, "duplicate item ID {id}"),
            Self::TextTooLong { classic_id, field } => write!(
                formatter,
                "item {classic_id} {field} exceeds the Classic 255-byte string limit"
            ),
            Self::UnsupportedTextCharacter { classic_id, field } => write!(
                formatter,
                "item {classic_id} {field} contains characters not representable in Classic MacRoman text"
            ),
            Self::InvalidDefinition { classic_id, reason } => {
                write!(formatter, "item {classic_id} is invalid: {reason}")
            }
        }
    }
}

impl std::error::Error for ItemCodecError {}

impl From<RuleNameCodecError> for ItemCodecError {
    fn from(value: RuleNameCodecError) -> Self {
        Self::InvalidTextResource(value)
    }
}

impl From<ResourceForkError> for ItemCodecError {
    fn from(value: ResourceForkError) -> Self {
        Self::ResourceFork(value)
    }
}

pub fn decode_standard_item_rules(
    bytes: &[u8],
    text_bytes: &[u8],
    source_blob: BlobId,
    text_source_blob: BlobId,
) -> Result<DecodedItemRuleFile, ItemCodecError> {
    if bytes.len() != ITEM_RECORD_BYTES * STANDARD_ITEM_RECORDS {
        return Err(ItemCodecError::InvalidBinaryLength(bytes.len()));
    }
    let (texts, warnings) = decode_item_texts(text_bytes)?;
    let rules = bytes
        .chunks_exact(ITEM_RECORD_BYTES)
        .enumerate()
        .skip(1)
        .map(|(index, row)| {
            let classic_id = index as i16;
            let text = texts.get(&classic_id).cloned().unwrap_or_default();
            SourcedItemRule {
                source: format!("Data ID record {index}"),
                source_blob: source_blob.clone(),
                text_source_blob: text_source_blob.clone(),
                definition: decode_definition(classic_id, row, text),
            }
        })
        .collect();
    Ok(DecodedItemRuleFile {
        rules,
        trailing_bytes: Vec::new(),
        warnings,
    })
}

pub fn encode_standard_item_rules(
    rules: &[SourcedItemRule],
    compatibility_source: &[u8],
) -> Result<Vec<u8>, ItemCodecError> {
    if compatibility_source.len() != ITEM_RECORD_BYTES * STANDARD_ITEM_RECORDS {
        return Err(ItemCodecError::InvalidBinaryLength(
            compatibility_source.len(),
        ));
    }
    let mut output = compatibility_source.to_vec();
    let mut seen = BTreeSet::new();
    for rule in rules {
        validate_definition(&rule.definition)?;
        if !seen.insert(rule.definition.classic_id) {
            return Err(ItemCodecError::DuplicateClassicId(
                rule.definition.classic_id,
            ));
        }
        let start = rule.definition.classic_id as usize * ITEM_RECORD_BYTES;
        let end = start + ITEM_RECORD_BYTES;
        let existing = decode_definition(
            rule.definition.classic_id,
            &output[start..end],
            [String::new(), String::new(), String::new()],
        );
        if same_native_semantics(&existing, &rule.definition) {
            continue;
        }
        encode_changed_definition(&mut output[start..end], &existing, &rule.definition)?;
    }
    Ok(output)
}

pub fn decode_scenario_item_rules(
    bytes: &[u8],
    text_bytes: Option<&[u8]>,
    source_blob: BlobId,
    text_source_blob: Option<BlobId>,
) -> Result<DecodedScenarioItemFile, ItemCodecError> {
    if bytes.len() != ITEM_RECORD_BYTES * SCENARIO_ITEM_DEFINITIONS {
        return Err(ItemCodecError::InvalidScenarioBinaryLength(bytes.len()));
    }
    let (texts, mut warnings) = match text_bytes {
        Some(text_bytes) => {
            let entries = parse_resource_entries_preserving_duplicates(text_bytes)?;
            let has_item_text_family = entries
                .iter()
                .any(|entry| entry.resource_type == *b"STR#" && (800..=802).contains(&entry.id));
            if has_item_text_family {
                decode_item_texts_for_bases(text_bytes, &[800])?
            } else {
                (
                    BTreeMap::new(),
                    vec![
                        "The supplied item-text resource fork contains no STR# 800 through 802 family; unrelated resources are preserved unchanged"
                            .into(),
                    ],
                )
            }
        }
        None => (
            BTreeMap::new(),
            vec!["Item names and descriptions were not imported because no item-text resource fork was supplied. Include Data NI.rsrc or Scenario.rsrc when importing; names will remain blank until supplied or authored.".into()],
        ),
    };
    let mut rules = Vec::with_capacity(SCENARIO_ITEM_DEFINITIONS);
    for (record_index, row) in bytes.chunks_exact(ITEM_RECORD_BYTES).enumerate() {
        let stored_id = read_i16(row, 2) as i16;
        let expected_id = 800 + record_index as i16;
        let classic_id = match stored_id {
            0 => expected_id,
            800..=999 if stored_id == expected_id => stored_id,
            800..=999 => {
                return Err(invalid(
                    stored_id,
                    format!("Data NI record {record_index} must own Classic ID {expected_id}"),
                ));
            }
            _ => {
                warnings.push(format!(
                    "Data NI record {record_index} stores out-of-domain Classic ID {stored_id}; canonical identity {expected_id} is used while the source bytes remain unchanged"
                ));
                expected_id
            }
        };
        let text = texts.get(&classic_id).cloned().unwrap_or_default();
        rules.push(SourcedScenarioItemRule {
            record_index: record_index as u16,
            source: format!("Data NI record {record_index}"),
            source_blob: source_blob.clone(),
            text_source_blob: text_source_blob.clone(),
            definition: decode_definition(classic_id, row, text),
        });
    }
    Ok(DecodedScenarioItemFile { rules, warnings })
}

pub fn encode_scenario_item_rules(
    rules: &[SourcedScenarioItemRule],
    compatibility_source: &[u8],
) -> Result<Vec<u8>, ItemCodecError> {
    if compatibility_source.len() != ITEM_RECORD_BYTES * SCENARIO_ITEM_DEFINITIONS {
        return Err(ItemCodecError::InvalidScenarioBinaryLength(
            compatibility_source.len(),
        ));
    }
    let mut output = compatibility_source.to_vec();
    let mut seen_records = BTreeSet::new();
    let mut seen_ids = BTreeSet::new();
    for rule in rules {
        validate_scenario_definition(rule)?;
        if !seen_records.insert(rule.record_index) || !seen_ids.insert(rule.definition.classic_id) {
            return Err(ItemCodecError::DuplicateClassicId(
                rule.definition.classic_id,
            ));
        }
        let start = usize::from(rule.record_index) * ITEM_RECORD_BYTES;
        let end = start + ITEM_RECORD_BYTES;
        let row = &output[start..end];
        let stored_id = read_i16(row, 2) as i16;
        let existing_id = if stored_id == 0 || !(800..=999).contains(&stored_id) {
            rule.definition.classic_id
        } else {
            stored_id
        };
        let existing = decode_definition(
            existing_id,
            row,
            [String::new(), String::new(), String::new()],
        );
        if same_native_semantics(&existing, &rule.definition) {
            continue;
        }
        encode_changed_definition(&mut output[start..end], &existing, &rule.definition)?;
    }
    Ok(output)
}

fn decode_definition(classic_id: i16, row: &[u8], text: [String; 3]) -> ItemRuleDefinition {
    ItemRuleDefinition {
        id: StableId(format!("classic.item.{classic_id}")),
        classic_id,
        unidentified_name: text[0].clone(),
        name: text[1].clone(),
        description: text[2].clone(),
        strength_bonus: read_i16(row, 0),
        icon_id: read_i16(row, 4),
        item_type: read_i16(row, 6),
        blunt: read_i16(row, 8),
        hands: read_i16(row, 10),
        luck_bonus: read_i16(row, 12),
        movement_bonus: read_i16(row, 14),
        armor_bonus: read_i16(row, 16),
        magic_resistance_bonus: read_i16(row, 18),
        damage_bonus: read_i16(row, 20),
        spell_point_bonus: read_i16(row, 22),
        sound_id: read_i16(row, 24),
        weight: read_i16(row, 26),
        cost: read_i16(row, 28),
        initial_charges: read_i16(row, 30),
        cursed_item_id: stable_optional("item", read_i16(row, 32)),
        magical: read_i16(row, 34) != 0,
        item_category_mask_low: read_i32(row, 36),
        item_category_mask_high: read_i32(row, 40),
        race_restrictions: read_i16(row, 44),
        caste_restrictions: read_i16(row, 46),
        specific_race_id: stable_optional("race", read_i16(row, 48)),
        specific_caste_id: stable_optional("caste", read_i16(row, 50)),
        race_class_only: read_i16(row, 52),
        caste_class_only: read_i16(row, 54),
        versus_small: read_i16(row, 70),
        versus_large: read_i16(row, 72),
        heat: read_i16(row, 74),
        cold: read_i16(row, 76),
        electric: read_i16(row, 78),
        versus_undead: read_i16(row, 80),
        versus_demon_devil: read_i16(row, 82),
        versus_evil: read_i16(row, 84),
        special: std::array::from_fn(|index| read_i16(row, 86 + index * 2)),
        weight_per_charge: read_i16(row, 96),
        drop_on_empty: read_i16(row, 98) != 0,
    }
}

fn encode_definition(
    row: &mut [u8],
    definition: &ItemRuleDefinition,
) -> Result<(), ItemCodecError> {
    let id = definition.classic_id;
    for (offset, value, field) in [
        (0, definition.strength_bonus, "strengthBonus"),
        (2, i32::from(id), "classicId"),
        (4, definition.icon_id, "iconId"),
        (6, definition.item_type, "itemType"),
        (8, definition.blunt, "blunt"),
        (10, definition.hands, "hands"),
        (12, definition.luck_bonus, "luckBonus"),
        (14, definition.movement_bonus, "movementBonus"),
        (16, definition.armor_bonus, "armorBonus"),
        (
            18,
            definition.magic_resistance_bonus,
            "magicResistanceBonus",
        ),
        (20, definition.damage_bonus, "damageBonus"),
        (22, definition.spell_point_bonus, "spellPointBonus"),
        (24, definition.sound_id, "soundId"),
        (26, definition.weight, "weight"),
        (28, definition.cost, "cost"),
        (30, definition.initial_charges, "initialCharges"),
        (
            32,
            classic_optional(&definition.cursed_item_id, "item", id, "cursedItemId")?,
            "cursedItemId",
        ),
        (34, i32::from(definition.magical), "magical"),
        (44, definition.race_restrictions, "raceRestrictions"),
        (46, definition.caste_restrictions, "casteRestrictions"),
        (
            48,
            classic_optional(&definition.specific_race_id, "race", id, "specificRaceId")?,
            "specificRaceId",
        ),
        (
            50,
            classic_optional(
                &definition.specific_caste_id,
                "caste",
                id,
                "specificCasteId",
            )?,
            "specificCasteId",
        ),
        (52, definition.race_class_only, "raceClassOnly"),
        (54, definition.caste_class_only, "casteClassOnly"),
        (70, definition.versus_small, "versusSmall"),
        (72, definition.versus_large, "versusLarge"),
        (74, definition.heat, "heat"),
        (76, definition.cold, "cold"),
        (78, definition.electric, "electric"),
        (80, definition.versus_undead, "versusUndead"),
        (82, definition.versus_demon_devil, "versusDemonDevil"),
        (84, definition.versus_evil, "versusEvil"),
        (96, definition.weight_per_charge, "weightPerCharge"),
        (98, i32::from(definition.drop_on_empty), "dropOnEmpty"),
    ] {
        write_i16(row, offset, value, id, field)?;
    }
    row[36..40].copy_from_slice(&definition.item_category_mask_low.to_be_bytes());
    row[40..44].copy_from_slice(&definition.item_category_mask_high.to_be_bytes());
    for (index, value) in definition.special.iter().enumerate() {
        write_i16(row, 86 + index * 2, *value, id, "special")?;
    }
    Ok(())
}

fn encode_changed_definition(
    row: &mut [u8],
    existing: &ItemRuleDefinition,
    definition: &ItemRuleDefinition,
) -> Result<(), ItemCodecError> {
    let mut before = row.to_vec();
    let mut after = row.to_vec();
    encode_definition(&mut before, existing)?;
    encode_definition(&mut after, definition)?;
    // Compare decoded meanings before authorizing a word write. Unchanged flags
    // and canonical identity aliases retain their exact imported representation.
    for offset in (0..56).step_by(2).chain((70..100).step_by(2)) {
        if before[offset..offset + 2] != after[offset..offset + 2] {
            row[offset..offset + 2].copy_from_slice(&after[offset..offset + 2]);
        }
    }
    Ok(())
}

fn validate_definition(definition: &ItemRuleDefinition) -> Result<(), ItemCodecError> {
    let id = definition.classic_id;
    if !(1..800).contains(&id) {
        return Err(invalid(id, "Classic ID is outside 1..=799"));
    }
    if definition.id.0 != format!("classic.item.{id}") {
        return Err(invalid(id, "stable ID does not match Classic ID"));
    }
    Ok(())
}

pub(super) fn validate_scenario_definition(
    rule: &SourcedScenarioItemRule,
) -> Result<(), ItemCodecError> {
    let definition = &rule.definition;
    if usize::from(rule.record_index) >= SCENARIO_ITEM_DEFINITIONS {
        return Err(invalid(
            definition.classic_id,
            "Data NI record index is outside 0..=199",
        ));
    }
    let expected_id = 800 + rule.record_index as i16;
    if definition.classic_id != expected_id {
        return Err(invalid(
            definition.classic_id,
            format!(
                "Data NI record {} must own Classic ID {expected_id}",
                rule.record_index
            ),
        ));
    }
    if definition.id.0 != format!("classic.item.{expected_id}") {
        return Err(invalid(
            definition.classic_id,
            "stable ID does not match Data NI row identity",
        ));
    }
    Ok(())
}

fn same_native_semantics(left: &ItemRuleDefinition, right: &ItemRuleDefinition) -> bool {
    let mut left = left.clone();
    let mut right = right.clone();
    left.name.clear();
    left.unidentified_name.clear();
    left.description.clear();
    right.name.clear();
    right.unidentified_name.clear();
    right.description.clear();
    left == right
}

fn stable_optional(kind: &str, id: i32) -> Option<StableId> {
    (id != 0).then(|| StableId(format!("classic.{kind}.{id}")))
}

fn classic_optional(
    value: &Option<StableId>,
    kind: &str,
    source_id: i16,
    field: &'static str,
) -> Result<i32, ItemCodecError> {
    let Some(value) = value else {
        return Ok(0);
    };
    let prefix = format!("classic.{kind}.");
    value
        .0
        .strip_prefix(&prefix)
        .and_then(|value| value.parse::<i16>().ok())
        .map(i32::from)
        .ok_or_else(|| {
            invalid(
                source_id,
                format!("{field} has invalid target '{}'", value.0),
            )
        })
}

fn invalid(classic_id: i16, reason: impl Into<String>) -> ItemCodecError {
    ItemCodecError::InvalidDefinition {
        classic_id,
        reason: reason.into(),
    }
}

fn read_i16(bytes: &[u8], offset: usize) -> i32 {
    i32::from(i16::from_be_bytes([bytes[offset], bytes[offset + 1]]))
}

fn read_i32(bytes: &[u8], offset: usize) -> i32 {
    i32::from_be_bytes([
        bytes[offset],
        bytes[offset + 1],
        bytes[offset + 2],
        bytes[offset + 3],
    ])
}

fn write_i16(
    bytes: &mut [u8],
    offset: usize,
    value: i32,
    classic_id: i16,
    field: &'static str,
) -> Result<(), ItemCodecError> {
    let value = i16::try_from(value).map_err(|_| {
        invalid(
            classic_id,
            format!("{field} is outside signed 16-bit range"),
        )
    })?;
    bytes[offset..offset + 2].copy_from_slice(&value.to_be_bytes());
    Ok(())
}

#[cfg(test)]
#[path = "classic_items_tests.rs"]
mod tests;

#[cfg(test)]
#[path = "classic_item_edit_preservation_tests.rs"]
mod edit_preservation_tests;

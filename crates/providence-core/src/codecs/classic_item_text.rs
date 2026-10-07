use std::collections::{BTreeMap, BTreeSet};

use super::classic_items::{
    ItemCodecError, SCENARIO_ITEM_DEFINITIONS, validate_scenario_definition,
};
use super::{
    ResourceEntry, ResourceForkError, empty_resource_fork,
    merge_resource_entries_preserving_unowned_duplicates,
    parse_resource_entries_preserving_duplicates,
};
use crate::model::SourcedScenarioItemRule;

#[path = "classic_item_text_rows.rs"]
mod rows;
use rows::{ItemTextRows, decode_text};

type ItemTextCatalog = BTreeMap<i16, [String; 3]>;

pub fn encode_scenario_item_text_resources(
    rules: &[SourcedScenarioItemRule],
    compatibility_source: Option<&[u8]>,
) -> Result<Vec<u8>, ItemCodecError> {
    encode_resources(rules, compatibility_source, &BTreeSet::new())
}

/// A draft knows which text the author actually changed, including a value that
/// coincides with an older lossy decoder's rendering of an imported source row.
pub fn encode_scenario_item_text_resources_for_draft(
    rules: &[SourcedScenarioItemRule],
    compatibility_source: Option<&[u8]>,
    before: &[SourcedScenarioItemRule],
) -> Result<Vec<u8>, ItemCodecError> {
    let previous = before
        .iter()
        .map(|rule| (rule.record_index, rule))
        .collect::<BTreeMap<_, _>>();
    let mut edited = BTreeSet::new();
    for rule in rules {
        for field in 0..3 {
            if previous
                .get(&rule.record_index)
                .is_none_or(|old| text_field(old, field) != text_field(rule, field))
            {
                edited.insert((rule.record_index, field));
            }
        }
    }
    encode_resources(rules, compatibility_source, &edited)
}

fn encode_resources(
    rules: &[SourcedScenarioItemRule],
    source: Option<&[u8]>,
    edited: &BTreeSet<(u16, u8)>,
) -> Result<Vec<u8>, ItemCodecError> {
    let baseline = source
        .map(ToOwned::to_owned)
        .unwrap_or_else(empty_resource_fork);
    let entries = parse_resource_entries_preserving_duplicates(&baseline)?;
    let mut records = BTreeSet::new();
    for rule in rules {
        validate_scenario_definition(rule)?;
        if !records.insert(rule.record_index) {
            return Err(ItemCodecError::DuplicateClassicId(
                rule.definition.classic_id,
            ));
        }
    }
    let has_text = rules
        .iter()
        .any(|rule| (0..3).any(|field| !text_field(rule, field).is_empty()));
    let mut updates = Vec::new();
    for field in 0..3 {
        if let Some(update) = update_family(&entries, rules, field, has_text, edited)? {
            updates.push(update);
        }
    }
    merge_resource_entries_preserving_unowned_duplicates(&baseline, updates).map_err(Into::into)
}

fn update_family(
    entries: &[ResourceEntry],
    rules: &[SourcedScenarioItemRule],
    field: u8,
    has_text: bool,
    edited: &BTreeSet<(u16, u8)>,
) -> Result<Option<ResourceEntry>, ItemCodecError> {
    let resource_id = 800 + i16::from(field);
    let existing = unique_family(entries, resource_id)?;
    let mut rows = existing
        .map(|entry| ItemTextRows::parse(&entry.data))
        .unwrap_or_else(|| ItemTextRows::empty(SCENARIO_ITEM_DEFINITIONS));
    let mut changed = existing.is_none() && has_text;
    for rule in rules {
        changed |= rows.replace(
            rule.record_index,
            field,
            text_field(rule, field),
            edited.contains(&(rule.record_index, field)),
        )?;
    }
    if !changed {
        return Ok(None);
    }
    Ok(Some(ResourceEntry {
        resource_type: *b"STR#",
        id: resource_id,
        name: existing
            .map(|entry| entry.name.clone())
            .unwrap_or_else(|| item_text_resource_name(i16::from(field)).into()),
        attributes: existing.map(|entry| entry.attributes).unwrap_or(0),
        data: rows.encode(),
    }))
}

fn unique_family(
    entries: &[ResourceEntry],
    id: i16,
) -> Result<Option<&ResourceEntry>, ItemCodecError> {
    let mut matches = entries
        .iter()
        .filter(|entry| entry.resource_type == *b"STR#" && entry.id == id);
    let existing = matches.next();
    if matches.next().is_some() {
        return Err(ResourceForkError::DuplicateResource {
            resource_type: *b"STR#",
            id,
        }
        .into());
    }
    Ok(existing)
}

fn text_field(rule: &SourcedScenarioItemRule, field: u8) -> &str {
    match field {
        0 => &rule.definition.unidentified_name,
        1 => &rule.definition.name,
        _ => &rule.definition.description,
    }
}

pub(super) fn decode_item_texts(
    bytes: &[u8],
) -> Result<(ItemTextCatalog, Vec<String>), ItemCodecError> {
    decode_item_texts_for_bases(bytes, &[0, 200, 400, 600])
}

pub(super) fn decode_item_texts_for_bases(
    bytes: &[u8],
    bases: &[i16],
) -> Result<(ItemTextCatalog, Vec<String>), ItemCodecError> {
    let entries = parse_resource_entries_preserving_duplicates(bytes)?;
    let mut texts = BTreeMap::<i16, [String; 3]>::new();
    let mut warnings = Vec::new();
    for base in bases.iter().copied() {
        for field in 0..3 {
            let resource_id = base + field;
            let entry = unique_family(&entries, resource_id)?
                .ok_or(ItemCodecError::MissingTextFamily(resource_id))?;
            let (strings, complete) = decode_available_string_list_payload(&entry.data);
            if !complete {
                warnings.push(format!(
                    "STR# {resource_id} ended before its declared string count; available strings were retained"
                ));
            }
            for (index, text) in strings
                .into_iter()
                .take(SCENARIO_ITEM_DEFINITIONS)
                .enumerate()
            {
                let item_id = i32::from(base) + index as i32;
                if (1..1000).contains(&item_id) {
                    texts.entry(item_id as i16).or_default()[field as usize] = text;
                }
            }
        }
    }
    Ok((texts, warnings))
}

pub(super) fn decode_available_string_list_payload(bytes: &[u8]) -> (Vec<String>, bool) {
    let rows = ItemTextRows::parse(bytes);
    (
        rows.strings.iter().map(|row| decode_text(row)).collect(),
        rows.complete,
    )
}

#[cfg(test)]
pub(super) fn encode_item_text_list(
    strings: &[String],
    field: i16,
) -> Result<Vec<u8>, ItemCodecError> {
    let mut rows = ItemTextRows::empty(0);
    for (record, value) in strings.iter().enumerate() {
        rows.strings
            .push(rows::encode_text(value, 800 + record as i16, field as u8)?);
    }
    rows.count = rows.strings.len() as u16;
    Ok(rows.encode())
}

pub(super) fn item_text_resource_name(field: i16) -> &'static str {
    match field {
        0 => "Item Unidentified Names",
        1 => "Item Names",
        _ => "Item Descriptions",
    }
}

#[cfg(test)]
#[path = "classic_item_text_tests.rs"]
mod tests;
#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ItemTextFeedback {
    pub field: &'static str,
    pub byte_count: Option<usize>,
    pub error: Option<String>,
}

pub fn inspect_item_text(definition: &crate::model::ItemRuleDefinition) -> Vec<ItemTextFeedback> {
    [
        ("unidentifiedName", definition.unidentified_name.as_str()),
        ("name", definition.name.as_str()),
        ("description", definition.description.as_str()),
    ]
    .into_iter()
    .enumerate()
    .map(|(index, (field, value))| {
        let encoded = rows::encode_text(value, definition.classic_id, index as u8);
        ItemTextFeedback {
            field,
            byte_count: encoded.as_ref().ok().map(Vec::len),
            error: encoded.err().map(|error| error.to_string()),
        }
    })
    .collect()
}

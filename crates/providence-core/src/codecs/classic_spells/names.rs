use super::{
    contracts::*,
    identity::{scenario_spell_classic_id, validate_spell},
};
use crate::{
    codecs::{
        ResourceEntry, empty_resource_fork, merge_resource_entries_preserving_unowned_duplicates,
        parse_resource_entries_preserving_duplicates,
    },
    model::{BlobId, SourcedSpellDefinition, SpellDefinition},
};

pub fn hydrate_standard_spell_names(
    spells: &mut [SourcedSpellDefinition],
    bytes: &[u8],
    source_blob: BlobId,
) -> Result<(), SpellCodecError> {
    let entries = parse_resource_entries_preserving_duplicates(bytes)?;
    for class in 1..=STANDARD_SPELL_CLASSES {
        for level_index in 0..7usize {
            let resource_id = (class * 1000 + level_index) as i16;
            let matches = entries
                .iter()
                .filter(|entry| entry.resource_type == *b"STR#" && entry.id == resource_id)
                .collect::<Vec<_>>();
            let entry = match matches.as_slice() {
                [] => return Err(SpellCodecError::MissingStandardNameResource(resource_id)),
                [entry] => *entry,
                _ => return Err(SpellCodecError::DuplicateStandardNameResource(resource_id)),
            };
            let (names, complete) = super::string_list::decode(&entry.data);
            if !complete {
                return Err(SpellCodecError::TruncatedStandardNameResource(resource_id));
            }
            if names.len() > SPELL_NAMES_PER_RESOURCE {
                return Err(SpellCodecError::TooManyStandardNames {
                    resource_id,
                    actual: names.len(),
                });
            }
            for (slot_index, name) in names.into_iter().enumerate() {
                let record_index = (class - 1) * SPELLS_PER_CLASS
                    + level_index * SPELL_NAMES_PER_RESOURCE
                    + slot_index;
                if let Some(spell) = spells
                    .iter_mut()
                    .find(|spell| usize::from(spell.definition.record_index) == record_index)
                    && !name.is_empty()
                {
                    spell.definition.name = name;
                }
            }
        }
    }
    for spell in spells {
        spell.text_source_blob = Some(source_blob.clone());
    }
    Ok(())
}

pub fn hydrate_scenario_spell_names(
    spells: &mut [SourcedSpellDefinition],
    bytes: &[u8],
    source_blob: BlobId,
) -> Result<Vec<String>, SpellCodecError> {
    let entries = parse_resource_entries_preserving_duplicates(bytes)?;
    let mut warnings = Vec::new();
    let mut found = false;
    for level_index in 0..7usize {
        let resource_id = SPELL_NAME_RESOURCE_MIN_ID + level_index as i16;
        let matches = entries
            .iter()
            .filter(|entry| entry.resource_type == *b"STR#" && entry.id == resource_id)
            .collect::<Vec<_>>();
        if matches.len() > 1 {
            return Err(SpellCodecError::DuplicateScenarioNameResource(resource_id));
        }
        let Some(entry) = matches.first().copied() else {
            continue;
        };
        found = true;
        let (names, complete) = super::string_list::decode(&entry.data);
        if !complete {
            warnings.push(format!(
                "STR# {resource_id} ended before its declared string count; available names were retained"
            ));
        }
        for (slot_index, name) in names.into_iter().take(SPELL_NAMES_PER_RESOURCE).enumerate() {
            if name.is_empty() {
                continue;
            }
            let record_index = level_index * SPELL_NAMES_PER_RESOURCE + slot_index;
            if let Some(spell) = spells
                .iter_mut()
                .find(|spell| usize::from(spell.definition.record_index) == record_index)
            {
                spell.definition.name = name;
            }
        }
    }
    if found {
        for spell in spells {
            spell.text_source_blob = Some(source_blob.clone());
        }
    } else {
        warnings.push("Data Spell name resource contains no STR# 5000 through 5006".into());
    }
    Ok(warnings)
}

fn spell_names_by_record(
    spells: &[SourcedSpellDefinition],
) -> Result<std::collections::BTreeMap<u16, &SourcedSpellDefinition>, SpellCodecError> {
    let mut by_record = std::collections::BTreeMap::new();
    for spell in spells {
        validate_spell(&spell.definition, scenario_spell_classic_id)?;
        if by_record
            .insert(spell.definition.record_index, spell)
            .is_some()
        {
            return Err(SpellCodecError::DuplicateRecordIndex(
                spell.definition.record_index,
            ));
        }
    }
    Ok(by_record)
}

pub fn encode_scenario_spell_name_resources(
    spells: &[SourcedSpellDefinition],
    compatibility_source: Option<&[u8]>,
) -> Result<Vec<u8>, SpellCodecError> {
    let baseline = compatibility_source
        .map(ToOwned::to_owned)
        .unwrap_or_else(empty_resource_fork);
    let entries = parse_resource_entries_preserving_duplicates(&baseline)?;
    let by_record = spell_names_by_record(spells)?;
    let mut updates = Vec::new();
    for level_index in 0..7usize {
        let resource_id = SPELL_NAME_RESOURCE_MIN_ID + level_index as i16;
        let matches = entries
            .iter()
            .filter(|entry| entry.resource_type == *b"STR#" && entry.id == resource_id)
            .collect::<Vec<_>>();
        if matches.len() > 1 {
            return Err(SpellCodecError::DuplicateScenarioNameResource(resource_id));
        }
        let existing = matches.first().copied();
        let mut names = existing
            .map(|entry| super::string_list::decode(&entry.data).0)
            .unwrap_or_default();
        names.resize(SPELL_NAMES_PER_RESOURCE, String::new());
        names.truncate(SPELL_NAMES_PER_RESOURCE);
        let changed_slots = collect_authored_name_changes(
            &mut names,
            &by_record,
            level_index,
            compatibility_source.is_some(),
        );
        let changed =
            (compatibility_source.is_none() && existing.is_none()) || !changed_slots.is_empty();
        if !changed {
            continue;
        }
        updates.push(ResourceEntry {
            resource_type: *b"STR#",
            id: resource_id,
            name: existing
                .map(|entry| entry.name.clone())
                .unwrap_or_else(|| spell_name_resource_name(level_index).to_string()),
            attributes: existing.map(|entry| entry.attributes).unwrap_or(32),
            data: super::name_overlay::encode(
                &names,
                existing.map(|entry| entry.data.as_slice()),
                &changed_slots,
                level_index,
            )?,
        });
    }
    merge_resource_entries_preserving_unowned_duplicates(&baseline, updates).map_err(Into::into)
}

fn collect_authored_name_changes(
    names: &mut [String],
    spells: &std::collections::BTreeMap<u16, &SourcedSpellDefinition>,
    level_index: usize,
    imported: bool,
) -> Vec<usize> {
    let mut changed_slots = Vec::new();
    for (slot_index, current_name) in names.iter_mut().enumerate() {
        let record_index = (level_index * SPELL_NAMES_PER_RESOURCE + slot_index) as u16;
        let Some(spell) = spells.get(&record_index) else {
            continue;
        };
        if imported && !spell.name_authored {
            continue;
        }
        let name = spell.definition.name.clone();
        if *current_name != name {
            *current_name = name;
            changed_slots.push(slot_index);
        }
    }
    changed_slots
}

pub fn validate_scenario_spell_name(spell: &SpellDefinition) -> Result<(), SpellCodecError> {
    let bytes = crate::codecs::classic_text_resources::encode_mac_roman_text(&spell.name)
        .ok_or(SpellCodecError::UnsupportedNameCharacter(spell.classic_id))?;
    if bytes.len() > 255 {
        return Err(SpellCodecError::NameTooLong(spell.classic_id));
    }
    Ok(())
}

pub(super) fn spell_name_resource_name(level_index: usize) -> &'static str {
    [
        "Custom 1st",
        "Custom 2nd",
        "Custom 3rd",
        "Custom 4th",
        "Custom 5th",
        "Custom 6th",
        "Custom 7th",
    ][level_index]
}

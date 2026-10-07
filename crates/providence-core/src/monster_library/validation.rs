use super::contracts::*;
use crate::{
    codecs::validate_monster_record_shape,
    model::{MonsterRecord, NativeRecordId, StableId},
};
pub(super) fn custom_entry(
    identity: StableId,
    label: String,
    preferred_scenario_monster_id: NativeRecordId,
    template: MonsterRecord,
    description: String,
    origin: MonsterLibraryOrigin,
) -> Result<MonsterLibraryEntry, MonsterLibraryError> {
    let label = normalized_label(&label)?;
    let template = canonical_template(&identity, preferred_scenario_monster_id, template, &label)?;
    Ok(MonsterLibraryEntry {
        identity,
        ownership: MonsterLibraryOwnership::Custom,
        label,
        preferred_scenario_monster_id,
        template,
        description: validated_description(description)?,
        origin,
    })
}

pub(super) fn canonical_template(
    identity: &StableId,
    preferred_scenario_monster_id: NativeRecordId,
    mut template: MonsterRecord,
    label: &str,
) -> Result<MonsterRecord, MonsterLibraryError> {
    if preferred_scenario_monster_id.0 > i16::MAX as u32 {
        return Err(MonsterLibraryError::InvalidEntry {
            identity: identity.clone(),
            reason: "preferred Classic scenario ID exceeds signed-short addressing".into(),
        });
    }
    template.identity = StableId(format!("{}:template", identity.0));
    template.native_id = preferred_scenario_monster_id;
    template.name_id = preferred_scenario_monster_id.0 as u8;
    template.display_name = label.into();
    template.authored = true;
    validate_monster_record_shape(&template).map_err(|error| {
        MonsterLibraryError::InvalidEntry {
            identity: identity.clone(),
            reason: error.to_string(),
        }
    })?;
    Ok(template)
}

pub(super) fn validate_entry(entry: &MonsterLibraryEntry) -> Result<(), MonsterLibraryError> {
    let label = normalized_label(&entry.label)?;
    if label != entry.label {
        return Err(MonsterLibraryError::InvalidEntry {
            identity: entry.identity.clone(),
            reason: "label must already be trimmed".into(),
        });
    }
    if entry.preferred_scenario_monster_id.0 > i16::MAX as u32 {
        return Err(MonsterLibraryError::InvalidEntry {
            identity: entry.identity.clone(),
            reason: "preferred Classic scenario ID exceeds signed-short addressing".into(),
        });
    }
    validate_monster_record_shape(&entry.template).map_err(|error| {
        MonsterLibraryError::InvalidEntry {
            identity: entry.identity.clone(),
            reason: error.to_string(),
        }
    })?;
    validated_description(entry.description.clone())?;
    Ok(())
}

pub(super) fn normalized_label(label: &str) -> Result<String, MonsterLibraryError> {
    let label = label.trim();
    if label.is_empty() {
        return Err(MonsterLibraryError::InvalidCatalog(
            "monster library labels cannot be empty".into(),
        ));
    }
    if label.chars().count() > 40 {
        return Err(MonsterLibraryError::InvalidCatalog(
            "monster library labels cannot exceed the Classic 40-byte field".into(),
        ));
    }
    Ok(label.into())
}

pub(super) fn validated_description(description: String) -> Result<String, MonsterLibraryError> {
    if description.chars().count() > 255 {
        return Err(MonsterLibraryError::InvalidCatalog(
            "monster library descriptions cannot exceed the Classic Str255 field".into(),
        ));
    }
    Ok(description)
}

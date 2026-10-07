use super::contracts::{CLASSIC_RULE_RECORDS, RebuiltV3RuleCatalogError};
use crate::{
    codecs::{effective_caste_name, effective_race_name},
    model::{ProjectSnapshot, SourcedCasteRule, SourcedRaceRule, StableId},
};
use std::collections::BTreeSet;

pub(super) fn validate_name_catalog(
    snapshot: &ProjectSnapshot,
) -> Result<(), RebuiltV3RuleCatalogError> {
    let Some(catalog) = &snapshot.rule_names else {
        return Ok(());
    };
    let reason = if catalog.source.trim().is_empty() {
        Some("source attribution is empty")
    } else if !valid_blob(Some(&catalog.source_blob)) {
        Some("source blob identity is invalid")
    } else if catalog.race_resource_id != 129 || catalog.caste_resource_id != 131 {
        Some("resource identities must be STR# 129 and STR# 131")
    } else if catalog.race_names.len() < CLASSIC_RULE_RECORDS
        || catalog.caste_names.len() < CLASSIC_RULE_RECORDS
    {
        Some("both ordered name lists must cover all 30 Classic slots")
    } else {
        None
    };
    reason.map_or(Ok(()), |reason| {
        Err(RebuiltV3RuleCatalogError::InvalidNameCatalog(reason.into()))
    })
}

pub(super) fn validate_counts(snapshot: &ProjectSnapshot) -> Result<(), RebuiltV3RuleCatalogError> {
    if snapshot.race_rules.len() != CLASSIC_RULE_RECORDS {
        return Err(RebuiltV3RuleCatalogError::WrongRaceCount(
            snapshot.race_rules.len(),
        ));
    }
    if snapshot.caste_rules.len() != CLASSIC_RULE_RECORDS {
        return Err(RebuiltV3RuleCatalogError::WrongCasteCount(
            snapshot.caste_rules.len(),
        ));
    }
    Ok(())
}

pub(super) fn validate_races(
    snapshot: &ProjectSnapshot,
) -> Result<BTreeSet<StableId>, RebuiltV3RuleCatalogError> {
    let mut ids = BTreeSet::new();
    let mut classic_ids = BTreeSet::new();
    let mut functional = false;
    for sourced in &snapshot.race_rules {
        let rule = &sourced.definition;
        if !ids.insert(rule.id.clone()) {
            return Err(RebuiltV3RuleCatalogError::DuplicateRaceId(rule.id.clone()));
        }
        if !classic_ids.insert(rule.classic_id) {
            return Err(RebuiltV3RuleCatalogError::DuplicateRaceClassicId(
                rule.classic_id,
            ));
        }
        validate_race(sourced, snapshot)?;
        functional |= rule.maximum_age != 0
            || rule.base_movement != 0
            || rule.base_attacks != 0
            || rule.maximum_attacks != 0
            || !rule.eligible_caste_ids.is_empty()
            || any_nonzero(&rule.attribute_limits);
    }
    if !functional {
        return Err(RebuiltV3RuleCatalogError::SemanticallyEmptyRaces);
    }
    Ok(ids)
}

pub(super) fn validate_castes(
    snapshot: &ProjectSnapshot,
) -> Result<BTreeSet<StableId>, RebuiltV3RuleCatalogError> {
    let mut ids = BTreeSet::new();
    let mut classic_ids = BTreeSet::new();
    let mut functional = false;
    for sourced in &snapshot.caste_rules {
        let rule = &sourced.definition;
        if !ids.insert(rule.id.clone()) {
            return Err(RebuiltV3RuleCatalogError::DuplicateCasteId(rule.id.clone()));
        }
        if !classic_ids.insert(rule.classic_id) {
            return Err(RebuiltV3RuleCatalogError::DuplicateCasteClassicId(
                rule.classic_id,
            ));
        }
        validate_caste(sourced, snapshot)?;
        functional |= rule.caste_class != 0
            || rule.movement_bonus != 0
            || rule.maximum_attacks != 0
            || rule.start_money != 0
            || !rule.eligible_race_ids.is_empty()
            || any_nonzero(&rule.victory_thresholds)
            || any_nonzero(&rule.attribute_limits)
            || any_nonzero(&rule.stamina_dice)
            || any_nonzero(&rule.attack_levels);
    }
    if !functional {
        return Err(RebuiltV3RuleCatalogError::SemanticallyEmptyCastes);
    }
    Ok(ids)
}

fn validate_race(
    rule: &SourcedRaceRule,
    snapshot: &ProjectSnapshot,
) -> Result<(), RebuiltV3RuleCatalogError> {
    let definition = &rule.definition;
    let reason = if rule.source.trim().is_empty() || !valid_blob(rule.source_blob.as_ref()) {
        Some("source attribution is missing or invalid")
    } else if definition.classic_id == 0
        || usize::from(definition.classic_id) > CLASSIC_RULE_RECORDS
    {
        Some("Classic ID is outside 1..=30")
    } else if definition.id.0 != format!("classic.race.{}", definition.classic_id) {
        Some("stable ID does not match the Classic race identity")
    } else if effective_race_name(
        snapshot.rule_names.as_ref(),
        definition.classic_id,
        &definition.name,
    )
    .is_none()
    {
        Some("authoritative or authored name source is missing")
    } else if !unique_nonempty_ids(&definition.eligible_caste_ids) {
        Some("eligible caste IDs are empty or duplicated")
    } else if !length(&definition.hit_modifiers, 8)
        || !length(&definition.ability_bonuses, 14)
        || !length(&definition.save_bonuses, 8)
        || !length(&definition.attribute_bonuses, 6)
        || !length(&definition.attribute_limits, 12)
        || !length(&definition.condition_levels, 40)
        || !matrix_shape(&definition.age_ranges, 5, 2)
        || !matrix_shape(&definition.age_changes, 5, 15)
        || !length(&definition.item_category_masks, 2)
    {
        Some("one or more fixed Classic vectors have the wrong length")
    } else {
        None
    };
    reason.map_or(Ok(()), |reason| {
        Err(RebuiltV3RuleCatalogError::InvalidRace {
            id: definition.id.clone(),
            reason: reason.into(),
        })
    })
}

fn validate_caste(
    rule: &SourcedCasteRule,
    snapshot: &ProjectSnapshot,
) -> Result<(), RebuiltV3RuleCatalogError> {
    let definition = &rule.definition;
    let reason = if rule.source.trim().is_empty() || !valid_blob(rule.source_blob.as_ref()) {
        Some("source attribution is missing or invalid")
    } else if definition.classic_id == 0
        || usize::from(definition.classic_id) > CLASSIC_RULE_RECORDS
    {
        Some("Classic ID is outside 1..=30")
    } else if definition.id.0 != format!("classic.caste.{}", definition.classic_id) {
        Some("stable ID does not match the Classic caste identity")
    } else if effective_caste_name(
        snapshot.rule_names.as_ref(),
        definition.classic_id,
        &definition.name,
    )
    .is_none()
    {
        Some("authoritative or authored name source is missing")
    } else if !unique_nonempty_ids(&definition.eligible_race_ids)
        || definition
            .starting_item_ids
            .iter()
            .any(|id| id.0.is_empty())
    {
        Some("eligible race IDs are empty or duplicated, or a starting item ID is empty")
    } else if !length(&definition.initial_ability_values, 14)
        || !length(&definition.level_ability_dice, 14)
        || !length(&definition.victory_thresholds, 30)
        || !length(&definition.save_bonuses, 8)
        || !length(&definition.attribute_bonuses, 6)
        || !length(&definition.attribute_limits, 12)
        || !length(&definition.condition_levels, 40)
        || !length(&definition.stamina_dice, 2)
        || !length(&definition.strength_values, 2)
        || !length(&definition.dodge_values, 2)
        || !length(&definition.to_hit_values, 2)
        || !length(&definition.missile_values, 2)
        || !length(&definition.hand_to_hand_values, 2)
        || !matrix_shape(&definition.spellcaster_rows, 4, 3)
        || !length(&definition.attack_levels, 10)
        || !length(&definition.item_category_masks, 2)
    {
        Some("one or more fixed Classic vectors have the wrong length")
    } else {
        None
    };
    reason.map_or(Ok(()), |reason| {
        Err(RebuiltV3RuleCatalogError::InvalidCaste {
            id: definition.id.clone(),
            reason: reason.into(),
        })
    })
}

fn length(values: &[i32], expected: usize) -> bool {
    values.len() == expected
}

fn matrix_shape(values: &[Vec<i32>], rows: usize, columns: usize) -> bool {
    values.len() == rows && values.iter().all(|row| row.len() == columns)
}

fn unique_nonempty_ids(values: &[StableId]) -> bool {
    values.iter().all(|id| !id.0.is_empty())
        && values.iter().collect::<BTreeSet<_>>().len() == values.len()
}

fn any_nonzero(values: &[i32]) -> bool {
    values.iter().any(|value| *value != 0)
}

fn valid_blob(blob: Option<&crate::model::BlobId>) -> bool {
    blob.is_none_or(|blob| {
        blob.0.strip_prefix("sha256:").is_some_and(|digest| {
            digest.len() == 64 && digest.bytes().all(|byte| byte.is_ascii_hexdigit())
        })
    })
}

use std::collections::BTreeSet;

use serde::{Deserialize, Deserializer, Serialize, Serializer};

use crate::model::{ProjectSnapshot, StableId};

pub const STANDARD_ITEM_DEFINITIONS: usize = 799;
pub const SCENARIO_ITEM_DEFINITIONS: usize = 200;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RebuiltV3ItemDefinition {
    pub id: StableId,
    pub classic_id: i16,
    pub name: String,
    pub unidentified_name: String,
    pub description: String,
    pub icon_id: i32,
    pub item_type: i32,
    pub strength_bonus: i32,
    pub blunt: i32,
    pub hands: i32,
    pub luck_bonus: i32,
    pub movement_bonus: i32,
    pub armor_bonus: i32,
    pub magic_resistance_bonus: i32,
    pub damage_bonus: i32,
    pub spell_point_bonus: i32,
    pub sound_id: i32,
    pub weight: i32,
    pub cost: i32,
    pub initial_charges: i32,
    #[serde(with = "optional_stable_id_string")]
    pub cursed_item_id: Option<StableId>,
    pub magical: bool,
    pub item_category_mask_low: i32,
    pub item_category_mask_high: i32,
    pub race_restrictions: i32,
    pub caste_restrictions: i32,
    #[serde(with = "optional_stable_id_string")]
    pub specific_race_id: Option<StableId>,
    #[serde(with = "optional_stable_id_string")]
    pub specific_caste_id: Option<StableId>,
    pub race_class_only: i32,
    pub caste_class_only: i32,
    pub versus_small: i32,
    pub versus_large: i32,
    pub heat: i32,
    pub cold: i32,
    pub electric: i32,
    pub versus_undead: i32,
    pub versus_demon_devil: i32,
    pub versus_evil: i32,
    pub special: [i32; 5],
    pub weight_per_charge: i32,
    pub drop_on_empty: bool,
}

mod optional_stable_id_string {
    use super::*;

    pub fn serialize<S>(value: &Option<StableId>, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(value.as_ref().map_or("", |id| id.0.as_str()))
    }

    pub fn deserialize<'de, D>(deserializer: D) -> Result<Option<StableId>, D::Error>
    where
        D: Deserializer<'de>,
    {
        let value = String::deserialize(deserializer)?;
        Ok((!value.is_empty()).then_some(StableId(value)))
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RebuiltV3ItemCatalogError {
    WrongCount(usize),
    InvalidItem { id: StableId, reason: String },
    DuplicateId(StableId),
    DuplicateClassicId(i16),
    WrongScenarioCount(usize),
    InvalidScenarioItem { id: StableId, reason: String },
    MissingSelectedScenarioItem(i16),
}

impl std::fmt::Display for RebuiltV3ItemCatalogError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::WrongCount(actual) => write!(
                formatter,
                "item catalog has {actual} definitions; standard Data ID requires IDs 1 through 799"
            ),
            Self::InvalidItem { id, reason } => {
                write!(formatter, "item '{}' is invalid: {reason}", id.0)
            }
            Self::DuplicateId(id) => write!(formatter, "item ID '{}' is duplicated", id.0),
            Self::DuplicateClassicId(id) => write!(formatter, "Classic item ID {id} is duplicated"),
            Self::WrongScenarioCount(actual) => write!(
                formatter,
                "scenario item catalog has {actual} definitions; Data NI requires IDs 800 through 999"
            ),
            Self::InvalidScenarioItem { id, reason } => {
                write!(formatter, "scenario item '{}' is invalid: {reason}", id.0)
            }
            Self::MissingSelectedScenarioItem(id) => write!(
                formatter,
                "selected Classic scenario item {id} is unavailable or outside 800 through 999"
            ),
        }
    }
}

impl std::error::Error for RebuiltV3ItemCatalogError {}

pub fn project_rebuilt_v3_item_catalog(
    snapshot: &ProjectSnapshot,
) -> Result<Vec<RebuiltV3ItemDefinition>, RebuiltV3ItemCatalogError> {
    if snapshot.item_rules.len() != STANDARD_ITEM_DEFINITIONS {
        return Err(RebuiltV3ItemCatalogError::WrongCount(
            snapshot.item_rules.len(),
        ));
    }
    let mut ids = BTreeSet::new();
    let mut classic_ids = BTreeSet::new();
    let mut output = Vec::with_capacity(STANDARD_ITEM_DEFINITIONS);
    for sourced in &snapshot.item_rules {
        let item = &sourced.definition;
        if !ids.insert(item.id.clone()) {
            return Err(RebuiltV3ItemCatalogError::DuplicateId(item.id.clone()));
        }
        if !classic_ids.insert(item.classic_id) {
            return Err(RebuiltV3ItemCatalogError::DuplicateClassicId(
                item.classic_id,
            ));
        }
        let reason = if sourced.source.trim().is_empty()
            || !valid_blob(&sourced.source_blob)
            || !valid_blob(&sourced.text_source_blob)
        {
            Some("binary or text source attribution is invalid")
        } else if !(1..800).contains(&item.classic_id) {
            Some("Classic ID is outside 1..=799")
        } else if item.id.0 != format!("classic.item.{}", item.classic_id) {
            Some("stable ID does not match Classic item ID")
        } else {
            None
        };
        if let Some(reason) = reason {
            return Err(RebuiltV3ItemCatalogError::InvalidItem {
                id: item.id.clone(),
                reason: reason.into(),
            });
        }
        output.push(project_item(item, false));
    }
    output.sort_by_key(|item| item.classic_id);
    if output
        .iter()
        .enumerate()
        .any(|(index, item)| item.classic_id != index as i16 + 1)
    {
        return Err(RebuiltV3ItemCatalogError::WrongCount(output.len()));
    }
    Ok(output)
}

pub fn project_rebuilt_v3_scenario_item_catalog(
    snapshot: &ProjectSnapshot,
) -> Result<Vec<RebuiltV3ItemDefinition>, RebuiltV3ItemCatalogError> {
    if snapshot.scenario_item_rules.len() != SCENARIO_ITEM_DEFINITIONS {
        return Err(RebuiltV3ItemCatalogError::WrongScenarioCount(
            snapshot.scenario_item_rules.len(),
        ));
    }
    let mut records = BTreeSet::new();
    let mut ids = BTreeSet::new();
    let mut output = Vec::with_capacity(SCENARIO_ITEM_DEFINITIONS);
    for sourced in &snapshot.scenario_item_rules {
        let item = &sourced.definition;
        let expected_id = 800 + sourced.record_index as i16;
        let valid_text_blob = sourced.text_source_blob.as_ref().is_none_or(valid_blob);
        let reason = if !records.insert(sourced.record_index) {
            Some("record index is duplicated")
        } else if !ids.insert(item.id.clone()) {
            Some("stable ID is duplicated")
        } else if sourced.source.trim().is_empty()
            || !valid_blob(&sourced.source_blob)
            || !valid_text_blob
        {
            Some("binary or optional text source attribution is invalid")
        } else if usize::from(sourced.record_index) >= SCENARIO_ITEM_DEFINITIONS {
            Some("record index is outside 0..=199")
        } else if item.classic_id != expected_id
            || item.id.0 != format!("classic.item.{expected_id}")
        {
            Some("Classic and stable IDs do not match the Data NI row")
        } else {
            None
        };
        if let Some(reason) = reason {
            return Err(RebuiltV3ItemCatalogError::InvalidScenarioItem {
                id: item.id.clone(),
                reason: reason.into(),
            });
        }
        output.push(project_item(item, true));
    }
    output.sort_by_key(|item| item.classic_id);
    if output
        .iter()
        .enumerate()
        .any(|(index, item)| item.classic_id != 800 + index as i16)
    {
        return Err(RebuiltV3ItemCatalogError::WrongScenarioCount(output.len()));
    }
    Ok(output)
}

pub fn project_rebuilt_v3_combined_item_catalog(
    snapshot: &ProjectSnapshot,
) -> Result<Vec<RebuiltV3ItemDefinition>, RebuiltV3ItemCatalogError> {
    let mut items = project_rebuilt_v3_item_catalog(snapshot)?;
    items.extend(project_rebuilt_v3_scenario_item_catalog(snapshot)?);
    Ok(items)
}

pub fn project_rebuilt_v3_selected_scenario_item_catalog(
    snapshot: &ProjectSnapshot,
    selected_classic_ids: &BTreeSet<i16>,
) -> Result<Vec<RebuiltV3ItemDefinition>, RebuiltV3ItemCatalogError> {
    let mut output = Vec::with_capacity(selected_classic_ids.len());
    for classic_id in selected_classic_ids {
        let record_index = classic_id
            .checked_sub(800)
            .and_then(|index| u16::try_from(index).ok())
            .filter(|index| usize::from(*index) < SCENARIO_ITEM_DEFINITIONS)
            .ok_or(RebuiltV3ItemCatalogError::MissingSelectedScenarioItem(
                *classic_id,
            ))?;
        let mut candidates = snapshot
            .scenario_item_rules
            .iter()
            .filter(|item| item.record_index == record_index);
        let sourced =
            candidates
                .next()
                .ok_or(RebuiltV3ItemCatalogError::MissingSelectedScenarioItem(
                    *classic_id,
                ))?;
        if candidates.next().is_some() {
            return Err(RebuiltV3ItemCatalogError::InvalidScenarioItem {
                id: sourced.definition.id.clone(),
                reason: "record index is duplicated".into(),
            });
        }
        let item = &sourced.definition;
        let valid_text_blob = sourced.text_source_blob.as_ref().is_none_or(valid_blob);
        let reason = if sourced.source.trim().is_empty()
            || !valid_blob(&sourced.source_blob)
            || !valid_text_blob
        {
            Some("binary or optional text source attribution is invalid")
        } else if item.classic_id != *classic_id
            || item.id.0 != format!("classic.item.{classic_id}")
        {
            Some("Classic and stable IDs do not match the selected Data NI row")
        } else {
            None
        };
        if let Some(reason) = reason {
            return Err(RebuiltV3ItemCatalogError::InvalidScenarioItem {
                id: item.id.clone(),
                reason: reason.into(),
            });
        }
        output.push(project_item(item, true));
    }
    Ok(output)
}

fn project_item(
    item: &crate::model::ItemRuleDefinition,
    scenario: bool,
) -> RebuiltV3ItemDefinition {
    let identified_name = if item.name.trim().is_empty() {
        if scenario {
            "Unknown item".into()
        } else {
            format!("Unnamed Classic item {}", item.classic_id)
        }
    } else {
        item.name.clone()
    };
    let unidentified_name = if item.unidentified_name.trim().is_empty() {
        if scenario {
            "Unknown item".into()
        } else {
            format!("Unidentified item {}", item.classic_id)
        }
    } else {
        item.unidentified_name.clone()
    };
    RebuiltV3ItemDefinition {
        id: item.id.clone(),
        classic_id: item.classic_id,
        name: identified_name,
        unidentified_name,
        description: item.description.clone(),
        icon_id: item.icon_id,
        item_type: item.item_type,
        strength_bonus: item.strength_bonus,
        blunt: item.blunt,
        hands: item.hands,
        luck_bonus: item.luck_bonus,
        movement_bonus: item.movement_bonus,
        armor_bonus: item.armor_bonus,
        magic_resistance_bonus: item.magic_resistance_bonus,
        damage_bonus: item.damage_bonus,
        spell_point_bonus: item.spell_point_bonus,
        sound_id: item.sound_id,
        weight: item.weight,
        cost: item.cost,
        initial_charges: item.initial_charges,
        cursed_item_id: item.cursed_item_id.clone(),
        magical: item.magical,
        item_category_mask_low: item.item_category_mask_low,
        item_category_mask_high: item.item_category_mask_high,
        race_restrictions: item.race_restrictions,
        caste_restrictions: item.caste_restrictions,
        specific_race_id: item.specific_race_id.clone(),
        specific_caste_id: item.specific_caste_id.clone(),
        race_class_only: item.race_class_only,
        caste_class_only: item.caste_class_only,
        versus_small: item.versus_small,
        versus_large: item.versus_large,
        heat: item.heat,
        cold: item.cold,
        electric: item.electric,
        versus_undead: item.versus_undead,
        versus_demon_devil: item.versus_demon_devil,
        versus_evil: item.versus_evil,
        special: item.special,
        weight_per_charge: item.weight_per_charge,
        drop_on_empty: item.drop_on_empty,
    }
}

fn valid_blob(blob: &crate::model::BlobId) -> bool {
    blob.0.strip_prefix("sha256:").is_some_and(|digest| {
        digest.len() == 64 && digest.bytes().all(|byte| byte.is_ascii_hexdigit())
    })
}

#[cfg(test)]
pub(crate) fn item_rule_fixture(classic_id: i16) -> crate::model::SourcedItemRule {
    crate::model::SourcedItemRule {
        source: format!("controlled Data ID record {classic_id}"),
        source_blob: crate::model::BlobId(format!("sha256:{}", "a".repeat(64))),
        text_source_blob: crate::model::BlobId(format!("sha256:{}", "b".repeat(64))),
        definition: crate::model::ItemRuleDefinition {
            id: StableId(format!("classic.item.{classic_id}")),
            classic_id,
            name: format!("Item {classic_id}"),
            unidentified_name: format!("Unknown item {classic_id}"),
            description: format!("Description {classic_id}"),
            icon_id: 1,
            item_type: 2,
            strength_bonus: 3,
            blunt: 0,
            hands: 1,
            luck_bonus: 0,
            movement_bonus: 0,
            armor_bonus: 0,
            magic_resistance_bonus: 0,
            damage_bonus: 4,
            spell_point_bonus: 0,
            sound_id: 7,
            weight: 2,
            cost: 10,
            initial_charges: 0,
            cursed_item_id: None,
            magical: false,
            item_category_mask_low: 1,
            item_category_mask_high: 0,
            race_restrictions: 0,
            caste_restrictions: 0,
            specific_race_id: None,
            specific_caste_id: None,
            race_class_only: 0,
            caste_class_only: 0,
            versus_small: 0,
            versus_large: 0,
            heat: 0,
            cold: 0,
            electric: 0,
            versus_undead: 0,
            versus_demon_devil: 0,
            versus_evil: 0,
            special: [0; 5],
            weight_per_charge: 0,
            drop_on_empty: false,
        },
    }
}

#[cfg(test)]
pub(crate) fn scenario_item_rule_fixture(
    record_index: u16,
) -> crate::model::SourcedScenarioItemRule {
    crate::model::SourcedScenarioItemRule {
        record_index,
        source: format!("controlled Data NI record {record_index}"),
        source_blob: crate::model::BlobId(format!("sha256:{}", "c".repeat(64))),
        text_source_blob: None,
        definition: item_rule_fixture(800 + record_index as i16).definition,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn complete_item_snapshot() -> ProjectSnapshot {
        let mut snapshot = ProjectSnapshot::new_authored(StableId("items".into()));
        snapshot.item_rules = (1..=STANDARD_ITEM_DEFINITIONS as i16)
            .map(item_rule_fixture)
            .rev()
            .collect();
        snapshot
    }

    #[test]
    fn complete_standard_catalog_projects_all_ids_deterministically() {
        let snapshot = complete_item_snapshot();
        let first = project_rebuilt_v3_item_catalog(&snapshot).expect("project items");
        let second = project_rebuilt_v3_item_catalog(&snapshot).expect("repeat projection");

        assert_eq!(first, second);
        assert_eq!(first.len(), 799);
        assert_eq!(first[0].id.0, "classic.item.1");
        assert_eq!(first[0].name, "Item 1");
        assert_eq!(first[798].classic_id, 799);
        let reopened: Vec<RebuiltV3ItemDefinition> =
            serde_json::from_str(&serde_json::to_string(&first).unwrap()).unwrap();
        assert_eq!(reopened, first);
    }

    #[test]
    fn catalog_rejects_missing_and_misaligned_classic_ids() {
        let mut snapshot = complete_item_snapshot();
        snapshot.item_rules.pop();
        assert_eq!(
            project_rebuilt_v3_item_catalog(&snapshot),
            Err(RebuiltV3ItemCatalogError::WrongCount(798))
        );

        snapshot.item_rules.push(item_rule_fixture(800));
        assert!(matches!(
            project_rebuilt_v3_item_catalog(&snapshot),
            Err(RebuiltV3ItemCatalogError::InvalidItem { .. })
        ));
    }

    #[test]
    fn combined_catalog_appends_all_scenario_rows_with_explicit_fallback_names() {
        let mut snapshot = complete_item_snapshot();
        snapshot.scenario_item_rules = (0..200).map(scenario_item_rule_fixture).collect();
        snapshot.scenario_item_rules[0].definition.name.clear();
        snapshot.scenario_item_rules[0]
            .definition
            .unidentified_name
            .clear();

        let projection =
            project_rebuilt_v3_combined_item_catalog(&snapshot).expect("combined catalog");

        assert_eq!(projection.len(), 999);
        assert_eq!(projection[799].classic_id, 800);
        assert_eq!(projection[799].name, "Unknown item");
        assert_eq!(projection[998].classic_id, 999);
    }
}

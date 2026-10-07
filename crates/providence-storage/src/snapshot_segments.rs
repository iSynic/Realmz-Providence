//! The portable segment table owns field names and typed comparisons, not core semantics.

use crate::StoreError;
use providence_core::model::ProjectSnapshot;
use serde::{Serialize, de::DeserializeOwned};

fn decode<T: DeserializeOwned>(name: &str, bytes: &[u8]) -> Result<T, StoreError> {
    serde_json::from_slice(bytes).map_err(|error| {
        StoreError::InvalidPortableSnapshot(format!("segment {name} is not valid JSON: {error}"))
    })
}

fn matches<T: DeserializeOwned + PartialEq>(
    bytes: &[u8],
    expected: &T,
) -> Result<bool, StoreError> {
    Ok(serde_json::from_slice::<T>(bytes)? == *expected)
}

fn changed_bytes<T: Serialize + PartialEq>(
    value: &T,
    base: &T,
) -> Result<Option<Vec<u8>>, StoreError> {
    if value == base {
        return Ok(None);
    }
    // Match full-checkpoint object-key ordering without a whole-snapshot JSON round trip.
    Ok(Some(serde_json::to_vec(&serde_json::to_value(value)?)?))
}

macro_rules! snapshot_segments {
    ($($name:literal => $field:ident),+ $(,)?) => {
        pub(super) const SNAPSHOT_SEGMENTS: &[&str] = &[$($name),+];

        pub(super) fn replace_segment(
            snapshot: &mut ProjectSnapshot, name: &str, bytes: &[u8],
        ) -> Result<(), StoreError> {
            match name {
                $($name => snapshot.$field = decode(name, bytes)?,)+
                _ => return Err(unknown_segment(name)),
            }
            Ok(())
        }

        pub(super) fn segment_matches(
            name: &str, bytes: &[u8], snapshot: &ProjectSnapshot,
        ) -> Result<bool, StoreError> {
            match name {
                $($name => matches(bytes, &snapshot.$field),)+
                _ => Err(unknown_segment(name)),
            }
        }

        pub(super) fn changed_segment_bytes(
            name: &str, snapshot: &ProjectSnapshot, base: &ProjectSnapshot,
        ) -> Result<Option<Vec<u8>>, StoreError> {
            match name {
                $($name => changed_bytes(&snapshot.$field, &base.$field),)+
                _ => Err(unknown_segment(name)),
            }
        }
    };
}

fn unknown_segment(name: &str) -> StoreError {
    StoreError::InvalidPortableSnapshot(format!("unknown segment {name}"))
}

snapshot_segments! {
    "formatVersion" => format_version, "projectId" => project_id, "origin" => origin,
    "classicSources" => classic_sources, "campaign" => campaign, "startLocation" => start_location,
    "importInterpretationVersion" => import_interpretation_version,
    "classicRuleSelection" => classic_rule_selection,
    "startupAuthoring" => startup_authoring,
    "terrainCatalog" => terrain_catalog, "landlookCatalogs" => landlook_catalogs, "assets" => assets,
    "terrainMappings" => terrain_mappings,
    "classicResourceRemovals" => classic_resource_removals, "extraCodes" => extra_codes,
    "extraActionPoints" => extra_action_points, "raceRules" => race_rules, "casteRules" => caste_rules,
    "ruleNames" => rule_names, "itemRules" => item_rules, "scenarioItemRules" => scenario_item_rules,
    "standardSpells" => standard_spells, "scenarioSpells" => scenario_spells,
    "scenarioApplication" => scenario_application, "messages" => messages, "optionLabels" => option_labels,
    "questLabels" => quest_labels, "scriptDescriptors" => script_descriptors,
    "messageReferences" => message_references, "world" => world,
    "playerMapNames" => player_map_names, "simpleEncounters" => simple_encounters,
    "complexEncounters" => complex_encounters, "rogueEncounters" => rogue_encounters,
    "timedEncounters" => timed_encounters, "monsterSets" => monster_sets,
    "monsterDescriptions" => monster_descriptions, "battles" => battles,
    "treasures" => treasures, "shops" => shops,
}

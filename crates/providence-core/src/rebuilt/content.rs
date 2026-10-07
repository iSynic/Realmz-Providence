use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use super::{
    RebuiltV3BattleDefinition, RebuiltV3Campaign, RebuiltV3ComplexEncounter,
    RebuiltV3ItemDefinition, RebuiltV3Message, RebuiltV3MonsterDefinition,
    RebuiltV3MonsterDescription, RebuiltV3MonsterSetDefinition, RebuiltV3RogueEncounter,
    RebuiltV3RuleCatalog, RebuiltV3SimpleEncounter, RebuiltV3SpellDefinition,
    RebuiltV3TimedEncounter, RebuiltV3TreasureDefinition, project_rebuilt_v3_battles,
    project_rebuilt_v3_campaign, project_rebuilt_v3_combined_item_catalog,
    project_rebuilt_v3_combined_spell_catalog, project_rebuilt_v3_complex_encounters,
    project_rebuilt_v3_monster_catalog, project_rebuilt_v3_option_labels,
    project_rebuilt_v3_rogue_encounters, project_rebuilt_v3_rule_catalog,
    project_rebuilt_v3_scenario, project_rebuilt_v3_simple_encounters,
    project_rebuilt_v3_timed_encounters, project_rebuilt_v3_treasures,
};
use crate::model::{CasteRuleDefinition, ProjectSnapshot, RaceRuleDefinition};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RebuiltV3ContentDocument {
    pub kind: String,
    pub schema_version: u8,
    pub campaign: RebuiltV3Campaign,
    pub messages: Vec<RebuiltV3Message>,
    pub option_labels: Vec<super::RebuiltV3OptionLabel>,
    pub battles: Vec<RebuiltV3BattleDefinition>,
    pub monsters: Vec<RebuiltV3MonsterDefinition>,
    pub monster_sets: Vec<RebuiltV3MonsterSetDefinition>,
    pub monster_descriptions: Vec<RebuiltV3MonsterDescription>,
    pub items: Vec<RebuiltV3ItemDefinition>,
    // Legacy schema field: retained on package reads, never a runtime text authority.
    pub item_texts: Vec<serde_json::Value>,
    pub treasures: Vec<RebuiltV3TreasureDefinition>,
    pub shops: Vec<super::RebuiltV3ShopDefinition>,
    pub simple_encounters: Vec<RebuiltV3SimpleEncounter>,
    pub complex_encounters: Vec<RebuiltV3ComplexEncounter>,
    pub thief_encounters: Vec<RebuiltV3RogueEncounter>,
    pub timed_encounters: Vec<RebuiltV3TimedEncounter>,
    pub spells: Vec<RebuiltV3SpellDefinition>,
    pub races: Vec<RaceRuleDefinition>,
    pub castes: Vec<CasteRuleDefinition>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RebuiltV3ContentArtifact {
    pub document: RebuiltV3ContentDocument,
    pub canonical_json: Vec<u8>,
    pub sha256: String,
    pub monster_omissions: Vec<super::RebuiltV3MonsterOmission>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RebuiltV3ContentError {
    MissingCampaign,
    InvalidSection {
        section: &'static str,
        reason: String,
    },
    Serialization(String),
}

impl std::fmt::Display for RebuiltV3ContentError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::MissingCampaign => write!(
                formatter,
                "content.json requires canonical campaign metadata"
            ),
            Self::InvalidSection { section, reason } => {
                write!(
                    formatter,
                    "content.json {section} projection failed: {reason}"
                )
            }
            Self::Serialization(reason) => {
                write!(formatter, "content.json serialization failed: {reason}")
            }
        }
    }
}

impl std::error::Error for RebuiltV3ContentError {}

pub fn project_rebuilt_v3_content(
    snapshot: &ProjectSnapshot,
) -> Result<RebuiltV3ContentDocument, RebuiltV3ContentError> {
    let campaign =
        project_rebuilt_v3_campaign(snapshot).ok_or(RebuiltV3ContentError::MissingCampaign)?;
    let scenario = project_rebuilt_v3_scenario(snapshot)
        .map_err(|error| invalid_section("scenario", error))?;
    let option_labels = project_rebuilt_v3_option_labels(snapshot)
        .map_err(|error| invalid_section("optionLabels", error))?;
    validate_choice_prompt_references(snapshot, &scenario, &option_labels)?;
    let shop_ids = snapshot.shops.iter().map(|shop| shop.native_id.0).collect();
    validate_shop_references(&scenario, &shop_ids)?;

    let simple = project_rebuilt_v3_simple_encounters(snapshot)
        .map_err(|error| invalid_section("simpleEncounters", error))?;
    let complex = project_rebuilt_v3_complex_encounters(snapshot)
        .map_err(|error| invalid_section("complexEncounters", error))?;
    let thief_encounters = project_rebuilt_v3_rogue_encounters(snapshot)
        .map_err(|error| invalid_section("thiefEncounters", error))?;
    let timed = project_rebuilt_v3_timed_encounters(snapshot)
        .map_err(|error| invalid_section("timedEncounters", error))?;
    let RebuiltV3RuleCatalog { races, castes } = project_rebuilt_v3_rule_catalog(snapshot)
        .map_err(|error| invalid_section("rules", error))?;
    let items = project_rebuilt_v3_combined_item_catalog(snapshot)
        .map_err(|error| invalid_section("items", error))?;
    let item_ids = items.iter().map(|item| item.id.clone()).collect();
    let treasures = project_rebuilt_v3_treasures(snapshot, &item_ids)
        .map_err(|error| invalid_section("treasures", error))?;
    validate_treasure_references(&scenario, &treasures)?;
    let shops = super::project_rebuilt_v3_shops(snapshot, &item_ids)
        .map_err(|error| invalid_section("shops", error))?;
    let spells = project_rebuilt_v3_combined_spell_catalog(snapshot)
        .map_err(|error| invalid_section("spells", error))?;
    let monsters = project_rebuilt_v3_monster_catalog(snapshot)
        .map_err(|error| invalid_section("monsters", error))?;
    let battles =
        project_rebuilt_v3_battles(snapshot).map_err(|error| invalid_section("battles", error))?;

    Ok(RebuiltV3ContentDocument {
        kind: "realmz2.content".into(),
        schema_version: 3,
        campaign,
        messages: simple.messages,
        option_labels,
        battles,
        monsters: monsters.monsters,
        monster_sets: monsters.monster_sets,
        monster_descriptions: monsters.monster_descriptions,
        items,
        item_texts: Vec::new(),
        treasures,
        shops,
        simple_encounters: simple.simple_encounters,
        complex_encounters: complex.complex_encounters,
        thief_encounters,
        timed_encounters: timed.timed_encounters,
        spells,
        races,
        castes,
    })
}

pub fn compile_rebuilt_v3_content(
    snapshot: &ProjectSnapshot,
) -> Result<RebuiltV3ContentArtifact, RebuiltV3ContentError> {
    let document = project_rebuilt_v3_content(snapshot)?;
    compile_content_artifact(document, Vec::new())
}

pub fn compile_rebuilt_v3_reachable_content(
    snapshot: &ProjectSnapshot,
    runtime: &super::RebuiltV3ReachableRuntimeSelection,
) -> Result<RebuiltV3ContentArtifact, RebuiltV3ContentError> {
    let campaign =
        project_rebuilt_v3_campaign(snapshot).ok_or(RebuiltV3ContentError::MissingCampaign)?;
    let option_labels = project_rebuilt_v3_option_labels(snapshot)
        .map_err(|error| invalid_section("optionLabels", error))?;
    let RebuiltV3RuleCatalog { races, castes } = project_rebuilt_v3_rule_catalog(snapshot)
        .map_err(|error| invalid_section("rules", error))?;
    let mut items = super::project_rebuilt_v3_item_catalog(snapshot)
        .map_err(|error| invalid_section("items", error))?;
    if !snapshot.scenario_item_rules.is_empty() {
        items.extend(
            super::project_rebuilt_v3_scenario_item_catalog(snapshot)
                .map_err(|error| invalid_section("items", error))?,
        );
    }
    let spells = super::project_rebuilt_v3_combined_spell_catalog(snapshot)
        .map_err(|error| invalid_section("spells", error))?;
    let (monsters, monster_omissions) =
        super::monsters::project_rebuilt_v3_package_monster_catalog(
            snapshot,
            &runtime
                .combat
                .reachable_monster_ids
                .iter()
                .copied()
                .collect(),
        )
        .map_err(|error| invalid_section("monsters", error))?;
    let thief_encounters = project_rebuilt_v3_rogue_encounters(snapshot)
        .map_err(|error| invalid_section("thiefEncounters", error))?;
    let document = RebuiltV3ContentDocument {
        kind: "realmz2.content".into(),
        schema_version: 3,
        campaign,
        messages: super::project_rebuilt_v3_messages(snapshot)
            .map_err(|error| invalid_section("messages", error))?,
        option_labels,
        battles: runtime.combat.battles.clone(),
        monsters: monsters.monsters,
        monster_sets: monsters.monster_sets,
        monster_descriptions: monsters.monster_descriptions,
        items,
        item_texts: Vec::new(),
        treasures: runtime.treasures.clone(),
        shops: runtime.shops.clone(),
        simple_encounters: runtime.simple_encounters.clone(),
        complex_encounters: runtime.complex_encounters.clone(),
        thief_encounters,
        timed_encounters: runtime.timed_encounters.clone(),
        spells,
        races,
        castes,
    };
    compile_content_artifact(document, monster_omissions)
}

pub(crate) fn compile_content_artifact(
    document: RebuiltV3ContentDocument,
    monster_omissions: Vec<super::monsters::RebuiltV3MonsterOmission>,
) -> Result<RebuiltV3ContentArtifact, RebuiltV3ContentError> {
    let canonical_json = super::canonical::canonical_json_bytes(&document)
        .map_err(|error| RebuiltV3ContentError::Serialization(error.to_string()))?;
    let mut hasher = Sha256::new();
    hasher.update(&canonical_json);
    let sha256 = format!("{:x}", hasher.finalize());
    Ok(RebuiltV3ContentArtifact {
        document,
        canonical_json,
        sha256,
        monster_omissions,
    })
}

fn invalid_section(section: &'static str, error: impl std::fmt::Display) -> RebuiltV3ContentError {
    RebuiltV3ContentError::InvalidSection {
        section,
        reason: error.to_string(),
    }
}

fn validate_choice_prompt_references(
    snapshot: &ProjectSnapshot,
    scenario: &super::RebuiltV3ScenarioDocument,
    option_labels: &[super::RebuiltV3OptionLabel],
) -> Result<(), RebuiltV3ContentError> {
    let (section, ids): (&'static str, std::collections::BTreeSet<u32>) =
        if option_labels.is_empty() {
            (
                "messages",
                snapshot
                    .messages
                    .iter()
                    .map(|message| message.native_id.0)
                    .collect(),
            )
        } else {
            (
                "optionLabels",
                option_labels.iter().map(|label| label.id).collect(),
            )
        };
    for program in &scenario.programs {
        for instruction in &program.instructions {
            if instruction.opcode != 3 {
                continue;
            }
            let Some(values) = instruction
                .extra_code
                .as_ref()
                .filter(|values| values.len() >= 5)
            else {
                continue;
            };
            for raw_target in [values[3], values[4]] {
                if raw_target == 0 {
                    continue;
                }
                let target = u32::from(raw_target.unsigned_abs());
                if !ids.contains(&target) {
                    return Err(RebuiltV3ContentError::InvalidSection {
                        section,
                        reason: format!(
                            "scenario program '{}' opcode 3 targets missing {} {}",
                            program.id.0,
                            if section == "optionLabels" {
                                "Option Label"
                            } else {
                                "message"
                            },
                            target
                        ),
                    });
                }
            }
        }
    }
    Ok(())
}

fn validate_treasure_references(
    scenario: &super::RebuiltV3ScenarioDocument,
    treasures: &[RebuiltV3TreasureDefinition],
) -> Result<(), RebuiltV3ContentError> {
    let ids = treasures
        .iter()
        .map(|treasure| treasure.classic_id)
        .collect::<std::collections::BTreeSet<_>>();
    for program in &scenario.programs {
        for instruction in &program.instructions {
            let target = match instruction.opcode {
                10 => u32::try_from(instruction.id).ok(),
                48 => match instruction
                    .extra_code
                    .as_ref()
                    .and_then(|values| values.get(4))
                    .copied()
                {
                    Some(value) if value > 0 => u32::try_from(value).ok(),
                    _ => continue,
                },
                _ => continue,
            };
            if target.is_none() || target.is_some_and(|target| !ids.contains(&target)) {
                return Err(RebuiltV3ContentError::InvalidSection {
                    section: "treasures",
                    reason: format!(
                        "scenario program '{}' opcode {} targets missing Classic treasure {}",
                        program.id.0,
                        instruction.opcode,
                        target
                            .map_or_else(|| instruction.id.to_string(), |value| value.to_string())
                    ),
                });
            }
        }
    }
    Ok(())
}

fn validate_shop_references(
    scenario: &super::RebuiltV3ScenarioDocument,
    ids: &std::collections::BTreeSet<u32>,
) -> Result<(), RebuiltV3ContentError> {
    for program in &scenario.programs {
        for instruction in &program.instructions {
            let target = match instruction.opcode {
                6 => u32::from(instruction.id.unsigned_abs()),
                51 => instruction
                    .extra_code
                    .as_ref()
                    .and_then(|values| values.first())
                    .copied()
                    .unwrap_or(0)
                    .max(0) as u32,
                73 => u32::from(
                    instruction
                        .extra_code
                        .as_ref()
                        .and_then(|values| values.first())
                        .copied()
                        .unwrap_or(0)
                        .unsigned_abs(),
                ),
                _ => continue,
            };
            if !ids.contains(&target) {
                return Err(RebuiltV3ContentError::InvalidSection {
                    section: "shops",
                    reason: format!(
                        "scenario program '{}' opcode {} targets missing Classic shop {}",
                        program.id.0, instruction.opcode, target
                    ),
                });
            }
        }
    }
    Ok(())
}

#[cfg(test)]
#[path = "content_tests.rs"]
pub(crate) mod tests;

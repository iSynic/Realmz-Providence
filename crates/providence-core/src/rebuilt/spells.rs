use std::collections::BTreeSet;

use serde::{Deserialize, Serialize};

use crate::{
    codecs::{
        SCENARIO_SPELL_RECORDS, STANDARD_SPELL_RECORDS, scenario_spell_classic_id,
        standard_spell_classic_id,
    },
    model::{ProjectSnapshot, SourcedSpellDefinition, StableId},
};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RebuiltV3SpellDefinition {
    pub id: StableId,
    pub classic_id: i16,
    pub name: String,
    pub description: String,
    pub range_min: i8,
    pub range_max: i8,
    pub queue_icon: i8,
    pub to_hit_bonus: i8,
    pub save_bonus: i8,
    pub fixed_target_count: i8,
    pub can_rotate: bool,
    pub save_adjust: i8,
    pub cannot: i8,
    pub resistance_adjust: i8,
    pub cost: i8,
    pub damage_min: i8,
    pub damage_max: i8,
    pub power_damage_min: i8,
    pub power_damage_max: i8,
    pub duration_min: i8,
    pub duration_max: i8,
    pub power_duration_min: i8,
    pub power_duration_max: i8,
    pub look_start: i8,
    pub look_end: i8,
    pub sound_start: i8,
    pub sound_end: i8,
    pub target_type: i8,
    pub size: i8,
    pub special: u8,
    pub damage_type: i8,
    pub spell_class: u8,
    pub in_combat: bool,
    pub in_camp: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RebuiltV3SpellCatalogError {
    IncompleteCatalog {
        expected: usize,
        actual: usize,
    },
    DuplicateRecordIndex(u16),
    RecordIndexOutOfRange(u16),
    InvalidClassicId {
        record_index: u16,
        expected: i16,
        actual: i16,
    },
    InvalidIdentity {
        expected: StableId,
        actual: StableId,
    },
    BlankName(StableId),
    MissingSelectedScenarioSpell(i16),
}

impl std::fmt::Display for RebuiltV3SpellCatalogError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::IncompleteCatalog { expected, actual } => write!(
                formatter,
                "Rebuilt v3 requires {expected} spells in this catalog; found {actual}"
            ),
            Self::DuplicateRecordIndex(index) => {
                write!(formatter, "spell record index {index} is duplicated")
            }
            Self::RecordIndexOutOfRange(index) => {
                write!(
                    formatter,
                    "spell record index {index} is outside this catalog's range"
                )
            }
            Self::InvalidClassicId {
                record_index,
                expected,
                actual,
            } => write!(
                formatter,
                "spell record {record_index} must use Classic ID {expected}, not {actual}"
            ),
            Self::InvalidIdentity { expected, actual } => write!(
                formatter,
                "scenario spell identity '{}' must match '{}'",
                actual.0, expected.0
            ),
            Self::BlankName(identity) => {
                write!(
                    formatter,
                    "scenario spell '{}' has a blank name",
                    identity.0
                )
            }
            Self::MissingSelectedScenarioSpell(id) => write!(
                formatter,
                "selected Classic scenario spell {id} is unavailable or outside the Data Spell catalog"
            ),
        }
    }
}

impl std::error::Error for RebuiltV3SpellCatalogError {}

pub fn project_rebuilt_v3_spell_catalog(
    snapshot: &ProjectSnapshot,
) -> Result<Vec<RebuiltV3SpellDefinition>, RebuiltV3SpellCatalogError> {
    project_spell_rows(
        &snapshot.scenario_spells,
        SCENARIO_SPELL_RECORDS,
        scenario_spell_classic_id,
    )
}

pub fn project_rebuilt_v3_standard_spell_catalog(
    snapshot: &ProjectSnapshot,
) -> Result<Vec<RebuiltV3SpellDefinition>, RebuiltV3SpellCatalogError> {
    project_spell_rows(
        &snapshot.standard_spells,
        STANDARD_SPELL_RECORDS,
        standard_spell_classic_id,
    )
}

pub fn project_rebuilt_v3_combined_spell_catalog(
    snapshot: &ProjectSnapshot,
) -> Result<Vec<RebuiltV3SpellDefinition>, RebuiltV3SpellCatalogError> {
    let mut projected = project_rebuilt_v3_standard_spell_catalog(snapshot)?;
    if !snapshot.scenario_spells.is_empty() {
        projected.extend(project_rebuilt_v3_spell_catalog(snapshot)?);
    }
    Ok(projected)
}

pub fn project_rebuilt_v3_selected_scenario_spell_catalog(
    snapshot: &ProjectSnapshot,
    selected_classic_ids: &BTreeSet<i16>,
) -> Result<Vec<RebuiltV3SpellDefinition>, RebuiltV3SpellCatalogError> {
    let expected_rows = (0..SCENARIO_SPELL_RECORDS)
        .filter_map(|index| scenario_spell_classic_id(index as u16).map(|id| (id, index as u16)))
        .collect::<std::collections::BTreeMap<_, _>>();
    let mut projected = Vec::with_capacity(selected_classic_ids.len());
    for classic_id in selected_classic_ids {
        let record_index = expected_rows.get(classic_id).copied().ok_or(
            RebuiltV3SpellCatalogError::MissingSelectedScenarioSpell(*classic_id),
        )?;
        let mut candidates = snapshot
            .scenario_spells
            .iter()
            .filter(|spell| spell.definition.record_index == record_index);
        let spell =
            candidates
                .next()
                .ok_or(RebuiltV3SpellCatalogError::MissingSelectedScenarioSpell(
                    *classic_id,
                ))?;
        if candidates.next().is_some() {
            return Err(RebuiltV3SpellCatalogError::DuplicateRecordIndex(
                record_index,
            ));
        }
        projected.push(project_spell(spell, *classic_id)?);
    }
    Ok(projected)
}

fn project_spell_rows(
    spells: &[SourcedSpellDefinition],
    expected_records: usize,
    classic_id_for_record: fn(u16) -> Option<i16>,
) -> Result<Vec<RebuiltV3SpellDefinition>, RebuiltV3SpellCatalogError> {
    if spells.len() != expected_records {
        return Err(RebuiltV3SpellCatalogError::IncompleteCatalog {
            expected: expected_records,
            actual: spells.len(),
        });
    }

    let mut rows = spells.iter().collect::<Vec<_>>();
    rows.sort_by_key(|spell| spell.definition.record_index);
    let mut record_indexes = BTreeSet::new();
    let mut projected = Vec::with_capacity(expected_records);

    for spell in rows {
        let definition = &spell.definition;
        if !record_indexes.insert(definition.record_index) {
            return Err(RebuiltV3SpellCatalogError::DuplicateRecordIndex(
                definition.record_index,
            ));
        }
        let Some(expected_classic_id) = classic_id_for_record(definition.record_index) else {
            return Err(RebuiltV3SpellCatalogError::RecordIndexOutOfRange(
                definition.record_index,
            ));
        };
        if definition.classic_id != expected_classic_id {
            return Err(RebuiltV3SpellCatalogError::InvalidClassicId {
                record_index: definition.record_index,
                expected: expected_classic_id,
                actual: definition.classic_id,
            });
        }
        projected.push(project_spell(spell, expected_classic_id)?);
    }

    Ok(projected)
}

fn project_spell(
    spell: &SourcedSpellDefinition,
    expected_classic_id: i16,
) -> Result<RebuiltV3SpellDefinition, RebuiltV3SpellCatalogError> {
    let definition = &spell.definition;
    let expected_identity = StableId(format!("classic.spell.{expected_classic_id}"));
    if definition.classic_id != expected_classic_id {
        return Err(RebuiltV3SpellCatalogError::InvalidClassicId {
            record_index: definition.record_index,
            expected: expected_classic_id,
            actual: definition.classic_id,
        });
    }
    if definition.id != expected_identity {
        return Err(RebuiltV3SpellCatalogError::InvalidIdentity {
            expected: expected_identity,
            actual: definition.id.clone(),
        });
    }
    if definition.name.trim().is_empty() {
        return Err(RebuiltV3SpellCatalogError::BlankName(definition.id.clone()));
    }

    Ok(RebuiltV3SpellDefinition {
        id: definition.id.clone(),
        classic_id: definition.classic_id,
        name: definition.name.clone(),
        description: definition.description.clone(),
        range_min: definition.range_min as i8,
        range_max: definition.range_max as i8,
        queue_icon: definition.queue_icon as i8,
        to_hit_bonus: definition.to_hit_bonus,
        save_bonus: definition.save_bonus,
        fixed_target_count: definition.fixed_target_count as i8,
        can_rotate: definition.can_rotate != 0,
        save_adjust: definition.save_adjust,
        cannot: definition.cannot as i8,
        resistance_adjust: definition.resistance_adjust,
        cost: definition.cost as i8,
        damage_min: definition.damage_min as i8,
        damage_max: definition.damage_max as i8,
        power_damage_min: definition.power_damage_min as i8,
        power_damage_max: definition.power_damage_max as i8,
        duration_min: definition.duration_min as i8,
        duration_max: definition.duration_max as i8,
        power_duration_min: definition.power_duration_min as i8,
        power_duration_max: definition.power_duration_max as i8,
        look_start: definition.look_start as i8,
        look_end: definition.look_end as i8,
        sound_start: definition.sound_start as i8,
        sound_end: definition.sound_end as i8,
        target_type: definition.target_type as i8,
        size: definition.size as i8,
        special: definition.special,
        damage_type: definition.damage_type as i8,
        spell_class: definition.spell_class,
        in_combat: definition.in_combat,
        in_camp: definition.in_camp,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        codecs::{
            SCENARIO_SPELL_BYTES, STANDARD_SPELL_BYTES, decode_scenario_spells,
            decode_standard_spells,
        },
        model::ProjectSnapshot,
    };

    fn catalog_snapshot() -> ProjectSnapshot {
        let mut snapshot = ProjectSnapshot::new_authored(StableId("spell-catalog".into()));
        snapshot.scenario_spells =
            decode_scenario_spells(&vec![0; SCENARIO_SPELL_BYTES], None).spells;
        let definition = &mut snapshot.scenario_spells[4].definition;
        definition.name = "Moon Gate".into();
        definition.description = "Folds a narrow path through moonlit space.".into();
        definition.range_min = 241;
        definition.range_max = 9;
        definition.queue_icon = 12;
        definition.to_hit_bonus = -3;
        definition.save_bonus = 4;
        definition.fixed_target_count = 2;
        definition.can_rotate = 7;
        definition.save_adjust = -5;
        definition.cannot = 6;
        definition.resistance_adjust = -8;
        definition.cost = 17;
        definition.damage_min = 2;
        definition.damage_max = 11;
        definition.power_damage_min = 3;
        definition.power_damage_max = 12;
        definition.duration_min = 4;
        definition.duration_max = 13;
        definition.power_duration_min = 5;
        definition.power_duration_max = 14;
        definition.look_start = 21;
        definition.look_end = 22;
        definition.sound_start = 23;
        definition.sound_end = 24;
        definition.target_type = 25;
        definition.size = 26;
        definition.special = 27;
        definition.damage_type = 28;
        definition.spell_class = 5;
        definition.in_combat = true;
        definition.in_camp = false;
        snapshot
    }

    #[test]
    fn projection_matches_the_pinned_schema_v3_spell_shape() {
        let snapshot = catalog_snapshot();
        let projection = project_rebuilt_v3_spell_catalog(&snapshot).expect("projection");
        assert_eq!(projection.len(), SCENARIO_SPELL_RECORDS);
        let moon_gate = &projection[4];
        assert_eq!(moon_gate.id.0, "classic.spell.5105");
        assert_eq!(moon_gate.classic_id, 5105);
        assert_eq!(moon_gate.name, "Moon Gate");
        assert_eq!(moon_gate.range_min, -15);
        assert!(moon_gate.can_rotate);
        assert_eq!(moon_gate.resistance_adjust, -8);
        assert_eq!(moon_gate.spell_class, 5);
        assert!(moon_gate.in_combat);
        assert!(!moon_gate.in_camp);

        let encoded = serde_json::to_string(&projection).expect("serialize");
        assert_eq!(
            encoded,
            serde_json::to_string(&project_rebuilt_v3_spell_catalog(&snapshot).unwrap()).unwrap()
        );
        let value = serde_json::to_value(&projection).expect("schema shape");
        assert_eq!(value[4].as_object().expect("object").len(), 34);
        assert_eq!(value[4]["classicId"], 5105);
        assert_eq!(value[4]["fixedTargetCount"], 2);
        assert_eq!(value[4]["canRotate"], true);
        assert!(value[4].get("recordIndex").is_none());
        assert!(value[4].get("authored").is_none());

        let reopened: Vec<RebuiltV3SpellDefinition> =
            serde_json::from_str(&encoded).expect("reimport");
        assert_eq!(reopened, projection);
    }

    #[test]
    fn combined_projection_requires_standard_spells_and_appends_complete_custom_catalog() {
        let mut snapshot = catalog_snapshot();
        snapshot.standard_spells =
            decode_standard_spells(&vec![0; STANDARD_SPELL_BYTES], None).spells;
        snapshot.standard_spells[0].definition.range_min = 255;
        let standard = project_rebuilt_v3_standard_spell_catalog(&snapshot).unwrap();
        assert_eq!(standard.len(), STANDARD_SPELL_RECORDS);
        assert_eq!(standard[0].classic_id, 1101);
        assert_eq!(standard[0].range_min, -1);
        assert_eq!(standard[419].classic_id, 4715);

        let combined = project_rebuilt_v3_combined_spell_catalog(&snapshot).unwrap();
        assert_eq!(
            combined.len(),
            STANDARD_SPELL_RECORDS + SCENARIO_SPELL_RECORDS
        );
        assert_eq!(combined[419].classic_id, 4715);
        assert_eq!(combined[420].classic_id, 5101);
        assert_eq!(combined[524].classic_id, 5715);

        snapshot.scenario_spells.clear();
        assert_eq!(
            project_rebuilt_v3_combined_spell_catalog(&snapshot)
                .unwrap()
                .len(),
            STANDARD_SPELL_RECORDS
        );
        snapshot.standard_spells.pop();
        assert_eq!(
            project_rebuilt_v3_combined_spell_catalog(&snapshot),
            Err(RebuiltV3SpellCatalogError::IncompleteCatalog {
                expected: STANDARD_SPELL_RECORDS,
                actual: STANDARD_SPELL_RECORDS - 1,
            })
        );
    }

    #[test]
    fn projection_rejects_incomplete_or_ambiguous_catalogs() {
        let mut snapshot = catalog_snapshot();
        snapshot.scenario_spells.pop();
        assert_eq!(
            project_rebuilt_v3_spell_catalog(&snapshot),
            Err(RebuiltV3SpellCatalogError::IncompleteCatalog {
                expected: SCENARIO_SPELL_RECORDS,
                actual: SCENARIO_SPELL_RECORDS - 1,
            })
        );

        let mut snapshot = catalog_snapshot();
        snapshot.scenario_spells[1].definition.record_index = 0;
        assert_eq!(
            project_rebuilt_v3_spell_catalog(&snapshot),
            Err(RebuiltV3SpellCatalogError::DuplicateRecordIndex(0))
        );

        let mut snapshot = catalog_snapshot();
        snapshot.scenario_spells[4].definition.classic_id = 5106;
        assert_eq!(
            project_rebuilt_v3_spell_catalog(&snapshot),
            Err(RebuiltV3SpellCatalogError::InvalidClassicId {
                record_index: 4,
                expected: 5105,
                actual: 5106,
            })
        );

        let mut snapshot = catalog_snapshot();
        snapshot.scenario_spells[4].definition.id = StableId("classic.spell.5106".into());
        assert_eq!(
            project_rebuilt_v3_spell_catalog(&snapshot),
            Err(RebuiltV3SpellCatalogError::InvalidIdentity {
                expected: StableId("classic.spell.5105".into()),
                actual: StableId("classic.spell.5106".into()),
            })
        );

        let mut snapshot = catalog_snapshot();
        snapshot.scenario_spells[4].definition.name = "  ".into();
        assert_eq!(
            project_rebuilt_v3_spell_catalog(&snapshot),
            Err(RebuiltV3SpellCatalogError::BlankName(StableId(
                "classic.spell.5105".into()
            )))
        );
    }
}

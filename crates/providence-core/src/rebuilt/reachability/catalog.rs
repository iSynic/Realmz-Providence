use super::super::runtime_ids::action_point_program_id;
use super::super::{placed_trigger_is_defined, simple_encounter_is_runtime_representable};
use super::identities::{complex_program, simple_program, xap_program};
use super::{
    RebuiltV3ReachabilityError, RebuiltV3ReachabilityRelation, RebuiltV3ReachabilityTarget,
};
use crate::model::{ClassicAction, ComplexEncounter, ProjectSnapshot, StableId};
use std::collections::{BTreeMap, BTreeSet};

#[derive(Clone, Copy)]
pub(super) struct ProgramSource<'a> {
    pub(super) actions: &'a [ClassicAction],
    pub(super) slot_group: Option<u8>,
}

#[derive(Default)]
pub(super) struct EncounterCatalog {
    pub(super) ids: BTreeSet<u32>,
    pub(super) results: BTreeMap<u32, BTreeSet<u8>>,
}

pub(super) struct ReachabilityCatalog<'a> {
    pub(super) programs: BTreeMap<StableId, ProgramSource<'a>>,
    pub(super) simple: EncounterCatalog,
    pub(super) complex: EncounterCatalog,
    pub(super) battles: BTreeMap<u32, &'a crate::model::BattleRecord>,
    pub(super) monsters: BTreeMap<u32, &'a crate::model::MonsterRecord>,
    pub(super) extra_codes: BTreeMap<u32, [i16; 5]>,
}

impl<'a> ReachabilityCatalog<'a> {
    pub(super) fn new(snapshot: &'a ProjectSnapshot) -> Result<Self, RebuiltV3ReachabilityError> {
        // Keep duplicate-failure precedence; these source indexes stay immutable during traversal.
        let mut programs = program_catalog(snapshot)?;
        let simple = simple_catalog(snapshot, &mut programs)?;
        let complex = complex_catalog(snapshot, &mut programs)?;
        let battles = battle_catalog(snapshot)?;
        let monsters = monster_catalog(snapshot)?;
        let extra_codes = extra_code_catalog(snapshot)?;
        Ok(Self {
            programs,
            simple,
            complex,
            battles,
            monsters,
            extra_codes,
        })
    }

    pub(super) fn resolves(
        &self,
        target: &RebuiltV3ReachabilityTarget,
        relation: &RebuiltV3ReachabilityRelation,
    ) -> bool {
        match target {
            RebuiltV3ReachabilityTarget::Program(id) => self.programs.contains_key(id),
            RebuiltV3ReachabilityTarget::SimpleEncounter(id) => self.simple.ids.contains(id),
            RebuiltV3ReachabilityTarget::ComplexEncounter(id) => self.complex.ids.contains(id),
            RebuiltV3ReachabilityTarget::Battle(id) => self.battles.contains_key(id),
            RebuiltV3ReachabilityTarget::Monster(id) => {
                *relation == RebuiltV3ReachabilityRelation::TestsMonsterPresence
                    || self.monsters.contains_key(id)
            }
            RebuiltV3ReachabilityTarget::ExtraCode(id) => self.extra_codes.contains_key(id),
            RebuiltV3ReachabilityTarget::RuntimeNoOp(_) => true,
            RebuiltV3ReachabilityTarget::Invalid(_) => false,
        }
    }
}

fn program_catalog(
    snapshot: &ProjectSnapshot,
) -> Result<BTreeMap<StableId, ProgramSource<'_>>, RebuiltV3ReachabilityError> {
    let mut programs = BTreeMap::new();
    for trigger in snapshot
        .world
        .action_points
        .iter()
        .filter(|trigger| placed_trigger_is_defined(trigger))
    {
        insert_program(
            &mut programs,
            action_point_program_id(trigger),
            ProgramSource {
                actions: &trigger.actions,
                slot_group: None,
            },
        )?;
    }
    for row in &snapshot.extra_action_points {
        insert_program(
            &mut programs,
            xap_program(i64::from(row.native_id.0)),
            ProgramSource {
                actions: &row.actions,
                slot_group: None,
            },
        )?;
    }

    Ok(programs)
}

fn simple_catalog<'a>(
    snapshot: &'a ProjectSnapshot,
    programs: &mut BTreeMap<StableId, ProgramSource<'a>>,
) -> Result<EncounterCatalog, RebuiltV3ReachabilityError> {
    let mut catalog = EncounterCatalog::default();
    for encounter in snapshot
        .simple_encounters
        .iter()
        .filter(|encounter| simple_encounter_is_runtime_representable(encounter))
    {
        catalog.ids.insert(encounter.native_id.0);
        catalog.results.insert(
            encounter.native_id.0,
            encounter
                .texts
                .iter()
                .zip(encounter.choice_results)
                .filter(|(label, result)| !label.trim().is_empty() && (1..=4).contains(result))
                .map(|(_, result)| (result - 1) as u8)
                .collect(),
        );
        for result in 0..4 {
            insert_program(
                programs,
                simple_program(encounter.native_id.0, result),
                ProgramSource {
                    actions: &encounter.actions,
                    slot_group: Some(result),
                },
            )?;
        }
    }

    Ok(catalog)
}

fn complex_catalog<'a>(
    snapshot: &'a ProjectSnapshot,
    programs: &mut BTreeMap<StableId, ProgramSource<'a>>,
) -> Result<EncounterCatalog, RebuiltV3ReachabilityError> {
    let mut catalog = EncounterCatalog::default();
    for encounter in &snapshot.complex_encounters {
        catalog.ids.insert(encounter.native_id.0);
        let results = complex_result_set(snapshot, encounter);
        catalog.results.insert(encounter.native_id.0, results);
        for result in 0..4 {
            insert_program(
                programs,
                complex_program(encounter.native_id.0, result),
                ProgramSource {
                    actions: &encounter.actions,
                    slot_group: Some(result),
                },
            )?;
        }
    }

    Ok(catalog)
}

fn complex_choice_results(encounter: &ComplexEncounter) -> impl Iterator<Item = i8> + '_ {
    [encounter.action_result, encounter.word_result]
        .into_iter()
        .chain(
            encounter
                .spell_ids
                .iter()
                .zip(encounter.spell_results)
                .filter_map(|(id, result)| (*id != 0).then_some(result)),
        )
        .chain(
            encounter
                .item_ids
                .iter()
                .zip(encounter.item_results)
                .filter_map(|(id, result)| (*id != 0).then_some(result)),
        )
}

fn complex_result_set(snapshot: &ProjectSnapshot, encounter: &ComplexEncounter) -> BTreeSet<u8> {
    let mut results = complex_choice_results(encounter)
        .filter(|result| (1..=4).contains(result))
        .map(|result| (result - 1) as u8)
        .collect::<BTreeSet<_>>();
    let has_failable_choice = encounter.action_result != 0
        || encounter.word_result != 0
        || encounter.spell_ids.iter().any(|id| *id != 0)
        || encounter.item_ids.iter().any(|id| *id != 0);
    if has_failable_choice {
        results.insert(3);
    }
    if encounter.thief {
        let rogue_id = i32::from(encounter.thief_success);
        if let Some(rogue) = snapshot
            .rogue_encounters
            .iter()
            .find(|rogue| rogue.native_id.0 as i32 == rogue_id)
        {
            for result in rogue.success_codes.iter().chain(&rogue.failure_codes) {
                if (1..=4).contains(result) {
                    results.insert((*result - 1) as u8);
                }
            }
        }
    }
    results
}

fn battle_catalog(
    snapshot: &ProjectSnapshot,
) -> Result<BTreeMap<u32, &crate::model::BattleRecord>, RebuiltV3ReachabilityError> {
    let mut battles = BTreeMap::new();
    for battle in &snapshot.battles {
        if battles.insert(battle.native_id.0, battle).is_some() {
            return Err(RebuiltV3ReachabilityError::DuplicateBattleId(
                battle.native_id.0,
            ));
        }
    }
    Ok(battles)
}

fn monster_catalog(
    snapshot: &ProjectSnapshot,
) -> Result<BTreeMap<u32, &crate::model::MonsterRecord>, RebuiltV3ReachabilityError> {
    let mut monsters = BTreeMap::new();
    if let Some(set) = snapshot
        .monster_sets
        .iter()
        .find(|set| set.set_id == 0 && set.native_path == "Data MD")
    {
        for monster in &set.monsters {
            if monsters.insert(monster.native_id.0, monster).is_some() {
                return Err(RebuiltV3ReachabilityError::DuplicateMonsterId(
                    monster.native_id.0,
                ));
            }
        }
    }
    Ok(monsters)
}

fn extra_code_catalog(
    snapshot: &ProjectSnapshot,
) -> Result<BTreeMap<u32, [i16; 5]>, RebuiltV3ReachabilityError> {
    let mut extra_codes = BTreeMap::new();
    for row in &snapshot.extra_codes {
        if extra_codes.insert(row.native_id.0, row.values).is_some() {
            return Err(RebuiltV3ReachabilityError::DuplicateExtraCodeId(
                row.native_id.0,
            ));
        }
    }

    Ok(extra_codes)
}

fn insert_program<'a>(
    programs: &mut BTreeMap<StableId, ProgramSource<'a>>,
    id: StableId,
    source: ProgramSource<'a>,
) -> Result<(), RebuiltV3ReachabilityError> {
    if programs.insert(id.clone(), source).is_some() {
        Err(RebuiltV3ReachabilityError::DuplicateProgramId(id))
    } else {
        Ok(())
    }
}

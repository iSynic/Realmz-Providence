use super::*;
pub(super) fn snapshot() -> ProjectSnapshot {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("item-spell-selection".into()));
    snapshot.item_rules = (1..=799).map(item_rule_fixture).collect();
    snapshot.scenario_item_rules = (0..200).map(scenario_item_rule_fixture).collect();
    snapshot.standard_spells = decode_standard_spells(&vec![0; STANDARD_SPELL_BYTES], None).spells;
    snapshot.scenario_spells = decode_scenario_spells(&vec![0; SCENARIO_SPELL_BYTES], None).spells;
    snapshot
}

pub(super) fn scenario(classic_item_id: i16) -> RebuiltV3ScenarioDocument {
    RebuiltV3ScenarioDocument {
        kind: "realmz.scenario.gdscript-actions-v1".into(),
        schema_version: 1,
        application_hooks: RebuiltV3ApplicationHooks {
            start_game: None,
            party_death: None,
            end_adventure: None,
            shop: None,
            temple: None,
        },
        programs: vec![RebuiltV3ScenarioProgram {
            id: StableId("xap:1".into()),
            owner_kind: RebuiltV3ProgramOwnerKind::ExtraActionPoint,
            owner_id: StableId("extra-action-point:1".into()),
            instructions: vec![RebuiltV3ClassicInstruction {
                kind: RebuiltV3InstructionKind::ClassicAction,
                slot: 0,
                raw_opcode: 21,
                opcode: 21,
                id: 1,
                gosub: false,
                extra_code: Some(vec![classic_item_id, 0, 1, 0, 0]),
            }],
        }],
        scenario_actions: [],
        state_definitions: [],
        migrations: [],
        extra_code_tail: None,
    }
}

pub(super) fn owners() -> RebuiltV3ReachableOwnerSelection {
    RebuiltV3ReachableOwnerSelection {
        reachable_treasure_ids: Vec::new(),
        reachable_shop_ids: Vec::new(),
        references: Vec::new(),
        timed_encounters: Vec::new(),
        excluded_timed_encounter_ids: Vec::new(),
        quarantined_timed_encounter_ids: Vec::new(),
        treasures: Vec::new(),
        shops: Vec::new(),
    }
}

pub(super) fn combat() -> RebuiltV3ReachableCombatSelection {
    RebuiltV3ReachableCombatSelection {
        reachable_battle_ids: Vec::new(),
        reachable_monster_ids: Vec::new(),
        battles: Vec::new(),
        monsters: Vec::new(),
        monster_sets: Vec::new(),
        monster_descriptions: Vec::new(),
    }
}

pub(super) fn complex_encounter_with_comparison_literals() -> RebuiltV3ComplexEncounter {
    let mut spell_ids = [0; 10];
    spell_ids[..5].copy_from_slice(&[1100, 9999, 6, 5101, i16::MIN]);
    let mut item_ids = [0; 5];
    item_ids[..3].copy_from_slice(&[1000, 800, i16::MIN]);
    RebuiltV3ComplexEncounter {
        id: 4,
        prompt_message_id: 1,
        action_result: 0,
        word_result: 0,
        groups: [0; 8],
        spell_ids,
        spell_results: [4; 10],
        item_ids,
        item_results: [4; 5],
        can_back_out: false,
        thief: false,
        max_times: 1,
        caste_success: 0,
        thief_success: 0,
        thief_fail: 0,
        texts: std::array::from_fn(|_| String::new()),
    }
}

pub(super) fn select_programs(
    snapshot: &ProjectSnapshot,
    scenario: &RebuiltV3ScenarioDocument,
) -> Result<RebuiltV3ReachableItemSpellSelection, RebuiltV3ReachableItemSpellError> {
    project_rebuilt_v3_reachable_items_and_spells(
        snapshot,
        scenario,
        &[],
        &[],
        &owners(),
        &combat(),
    )
}

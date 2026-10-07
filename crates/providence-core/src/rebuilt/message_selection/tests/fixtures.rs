use crate::model::{
    LevelType, MapLevel, MapRuntimeMetadata, NativeRecordId, ProjectSnapshot, RandomRectangle,
    ScenarioMessage, StableId,
};
use crate::rebuilt::{
    RebuiltV3ApplicationHooks, RebuiltV3BattleDefinition, RebuiltV3ClassicInstruction,
    RebuiltV3ComplexEncounter, RebuiltV3InstructionKind, RebuiltV3ProgramOwnerKind,
    RebuiltV3ReachableCombatSelection, RebuiltV3RogueEncounter, RebuiltV3ScenarioDocument,
    RebuiltV3ScenarioProgram, RebuiltV3SimpleEncounter,
};

pub(super) fn instruction(
    slot: u8,
    opcode: i16,
    id: i16,
    extra_code: Option<[i16; 5]>,
) -> RebuiltV3ClassicInstruction {
    RebuiltV3ClassicInstruction {
        kind: RebuiltV3InstructionKind::ClassicAction,
        slot,
        raw_opcode: opcode,
        opcode,
        id,
        gosub: false,
        extra_code: extra_code.map(Vec::from),
    }
}

pub(super) fn all_family_selection() -> (
    ProjectSnapshot,
    RebuiltV3ScenarioDocument,
    Vec<RebuiltV3SimpleEncounter>,
    Vec<RebuiltV3ComplexEncounter>,
    Vec<RebuiltV3RogueEncounter>,
    RebuiltV3ReachableCombatSelection,
) {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("message-selection".into()));
    snapshot.messages.extend((1..=20).map(|id| ScenarioMessage {
        identity: StableId(format!("message:{id}")),
        native_id: NativeRecordId(id),
        text: format!("Message {id}"),
        authored: true,
    }));
    snapshot.messages.push(ScenarioMessage {
        identity: StableId("invalid-unreachable-message".into()),
        native_id: NativeRecordId(99),
        text: "Must stay outside the selected closure.".into(),
        authored: true,
    });
    snapshot.world.maps.push(land());
    let scenario = scenario();
    let (simple, complex) = encounters();
    (snapshot, scenario, simple, complex, rogues(), combat())
}

fn land() -> MapLevel {
    MapLevel {
        identity: StableId("map:land:0".into()),
        level_type: LevelType::Land,
        native_index: 0,
        name: "Controlled Land".into(),
        tiles: Vec::new(),
        runtime: Some(MapRuntimeMetadata {
            source: "Data RD".into(),
            source_blob: None,
            dark: false,
            uses_los: false,
            landlook: Some(0),
            base_scale: None,
            tileset_id: StableId("tileset:land:0".into()),
            base_tile: None,
            random_rectangles: vec![RandomRectangle {
                identity: StableId("map:land:0:rect:0".into()),
                top: 0,
                left: 0,
                bottom: 1,
                right: 1,
                chance_ten_thousand: 100,
                battle_range: [0, 0],
                random_doors: [0; 3],
                random_door_percent: [0; 3],
                only: false,
                option: 0,
                sound_id: 0,
                text_id: -20,
            }],
        }),
    }
}

fn scenario() -> RebuiltV3ScenarioDocument {
    RebuiltV3ScenarioDocument {
        kind: "realmz2.scenario".into(),
        schema_version: 3,
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
            instructions: program_instructions(),
        }],
        scenario_actions: [],
        state_definitions: [],
        migrations: [],
        extra_code_tail: None,
    }
}

fn program_instructions() -> Vec<RebuiltV3ClassicInstruction> {
    vec![
        instruction(0, 1, -1, None),
        instruction(1, 19, 100, Some([-3, -2, 0, 0, 0])),
        instruction(2, 20, 101, Some([0, 0, 0, 0, -4])),
        instruction(3, 2, 102, Some([0, 0, 0, -5, 0])),
        instruction(4, 15, 103, Some([0, 0, 0, 0, -6])),
        instruction(5, 21, 104, Some([0, 0, 2, 0, -7])),
        instruction(6, 55, 105, Some([0, 2, 0, 0, -8])),
        instruction(7, 74, 106, Some([0, 0, 0, 0, -9])),
        instruction(8, 85, 107, Some([0, 0, 0, 0, -10])),
        instruction(9, 87, 108, Some([0, 0, 2, 0, -11])),
        instruction(10, 122, 109, Some([-12, 0, 0, 0, 0])),
    ]
}

fn encounters() -> (
    Vec<RebuiltV3SimpleEncounter>,
    Vec<RebuiltV3ComplexEncounter>,
) {
    let simple = vec![RebuiltV3SimpleEncounter {
        id: 1,
        prompt_message_id: -13,
        responses: Vec::new(),
        can_back_out: false,
        max_times: 1,
        caste_success: 0,
    }];
    let complex = vec![RebuiltV3ComplexEncounter {
        id: 2,
        prompt_message_id: -14,
        action_result: 0,
        word_result: 0,
        groups: [0; 8],
        spell_ids: [0; 10],
        spell_results: [0; 10],
        item_ids: [0; 5],
        item_results: [0; 5],
        can_back_out: false,
        thief: true,
        max_times: 1,
        caste_success: 0,
        thief_success: 3,
        thief_fail: 0,
        texts: std::array::from_fn(|_| String::new()),
    }];
    (simple, complex)
}

fn rogues() -> Vec<RebuiltV3RogueEncounter> {
    let mut success_text = [0; 8];
    success_text[0] = -15;
    let mut failure_text = [0; 8];
    failure_text[0] = -16;
    vec![RebuiltV3RogueEncounter {
        id: 3,
        type_flags: [false; 10],
        modifiers: [0; 8],
        success_codes: [0; 8],
        failure_codes: [0; 8],
        success_text,
        failure_text,
        success_sounds: [0; 8],
        failure_sounds: [0; 8],
        spell_id: 0,
        low_damage: 0,
        high_damage: 0,
        tumblers: 0,
        prompts: [-17, 0, 0],
        prompt_sounds: [0; 3],
    }]
}

fn combat() -> RebuiltV3ReachableCombatSelection {
    RebuiltV3ReachableCombatSelection {
        reachable_battle_ids: vec![4],
        reachable_monster_ids: Vec::new(),
        battles: vec![RebuiltV3BattleDefinition {
            id: StableId("classic.battle.4".into()),
            classic_id: 4,
            monster_slots: Vec::new(),
            distance: 0,
            message_before_id: -18,
            message_after_id: -19,
            macro_id: 0,
        }],
        monsters: Vec::new(),
        monster_sets: Vec::new(),
        monster_descriptions: Vec::new(),
    }
}

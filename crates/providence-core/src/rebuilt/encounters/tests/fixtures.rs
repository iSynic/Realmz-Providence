use crate::{
    codecs::{COMPLEX_ENCOUNTER_RECORD_BYTES, decode_complex_encounters},
    model::{
        ClassicAction, ComplexEncounter, ExtraCodeRow, NativeRecordId, ProjectSnapshot,
        RogueEncounter, ScenarioMessage, SimpleEncounter, StableId,
    },
};

pub(super) fn snapshot() -> ProjectSnapshot {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("complex-projection".into()));
    snapshot.complex_encounters.push(complex_record());
    snapshot.messages.push(message());
    snapshot.rogue_encounters.push(rogue_record());
    snapshot.extra_codes = extra_codes();
    snapshot
}

fn complex_record() -> ComplexEncounter {
    let mut encounter = decode_complex_encounters(&vec![0; COMPLEX_ENCOUNTER_RECORD_BYTES])
        .records
        .remove(0);
    encounter.prompt_message_native_id = -47;
    encounter.action_result = 1;
    encounter.word_result = 2;
    encounter.groups = [1, 2, 3, 4, 5, 6, 7, 8];
    encounter.spell_ids[1] = 1201;
    encounter.spell_results[1] = 3;
    encounter.item_ids[2] = -800;
    encounter.item_results[2] = 4;
    encounter.can_back_out = true;
    encounter.thief = true;
    encounter.thief_success = 6;
    encounter.texts[0] = "Force the gate".into();
    encounter.texts[8] = "moonstone".into();
    encounter.actions = vec![
        ClassicAction {
            slot: 0,
            raw_opcode: -1,
            target_native_id: 47,
        },
        ClassicAction {
            slot: 17,
            raw_opcode: 92,
            target_native_id: 8,
        },
    ];
    encounter
}

fn message() -> ScenarioMessage {
    ScenarioMessage {
        identity: StableId("message:47".into()),
        native_id: NativeRecordId(47),
        text: "The western gate is sealed.".into(),
        authored: true,
    }
}

fn rogue_record() -> RogueEncounter {
    RogueEncounter {
        identity: StableId("rogue-encounter:6".into()),
        native_id: NativeRecordId(6),
        type_flags: [false; 10],
        modifiers: [0; 8],
        success_codes: [0; 8],
        failure_codes: [0; 8],
        success_text: [0; 8],
        failure_text: [0; 8],
        success_sounds: [0; 8],
        failure_sounds: [0; 8],
        spell: 0,
        low_damage: 0,
        high_damage: 0,
        tumblers: 0,
        prompts: [0; 3],
        prompt_sounds: [0; 3],
        authored: true,
    }
}

fn extra_codes() -> Vec<ExtraCodeRow> {
    [
        ExtraCodeRow {
            native_id: NativeRecordId(8),
            values: [1, 2, 3, 4, 5],
        },
        ExtraCodeRow {
            native_id: NativeRecordId(9),
            values: [6, 7, 8, 9, 10],
        },
    ]
    .into()
}

pub(super) fn simple_snapshot() -> ProjectSnapshot {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("simple-projection".into()));
    snapshot.messages = vec![
        ScenarioMessage {
            identity: StableId("message:47".into()),
            native_id: NativeRecordId(47),
            text: "The western gate is sealed.".into(),
            authored: true,
        },
        ScenarioMessage {
            identity: StableId("message:2".into()),
            native_id: NativeRecordId(2),
            text: "Second in source, first in projection.".into(),
            authored: true,
        },
    ];
    snapshot.simple_encounters.push(SimpleEncounter {
        identity: StableId("simple-encounter:7".into()),
        native_id: NativeRecordId(7),
        actions: vec![
            ClassicAction {
                slot: 0,
                raw_opcode: 1,
                target_native_id: 47,
            },
            ClassicAction {
                slot: 17,
                raw_opcode: 92,
                target_native_id: 8,
            },
        ],
        choice_results: [3, 1, 0, 0],
        can_back_out: true,
        max_times: 4,
        caste_success: -2,
        prompt_message_native_id: -47,
        texts: [
            "Force the gate".into(),
            "Wait".into(),
            "  ".into(),
            String::new(),
        ],
        authored: true,
    });
    snapshot.simple_encounters.push(empty_simple_record());
    snapshot.extra_codes = extra_codes();
    snapshot
}

fn empty_simple_record() -> SimpleEncounter {
    SimpleEncounter {
        identity: StableId("simple-encounter:8".into()),
        native_id: NativeRecordId(8),
        actions: Vec::new(),
        choice_results: [0; 4],
        can_back_out: false,
        max_times: 0,
        caste_success: 0,
        prompt_message_native_id: 0,
        texts: std::array::from_fn(|_| String::new()),
        authored: false,
    }
}

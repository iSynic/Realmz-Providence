use super::super::*;
use crate::codecs::{SHOP_ITEM_SLOTS, TIMED_ENCOUNTER_RECORD_BYTES};
use crate::model::{
    AssetDescriptor, BlobId, ClassicAction, ClassicResourceKey, ComplexEncounter, ExtraActionPoint,
    NativeRecordId, RogueEncounter, ScenarioApplicationContract, ScenarioApplicationHooks,
    ScenarioMessage, ShopRecord, SimpleEncounter, StableId, TreasureRecord,
};
use crate::rebuilt::item_rule_fixture;

pub(super) fn action(slot: u8, raw_opcode: i16, target_native_id: i16) -> ClassicAction {
    ClassicAction {
        slot,
        raw_opcode,
        target_native_id,
    }
}

fn xap(id: u32, actions: Vec<ClassicAction>) -> ExtraActionPoint {
    ExtraActionPoint {
        identity: StableId(format!("extra-action-point:{id}")),
        native_id: NativeRecordId(id),
        classic_door_id: id as i32,
        post_action_level: 0,
        post_action_x: 0,
        post_action_y: 0,
        chance_percent: 100,
        actions,
    }
}

pub(super) fn runtime_snapshot() -> ProjectSnapshot {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("runtime-selection".into()));
    snapshot.scenario_application = Some(ScenarioApplicationContract {
        hooks: ScenarioApplicationHooks {
            start_game: Some(StableId("extra-action-point:1".into())),
            ..ScenarioApplicationHooks::default()
        },
    });
    snapshot.messages.push(ScenarioMessage {
        identity: StableId("message:1".into()),
        native_id: NativeRecordId(1),
        text: "Choose a road.".into(),
        authored: true,
    });
    snapshot.messages.push(ScenarioMessage {
        identity: StableId("invalid-unreachable-message".into()),
        native_id: NativeRecordId(99),
        text: "Must remain outside the selected closure.".into(),
        authored: true,
    });
    snapshot.extra_action_points = vec![
        xap(
            1,
            vec![
                action(0, 4, 2),
                action(1, 5, 7),
                action(4, 10, -3),
                action(5, 6, -4),
            ],
        ),
        xap(4, Vec::new()),
        xap(5, Vec::new()),
        xap(6, Vec::new()),
        xap(99, vec![action(0, 200, 0)]),
    ];
    add_encounters(&mut snapshot);
    add_catalogs(&mut snapshot);
    snapshot
}

fn add_encounters(snapshot: &mut ProjectSnapshot) {
    let simple = simple_encounter();
    let mut unused_simple = simple.clone();
    unused_simple.identity = StableId("simple-encounter:9".into());
    unused_simple.native_id = NativeRecordId(9);
    unused_simple.actions.clear();
    unused_simple.choice_results = [9, 0, 0, 0];
    unused_simple.texts[0] = "Invalid but unreachable".into();
    snapshot.simple_encounters.extend([simple, unused_simple]);

    let complex = complex_encounter();
    let mut unused_complex = complex.clone();
    unused_complex.identity = StableId("invalid-unreachable-complex".into());
    unused_complex.native_id = NativeRecordId(8);
    unused_complex.actions.clear();
    unused_complex.action_result = 0;
    unused_complex.thief = false;
    unused_complex.thief_success = 0;
    snapshot
        .complex_encounters
        .extend([complex, unused_complex]);

    let rogue = rogue_encounter();
    let mut unused_rogue = rogue.clone();
    unused_rogue.identity = StableId("invalid-unreachable-rogue".into());
    unused_rogue.native_id = NativeRecordId(99);
    snapshot.rogue_encounters.extend([rogue, unused_rogue]);
}

fn simple_encounter() -> SimpleEncounter {
    SimpleEncounter {
        identity: StableId("simple-encounter:2".into()),
        native_id: NativeRecordId(2),
        actions: vec![action(0, 39, 4)],
        choice_results: [1, 0, 0, 0],
        can_back_out: false,
        max_times: 1,
        caste_success: 0,
        prompt_message_native_id: 1,
        texts: [
            "Continue".into(),
            String::new(),
            String::new(),
            String::new(),
        ],
        authored: true,
    }
}

fn complex_encounter() -> ComplexEncounter {
    ComplexEncounter {
        identity: StableId("complex-encounter:7".into()),
        native_id: NativeRecordId(7),
        actions: vec![action(0, 39, 5), action(24, 39, 6)],
        action_result: 1,
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
        thief_success: 6,
        thief_fail: 0,
        prompt_message_native_id: 1,
        texts: std::array::from_fn(|_| String::new()),
        authored: true,
    }
}

fn rogue_encounter() -> RogueEncounter {
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

fn add_catalogs(snapshot: &mut ProjectSnapshot) {
    snapshot.item_rules = (1..=799).map(item_rule_fixture).collect();
    snapshot.standard_spells =
        crate::codecs::decode_standard_spells(&vec![0; crate::codecs::STANDARD_SPELL_BYTES], None)
            .spells;
    snapshot.treasures.push(TreasureRecord {
        identity: StableId("treasure:3".into()),
        native_id: NativeRecordId(3),
        item_ids: [7].into_iter().chain(std::iter::repeat_n(0, 19)).collect(),
        experience: 10,
        gold: 20,
        gems: 0,
        jewelry: 0,
        authored: true,
    });
    snapshot.shops.push(ShopRecord {
        identity: StableId("shop:4".into()),
        native_id: NativeRecordId(4),
        item_ids: [7]
            .into_iter()
            .chain(std::iter::repeat_n(-1, SHOP_ITEM_SLOTS - 1))
            .collect(),
        quantities: vec![1; SHOP_ITEM_SLOTS],
        inflation: 100,
        authored: true,
    });
    let mut timed =
        crate::codecs::decode_timed_encounters(&[0; TIMED_ENCOUNTER_RECORD_BYTES * 2]).records;
    timed[0].day = 1;
    timed[0].door = 4;
    timed[0].required_item = 7;
    timed[1].identity = StableId("invalid-excluded-timed".into());
    snapshot.timed_encounters = timed;
}

pub(super) fn text_asset(kind: &str, resource_type: &str, id: i32) -> AssetDescriptor {
    AssetDescriptor {
        identity: StableId(format!("classic-resource:{resource_type}:{id}")),
        label: format!("{resource_type} {id}"),
        kind: kind.into(),
        mime_type: Some(if resource_type == "TEXT" {
            "text/plain".into()
        } else {
            "application/octet-stream".into()
        }),
        classic_resource: Some(ClassicResourceKey {
            resource_type: resource_type.into(),
            resource_id: id,
        }),
        scenario_music_slot: None,
        blob: BlobId(format!(
            "sha256:{}",
            if id == -201 { "2" } else { "1" }.repeat(64)
        )),
        byte_length: 4,
        classic_payload_blob: None,
        classic_payload_byte_length: None,
        extension: Some(
            if resource_type == "TEXT" {
                "txt"
            } else {
                "bin"
            }
            .into(),
        ),
        width: None,
        height: None,
        duration_ms: None,
        sample_rate: None,
        channels: None,
        tile_width: None,
        tile_height: None,
        columns: None,
        rows: None,
        landlook: None,
        base_tile: None,
        source: "controlled resource".into(),
    }
}

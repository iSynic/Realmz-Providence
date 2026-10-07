use crate::model::{ProjectSnapshot, StableId};
use crate::{
    codecs::{SHOP_ITEM_SLOTS, TIMED_ENCOUNTER_RECORD_BYTES},
    model::{NativeRecordId, ShopRecord, TimedEncounterLocationKind, TreasureRecord},
    rebuilt::{
        RebuiltV3ApplicationHooks, RebuiltV3ClassicInstruction, RebuiltV3InstructionKind,
        RebuiltV3ProgramOwnerKind, RebuiltV3ScenarioDocument, RebuiltV3ScenarioProgram,
        item_rule_fixture,
    },
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

pub(super) fn fixture() -> (ProjectSnapshot, RebuiltV3ScenarioDocument) {
    (catalog_snapshot(), scenario())
}

fn catalog_snapshot() -> ProjectSnapshot {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("owner-selection".into()));
    snapshot.item_rules.push(item_rule_fixture(7));
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
    timed[0].door = 7;
    timed[0].required_item = 7;
    timed[0].location_kind = TimedEncounterLocationKind::Any;
    timed[1].day = 0;
    snapshot.timed_encounters = timed;

    snapshot
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
        programs: vec![
            RebuiltV3ScenarioProgram {
                id: StableId("xap:1".into()),
                owner_kind: RebuiltV3ProgramOwnerKind::ExtraActionPoint,
                owner_id: StableId("extra-action-point:1".into()),
                instructions: vec![
                    instruction(0, 10, -3, None),
                    instruction(1, 6, -4, None),
                    instruction(2, 48, 9, Some([1, 1, 0, 0, -3])),
                    instruction(3, 51, 10, Some([-4, 0, 0, 0, 0])),
                    instruction(4, 73, 11, Some([4, 0, 0, 0, 0])),
                ],
            },
            RebuiltV3ScenarioProgram {
                id: StableId("xap:7".into()),
                owner_kind: RebuiltV3ProgramOwnerKind::ExtraActionPoint,
                owner_id: StableId("extra-action-point:7".into()),
                instructions: Vec::new(),
            },
        ],
        scenario_actions: [],
        state_definitions: [],
        migrations: [],
        extra_code_tail: None,
    }
}

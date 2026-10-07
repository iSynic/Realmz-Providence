use super::*;
use super::{
    extra_code::reachability_inline_branch_layout, navigation::reachability_repair_command,
};
use providence_core::{
    model::{LevelType, StableId},
    rebuilt::{RebuiltV3ReachableOwnerError, RebuiltV3RuntimeMessageReference, RebuiltV3ShopError},
};

use providence_core::model::{
    ActionPoint, ClassicAction, ExtraCodeRow, MapCoordinate, NativeRecordId, SimpleEncounter,
};
use providence_core::rebuilt::RebuiltV3ReachabilityRelation;

mod source_geometry;

#[test]
fn direct_timed_and_monster_blockers_have_concrete_repair_routes() {
    let timed = reachability_repair_command(&StableId("timed-encounter:7".into()), "door")
        .expect("Timed Encounter door repair route");
    assert_eq!(timed["method"], "timed-encounter.reference.retarget");
    assert_eq!(timed["targetParameter"], "targetId");

    let monster = reachability_repair_command(&StableId("monster:0:29".into()), "deathMacro")
        .expect("Monster death-macro repair route");
    assert_eq!(monster["method"], "monster-reference.retarget");
    assert_eq!(monster["targetParameter"], "targetId");
}

#[test]
fn inline_branch_opcodes_map_to_their_exact_two_word_layouts() {
    assert_eq!(
        reachability_inline_branch_layout(3),
        Some(("values[1..=2]", 1, 2, "choice"))
    );
    for opcode in [38, 42, 46, 58, 59] {
        assert_eq!(
            reachability_inline_branch_layout(opcode),
            Some(("values[2..=3]", 2, 3, "force"))
        );
    }
    assert_eq!(reachability_inline_branch_layout(85), None);
}

#[test]
fn missing_runtime_message_names_exact_extra_code_word_and_repair() {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("runtime-message".into()));
    snapshot.world.action_points.push(ActionPoint {
        identity: StableId("action-point:land:6:42".into()),
        level_type: LevelType::Land,
        level_index: 6,
        record_index: 42,
        classic_door_id: 60101,
        coordinate: Some(MapCoordinate { x: 1, y: 1 }),
        post_action_level: 6,
        post_action_x: 1,
        post_action_y: 1,
        chance_percent: 100,
        actions: vec![ClassicAction {
            slot: 1,
            raw_opcode: 2,
            target_native_id: 73,
        }],
    });
    snapshot.extra_codes.push(ExtraCodeRow {
        native_id: NativeRecordId(73),
        values: [0, 0, 0, 30_002, 0],
    });
    let error = RebuiltV3ReachableRuntimeError::Message(
        RebuiltV3ReachableMessageError::MissingMessage(RebuiltV3RuntimeMessageReference {
            source: StableId("trigger:Data DD:6:42".into()),
            runtime_opcode: Some(2),
            field_path: "actions[1].extraCode[3]".into(),
            raw_native_id: 30_002,
            message_native_id: 30_002,
        }),
    );

    let problem =
        runtime_selection_problem_projection(&snapshot, &[], &error).expect("message problem");

    assert_eq!(problem["code"], "rebuilt.message.missing-target");
    assert_eq!(problem["source"], "extra-code:73");
    assert_eq!(problem["field"], "values[3]");
    assert_eq!(problem["targetKind"], "message");
    assert_eq!(problem["targetId"], "30002");
    assert_eq!(problem["runtimeSource"], "trigger:Data DD:6:42");
    assert_eq!(problem["byteProvenance"]["nativePath"], "Data EDCD");
    assert_eq!(problem["byteProvenance"]["recordIndex"], 73);
    assert_eq!(problem["byteProvenance"]["byteStart"], 736);
    assert_eq!(problem["byteProvenance"]["byteEnd"], 738);
    assert_eq!(problem["navigation"]["documentKind"], "extra-code");
    assert_eq!(problem["repair"]["method"], "extra-code-value.retarget");
    assert_eq!(problem["repair"]["params"]["index"], 3);
    assert_eq!(problem["repair"]["targetParameter"], "targetId");
}

#[test]
fn unresolved_combat_references_are_projected_individually() {
    let snapshot = ProjectSnapshot::new_authored(StableId("combat-problems".into()));
    let error = RebuiltV3ReachableRuntimeError::Combat(
        RebuiltV3ReachableCombatError::UnresolvedReferences(vec![
            RebuiltV3ReachabilityReference {
                source: StableId("battle:7".into()),
                field: "monsters[0]".into(),
                relation: RebuiltV3ReachabilityRelation::StartsBattle,
                target: RebuiltV3ReachabilityTarget::Monster(44),
                resolved: false,
            },
            RebuiltV3ReachabilityReference {
                source: StableId("action-point:land:1:2".into()),
                field: "actions[1].target".into(),
                relation: RebuiltV3ReachabilityRelation::CallsProgram,
                target: RebuiltV3ReachabilityTarget::Program(StableId("xap:149".into())),
                resolved: false,
            },
        ]),
    );

    let problems = runtime_selection_problem_projections(&snapshot, &[], &error);

    assert_eq!(problems.len(), 2);
    assert_eq!(problems[0]["source"], "battle:7");
    assert_eq!(problems[0]["field"], "monsters[0]");
    assert_eq!(problems[0]["targetKind"], "monster");
    assert_eq!(problems[0]["targetId"], "44");
    assert_eq!(problems[1]["source"], "action-point:land:1:2");
    assert_eq!(problems[1]["field"], "actions[1].target");
    assert_eq!(problems[1]["targetKind"], "extra-action-point");
    assert_eq!(problems[1]["targetId"], "149");
}

#[test]
fn invalid_encounter_result_operand_names_exact_source_byte_without_fake_retarget() {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("opcode-context".into()));
    snapshot.simple_encounters.push(SimpleEncounter {
        identity: StableId("simple-encounter:7".into()),
        native_id: NativeRecordId(7),
        actions: vec![ClassicAction {
            slot: 26,
            raw_opcode: 44,
            target_native_id: 5,
        }],
        choice_results: [0; 4],
        can_back_out: false,
        max_times: 0,
        caste_success: 0,
        prompt_message_native_id: 0,
        texts: std::array::from_fn(|_| String::new()),
        authored: false,
    });
    let error = RebuiltV3ReachableRuntimeError::Scenario(
        RebuiltV3ScenarioError::InvalidEncounterResultOpcode {
            program: StableId("simple:7:result:3".into()),
            slot: 2,
            result: 5,
        },
    );

    let problem = runtime_selection_problem_projection(&snapshot, &[], &error)
        .expect("opcode-context problem");

    assert_eq!(problem["code"], "rebuilt.opcode.invalid-context");
    assert_eq!(problem["source"], "simple-encounter:7");
    assert_eq!(problem["field"], "actions[26].opcode");
    assert_eq!(problem["runtimeSource"], "simple:7:result:3");
    assert_eq!(problem["runtimeField"], "actions[2].opcode");
    assert_eq!(problem["byteProvenance"]["nativePath"], "Data ED");
    assert_eq!(problem["byteProvenance"]["recordIndex"], 7);
    assert_eq!(problem["byteProvenance"]["byteStart"], 3008);
    assert_eq!(problem["byteProvenance"]["byteEnd"], 3009);
    assert_eq!(problem["navigation"]["documentKind"], "simple-encounter");
    assert_eq!(problem["repairActions"], json!(["edit-source"]));
    assert_eq!(problem["repair"]["method"], "action.set-opcode");
    assert_eq!(problem["repair"]["params"]["slot"], 26);
    assert_eq!(problem["repair"]["targetParameter"], "rawOpcode");
    assert!(
        problem["message"]
            .as_str()
            .is_some_and(|message| message.contains("retargeting result 5 cannot repair"))
    );
}

#[test]
fn invalid_reachable_shop_item_names_exact_stock_word_and_repair() {
    let snapshot = ProjectSnapshot::new_authored(StableId("shop-owner".into()));
    let error = RebuiltV3ReachableRuntimeError::Owner(RebuiltV3ReachableOwnerError::Shop(
        RebuiltV3ShopError::InvalidItem {
            classic_id: 26,
            slot: 600,
            item_id: 16_236,
        },
    ));

    let problem =
        runtime_selection_problem_projection(&snapshot, &[], &error).expect("shop item problem");

    assert_eq!(problem["code"], "rebuilt.shop.item-out-of-range");
    assert_eq!(problem["source"], "shop:26");
    assert_eq!(problem["field"], "itemIds[600]");
    assert_eq!(problem["targetKind"], "item");
    assert_eq!(problem["targetId"], "16236");
    assert_eq!(problem["resolution"], "invalid");
    assert_eq!(problem["repairActions"], json!(["retarget"]));
    assert_eq!(problem["byteProvenance"]["nativePath"], "Data SD");
    assert_eq!(problem["byteProvenance"]["recordIndex"], 26);
    assert_eq!(problem["byteProvenance"]["byteStart"], 79_252);
    assert_eq!(problem["byteProvenance"]["byteEnd"], 79_254);
    assert_eq!(problem["navigation"]["documentKind"], "shop");
    assert_eq!(problem["repair"]["method"], "shop-reference.retarget");
    assert_eq!(problem["repair"]["params"]["slot"], 600);
    assert_eq!(problem["repair"]["targetParameter"], "targetId");
}

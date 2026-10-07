use crate::demo::demo_scenario_items;
use crate::demo::demo_snapshot;
use crate::dispatch_result;
use providence_core::codecs::BATTLE_RECORD_BYTES;
use providence_core::codecs::EXTRA_ACTION_POINT_RECORD_BYTES;
use providence_core::codecs::decode_battles;
use providence_core::codecs::decode_extra_action_points;
use providence_core::codecs::decode_land_random_levels;
use providence_core::codecs::encode_extra_action_points;
use providence_core::codecs::encode_land_random_levels;
use providence_core::model::ClassicAction;
use providence_core::model::ExtraCodeRow;
use providence_core::model::MapRuntimeMetadata;
use providence_core::model::NativeRecordId;
use providence_core::model::RandomRectangle;
use providence_core::model::StableId;
use providence_core::session::EditorSession;
use serde_json::json;
use std::collections::BTreeSet;

#[test]
fn rebuilt_battle_range_problem_has_one_atomic_range_repair_command() {
    let mut snapshot = demo_snapshot();
    snapshot.world.action_points[0].actions.push(ClassicAction {
        slot: 2,
        raw_opcode: 2,
        target_native_id: 8,
    });
    snapshot.extra_codes.push(ExtraCodeRow {
        native_id: NativeRecordId(8),
        values: [814, 0, 3, 4, 5],
    });
    let mut session = EditorSession::new(snapshot);

    assert_extra_code_range_problem(&mut session);

    let repaired = dispatch_result(
        &mut session,
        "extra-code-battle-range.retarget",
        json!({
            "expectedRevision": 0,
            "source": "extra-code:8",
            "lowId": 12,
            "highId": 18
        }),
    )
    .expect("retarget complete battle range");
    assert_eq!(repaired["revision"], 1);
    assert_eq!(repaired["changedEntities"], json!(["extra-code:8"]));
    assert_eq!(
        session
            .snapshot()
            .extra_codes
            .iter()
            .find(|row| row.native_id == NativeRecordId(8))
            .unwrap()
            .values,
        [12, 18, 3, 4, 5]
    );
}

#[test]
fn random_rectangle_battle_range_problem_dispatches_one_atomic_signed_repair() {
    let mut session = random_battle_range_session();

    assert_random_region_battle_problem(&mut session);

    let repaired = dispatch_result(
        &mut session,
        "random-rectangle.battle-range.retarget",
        json!({
            "expectedRevision": 0,
            "source": "land:0:rect:2",
            "lowId": 2,
            "highId": 2
        }),
    )
    .expect("repair both Data RD Battle-range endpoints");
    assert_eq!(repaired["revision"], 1);
    assert_eq!(
        repaired["changedEntities"],
        json!(["land:0", "land:0:rect:2"])
    );
    assert_eq!(
        session.snapshot().world.maps[0]
            .runtime
            .as_ref()
            .unwrap()
            .random_rectangles[0]
            .battle_range,
        [-2, -2]
    );
    let after = dispatch_result(
        &mut session,
        "project.inspect-rebuilt-reachability",
        json!({"limit": 100}),
    )
    .expect("reinspect random-region repair");
    assert!(
        after["problems"]
            .as_array()
            .unwrap()
            .iter()
            .all(|problem| problem["source"] != "land:0:rect:2")
    );

    let encoded = encode_land_random_levels(&session.snapshot().world.maps, None)
        .expect("compile repaired Data RD");
    let reimported = decode_land_random_levels(&encoded);
    assert_eq!(
        reimported.records[0].runtime,
        *session.snapshot().world.maps[0].runtime.as_ref().unwrap()
    );
}

#[test]
fn two_data_rd_roots_route_four_runtime_paths_to_two_extra_code_words() {
    let mut session = shared_random_door_session();

    assert_shared_runtime_paths(&mut session);

    for (expected_revision, index) in [(0, 3), (1, 4)] {
        dispatch_result(
            &mut session,
            "extra-code-value.retarget",
            json!({
                "expectedRevision": expected_revision,
                "source": "extra-code:8",
                "index": index,
                "targetId": 3
            }),
        )
        .expect("repair one shared Data EDCD word");
    }
    let after = dispatch_result(
        &mut session,
        "project.inspect-rebuilt-reachability",
        json!({"limit": 100}),
    )
    .expect("reinspect both repaired runtime paths");
    assert!(
        after["problems"]
            .as_array()
            .unwrap()
            .iter()
            .all(|problem| problem["source"] != "extra-code:8")
    );
}

#[test]
fn shared_door_item_problem_creates_a_dense_extra_action_point_target() {
    let (mut session, source) = shared_door_item_session();

    assert_shared_door_item_problem(&mut session);

    let repaired = dispatch_result(
        &mut session,
        "extra-action-point.create",
        json!({"expectedRevision": 0, "nativeId": 69}),
    )
    .expect("create scenario-owned door target");
    assert_eq!(repaired["revision"], 1);
    assert_eq!(session.snapshot().extra_action_points.len(), 70);
    assert_eq!(
        session
            .snapshot()
            .extra_action_points
            .last()
            .unwrap()
            .identity,
        StableId("extra-action-point:69".into())
    );
    let after = dispatch_result(
        &mut session,
        "project.inspect-rebuilt-reachability",
        json!({"limit": 100}),
    )
    .expect("reinspect shared door-item repair");
    assert!(
        after["problems"]
            .as_array()
            .unwrap()
            .iter()
            .all(|problem| problem["source"] != "classic.item.662")
    );

    let encoded =
        encode_extra_action_points(&session.snapshot().extra_action_points, Some(&source))
            .expect("compile dense Data ED3");
    assert_eq!(encoded.len(), EXTRA_ACTION_POINT_RECORD_BYTES * 70);
    assert_eq!(
        decode_extra_action_points(&encoded).records,
        session.snapshot().extra_action_points
    );

    dispatch_result(&mut session, "history.undo", json!({"expectedRevision": 1}))
        .expect("undo target creation");
    assert_eq!(session.snapshot().extra_action_points.len(), 8);
    dispatch_result(&mut session, "history.redo", json!({"expectedRevision": 2}))
        .expect("redo target creation");
    assert_eq!(session.snapshot().extra_action_points.len(), 70);
}

#[test]
fn unsafe_inline_branch_problem_repairs_the_mode_and_target_pair() {
    let mut snapshot = demo_snapshot();
    snapshot.world.action_points[0].actions.push(ClassicAction {
        slot: 2,
        raw_opcode: 3,
        target_native_id: 8,
    });
    snapshot.extra_codes.push(ExtraCodeRow {
        native_id: NativeRecordId(8),
        values: [1, 2, 0, 106, 107],
    });
    let mut session = EditorSession::new(snapshot);

    assert_inline_branch_problem(&mut session);

    dispatch_result(
        &mut session,
        "extra-code-branch.retarget",
        json!({
            "expectedRevision": 0,
            "source": "extra-code:8",
            "layout": "choice",
            "mode": 1,
            "targetId": 40
        }),
    )
    .expect("repair branch to existing Extra Action Point");
    assert_eq!(
        session
            .snapshot()
            .extra_codes
            .iter()
            .find(|row| row.native_id == NativeRecordId(8))
            .unwrap()
            .values,
        [1, 1, 40, 106, 107]
    );
    let after = dispatch_result(
        &mut session,
        "project.inspect-rebuilt-reachability",
        json!({"limit": 10}),
    )
    .expect("reinspect repaired branch");
    assert!(
        after["problems"]
            .as_array()
            .unwrap()
            .iter()
            .all(|problem| problem["source"] != "extra-code:8")
    );
}

fn assert_extra_code_range_problem(session: &mut EditorSession) {
    let before = dispatch_result(
        session,
        "project.inspect-rebuilt-reachability",
        json!({"limit": 10}),
    )
    .expect("inspect battle range problem");
    let problem = before["problems"]
        .as_array()
        .unwrap()
        .iter()
        .find(|problem| problem["source"] == "extra-code:8")
        .expect("missing battle problem from Data EDCD");
    assert_eq!(problem["field"], "values[0..=1]");
    assert_eq!(problem["targetKind"], "battle");
    assert_eq!(problem["targetId"], "814");
    assert_eq!(problem["byteProvenance"]["nativePath"], "Data EDCD");
    assert_eq!(problem["byteProvenance"]["byteStart"], 80);
    assert_eq!(problem["byteProvenance"]["byteEnd"], 84);
    assert_eq!(
        problem["repair"]["method"],
        "extra-code-battle-range.retarget"
    );
    assert_eq!(
        problem["repair"]["targetParameters"],
        json!(["lowId", "highId"])
    );
}

fn assert_random_region_battle_problem(session: &mut EditorSession) {
    let before = dispatch_result(
        session,
        "project.inspect-rebuilt-reachability",
        json!({"limit": 100}),
    )
    .expect("inspect random-region Battle blocker");
    let problem = before["problems"]
        .as_array()
        .unwrap()
        .iter()
        .find(|problem| problem["source"] == "land:0:rect:2")
        .expect("missing random-region Battle problem");
    assert_eq!(problem["field"], "battleRange");
    assert_eq!(problem["targetKind"], "battle");
    assert_eq!(problem["targetId"], "99");
    assert_eq!(problem["byteProvenance"]["nativePath"], "Data RD");
    assert_eq!(problem["byteProvenance"]["recordIndex"], 0);
    assert_eq!(problem["byteProvenance"]["byteStart"], 208);
    assert_eq!(problem["byteProvenance"]["byteEnd"], 212);
    assert_eq!(
        problem["repair"]["method"],
        "random-rectangle.battle-range.retarget"
    );
    assert_eq!(
        problem["repair"]["targetParameters"],
        json!(["lowId", "highId"])
    );
}

fn assert_shared_runtime_paths(session: &mut EditorSession) {
    let before = dispatch_result(
        session,
        "project.inspect-rebuilt-reachability",
        json!({"limit": 100}),
    )
    .expect("inspect two Data RD-rooted programs");
    let rooted = before["problems"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|problem| problem["source"] == "extra-code:8")
        .collect::<Vec<_>>();
    assert_eq!(rooted.len(), 4);
    assert_eq!(
        rooted
            .iter()
            .map(|problem| problem["runtimeSource"].as_str().unwrap())
            .collect::<BTreeSet<_>>(),
        BTreeSet::from(["xap:40", "xap:41"])
    );
    assert_eq!(
        rooted
            .iter()
            .map(|problem| problem["field"].as_str().unwrap())
            .collect::<BTreeSet<_>>(),
        BTreeSet::from(["values[3]", "values[4]"])
    );
    assert!(rooted.iter().all(|problem| {
        problem["navigation"]["documentKind"] == "extra-code"
            && problem["repair"]["method"] == "extra-code-value.retarget"
            && problem["byteProvenance"]["nativePath"] == "Data EDCD"
    }));
}

fn assert_shared_door_item_problem(session: &mut EditorSession) {
    let before = dispatch_result(
        session,
        "project.inspect-rebuilt-reachability",
        json!({"limit": 100}),
    )
    .expect("inspect shared door-item blocker");
    let problem = before["problems"]
        .as_array()
        .unwrap()
        .iter()
        .find(|problem| problem["source"] == "classic.item.662")
        .expect("missing shared door-item Extra Action Point problem");
    assert_eq!(problem["field"], "special[4]");
    assert_eq!(problem["targetKind"], "extra-action-point");
    assert_eq!(problem["targetId"], "69");
    assert_eq!(problem["navigation"]["documentKind"], "item");
    assert_eq!(problem["repairActions"], json!(["create-target"]));
    assert_eq!(problem["byteProvenance"]["nativePath"], "Data ID");
    assert_eq!(problem["byteProvenance"]["recordIndex"], 662);
    assert_eq!(problem["byteProvenance"]["byteStart"], 66_294);
    assert_eq!(problem["byteProvenance"]["byteEnd"], 66_296);
    assert_eq!(problem["repair"]["method"], "extra-action-point.create");
    assert_eq!(problem["repair"]["params"]["nativeId"], 69);
}

fn assert_inline_branch_problem(session: &mut EditorSession) {
    let before = dispatch_result(
        session,
        "project.inspect-rebuilt-reachability",
        json!({"limit": 10}),
    )
    .expect("inspect unsafe inline branch");
    let problem = before["problems"]
        .as_array()
        .unwrap()
        .iter()
        .find(|problem| problem["source"] == "extra-code:8")
        .expect("unsafe inline branch problem");
    assert_eq!(problem["field"], "values[1..=2]");
    assert_eq!(problem["byteProvenance"]["byteStart"], 82);
    assert_eq!(problem["byteProvenance"]["byteEnd"], 86);
    assert_eq!(problem["repair"]["method"], "extra-code-branch.retarget");
    assert_eq!(problem["repair"]["params"]["layout"], "choice");
}

fn random_battle_range_session() -> EditorSession {
    let mut snapshot = demo_snapshot();
    snapshot.battles = decode_battles(&vec![0; BATTLE_RECORD_BYTES * 4]).records;
    snapshot.world.maps[0].runtime = Some(MapRuntimeMetadata {
        source: "Data RD".into(),
        source_blob: None,
        dark: false,
        uses_los: true,
        landlook: Some(0),
        base_scale: None,
        tileset_id: StableId("classic.landlook.0".into()),
        base_tile: None,
        random_rectangles: vec![RandomRectangle {
            identity: StableId("land:0:rect:2".into()),
            top: 3,
            left: 4,
            bottom: 8,
            right: 9,
            chance_ten_thousand: 750,
            battle_range: [-99, -99],
            random_doors: [0; 3],
            random_door_percent: [0; 3],
            only: false,
            option: 0,
            sound_id: 0,
            text_id: 0,
        }],
    });
    EditorSession::new(snapshot)
}

fn shared_random_door_session() -> EditorSession {
    let mut snapshot = demo_snapshot();
    snapshot.extra_action_points =
        decode_extra_action_points(&vec![0; EXTRA_ACTION_POINT_RECORD_BYTES * 42]).records;
    for native_id in [40, 41] {
        snapshot.extra_action_points[native_id].actions = vec![ClassicAction {
            slot: 0,
            raw_opcode: 67,
            target_native_id: 8,
        }];
    }
    snapshot.extra_codes.push(ExtraCodeRow {
        native_id: NativeRecordId(8),
        values: [29, 1, 0, 99, 100],
    });
    snapshot.world.maps[0].runtime = Some(MapRuntimeMetadata {
        source: "Data RD".into(),
        source_blob: None,
        dark: false,
        uses_los: true,
        landlook: Some(0),
        base_scale: None,
        tileset_id: StableId("classic.landlook.0".into()),
        base_tile: None,
        random_rectangles: vec![RandomRectangle {
            identity: StableId("land:0:rect:0".into()),
            top: 3,
            left: 4,
            bottom: 8,
            right: 9,
            chance_ten_thousand: 750,
            battle_range: [0, 0],
            random_doors: [40, 41, 0],
            random_door_percent: [50, 50, 0],
            only: false,
            option: 0,
            sound_id: 0,
            text_id: 0,
        }],
    });
    EditorSession::new(snapshot)
}

fn shared_door_item_session() -> (EditorSession, Vec<u8>) {
    let mut snapshot = demo_snapshot();
    let source = vec![0; EXTRA_ACTION_POINT_RECORD_BYTES * 8];
    snapshot.extra_action_points = decode_extra_action_points(&source).records;
    let mut definition = demo_scenario_items().remove(0).definition;
    definition.id = StableId("classic.item.662".into());
    definition.classic_id = 662;
    definition.item_type = 23;
    definition.special = [0, 0, 0, 0, 69];
    snapshot
        .item_rules
        .push(providence_core::model::SourcedItemRule {
            source: "Data ID record 662".into(),
            source_blob: providence_core::model::BlobId(format!("sha256:{}", "1".repeat(64))),
            text_source_blob: providence_core::model::BlobId(format!("sha256:{}", "2".repeat(64))),
            definition,
        });
    (EditorSession::new(snapshot), source)
}

use super::*;
use std::collections::BTreeSet;

#[test]
fn dungeon_triggers_use_level_matched_source_and_destination_maps() {
    let mut snapshot = snapshot();
    for (index, map) in snapshot.world.maps.iter_mut().enumerate() {
        map.identity = StableId(format!("dungeon:{index}"));
        map.level_type = LevelType::Dungeon;
    }
    for trigger in &mut snapshot.world.action_points {
        trigger.level_type = LevelType::Dungeon;
    }

    let projection = project_rebuilt_v3_trigger_programs(&snapshot).expect("projection");
    assert_eq!(projection.triggers.len(), 2);
    assert_eq!(
        projection.triggers[0].map_id,
        Some(StableId("dungeon:0".into()))
    );
    assert_eq!(
        projection.triggers[0]
            .post_action_location
            .as_ref()
            .map(|destination| destination.map_id.clone()),
        Some(StableId("dungeon:1".into()))
    );
    assert_eq!(
        projection.programs[0].owner_id,
        StableId("Data DDD:0:5".into())
    );
}

#[test]
fn imported_selected_trigger_preserves_an_unavailable_post_action_map() {
    let mut snapshot = snapshot();
    snapshot.origin = crate::model::ProjectOrigin::Imported {
        compatibility_annex: BlobId(format!("sha256:{}", "a".repeat(64))),
    };
    snapshot.world.action_points[0].post_action_level = 99;
    let program_id = action_point_program_id(&snapshot.world.action_points[0]);

    let projection =
        project_rebuilt_v3_selected_trigger_programs(&snapshot, &BTreeSet::from([program_id]))
            .expect("imported post-action destination is deferred");
    assert_eq!(projection.triggers.len(), 1);
    assert_eq!(
        projection.triggers[0]
            .post_action_location
            .as_ref()
            .map(|destination| destination.map_id.clone()),
        Some(StableId("land:99".into()))
    );
    assert!(matches!(
        project_rebuilt_v3_trigger_programs(&snapshot),
        Err(RebuiltV3ScenarioError::MissingDestinationMap(_, 99))
    ));
}

#[test]
fn opcode_92_cannot_silently_lose_its_consecutive_extra_code_row() {
    let mut snapshot = snapshot();
    snapshot.extra_codes.retain(|row| row.native_id.0 != 9);

    assert_eq!(
        project_rebuilt_v3_trigger_programs(&snapshot),
        Err(RebuiltV3ScenarioError::MissingConsecutiveExtraCodeRow {
            trigger: StableId("action-point:land:0:5".into()),
            native_id: 9,
        })
    );
}

#[test]
fn extra_action_points_emit_owner_matched_programs_and_resolve_application_hooks() {
    let mut snapshot = snapshot();
    snapshot.extra_action_points.push(ExtraActionPoint {
        identity: StableId("extra-action-point:40".into()),
        native_id: NativeRecordId(40),
        classic_door_id: 0,
        post_action_level: 0,
        post_action_x: 0,
        post_action_y: 0,
        chance_percent: 100,
        actions: vec![ClassicAction {
            slot: 0,
            raw_opcode: 92,
            target_native_id: 8,
        }],
    });

    let projection = project_rebuilt_v3_trigger_programs(&snapshot).expect("projection");
    let program = projection
        .programs
        .iter()
        .find(|program| program.id.0 == "xap:40")
        .expect("Extra AP program");
    assert_eq!(
        program.owner_kind,
        RebuiltV3ProgramOwnerKind::ExtraActionPoint
    );
    assert_eq!(program.owner_id, StableId("Data ED3:macro:40".into()));
    assert_eq!(
        program.instructions[0].extra_code,
        Some(vec![0, 0, 0, 83, 84, 90, 91, 92, 93, 94])
    );

    snapshot.scenario_application = Some(crate::model::ScenarioApplicationContract {
        hooks: ScenarioApplicationHooks {
            shop: Some(StableId("extra-action-point:40".into())),
            ..ScenarioApplicationHooks::default()
        },
    });
    let scenario = project_rebuilt_v3_scenario(&snapshot).expect("application hook resolves");
    assert_eq!(
        scenario.application_hooks.shop,
        Some(StableId("xap:40".into()))
    );
}

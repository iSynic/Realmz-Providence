use super::*;
#[test]
fn alternate_monster_death_hooks_extend_the_transitive_program_closure() {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("variant-hooks".into()));
    let mut application = ScenarioApplicationContract::default();
    application.hooks.start_game = Some(StableId("extra-action-point:0".into()));
    snapshot.scenario_application = Some(application);
    snapshot.extra_action_points = vec![
        xap(0, vec![action(0, 89, 7)]),
        xap(11, vec![action(0, 39, 13)]),
        xap(12, vec![]),
        xap(13, vec![]),
    ];
    for (set_id, native_path, macro_id) in [
        (0, "Data MD", 12),
        (1, "Data MD1", 11),
        (-1, "Data MD-1", -11),
    ] {
        let mut row = monster(7, macro_id);
        row.identity = StableId(format!("monster:{set_id}:7"));
        snapshot.monster_sets.push(MonsterSet {
            set_id,
            native_path: native_path.into(),
            monsters: vec![row],
        });
    }
    let report = derive_rebuilt_v3_reachability(&snapshot).expect("variant closure");
    assert_eq!(
        report.reachable_program_ids,
        vec!["xap:0", "xap:11", "xap:12", "xap:13"]
            .into_iter()
            .map(|id| StableId(id.into()))
            .collect::<Vec<_>>()
    );
    assert!(report.unresolved_references.is_empty());
    snapshot
        .extra_action_points
        .retain(|row| row.native_id.0 != 13);
    let missing = derive_rebuilt_v3_reachability(&snapshot).expect("missing transitive hook");
    assert!(
        missing
            .unresolved_references
            .iter()
            .any(|r| r.target == RebuiltV3ReachabilityTarget::Program(StableId("xap:13".into())))
    );
}

#[test]
fn automatic_simple_result_keeps_its_called_program_without_choice_text() {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("automatic-encounter".into()));
    let mut application = ScenarioApplicationContract::default();
    application.hooks.start_game = Some(StableId("extra-action-point:0".into()));
    snapshot.scenario_application = Some(application);
    snapshot.extra_action_points = vec![xap(0, vec![action(0, 4, 0)]), xap(2, vec![])];
    snapshot.simple_encounters.push(SimpleEncounter {
        identity: StableId("simple-encounter:0".into()),
        native_id: NativeRecordId(0),
        actions: vec![action(24, 39, 2)],
        choice_results: [-4, 0, 0, 0],
        can_back_out: false,
        max_times: 1,
        caste_success: 0,
        prompt_message_native_id: 0,
        texts: std::array::from_fn(|_| String::new()),
        authored: true,
    });
    let report = derive_rebuilt_v3_reachability(&snapshot).expect("automatic result");
    assert!(
        report
            .reachable_program_ids
            .contains(&StableId("simple:0:result:3".into()))
    );
    assert!(
        report
            .reachable_program_ids
            .contains(&StableId("xap:2".into()))
    );
}

#[test]
fn complex_timeout_and_retained_simple_context_keep_transitive_targets() {
    let mut snapshot = timeout_fixture();
    let report = derive_rebuilt_v3_reachability(&snapshot).expect("timeout closure");
    assert!(
        report
            .reachable_program_ids
            .contains(&StableId("xap:9".into()))
    );
    let native_empty = StableId("simple:8:result:1".into());
    assert!(report.reachable_program_ids.contains(&native_empty));
    let projection = crate::rebuilt::encounters::project_rebuilt_v3_selected_simple_encounters(
        &snapshot,
        &BTreeSet::from([8]),
        &report.reachable_program_ids.iter().cloned().collect(),
    )
    .expect("retained empty result projection");
    assert!(
        projection
            .programs
            .iter()
            .any(|row| row.id == native_empty && row.instructions.is_empty())
    );
    snapshot
        .simple_encounters
        .last_mut()
        .unwrap()
        .actions
        .push(action(8, 39, 13));
    snapshot.extra_action_points.push(xap(13, vec![]));
    let hidden = derive_rebuilt_v3_reachability(&snapshot).expect("retained non-dialogue actions");
    assert!(
        hidden
            .reachable_program_ids
            .contains(&StableId("xap:13".into()))
    );
    let hidden_projection =
        crate::rebuilt::encounters::project_rebuilt_v3_selected_simple_encounters(
            &snapshot,
            &BTreeSet::from([8]),
            &hidden.reachable_program_ids.iter().cloned().collect(),
        )
        .expect("non-dialogue native result projection");
    assert!(hidden_projection.programs.iter().any(|row| {
        row.id == native_empty
            && row
                .instructions
                .first()
                .is_some_and(|instruction| instruction.opcode == 39 && instruction.id == 13)
    }));
    snapshot.complex_encounters[0].max_times = 1;
    let no_timeout = derive_rebuilt_v3_reachability(&snapshot).expect("no timeout");
    assert!(
        !no_timeout
            .reachable_program_ids
            .contains(&StableId("xap:9".into()))
    );
}

#[test]
fn random_region_mutations_keep_correlated_ranges_and_revisit_partial_writes() {
    let snapshot = random_mutation_fixture();
    let report = derive_rebuilt_v3_reachability(&snapshot).expect("mutation closure");
    assert_eq!(report.reachable_battle_ids, vec![7, 8, 9, 10]);
    assert!(
        report
            .reachable_program_ids
            .contains(&StableId("xap:9".into()))
    );
    assert!(
        report
            .unresolved_references
            .iter()
            .any(|r| matches!(&r.target,
        RebuiltV3ReachabilityTarget::Invalid(detail) if detail.contains("rectangle 24")))
    );
    assert!(
        !report
            .references
            .iter()
            .any(|r| r.target == RebuiltV3ReachabilityTarget::Battle(99))
    );
    assert!(
        report
            .reachable_program_ids
            .contains(&StableId("xap:13".into())),
        "later random battle must not freeze the encounter that changed its region"
    );
}

fn timeout_fixture() -> ProjectSnapshot {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("timeout-retained".into()));
    let mut application = ScenarioApplicationContract::default();
    application.hooks.start_game = Some(StableId("extra-action-point:0".into()));
    snapshot.scenario_application = Some(application);
    snapshot.extra_action_points = vec![xap(0, vec![action(0, 5, 0)]), xap(9, vec![])];
    snapshot.complex_encounters.push(ComplexEncounter {
        identity: StableId("complex-encounter:0".into()),
        native_id: NativeRecordId(0),
        actions: vec![action(16, 33, 0)],
        action_result: 1,
        word_result: 0,
        groups: [0; 8],
        spell_ids: [0; 10],
        spell_results: [0; 10],
        item_ids: [0; 5],
        item_results: [0; 5],
        can_back_out: false,
        thief: false,
        max_times: 2,
        caste_success: 0,
        thief_success: 0,
        thief_fail: 0,
        prompt_message_native_id: 0,
        texts: std::array::from_fn(|_| String::new()),
        authored: true,
    });
    snapshot.extra_codes.push(ExtraCodeRow {
        native_id: NativeRecordId(0),
        values: [1, 2, 1, 1, 0],
    });
    add_retained_simple_rows(&mut snapshot);
    snapshot
}

fn random_mutation_fixture() -> ProjectSnapshot {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("mutated-battles".into()));
    let mut application = ScenarioApplicationContract::default();
    application.hooks.start_game = Some(StableId("extra-action-point:0".into()));
    snapshot.scenario_application = Some(application);
    snapshot.extra_action_points = vec![xap(0, vec![action(0, 4, 1)])];
    for id in [1, 2] {
        snapshot.simple_encounters.push(SimpleEncounter {
            identity: StableId(format!("simple-encounter:{id}")),
            native_id: NativeRecordId(id),
            actions: if id == 1 {
                vec![action(0, 23, 0), action(1, 23, 1), action(2, 23, 2)]
            } else {
                vec![action(8, 39, 13)]
            },
            choice_results: [1, 0, 0, 0],
            can_back_out: false,
            max_times: 1,
            caste_success: 0,
            prompt_message_native_id: 0,
            texts: [
                "Continue".into(),
                String::new(),
                String::new(),
                String::new(),
            ],
            authored: true,
        });
    }
    snapshot.extra_codes = vec![
        ExtraCodeRow {
            native_id: NativeRecordId(0),
            values: [0, 4, 100, 7, 8],
        },
        ExtraCodeRow {
            native_id: NativeRecordId(1),
            values: [0, 4, 100, -1, 10],
        },
        ExtraCodeRow {
            native_id: NativeRecordId(2),
            values: [0, 24, 100, 99, 99],
        },
        ExtraCodeRow {
            native_id: NativeRecordId(3),
            values: [1, 2, 1, 1, 0],
        },
    ];
    add_random_map_and_battles(&mut snapshot);
    snapshot
}

fn add_random_map_and_battles(snapshot: &mut ProjectSnapshot) {
    snapshot.world.maps.push(MapLevel {
        identity: StableId("land:0".into()),
        level_type: LevelType::Land,
        native_index: 0,
        name: String::new(),
        tiles: vec![],
        runtime: Some(MapRuntimeMetadata {
            source: String::new(),
            source_blob: None,
            dark: false,
            uses_los: false,
            landlook: None,
            base_scale: None,
            tileset_id: StableId("tiles".into()),
            base_tile: None,
            random_rectangles: vec![],
        }),
    });
    snapshot.battles = (7..=10)
        .map(|id| BattleRecord {
            identity: StableId(format!("battle:{id}")),
            native_id: NativeRecordId(id),
            grid: vec![0; 169],
            distance: 1,
            message_before: 0,
            message_after: 0,
            battle_macro: if id == 10 { -9 } else { 0 },
            authored: true,
        })
        .collect();
    snapshot
        .extra_action_points
        .push(xap(9, vec![action(0, 33, 3)]));
    snapshot.extra_action_points.push(xap(13, vec![]));
}

fn add_retained_simple_rows(snapshot: &mut ProjectSnapshot) {
    snapshot.simple_encounters.push(SimpleEncounter {
        identity: StableId("simple-encounter:7".into()),
        native_id: NativeRecordId(7),
        actions: vec![action(8, 39, 9)],
        choice_results: [1, 0, 0, 0],
        can_back_out: false,
        max_times: 1,
        caste_success: 0,
        prompt_message_native_id: 0,
        texts: [
            "Continue".into(),
            String::new(),
            String::new(),
            String::new(),
        ],
        authored: true,
    });
    let mut reserved = snapshot.simple_encounters[0].clone();
    reserved.native_id = NativeRecordId(8);
    reserved.identity = StableId("simple-encounter:8".into());
    reserved.actions.clear();
    reserved.choice_results = [0; 4];
    reserved.max_times = 0;
    reserved.texts = std::array::from_fn(|_| String::new());
    reserved.authored = false;
    snapshot.simple_encounters.push(reserved);
}

#[test]
fn random_mutation_reports_match_naive_with_land_and_dungeon_writes() {
    let mut snapshot = random_mutation_fixture();
    let mut dungeon = snapshot.world.maps[0].clone();
    dungeon.identity = StableId("dungeon:0".into());
    dungeon.level_type = LevelType::Dungeon;
    snapshot.world.maps.push(dungeon);
    snapshot.extra_action_points[0]
        .actions
        .extend([action(2, -23, 0), action(3, 23, 0)]);
    let fast = derive_rebuilt_v3_reachability(&snapshot).unwrap();
    let mut naive = ReachabilityBuilder::new(&snapshot).unwrap();
    naive.naive_random_regions = true;
    naive.add_roots();
    naive.run();
    assert_eq!(fast, naive.finish());
}

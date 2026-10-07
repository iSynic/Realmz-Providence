use providence_core::model::{
    ActionPoint, ClassicAction, ComplexEncounter, ExtraActionPoint, LevelType, MapCoordinate,
    NativeRecordId, ProjectSnapshot, SimpleEncounter, StableId,
};

pub(super) fn snapshot() -> ProjectSnapshot {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("source-geometry".into()));
    snapshot.world.action_points = vec![placed(LevelType::Land), placed(LevelType::Dungeon)];
    snapshot.extra_action_points.push(macro_row());
    snapshot.simple_encounters.push(simple());
    snapshot.complex_encounters.push(complex());
    snapshot
}

pub(super) fn opcode_context_snapshot() -> ProjectSnapshot {
    let mut snapshot = snapshot();
    for owner in &mut snapshot.world.action_points {
        owner.actions[0].raw_opcode = 44;
    }
    snapshot.extra_action_points[0].actions[0].raw_opcode = 44;
    snapshot.simple_encounters[0].actions[0].raw_opcode = 44;
    snapshot
}

fn action(slot: u8) -> ClassicAction {
    ClassicAction {
        slot,
        raw_opcode: 1,
        target_native_id: 149,
    }
}

fn placed(level_type: LevelType) -> ActionPoint {
    let kind = match level_type {
        LevelType::Land => "land",
        LevelType::Dungeon => "dungeon",
    };
    ActionPoint {
        identity: StableId(format!("action-point:{kind}:2:3")),
        level_type,
        level_index: 2,
        record_index: 3,
        classic_door_id: 0,
        coordinate: Some(MapCoordinate { x: 1, y: 1 }),
        post_action_level: 2,
        post_action_x: 1,
        post_action_y: 1,
        chance_percent: 100,
        actions: vec![action(2)],
    }
}

fn macro_row() -> ExtraActionPoint {
    ExtraActionPoint {
        identity: StableId("extra-action-point:7".into()),
        native_id: NativeRecordId(7),
        classic_door_id: 0,
        post_action_level: 0,
        post_action_x: 0,
        post_action_y: 0,
        chance_percent: 100,
        actions: vec![action(2)],
    }
}

fn simple() -> SimpleEncounter {
    SimpleEncounter {
        identity: StableId("simple-encounter:7".into()),
        native_id: NativeRecordId(7),
        actions: vec![action(18)],
        choice_results: [0; 4],
        can_back_out: false,
        max_times: 0,
        caste_success: 0,
        prompt_message_native_id: 0,
        texts: std::array::from_fn(|_| String::new()),
        authored: false,
    }
}

fn complex() -> ComplexEncounter {
    ComplexEncounter {
        identity: StableId("complex-encounter:7".into()),
        native_id: NativeRecordId(7),
        actions: vec![action(18)],
        action_result: 0,
        word_result: 0,
        groups: [0; 8],
        spell_ids: [0; 10],
        spell_results: [0; 10],
        item_ids: [0; 5],
        item_results: [0; 5],
        can_back_out: false,
        thief: false,
        max_times: 0,
        caste_success: 0,
        thief_success: 0,
        thief_fail: 0,
        prompt_message_native_id: 0,
        texts: std::array::from_fn(|_| String::new()),
        authored: false,
    }
}

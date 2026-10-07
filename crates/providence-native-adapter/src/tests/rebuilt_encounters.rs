use crate::dispatch_result;
use providence_core::codecs::COMPLEX_ENCOUNTER_RECORD_BYTES;
use providence_core::codecs::MONSTER_RECORD_BYTES;
use providence_core::codecs::ROGUE_ENCOUNTER_RECORD_BYTES;
use providence_core::codecs::TIMED_ENCOUNTER_RECORD_BYTES;
use providence_core::codecs::decode_complex_encounters;
use providence_core::codecs::decode_monster_set;
use providence_core::codecs::decode_rogue_encounters;
use providence_core::codecs::decode_timed_encounters;
use providence_core::model::BattleRecord;
use providence_core::model::ClassicAction;
use providence_core::model::ExtraActionPoint;
use providence_core::model::MonsterDescription;
use providence_core::model::NativeRecordId;
use providence_core::model::ProjectSnapshot;
use providence_core::model::ScenarioMessage;
use providence_core::model::SimpleEncounter;
use providence_core::model::StableId;
use providence_core::session::EditorSession;
use providence_core::session::Revision;
use serde_json::json;

#[test]
fn rebuilt_battle_inspection_returns_exact_signed_grid_projection() {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("battle-projection".into()));
    snapshot.monster_sets.push(decode_monster_set(
        &vec![0; MONSTER_RECORD_BYTES * 8],
        "Data MD",
        0,
    ));
    snapshot.messages = [4, 5]
        .into_iter()
        .map(|id| ScenarioMessage {
            identity: StableId(format!("message:{id}")),
            native_id: NativeRecordId(id),
            text: format!("Message {id}"),
            authored: true,
        })
        .collect();
    snapshot.extra_action_points.push(ExtraActionPoint {
        identity: StableId("extra-action-point:6".into()),
        native_id: NativeRecordId(6),
        classic_door_id: 6,
        post_action_level: 0,
        post_action_x: 0,
        post_action_y: 0,
        chance_percent: 100,
        actions: Vec::new(),
    });
    let mut grid = vec![0; providence_core::codecs::BATTLE_GRID_SLOTS];
    grid[14] = -7;
    snapshot.battles.push(BattleRecord {
        identity: StableId("battle:2".into()),
        native_id: NativeRecordId(2),
        grid,
        distance: 9,
        message_before: -4,
        message_after: 5,
        battle_macro: -6,
        authored: true,
    });
    let mut session = EditorSession::new(snapshot);

    let result = dispatch_result(&mut session, "project.inspect-rebuilt-battles", json!({}))
        .expect("inspect battles");

    assert_eq!(result[0]["id"], "classic.battle.2");
    assert_eq!(result[0]["monsterSlots"][0]["x"], 1);
    assert_eq!(result[0]["monsterSlots"][0]["y"], 1);
    assert_eq!(
        result[0]["monsterSlots"][0]["monsterId"],
        "classic.monster.7"
    );
    assert_eq!(result[0]["monsterSlots"][0]["invertTraitor"], true);
    assert_eq!(result[0]["messageBeforeId"], -4);
    assert_eq!(result[0]["macroId"], -6);
    assert_eq!(session.revision(), Revision(0));
}

#[test]
fn rebuilt_monster_inspection_preserves_native_slot_identity() {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("monster-projection".into()));
    let mut normal = decode_monster_set(&vec![0; MONSTER_RECORD_BYTES], "Data MD", 0);
    normal.monsters[0].display_name = "Tide Warden".into();
    normal.monsters[0].spells[0] = 1201;
    normal.monsters[0].spells[1] = 0;
    normal.monsters[0].items[0] = -12;
    normal.monsters[0].weapon = -3;
    snapshot.monster_sets.push(normal);
    snapshot.monster_descriptions.push(MonsterDescription {
        identity: StableId("monster-description:0".into()),
        native_id: NativeRecordId(0),
        text: "Keeper of the drowned archive.".into(),
        authored: true,
    });
    let mut session = EditorSession::new(snapshot);

    let result = dispatch_result(&mut session, "project.inspect-rebuilt-monsters", json!({}))
        .expect("inspect monsters");

    assert_eq!(result["monsters"][0]["id"], "classic.monster.0");
    assert_eq!(result["monsters"][0]["spellIds"][0], "classic.spell.1201");
    assert_eq!(result["monsters"][0]["spellIds"][1], "");
    assert_eq!(result["monsters"][0]["itemIds"][0], "classic.item.12");
    assert_eq!(result["monsters"][0]["weaponId"], "");
    assert_eq!(result["monsters"][0]["randomWeaponTable"], 3);
    assert_eq!(result["monsterDescriptions"][0]["id"], 0);
    assert_eq!(session.revision(), Revision(0));
}

#[test]
fn rebuilt_complex_encounter_inspection_returns_result_programs() {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("complex-projection".into()));
    let mut encounter = decode_complex_encounters(&vec![0; COMPLEX_ENCOUNTER_RECORD_BYTES])
        .records
        .remove(0);
    encounter.prompt_message_native_id = -47;
    encounter.texts[0] = "Read the tide marks".into();
    encounter.actions.push(ClassicAction {
        slot: 24,
        raw_opcode: -1,
        target_native_id: 47,
    });
    snapshot.complex_encounters.push(encounter);
    snapshot.messages.push(ScenarioMessage {
        identity: StableId("message:47".into()),
        native_id: NativeRecordId(47),
        text: "The tide marks form a warning.".into(),
        authored: true,
    });
    let mut session = EditorSession::new(snapshot);

    let result = dispatch_result(
        &mut session,
        "project.inspect-rebuilt-complex-encounters",
        json!({}),
    )
    .expect("inspect Complex Encounters");

    assert_eq!(result["complexEncounters"][0]["promptMessageId"], -47);
    assert_eq!(result["programs"].as_array().unwrap().len(), 4);
    assert_eq!(result["programs"][3]["id"], "complex:0:result:3");
    assert_eq!(result["programs"][3]["instructions"][0]["slot"], 0);
    assert_eq!(result["programs"][3]["instructions"][0]["gosub"], true);
    assert_eq!(session.revision(), Revision(0));
}

#[test]
fn rebuilt_rogue_encounter_inspection_returns_exact_fixed_fields() {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("rogue-projection".into()));
    let mut encounter = decode_rogue_encounters(&[0; ROGUE_ENCOUNTER_RECORD_BYTES])
        .records
        .remove(0);
    encounter.type_flags[3] = true;
    encounter.modifiers[3] = -7;
    encounter.success_text[3] = -47;
    encounter.prompt_sounds[2] = 603;
    snapshot.rogue_encounters.push(encounter);
    let mut session = EditorSession::new(snapshot);

    let result = dispatch_result(
        &mut session,
        "project.inspect-rebuilt-rogue-encounters",
        json!({}),
    )
    .expect("inspect Rogue Encounters");

    assert_eq!(result[0]["id"], 0);
    assert_eq!(result[0]["typeFlags"][3], true);
    assert_eq!(result[0]["modifiers"][3], -7);
    assert_eq!(result[0]["successText"][3], -47);
    assert_eq!(result[0]["promptSounds"][2], 603);
    assert_eq!(session.revision(), Revision(0));
}

#[test]
fn rebuilt_simple_encounter_inspection_returns_messages_choices_and_programs() {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("simple-projection".into()));
    snapshot.messages.push(ScenarioMessage {
        identity: StableId("message:47".into()),
        native_id: NativeRecordId(47),
        text: "The western gate is sealed.".into(),
        authored: true,
    });
    snapshot.simple_encounters.push(SimpleEncounter {
        identity: StableId("simple-encounter:3".into()),
        native_id: NativeRecordId(3),
        actions: vec![ClassicAction {
            slot: 16,
            raw_opcode: -1,
            target_native_id: 47,
        }],
        choice_results: [3, 0, 0, 0],
        can_back_out: true,
        max_times: 2,
        caste_success: -1,
        prompt_message_native_id: -47,
        texts: [
            "Force the gate".into(),
            String::new(),
            String::new(),
            String::new(),
        ],
        authored: true,
    });
    let mut session = EditorSession::new(snapshot);

    let result = dispatch_result(
        &mut session,
        "project.inspect-rebuilt-simple-encounters",
        json!({}),
    )
    .expect("inspect Simple Encounters");

    assert_eq!(result["messages"][0]["id"], 47);
    assert_eq!(result["simpleEncounters"][0]["promptMessageId"], -47);
    assert_eq!(
        result["simpleEncounters"][0]["responses"][0]["resultProgramId"],
        "simple:3:result:2"
    );
    assert_eq!(result["programs"].as_array().unwrap().len(), 4);
    assert_eq!(result["programs"][2]["instructions"][0]["slot"], 0);
    assert_eq!(session.revision(), Revision(0));
}

#[test]
fn rebuilt_timed_encounter_inspection_returns_runtime_xap_and_exclusions() {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("timed-projection".into()));
    snapshot.extra_action_points.push(ExtraActionPoint {
        identity: StableId("extra-action-point:4".into()),
        native_id: NativeRecordId(4),
        classic_door_id: 0,
        post_action_level: 0,
        post_action_x: 0,
        post_action_y: 0,
        chance_percent: 100,
        actions: Vec::new(),
    });
    let mut records = decode_timed_encounters(&[0; TIMED_ENCOUNTER_RECORD_BYTES * 2]).records;
    records[0].day = 5;
    records[0].door = 4;
    records[0].location_kind = providence_core::model::TimedEncounterLocationKind::Dungeon;
    records[1].day = 0;
    snapshot.timed_encounters = records;
    let mut session = EditorSession::new(snapshot);

    let result = dispatch_result(
        &mut session,
        "project.inspect-rebuilt-timed-encounters",
        json!({}),
    )
    .expect("inspect Timed Encounters");

    assert_eq!(result["timedEncounters"][0]["programId"], "xap:4");
    assert_eq!(result["timedEncounters"][0]["locationKind"], "dungeon");
    assert_eq!(result["excludedNativeIds"], json!([1]));
    assert_eq!(session.revision(), Revision(0));
}

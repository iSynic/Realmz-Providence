use super::*;

fn describe(session: &mut EditorSession, opcode: i16, values: Value) -> Value {
    dispatch_result(
        session,
        "action-form.describe",
        json!({"query": {
            "actionIdentity": format!("realmz.action.{opcode}"),
            "targetNativeId": 33, "values": values, "context": {}
        }}),
    )
    .expect("describe action fields through the adapter")
}

fn field<'a>(description: &'a Value, key: &str) -> &'a Value {
    description["fields"]
        .as_array()
        .unwrap()
        .iter()
        .find(|field| field["key"] == key)
        .unwrap()
}

fn assert_not_reference(field: &Value) {
    assert!(field["targetKind"].is_null(), "{field}");
    assert!(field["preview"].is_null(), "{field}");
}

#[test]
fn media_target_responses_refuse_wrong_types_and_ambiguous_exact_keys() {
    use providence_core::model::AssetDescriptor;
    let mut snapshot = demo_snapshot();
    let make = |identity: &str, kind: &str, resource_type: &str| -> AssetDescriptor {
        serde_json::from_value(
            json!({"identity": identity, "label": identity, "kind": kind,
            "classicResource": {"resourceType": resource_type, "resourceId": 33},
            "blob": "fixture", "byteLength": 1, "source": "controlled"}),
        )
        .unwrap()
    };
    snapshot.assets = vec![make("wrong-key", "sound", "PICT")];
    for extra in [
        None,
        Some(make("correct", "sound", "snd ")),
        Some(make("collision", "picture", "snd ")),
    ] {
        if let Some(asset) = extra {
            snapshot.assets.push(asset);
        }
        let mut session = EditorSession::new(snapshot.clone());
        let before = session.snapshot().clone();
        let page = dispatch_result(
            &mut session,
            "action-target.list",
            json!({"query": {"kind": "sound", "search": "33", "limit": 128}}),
        )
        .unwrap();
        let description = describe(&mut session, 9, json!({}));
        let resolved = snapshot.assets.len() == 2;
        assert_eq!(
            page["items"].as_array().unwrap().len(),
            usize::from(resolved)
        );
        assert_eq!(!description["fields"][0]["preview"].is_null(), resolved);
        if resolved {
            assert_eq!(description["fields"][0]["preview"]["identity"], "correct");
        }
        assert_eq!(session.snapshot(), &before);
    }
}

#[test]
fn scalar_collisions_and_mode_changes_do_not_infer_adapter_links() {
    let mut snapshot = demo_snapshot();
    let mut collision = snapshot.extra_action_points[0].clone();
    collision.identity = StableId("extra-action-point:33".into());
    collision.native_id = NativeRecordId(33);
    snapshot.extra_action_points.push(collision);
    let mut session = EditorSession::new(snapshot);
    let before = session.snapshot().clone();
    let mut values = json!({"percent": 33, "successBehavior": 1,
        "branchMode": 0, "target": 40, "slot": 33});
    let xap = describe(&mut session, 42, values.clone());
    for key in ["percent", "successBehavior", "branchMode", "slot"] {
        assert_not_reference(field(&xap, key));
    }
    assert_eq!(field(&xap, "target")["targetKind"], "extra-action-point");
    assert_eq!(
        field(&xap, "target")["preview"]["identity"],
        "extra-action-point:40"
    );
    values["branchMode"] = json!(1);
    let local = describe(&mut session, 42, values.clone());
    assert_not_reference(field(&local, "target"));
    assert_not_reference(field(&local, "slot"));
    assert_eq!(field(&local, "target")["value"], 40);
    values["branchMode"] = json!(0);
    assert_eq!(describe(&mut session, 42, values), xap);
    assert_eq!(session.snapshot(), &before);
}

#[test]
fn existing_monster_record_does_not_turn_a_name_tag_into_a_record_link() {
    use providence_core::codecs::{MONSTER_RECORD_BYTES, decode_monster_set};
    let mut snapshot = demo_snapshot();
    let mut monsters = decode_monster_set(&vec![0; 34 * MONSTER_RECORD_BYTES], "Data MD", 0);
    monsters.monsters[1].name_id = 33;
    monsters.monsters[1].display_name = "Goblin".into();
    monsters.monsters[2].name_id = 33;
    monsters.monsters[2].display_name = "Goblin Archer".into();
    snapshot.monster_sets.push(monsters);
    let mut session = EditorSession::new(snapshot);
    let targets = dispatch_result(
        &mut session,
        "action-target.list",
        json!({
            "query": {"kind": "monster", "search": "33", "limit": 128, "context": {}}
        }),
    )
    .unwrap();
    assert!(
        targets["items"]
            .as_array()
            .unwrap()
            .iter()
            .any(|row| row["value"] == 33)
    );
    for opcode in [88, 127] {
        let description = describe(&mut session, opcode, json!({}));
        assert_not_reference(&description["fields"][0]);
        assert_eq!(description["fields"][0]["label"], "Monster Name Tag");
        assert_eq!(
            description["fields"][0]["valuePickerKind"],
            "monster-name-tag"
        );
    }
    let tag_targets = dispatch_result(
        &mut session,
        "action-target.list",
        json!({
            "query": {"kind": "monster-name-tag", "search": "goblin", "limit": 128}
        }),
    )
    .unwrap();
    assert_eq!(tag_targets["items"].as_array().unwrap().len(), 1);
    assert_eq!(tag_targets["items"][0]["value"], 33);
    assert!(
        tag_targets["items"][0]["detail"]
            .as_str()
            .unwrap()
            .contains("2 monster definitions")
    );
    let record = describe(&mut session, 89, json!({}));
    assert_eq!(record["fields"][0]["targetKind"], "monster");
    assert!(!record["fields"][0]["preview"].is_null());
}

#[test]
fn half_truth_choice_defaults_survive_the_adapter_contract() {
    let mut session = EditorSession::new(demo_snapshot());
    let choice = describe(
        &mut session,
        3,
        json!({"replyPolarity": 1,
        "branchMode": 1, "branchTarget": 436, "promptA": 0, "promptB": 0}),
    );
    assert_eq!(choice["authoring"]["controls"][0]["value"], 0);
    assert_eq!(
        choice["authoring"]["controls"][0]["choices"][0]["label"],
        "Default Yes/No"
    );
    for key in ["promptA", "promptB"] {
        let field = field(&choice, key);
        assert_eq!(field["value"], 0);
        assert!(field["preview"].is_null());
        assert!(field["targetKind"].is_null());
    }
}

#[test]
fn time_change_projects_named_absolute_controls_and_signed_offsets() {
    let mut session = EditorSession::new(demo_snapshot());
    let before = session.snapshot().clone();
    let absolute = dispatch_result(
        &mut session,
        "action-form.describe",
        json!({"query": {
            "actionIdentity": "realmz.action.63", "targetNativeId": 63,
            "values": {"mode": 1, "dayOrDelta": -1, "hourOrDelta": 17,
                "minuteOrDelta": -1},
            "context": {"authoring": {"modes": {"dayOrDeltaBehavior": 1},
                "selections": {"dayOrDelta": 42}}}
        }}),
    )
    .unwrap();
    assert_eq!(absolute["authoring"]["controls"][0]["label"], "Time Change");
    assert_eq!(absolute["authoring"]["controls"][1]["label"], "Day");
    assert_eq!(absolute["authoring"]["resolvedValues"]["dayOrDelta"], 42);
    assert_eq!(field(&absolute, "hourOrDelta")["maximum"], 23);

    let offset = describe(
        &mut session,
        63,
        json!({"mode": 2, "dayOrDelta": -1, "hourOrDelta": -2,
            "minuteOrDelta": -3}),
    );
    assert_eq!(offset["authoring"]["controls"].as_array().unwrap().len(), 1);
    assert_eq!(field(&offset, "dayOrDelta")["value"], -1);
    assert_not_reference(field(&offset, "dayOrDelta"));
    assert_eq!(session.snapshot(), &before);
}

#[test]
fn time_branch_projects_named_wildcards_and_exact_xap_links() {
    let mut session = EditorSession::new(demo_snapshot());
    let before = session.snapshot().clone();
    let branch = dispatch_result(
        &mut session,
        "action-form.describe",
        json!({"query": {
            "actionIdentity": "realmz.action.64", "targetNativeId": 64,
            "values": {"dayLimit": 7, "hourLimit": 17,
                "successMacro": 40, "failureMacro": 41},
            "context": {"authoring": {"modes": {"dayLimitTest": 0},
                "selections": {"dayLimit": 99}}}
        }}),
    )
    .unwrap();
    assert_eq!(branch["action"]["gosubApplicable"], true);
    assert_eq!(branch["authoring"]["controls"][0]["label"], "Day Test");
    assert_eq!(
        branch["authoring"]["controls"][0]["choices"][0]["label"],
        "Ignore Day"
    );
    assert_eq!(branch["authoring"]["resolvedValues"]["dayLimit"], -1);
    assert_eq!(
        field(&branch, "successMacro")["targetKind"],
        "extra-action-point"
    );
    assert_eq!(
        field(&branch, "failureMacro")["targetKind"],
        "extra-action-point"
    );
    assert_eq!(session.snapshot(), &before);
}

#[test]
fn timed_encounter_change_projects_named_keep_set_and_day_base_controls() {
    let mut session = EditorSession::new(demo_snapshot());
    let before = session.snapshot().clone();
    let change = dispatch_result(
        &mut session,
        "action-form.describe",
        json!({"query": {
            "actionIdentity": "realmz.action.54", "targetNativeId": 54,
            "values": {"timedEncounter": 0, "percentOrKeep": -7,
                "incrementOrKeep": 4, "resetDayFlag": 9, "dayOffsetOrKeep": -1},
            "context": {"authoring": {"modes": {"percentOrKeepBehavior": 1,
                "activationDayBase": 0}, "selections": {"percentOrKeep": 85}}}
        }}),
    )
    .unwrap();
    assert_eq!(
        field(&change, "timedEncounter")["targetKind"],
        "timed-encounter"
    );
    assert_eq!(
        change["authoring"]["controls"][0]["label"],
        "Activation Chance"
    );
    assert_eq!(change["authoring"]["resolvedValues"]["percentOrKeep"], 85);
    assert_eq!(change["authoring"]["resolvedValues"]["resetDayFlag"], 0);
    assert_eq!(field(&change, "percentOrKeep")["maximum"], 100);
    assert_not_reference(field(&change, "percentOrKeep"));
    assert_not_reference(field(&change, "incrementOrKeep"));
    assert_not_reference(field(&change, "dayOffsetOrKeep"));
    assert_eq!(session.snapshot(), &before);
}

#[test]
fn random_item_count_projects_named_fixed_and_random_modes() {
    let mut session = EditorSession::new(demo_snapshot());
    let before = session.snapshot().clone();
    let random = dispatch_result(
        &mut session,
        "action-form.describe",
        json!({"query": {
            "actionIdentity": "realmz.action.65", "targetNativeId": 65,
            "values": {"countOrRandomLimit": 4, "itemLow": 1, "itemHigh": 3},
            "context": {"authoring": {"modes": {"itemCountMode": 1},
                "selections": {"countOrRandomLimit": 8}}}
        }}),
    )
    .unwrap();
    assert_eq!(random["authoring"]["controls"][0]["label"], "Item Count");
    assert_eq!(
        random["authoring"]["controls"][0]["choices"][1]["label"],
        "Random count"
    );
    assert_eq!(
        random["authoring"]["resolvedValues"]["countOrRandomLimit"],
        -8
    );
    assert_eq!(
        field(&random, "countOrRandomLimit")["label"],
        "Random Maximum"
    );
    assert_eq!(field(&random, "countOrRandomLimit")["value"], 8);
    assert_eq!(field(&random, "countOrRandomLimit")["maximum"], 20);
    assert_eq!(field(&random, "itemLow")["targetKind"], "item");
    assert_eq!(field(&random, "itemHigh")["targetKind"], "item");
    assert_not_reference(field(&random, "countOrRandomLimit"));

    let spawn = dispatch_result(
        &mut session,
        "action-form.describe",
        json!({"query": {
            "actionIdentity": "realmz.action.124", "targetNativeId": 124,
            "values": {"unused": 91, "monster": 0, "countOrRandomLimit": 5,
                "sound": 0, "traitorOverride": 0},
            "context": {"scriptKind": "extra-action-point", "authoring": {
                "modes": {"spawnCountMode": 1},
                "selections": {"countOrRandomLimit": 12}}}
        }}),
    )
    .unwrap();
    assert_eq!(spawn["authoring"]["controls"][0]["label"], "Spawn Count");
    assert_eq!(
        spawn["authoring"]["resolvedValues"]["countOrRandomLimit"],
        -12
    );
    assert_spawn_presentation(&spawn);
    assert_eq!(session.snapshot(), &before);
}

fn assert_spawn_presentation(spawn: &Value) {
    assert_eq!(field(spawn, "countOrRandomLimit")["value"], 12);
    assert_eq!(field(spawn, "countOrRandomLimit")["maximum"], 100);
    assert_eq!(field(spawn, "monster")["targetKind"], "monster");
    assert_eq!(field(spawn, "monster")["label"], "Monster To Spawn");
    assert_eq!(field(spawn, "sound")["label"], "Spawn Sound");
    assert_eq!(field(spawn, "traitorOverride")["label"], "Spawn Allegiance");
    assert_eq!(
        field(spawn, "traitorOverride")["choices"][1]["label"],
        "Use caller/default allegiance"
    );
}

#[test]
fn destroy_related_projects_all_or_limited_count_without_a_false_monster_link() {
    let mut session = EditorSession::new(demo_snapshot());
    let before = session.snapshot().clone();
    let limited = dispatch_result(
        &mut session,
        "action-form.describe",
        json!({"query": {
            "actionIdentity": "realmz.action.125", "targetNativeId": 125,
            "values": {"monsterId": 17, "maxCount": 0, "unused@2": -9,
                "unused@3": 88, "includeTraitorSide": 4},
            "context": {"scriptKind": "extra-action-point", "authoring": {
                "modes": {"destroyCountMode": 1},
                "selections": {"maxCount": 12}}}
        }}),
    )
    .unwrap();
    assert_eq!(
        limited["authoring"]["controls"][0]["label"],
        "Monsters To Destroy"
    );
    assert_eq!(limited["authoring"]["resolvedValues"]["maxCount"], 12);
    assert_eq!(field(&limited, "monsterId")["label"], "Monster Name Tag");
    assert_not_reference(field(&limited, "monsterId"));
    assert_not_reference(field(&limited, "maxCount"));
    assert_eq!(field(&limited, "maxCount")["maximum"], 100);
    assert_eq!(
        field(&limited, "includeTraitorSide")["choices"][1],
        json!({"label": "Include allied monsters", "value": 4})
    );
    assert_eq!(session.snapshot(), &before);
}

#[test]
fn combat_monster_change_projects_count_and_exclusive_mutation_modes() {
    let mut session = combat_monster_fixture_session();
    let before = session.snapshot().clone();
    assert_combat_monster_allegiance(&mut session);
    assert_combat_monster_appearance_picker(&mut session);
    assert_eq!(session.snapshot(), &before);
}

fn combat_monster_fixture_session() -> EditorSession {
    let mut snapshot = demo_snapshot();
    snapshot.assets.extend([392, 700].map(|id| {
        serde_json::from_value(json!({
            "identity": format!("appearance:{id}"),
            "label": if id == 392 { "Wyvern" } else { "Wyvern Facing" },
            "kind": "icon", "mimeType": "image/png",
            "classicResource": {"resourceType": "cicn", "resourceId": id},
            "blob": format!("fixture-{id}"), "byteLength": 1, "source": "controlled fixture"
        }))
        .unwrap()
    }));
    EditorSession::new(snapshot)
}

fn assert_combat_monster_allegiance(session: &mut EditorSession) {
    let allegiance = dispatch_result(
        session,
        "action-form.describe",
        json!({"query": {
            "actionIdentity": "realmz.action.120", "targetNativeId": 120,
            "values": {"targetClass": 2, "monsterId": 17, "count": 4,
                "replacementIcon": 9000, "traitorOverride": 7},
            "context": {"scriptKind": "extra-action-point", "authoring": {
                "modes": {"combatantCountMode": 2, "combatantChange": 1},
                "selections": {"traitorOverride": 0}}}
        }}),
    )
    .unwrap();
    assert_eq!(allegiance["authoring"]["resolvedValues"]["count"], -1);
    assert_eq!(
        allegiance["authoring"]["resolvedValues"]["replacementIcon"],
        -1
    );
    assert_eq!(
        allegiance["authoring"]["resolvedValues"]["traitorOverride"],
        0
    );
    assert_eq!(
        allegiance["authoring"]["controls"][0]["choices"][2]["label"],
        "All matching combatants"
    );
    assert_eq!(
        allegiance["authoring"]["controls"][1]["choices"][1]["label"],
        "Change allegiance"
    );
    assert_eq!(field(&allegiance, "monsterId")["label"], "Monster Name Tag");
    assert_not_reference(field(&allegiance, "monsterId"));
    assert_not_reference(field(&allegiance, "count"));
}

fn assert_combat_monster_appearance_picker(session: &mut EditorSession) {
    let appearance = dispatch_result(
        session,
        "action-form.describe",
        json!({"query": {
            "actionIdentity": "realmz.action.120", "targetNativeId": 120,
            "values": {"targetClass": 2, "monsterId": 17, "count": 4,
                "replacementIcon": -1, "traitorOverride": 0},
            "context": {"scriptKind": "extra-action-point", "authoring": {
                "modes": {"combatantChange": 0},
                "selections": {"replacementIcon": 392}}}
        }}),
    )
    .unwrap();
    let icon = field(&appearance, "replacementIcon");
    assert_eq!(icon["targetKind"], "monster-appearance");
    assert_eq!(icon["control"], "target");
    assert_eq!(icon["preview"]["label"], "Wyvern");
    assert_eq!(
        appearance["authoring"]["resolvedValues"]["replacementIcon"],
        392
    );
    let targets = dispatch_result(
        session,
        "action-target.list",
        json!({"query": {"kind": "monster-appearance", "search": "wyvern", "limit": 10}}),
    )
    .unwrap();
    assert_eq!(targets["items"].as_array().unwrap().len(), 1);
    assert_eq!(targets["items"][0]["value"], 392);
    assert_eq!(targets["items"][0]["identity"], "appearance:392");
}

#[test]
fn character_property_modes_expose_named_choices_and_exact_rule_targets() {
    use providence_core::codecs::{
        CASTE_RECORD_BYTES, RACE_RECORD_BYTES, decode_caste_rules, decode_race_rules,
    };
    let mut snapshot = demo_snapshot();
    snapshot.race_rules = decode_race_rules(&vec![0; RACE_RECORD_BYTES * 30], None).rules;
    snapshot.caste_rules = decode_caste_rules(&vec![0; CASTE_RECORD_BYTES * 30], None).rules;
    let mut session = EditorSession::new(snapshot);
    let before = session.snapshot().clone();
    let base = json!({"selector": 0, "gender": 2, "raceCasteOrClass": 7,
        "unused": -317, "livingOnly": 33});

    for (mode, label, active, kind, count) in [
        (0, "Race", "raceCasteOrClass", Some("race"), 0),
        (1, "Gender", "gender", None, 2),
        (2, "Caste", "raceCasteOrClass", Some("caste"), 0),
        (3, "Race class", "raceCasteOrClass", None, 9),
        (4, "Caste class", "raceCasteOrClass", None, 7),
    ] {
        let mut context = json!({"authoring": {"modes": {"characterProperty": mode}}});
        if mode == 2 {
            context["authoring"]["selections"] = json!({"raceCasteOrClass": 4});
        }
        let description = dispatch_result(
            &mut session,
            "action-form.describe",
            json!({"query": {"actionIdentity": "realmz.action.50", "targetNativeId": 33,
                "values": base, "context": context}}),
        )
        .unwrap();
        let control = &description["authoring"]["controls"][0];
        assert_eq!(control["label"], "Property");
        assert_eq!(control["choices"][mode as usize]["label"], label);
        assert_eq!(control["activeFields"], json!([active]));
        let active_field = field(&description, active);
        assert_eq!(
            active_field["targetKind"],
            kind.map_or(Value::Null, Value::from)
        );
        assert_eq!(active_field["choices"].as_array().unwrap().len(), count);
        assert_eq!(description["authoring"]["resolvedValues"]["gender"], 2);
        assert_eq!(description["authoring"]["resolvedValues"]["unused"], -317);
        assert_eq!(description["authoring"]["resolvedValues"]["livingOnly"], 33);
    }

    let targets = dispatch_result(
        &mut session,
        "action-target.list",
        json!({"query": {"kind": "race", "search": "7", "limit": 10}}),
    )
    .unwrap();
    assert_eq!(targets["items"][0]["identity"], "classic.race.7");
    assert_eq!(session.snapshot(), &before);
}

#[test]
fn percent_branch_is_a_bounded_scalar_even_when_its_value_matches_a_record_id() {
    let mut session = EditorSession::new(demo_snapshot());
    let before = session.snapshot().clone();
    let description = describe(
        &mut session,
        42,
        json!({"percent": 33, "successBehavior": 1, "branchMode": 0,
            "target": 1, "slot": 0}),
    );
    let percent = field(&description, "percent");
    assert_eq!(percent["minimum"], 0);
    assert_eq!(percent["maximum"], 100);
    assert_not_reference(percent);

    let imported = describe(
        &mut session,
        42,
        json!({"percent": 150, "successBehavior": 2, "branchMode": 0,
            "target": 0, "slot": 0}),
    );
    assert_eq!(field(&imported, "percent")["value"], 150);
    assert_eq!(session.snapshot(), &before);
}

#[test]
fn battle_macro_threshold_bounds_follow_the_selected_activation_mode() {
    let mut session = EditorSession::new(demo_snapshot());
    for (mode, maximum) in [(0, i16::MAX), (1, 100), (2, i16::MAX)] {
        let description = describe(
            &mut session,
            126,
            json!({"mode": mode, "roundOrPercent": 33, "repeatMode": 0,
                "macroLow": 1, "macroHigh": 0}),
        );
        let threshold = field(&description, "roundOrPercent");
        assert_eq!(threshold["minimum"], 0);
        assert_eq!(threshold["maximum"], maximum);
        assert_not_reference(threshold);
    }
}

#[test]
fn item_mutation_count_is_bounded_by_party_inventory_capacity() {
    let mut session = EditorSession::new(demo_snapshot());
    let description = describe(
        &mut session,
        22,
        json!({"item": 851, "maxMatches": 4, "mode": 2,
            "chargeDelta": -3, "replacementItem": 0}),
    );
    let count = field(&description, "maxMatches");
    assert_eq!(count["minimum"], 1);
    assert_eq!(count["maximum"], 180);
    assert_not_reference(count);
}

#[test]
fn spell_point_branch_required_points_are_nonnegative_and_never_a_link() {
    let mut session = EditorSession::new(demo_snapshot());
    let before = session.snapshot().clone();
    let description = describe(
        &mut session,
        75,
        json!({"testA": 2, "testB": 12, "falseBehavior": 1,
            "branchMode": 0, "target": 436}),
    );
    let required = field(&description, "testB");
    assert_eq!(required["minimum"], 0);
    assert_eq!(required["maximum"], i16::MAX);
    assert_not_reference(required);

    let imported = describe(
        &mut session,
        75,
        json!({"testA": 1, "testB": -7, "falseBehavior": 0,
            "branchMode": 0, "target": 436}),
    );
    assert_eq!(field(&imported, "testB")["value"], -7);
    assert_eq!(session.snapshot(), &before);
}

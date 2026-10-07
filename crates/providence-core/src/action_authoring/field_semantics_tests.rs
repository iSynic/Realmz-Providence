use super::authoring_flow_tests::word;
use super::target_rules::{FieldMeaning, direct_meaning, primary_meaning, primary_meanings};
use super::*;
use crate::model::{ExtraActionPoint, NativeRecordId, ProjectSnapshot, StableId};
use std::collections::{BTreeMap, BTreeSet};

fn role(meaning: FieldMeaning) -> String {
    match meaning {
        FieldMeaning::Record(kind) => serde_json::to_value(kind).unwrap().as_str().unwrap().into(),
        FieldMeaning::Value => "value".into(),
        FieldMeaning::Preserved => "preserved".into(),
        FieldMeaning::SimpleResult => "simple-result".into(),
        FieldMeaning::ComplexResult => "complex-result".into(),
        FieldMeaning::CodePosition => "code-position".into(),
        FieldMeaning::MonsterTag => "monster-tag".into(),
        FieldMeaning::CurrentShop => "current-shop".into(),
        FieldMeaning::Unresolved => "unresolved".into(),
    }
}

#[test]
fn every_direct_argument_has_an_independent_classic_expectation() {
    let mut covered = BTreeSet::new();
    for line in include_str!("fixtures/classic-direct-expectations.txt").lines() {
        if line.starts_with('#') || line.is_empty() {
            continue;
        }
        let columns: Vec<_> = line.split_whitespace().collect();
        assert_eq!(columns.len(), 3);
        let opcode: i16 = columns[0].parse().unwrap();
        assert!(columns[1].parse::<usize>().unwrap() > 0);
        assert!(covered.insert(opcode));
        assert_eq!(
            role(direct_meaning(opcode)),
            columns[2],
            "opcode {opcode}, newland.c:{}",
            columns[1]
        );
    }
    let expected = catalog()
        .actions
        .into_iter()
        .filter(|a| a.form_id.is_none())
        .map(|a| a.opcode)
        .collect();
    assert_eq!(covered, expected);
    assert_eq!(direct_meaning(999), FieldMeaning::Unresolved);
}

#[test]
fn opposite_selection_argument_is_editable_and_monster_tags_are_not_record_links() {
    let snapshot = ProjectSnapshot::new_authored(StableId("direct-semantics".into()));
    for (opcode, expected_fields) in [(-14, 1), (49, 0), (97, 0), (88, 1), (127, 1)] {
        let description = describe_action_form(
            &snapshot,
            &ActionFormDescribeQuery {
                action_identity: format!("realmz.action.{opcode}"),
                target_native_id: -3,
                values: BTreeMap::new(),
                secondary_values: BTreeMap::new(),
                context: Default::default(),
            },
        )
        .unwrap();
        assert_eq!(description.fields.len(), expected_fields, "opcode {opcode}");
        for field in description.fields {
            assert!(field.editable);
            assert_eq!(field.value, if opcode == -14 { 3 } else { -3 });
            assert_eq!(field.target_kind, None);
            assert_eq!(field.preview, None);
            if opcode != -14 {
                assert_eq!(field.label, "Monster Name Tag");
            }
        }
        if opcode == -14 {
            assert_eq!(description.authoring.resolved_values["targetNativeId"], -3);
        }
    }
    for (opcode, index) in [(87, 0), (120, 1), (125, 0)] {
        assert_eq!(
            primary_meaning(opcode, index, [33; 5], false),
            FieldMeaning::MonsterTag
        );
    }
    for (opcode, index) in [(123, 0), (124, 1)] {
        assert_eq!(
            primary_meaning(opcode, index, [33; 5], false),
            FieldMeaning::Record(ActionTargetKind::Monster)
        );
    }
    assert!(settings_target_fields(123, [0; 5], false).is_empty());
    assert_eq!(
        settings_target_fields(124, [0; 5], false)[0].kind,
        ActionTargetKind::Monster
    );
    assert_eq!(
        primary_meaning(120, 3, [2, 17, 4, 392, 0], false),
        FieldMeaning::Record(ActionTargetKind::MonsterAppearance)
    );
    assert_eq!(
        primary_meaning(120, 3, [2, 17, 4, -1, 0], false),
        FieldMeaning::Value
    );
}

#[test]
fn restricted_shop_high_endpoints_are_inactive_when_their_low_endpoint_is_zero() {
    // newland.c:2949-2953 copies the pairs; moveicon.c:82-89 and 107-114
    // guard each twixt() call with that pair's low endpoint.
    let words = [12, 0, 400, 905, 910];
    assert_eq!(primary_meaning(73, 1, words, false), FieldMeaning::Value);
    assert_eq!(primary_meaning(73, 2, words, false), FieldMeaning::Value);
    assert_eq!(
        primary_meaning(73, 3, words, false),
        FieldMeaning::Record(ActionTargetKind::Item)
    );
    assert_eq!(
        primary_meaning(73, 4, words, false),
        FieldMeaning::Record(ActionTargetKind::Item)
    );
}

#[test]
fn restricted_shop_range_labels_exclude_donor_help_fragments() {
    let snapshot = ProjectSnapshot::new_authored(StableId("restricted-shop-labels".into()));
    let description = describe_action_form(
        &snapshot,
        &ActionFormDescribeQuery {
            action_identity: "realmz.action.73".into(),
            target_native_id: 73,
            values: decode_form_values("restricted-shop", [1, 2, 3, 4, 5]).unwrap(),
            secondary_values: BTreeMap::new(),
            context: Default::default(),
        },
    )
    .unwrap();
    let labels: Vec<_> = description.fields[1..=4]
        .iter()
        .map(|field| field.label.as_str())
        .collect();
    assert_eq!(
        labels,
        [
            "Range 1 Low Item",
            "Range 1 High Item",
            "Range 2 Low Item",
            "Range 2 High Item"
        ]
    );
}

#[test]
fn bywater_and_war_battle_messages_do_not_create_missing_xap_references() {
    for line in include_str!("fixtures/classic-corpus-field-regressions.txt").lines() {
        if line.starts_with('#') || line.is_empty() {
            continue;
        }
        let columns: Vec<_> = line.split_whitespace().collect();
        assert_eq!(columns.len(), 12);
        let opcode: i16 = columns[5].parse().unwrap();
        let words = std::array::from_fn(|index| columns[index + 7].parse::<i16>().unwrap());
        let fields = settings_target_fields(opcode, words, false);
        assert!(
            !fields
                .iter()
                .any(|field| field.kind == ActionTargetKind::ExtraActionPoint),
            "{line}"
        );
        let message = fields.iter().find(|field| field.index == 4).unwrap();
        assert_eq!(message.kind, ActionTargetKind::Message);
        assert_eq!(message.value, words[4]);
        let encoded = encode_form_values(
            "battle-outcome-branch",
            &decode_form_values("battle-outcome-branch", words).unwrap(),
            Some(words),
        );
        assert_eq!(encoded.unwrap(), words);
    }
}

#[test]
fn every_primary_word_has_an_independent_classic_expectation() {
    let mut covered = BTreeSet::new();
    for line in include_str!("fixtures/classic-field-expectations.txt").lines() {
        if line.starts_with('#') || line.is_empty() {
            continue;
        }
        let columns: Vec<_> = line.split_whitespace().collect();
        assert_eq!(columns.len(), 7);
        let opcode: i16 = columns[0].parse().unwrap();
        assert!(columns[1].parse::<usize>().unwrap() > 0);
        assert!(covered.insert(opcode));
        for index in 0..5 {
            assert_eq!(
                role(primary_meaning(opcode, index, [0; 5], false)),
                columns[index as usize + 2],
                "opcode {opcode} word {index}, newland.c:{}",
                columns[1]
            );
        }
    }
    let expected: BTreeSet<_> = catalog()
        .actions
        .into_iter()
        .filter(|a| a.form_id.is_some())
        .map(|a| a.opcode)
        .collect();
    assert_eq!(covered, expected);
    assert_eq!(
        primary_meaning(999, 0, [0; 5], false),
        FieldMeaning::Unresolved
    );
}

#[test]
fn every_documented_reference_mode_has_an_independent_classic_expectation() {
    let mut names = BTreeSet::new();
    let mut covered_opcodes = BTreeSet::new();
    for line in include_str!("fixtures/classic-conditional-field-expectations.txt").lines() {
        if line.starts_with('#') || line.is_empty() {
            continue;
        }
        let columns: Vec<_> = line.split_whitespace().collect();
        assert_eq!(columns.len(), 14, "{line}");
        assert!(names.insert(columns[0]), "duplicate case {}", columns[0]);
        let opcode: i16 = columns[1].parse().unwrap();
        assert!(columns[2].parse::<usize>().unwrap() > 0);
        let options = match columns[3] {
            "messages" => false,
            "option-labels" => true,
            value => panic!("unsupported option storage {value}"),
        };
        let words = std::array::from_fn(|index| columns[index + 4].parse::<i16>().unwrap());
        for index in 0..5 {
            let actual = primary_meanings(opcode, index, words, options)
                .into_iter()
                .map(role)
                .collect::<Vec<_>>()
                .join("+");
            assert_eq!(actual, columns[index as usize + 9], "{line}, word {index}");
        }
        covered_opcodes.insert(opcode);
    }
    assert_eq!(names.len(), 73);
    assert_eq!(
        covered_opcodes,
        BTreeSet::from([
            2, 3, 7, 13, 20, 21, 22, 23, 33, 38, 40, 42, 46, 50, 51, 52, 55, 56, 58, 59, 67, 72,
            73, 74, 75, 76, 77, 78, 85, 86, 87, 120, 126,
        ])
    );
}

#[test]
fn local_encounter_branches_are_not_encounter_record_references() {
    for opcode in [33, 38, 42, 46, 58, 59] {
        for (mode, meaning) in [
            (0, FieldMeaning::Record(ActionTargetKind::ExtraActionPoint)),
            (1, FieldMeaning::SimpleResult),
            (2, FieldMeaning::ComplexResult),
            (-1, FieldMeaning::Value),
            (3, FieldMeaning::Value),
        ] {
            let words = [33, 1, mode, 2, 4];
            assert_eq!(primary_meaning(opcode, 3, words, false), meaning);
            assert!(!matches!(
                primary_meaning(opcode, 4, words, false),
                FieldMeaning::Record(_)
            ));
        }
    }
    for (mode, expected) in [
        (0, "value"),
        (1, "extra-action-point"),
        (2, "simple-result"),
        (3, "complex-result"),
        (4, "value"),
    ] {
        assert_eq!(
            role(primary_meaning(3, 2, [0, mode, 33, 0, 0], false)),
            expected
        );
    }
}

#[test]
fn modes_cannot_fall_back_to_donor_reference_hints() {
    for switch in [i16::MIN, -1, 0, 1, 2, i16::MAX] {
        let words = [2, 33, 50, switch, 0];
        assert_eq!(primary_meaning(74, 3, words, false), FieldMeaning::Value);
        assert_eq!(
            role(primary_meaning(74, 1, words, false)),
            if switch == 0 { "value" } else { "sound" }
        );
    }
    for mode in 0..=8 {
        assert_eq!(
            role(primary_meaning(52, 1, [mode, 33, 0, 0, 0], false)),
            if matches!(mode, 2 | 7) {
                "item"
            } else {
                "value"
            }
        );
    }
    for (mode, expected) in [
        (-1, "simple-encounter"),
        (-2, "complex-encounter"),
        (-3, "unresolved"),
        (0, "same-map-action-point"),
    ] {
        assert_eq!(
            role(primary_meaning(7, 1, [mode, 33, 0, 0, 0], false)),
            expected
        );
    }
    for opcode in [21, 87] {
        for (mode, expected) in [
            (0, "extra-action-point"),
            (1, "value"),
            (2, "message"),
            (3, "value"),
        ] {
            assert_eq!(
                role(primary_meaning(opcode, 4, [0, 0, mode, 33, 33], false)),
                expected
            );
        }
    }
    assert_eq!(
        role(primary_meaning(56, 2, [1, 0, 33, 1, 2], false)),
        "extra-action-point"
    );
    assert_eq!(
        role(primary_meaning(56, 4, [1, 0, 33, 1, 2], false)),
        "message"
    );
    assert_eq!(
        role(primary_meaning(125, 1, [1, 33, 0, 0, 0], false)),
        "value"
    );
    assert_eq!(
        role(primary_meaning(69, 1, [0, 33, 0, 0, 0], false)),
        "value"
    );
}

#[test]
fn matching_xap_ids_never_turn_percent_or_behavior_into_previews() {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("field-semantics".into()));
    for id in [0, 1, 33] {
        snapshot.extra_action_points.push(ExtraActionPoint {
            identity: StableId(format!("extra-action-point:{id}")),
            native_id: NativeRecordId(id),
            classic_door_id: id as i32,
            post_action_level: 0,
            post_action_x: 0,
            post_action_y: 0,
            chance_percent: 0,
            actions: vec![],
        });
    }
    let values = BTreeMap::from([
        ("percent".into(), 33),
        ("successBehavior".into(), 1),
        ("branchMode".into(), 0),
        ("target".into(), 1),
        ("slot".into(), 0),
    ]);
    let description = describe_action_form(
        &snapshot,
        &ActionFormDescribeQuery {
            action_identity: "realmz.action.42".into(),
            target_native_id: 0,
            values,
            secondary_values: BTreeMap::new(),
            context: Default::default(),
        },
    )
    .unwrap();
    for index in [0, 1, 2, 4] {
        assert_eq!(description.fields[index].target_kind, None);
        assert_eq!(description.fields[index].preview, None);
    }
    assert_eq!(description.fields[0].minimum, 0);
    assert_eq!(description.fields[0].maximum, 100);
    assert_eq!(
        description.fields[3].preview.as_ref().unwrap().identity.0,
        "extra-action-point:1"
    );
}

#[test]
fn guarded_zero_messages_do_not_create_missing_string_uses() {
    // Each listed dispatch checks the message word before calling textbox().
    for (opcode, index) in [
        (2, 3),
        (15, 4),
        (16, 4),
        (20, 4),
        (45, 4),
        (48, 3),
        (56, 4),
        (74, 4),
        (85, 4),
        (107, 3),
        (122, 0),
    ] {
        let mut words = [1; 5];
        words[index] = 0;
        assert!(
            settings_target_fields(opcode, words, false)
                .into_iter()
                .all(|field| field.index != index as u8 || field.kind != ActionTargetKind::Message),
            "opcode {opcode} word {index}"
        );
    }
    // These call textbox() without a zero guard in their active message mode.
    for (opcode, words, index) in [
        (19, [0, 2, 0, 0, 0], 0),
        (21, [7, 0, 2, 11, 0], 4),
        (55, [0, 2, 0, 11, 0], 4),
    ] {
        assert!(
            settings_target_fields(opcode, words, false)
                .into_iter()
                .any(|field| field.index == index && field.kind == ActionTargetKind::Message),
            "opcode {opcode} word {index}"
        );
    }
}

#[test]
fn percent_branch_retains_an_imported_out_of_range_value_for_explicit_repair() {
    let snapshot = ProjectSnapshot::new_authored(StableId("percent-import".into()));
    let description = describe_action_form(
        &snapshot,
        &ActionFormDescribeQuery {
            action_identity: "realmz.action.42".into(),
            target_native_id: 0,
            values: BTreeMap::from([
                ("percent".into(), 150),
                ("successBehavior".into(), 2),
                ("branchMode".into(), 0),
                ("target".into(), 0),
                ("slot".into(), 0),
            ]),
            secondary_values: BTreeMap::new(),
            context: Default::default(),
        },
    )
    .unwrap();
    let percent = &description.fields[0];
    assert_eq!(percent.value, 150);
    assert_eq!((percent.minimum, percent.maximum), (0, 100));
}

#[test]
fn half_truth_player_option_zero_words_use_default_yes_and_no() {
    // Half Truth Data DD AP 78 slot 1 points to EDCD row 15: [1, 1, 436, 0, 0].
    let snapshot = ProjectSnapshot::new_authored(StableId("half-truth-choice".into()));
    let values = BTreeMap::from([
        ("replyPolarity".into(), 1),
        ("branchMode".into(), 1),
        ("branchTarget".into(), 436),
        ("promptA".into(), 0),
        ("promptB".into(), 0),
    ]);
    let description = describe_action_form(
        &snapshot,
        &ActionFormDescribeQuery {
            action_identity: "realmz.action.3".into(),
            target_native_id: 15,
            values,
            secondary_values: BTreeMap::new(),
            context: Default::default(),
        },
    )
    .unwrap();
    assert_eq!(description.authoring.controls[0].value, 0);
    assert_eq!(
        description.authoring.controls[0].display,
        "Left: Yes     Right: No"
    );
    for index in [3, 4] {
        let field = word(&description, index);
        assert_eq!(field.value, 0);
        assert!(field.special_values.is_empty());
        assert_eq!(field.preview, None);
        assert_eq!(field.target_kind, None);
    }
    let references = settings_target_fields(3, [1, 1, 436, 0, 0], false);
    assert_eq!(references.len(), 1);
    assert_eq!(references[0].index, 2);
    assert_eq!(references[0].kind, ActionTargetKind::ExtraActionPoint);
    assert_eq!(
        encode_form_values(
            "choice",
            &decode_form_values("choice", [1, 1, 436, 0, 0]).unwrap(),
            None
        )
        .unwrap(),
        [1, 1, 436, 0, 0]
    );
}

#[test]
fn selected_message_preview_preserves_full_multiline_authored_text() {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("message-preview".into()));
    let text = format!(
        "{}\nThe final line remains visible.",
        "A long authored sentence. ".repeat(10)
    );
    snapshot.messages.push(crate::model::ScenarioMessage {
        identity: StableId("message:33".into()),
        native_id: NativeRecordId(33),
        text: text.clone(),
        authored: true,
    });
    let description = describe_action_form(
        &snapshot,
        &ActionFormDescribeQuery {
            action_identity: "realmz.action.1".into(),
            target_native_id: -33,
            values: BTreeMap::new(),
            secondary_values: BTreeMap::new(),
            context: Default::default(),
        },
    )
    .unwrap();
    assert_eq!(description.fields[0].preview.as_ref().unwrap().detail, text);
    assert_eq!(
        description.fields[0].preview.as_ref().unwrap().identity.0,
        "message:33"
    );
}

#[test]
fn companion_geometry_modes_preserve_inactive_values_without_links() {
    let snapshot = ProjectSnapshot::new_authored(StableId("shape-modes".into()));
    // newland.c action 92: mode 1 moves the rectangle with two offsets;
    // modes 0 and 2 read four bounds, and other modes leave geometry alone.
    for (mode, editable) in [(-1, 0), (0, 4), (1, 2), (2, 4), (3, 0)] {
        let fields = describe_action_form(
            &snapshot,
            &ActionFormDescribeQuery {
                action_identity: "realmz.action.92".into(),
                target_native_id: 0,
                values: BTreeMap::from([("shapeMode".into(), mode)]),
                secondary_values: BTreeMap::from([
                    ("shapeX2".into(), 33),
                    ("shapeFlags".into(), -123),
                ]),
                context: Default::default(),
            },
        )
        .unwrap()
        .fields;
        let companion: Vec<_> = fields
            .iter()
            .filter(|f| f.row == FormRow::Secondary)
            .collect();
        assert_eq!(companion.len(), 5);
        assert_eq!(companion.iter().filter(|f| f.editable).count(), editable);
        assert!(
            companion
                .iter()
                .all(|f| f.target_kind.is_none() && f.preview.is_none())
        );
        assert_eq!(companion[2].value, 33);
        assert_eq!(companion[4].value, -123);
        for field in companion.iter().take(4) {
            if mode == 0 {
                assert_eq!((field.minimum, field.maximum), (0, 89));
            } else {
                assert_eq!((field.minimum, field.maximum), (i16::MIN, i16::MAX));
            }
        }
    }
}

#[test]
fn gold_branch_words_are_distinct_and_round_trip_without_rewriting_neighbors() {
    let original = [-50, 2, 0, 33, 7];
    let mut values = decode_form_values("gold", original).unwrap();
    assert_eq!(values.len(), 5);
    assert_eq!(values["branchMode"], 0);
    assert_eq!(values["target"], 33);
    assert_eq!(values["slot"], 7);
    assert_eq!(
        encode_form_values("gold", &values, Some(original)).unwrap(),
        original
    );
    values.insert("target".into(), 34);
    assert_eq!(
        encode_form_values("gold", &values, Some(original)).unwrap(),
        [-50, 2, 0, 34, 7]
    );
    let fields = settings_target_fields(33, original, false);
    assert_eq!(fields.len(), 1);
    assert_eq!(fields[0].key, "target");
    assert_eq!(fields[0].value, 33);
}

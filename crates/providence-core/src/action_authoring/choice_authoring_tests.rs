use super::authoring_flow_tests::{named, word};
use super::*;
use crate::model::{
    BlobId, ClassicSourceBlob, NativeRecordId, OptionLabelRecord, ProjectSnapshot, ScenarioMessage,
    StableId,
};
use std::collections::BTreeMap;

fn snapshot() -> ProjectSnapshot {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("choice-modes".into()));
    for (id, text) in [(0, "Custom zero"), (12, "Enter"), (19, "Leave")] {
        snapshot.option_labels.push(OptionLabelRecord {
            identity: StableId(format!("option-label:{id}")),
            native_id: NativeRecordId(id),
            text: text.into(),
            authored: true,
        });
    }
    snapshot
}

fn query(left: i16, right: i16) -> ActionFormDescribeQuery {
    ActionFormDescribeQuery {
        action_identity: "realmz.action.3".into(),
        target_native_id: 15,
        values: decode_form_values("choice", [1, 1, 436, left, right]).unwrap(),
        secondary_values: BTreeMap::new(),
        context: Default::default(),
    }
}

#[test]
fn question2_left_prompt_controls_both_labels_and_custom_zero_is_a_record() {
    // Classic 491816ad question.c:101-140: only prompt1 controls dialog/storage reads.
    for (left, right, custom) in [
        (0, 0, false),
        (0, 19, false),
        (12, 0, true),
        (12, 19, true),
        (-12, -19, true),
    ] {
        let description = describe_action_form(&snapshot(), &query(left, right)).unwrap();
        assert_eq!(description.authoring.controls[0].value, i16::from(custom));
        assert_eq!(description.authoring.resolved_values["promptB"], right);
        assert!(description.authoring.errors.is_empty());
        let references = settings_target_fields(3, [1, 1, 436, left, right], true);
        for (index, raw) in [(3, left), (4, right)] {
            assert_eq!(word(&description, index).target_kind.is_some(), custom);
            assert_eq!(
                references
                    .iter()
                    .any(|field| field.index == index as u8 && field.value == raw),
                custom
            );
        }
        if custom {
            assert_eq!(
                named(&description, "promptB")
                    .preview
                    .as_ref()
                    .unwrap()
                    .detail,
                if right == 0 { "Custom zero" } else { "Leave" }
            );
        }
    }
}

#[test]
fn named_modes_require_explicit_new_selections_and_preserve_inactive_words() {
    let mut query = query(0, -19);
    query.context.authoring.modes.insert("choiceText".into(), 1);
    let incomplete = describe_action_form(&snapshot(), &query).unwrap();
    assert_eq!(incomplete.authoring.errors.len(), 2);
    query
        .context
        .authoring
        .selections
        .insert("promptA".into(), 12);
    assert_eq!(
        describe_action_form(&snapshot(), &query)
            .unwrap()
            .authoring
            .errors
            .len(),
        1
    );
    query
        .context
        .authoring
        .selections
        .insert("promptB".into(), 0);
    let custom = describe_action_form(&snapshot(), &query).unwrap();
    assert!(custom.authoring.errors.is_empty());
    assert_eq!(
        encode_form_values("choice", &custom.authoring.resolved_values, None).unwrap(),
        [1, 1, 436, 12, 0]
    );
    query.context.authoring.modes.insert("choiceText".into(), 0);
    let default = describe_action_form(&snapshot(), &query).unwrap();
    assert_eq!(
        encode_form_values("choice", &default.authoring.resolved_values, None).unwrap(),
        [1, 1, 436, 0, -19]
    );
    query.context.authoring.modes.insert("choiceText".into(), 1);
    assert_eq!(describe_action_form(&snapshot(), &query).unwrap(), custom);
}

#[test]
fn returning_to_custom_reuses_existing_valid_records_without_normalizing_signs() {
    let mut query = query(-12, 0);
    query.context.authoring.modes.insert("choiceText".into(), 0);
    assert_eq!(
        describe_action_form(&snapshot(), &query)
            .unwrap()
            .authoring
            .resolved_values["promptA"],
        0
    );
    query.context.authoring.modes.insert("choiceText".into(), 1);
    let description = describe_action_form(&snapshot(), &query).unwrap();
    assert!(description.authoring.errors.is_empty());
    assert_eq!(description.authoring.resolved_values, query.values);
}

#[test]
fn custom_left_zero_cannot_silently_switch_to_default_and_choices_name_actual_labels() {
    let mut query = query(12, 19);
    let description = describe_action_form(&snapshot(), &query).unwrap();
    assert_eq!(
        named(&description, "replyPolarity").choices[2].label,
        "Left / Enter continues"
    );
    assert_eq!(
        named(&description, "replyPolarity").choices[1].label,
        "Right / Leave continues"
    );
    query
        .context
        .authoring
        .selections
        .insert("promptA".into(), 0);
    let invalid = describe_action_form(&snapshot(), &query).unwrap();
    assert_eq!(invalid.authoring.controls[0].value, 1);
    assert_eq!(invalid.authoring.errors.len(), 1);
    assert!(invalid.authoring.errors[0].contains("Left"));
}

#[test]
fn present_empty_od_does_not_fall_back_to_matching_message_ids() {
    let mut snapshot = snapshot();
    snapshot.option_labels.clear();
    snapshot.messages.push(ScenarioMessage {
        identity: StableId("message:12".into()),
        native_id: NativeRecordId(12),
        text: "Not the OD label".into(),
        authored: true,
    });
    let fallback = describe_action_form(&snapshot, &query(12, 0)).unwrap();
    assert_eq!(fallback.option_prompt_storage.as_deref(), Some("messages"));
    assert!(named(&fallback, "promptA").preview.is_some());
    snapshot.classic_sources.push(ClassicSourceBlob {
        native_path: "Data OD".into(),
        blob: BlobId("empty-od".into()),
        byte_length: 0,
    });
    let present = describe_action_form(&snapshot, &query(12, 0)).unwrap();
    assert_eq!(
        present.option_prompt_storage.as_deref(),
        Some("option-labels")
    );
    assert!(named(&present, "promptA").preview.is_none());
    assert!(
        present.authoring.errors.is_empty(),
        "unchanged missing imported references remain preservable"
    );
}

#[test]
fn reference_index_uses_the_same_paired_prompt_rule_and_storage() {
    use crate::model::{ClassicAction, ExtraActionPoint, ExtraCodeRow};
    use crate::references::TargetKind;
    for options in [false, true] {
        for (left, right) in [(0, 0), (0, 19), (12, 0), (-12, -19)] {
            let mut snapshot = snapshot();
            if !options {
                snapshot.option_labels.clear();
            }
            snapshot.extra_action_points.push(ExtraActionPoint {
                identity: StableId("extra-action-point:7".into()),
                native_id: NativeRecordId(7),
                classic_door_id: 0,
                post_action_level: 0,
                post_action_x: 0,
                post_action_y: 0,
                chance_percent: 100,
                actions: vec![ClassicAction {
                    slot: 1,
                    raw_opcode: 3,
                    target_native_id: 15,
                }],
            });
            snapshot.extra_codes.push(ExtraCodeRow {
                native_id: NativeRecordId(15),
                values: [1, 0, 436, left, right],
            });
            let refs = crate::session::references_for(&snapshot)
                .into_iter()
                .filter(|r| {
                    r.source.0 == "extra-action-point:7"
                        && matches!(r.target_kind, TargetKind::Message | TargetKind::OptionLabel)
                })
                .collect::<Vec<_>>();
            assert_eq!(refs.len(), if left == 0 { 0 } else { 2 });
            for reference in refs {
                assert_eq!(
                    reference.target_kind,
                    if options {
                        TargetKind::OptionLabel
                    } else {
                        TargetKind::Message
                    }
                );
                assert_eq!(reference.byte_provenance.as_ref().unwrap().record_index, 15);
            }
        }
    }
}

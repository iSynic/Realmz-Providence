use super::*;
use crate::model::ScenarioMessage;

fn message(id: u32) -> ScenarioMessage {
    ScenarioMessage {
        identity: StableId(format!("message:{id}")),
        native_id: NativeRecordId(id),
        text: format!("Authored message {id}"),
        authored: true,
    }
}

fn message_snapshot() -> ProjectSnapshot {
    let mut snapshot = snapshot();
    snapshot.extra_action_points[0].actions[0].raw_opcode = -19;
    snapshot.extra_codes[0].values = [2, 4, i16::MIN, 731, i16::MAX];
    snapshot.messages.extend((1..=8).map(message));
    snapshot.normalize();
    snapshot
}

fn message_draft(snapshot: &ProjectSnapshot) -> RepairDraft<RandomMessageInput> {
    prepare_random_message(
        snapshot,
        Revision(0),
        StableId("extra-action-point:158".into()),
        4,
    )
    .unwrap()
}

#[test]
fn missing_single_row_requires_both_values_and_repairs_as_one_undo_entry() {
    let mut before = message_snapshot();
    before.extra_codes.clear();
    let mut draft = message_draft(&before);
    assert_eq!(draft.input.first_message, "");
    assert_eq!(draft.input.last_message, "");
    assert_eq!(draft.input.retained, [0; 3]);
    let errors = draft.input.values(&before).unwrap_err();
    assert_eq!(
        errors
            .iter()
            .map(|error| error.field.as_str())
            .collect::<Vec<_>>(),
        ["firstMessage", "lastMessage"]
    );
    change(&before, &mut draft, "firstMessage", "2").unwrap();
    change(&before, &mut draft, "lastMessage", "4").unwrap();
    let (edit, intent) = plan(&before, Revision(0), &draft).unwrap();
    assert_eq!(edit.values, [2, 4, 0, 0, 0]);
    assert_eq!(edit.secondary_values, None);
    assert_eq!(intent.row_ids, [10]);
    assert_eq!(
        reconcile(&before, Revision(0), &intent, true),
        RepairOutcome::NotApplied
    );
    let mut session = EditorSession::new(before.clone());
    apply(&mut session, edit);
    assert_eq!(session.snapshot().extra_codes, [row(10, [2, 4, 0, 0, 0])]);
    assert_eq!(
        session.snapshot().extra_action_points,
        before.extra_action_points
    );
    assert_eq!(session.undo_history().len(), 1);
    assert!(crate::validation::action_settings::diagnostics(session.snapshot()).is_empty());
    assert_eq!(
        reconcile(session.snapshot(), session.revision(), &intent, true),
        RepairOutcome::MatchesRepair
    );
    let after = session.snapshot().clone();
    for (command, expected) in [
        (EditorCommand::Undo, &before),
        (EditorCommand::Redo, &after),
    ] {
        session
            .execute(ExpectedRevisionCommand {
                expected_revision: session.revision(),
                command,
            })
            .unwrap();
        assert_eq!(session.snapshot(), expected);
    }
}

#[test]
fn existing_words_and_signed_endpoint_meaning_survive_semantic_edits() {
    let before = message_snapshot();
    let mut draft = message_draft(&before);
    change(&before, &mut draft, "firstMessage", "-4").unwrap();
    change(&before, &mut draft, "lastMessage", "-2").unwrap();
    let (edit, _) = plan(&before, Revision(0), &draft).unwrap();
    assert_eq!(edit.values, [-4, -2, i16::MIN, 731, i16::MAX]);
    let range = message_range(&before, &draft.input, 0, 128).unwrap();
    assert_eq!(range.total, 3);
    assert_eq!(range.wait_mode, MessageWaitMode::Never);
    assert_eq!(
        range
            .entries
            .iter()
            .map(|entry| entry.native_id.unwrap().0)
            .collect::<Vec<_>>(),
        [4, 3, 2]
    );
    assert!(
        range
            .entries
            .iter()
            .all(|entry| entry.status == MessageRangeStatus::Ready && !entry.waits_for_click)
    );
    assert!(!range.includes_no_message);
    let original_input = draft.input.clone();
    assert!(change(&before, &mut draft, "retained", "5").is_err());
    assert_eq!(draft.input, original_input);
    draft.input.retained[1] += 1;
    assert!(
        plan(&before, Revision(0), &draft)
            .unwrap_err()
            .contains("retained settings")
    );
}

#[test]
fn invalid_typed_text_is_retained_without_defaulting_or_normalizing_the_range() {
    let before = message_snapshot();
    let mut draft = message_draft(&before);
    for invalid in ["", "1.5", "32768", "-32769", "1x", "1 2"] {
        change(&before, &mut draft, "firstMessage", invalid).unwrap();
        assert_eq!(draft.input.first_message, invalid);
        assert_eq!(
            draft.input.values(&before).unwrap_err()[0].field,
            "firstMessage"
        );
        assert!(plan(&before, Revision(0), &draft).is_err());
    }
    let original_input = draft.input.clone();
    assert!(change(&before, &mut draft, "firstMessage", &"0".repeat(513)).is_err());
    assert_eq!(draft.input, original_input);
}

#[test]
fn every_reachable_message_is_checked_even_beyond_the_requested_page() {
    let mut snapshot = message_snapshot();
    snapshot.messages = (1..=260).filter(|id| *id != 200).map(message).collect();
    let mut draft = message_draft(&snapshot);
    change(&snapshot, &mut draft, "firstMessage", "1").unwrap();
    change(&snapshot, &mut draft, "lastMessage", "260").unwrap();
    let page = message_range(&snapshot, &draft.input, 0, usize::MAX).unwrap();
    assert_eq!(
        (page.total, page.entries.len(), page.limit),
        (260, 128, 128)
    );
    assert!(
        page.entries
            .iter()
            .all(|entry| entry.status == MessageRangeStatus::Ready)
    );
    assert_eq!(page.unresolved_messages, 1);
    assert_eq!(page.errors[0].field, "messageRange");
    assert!(page.errors[0].message.contains("200"));
    assert!(plan(&snapshot, Revision(0), &draft).is_err());
    let missing = message_range(&snapshot, &draft.input, 199, 0).unwrap();
    assert_eq!(missing.limit, 1);
    assert_eq!(missing.entries[0].status, MessageRangeStatus::Missing);
    assert_eq!(missing.entries[0].identity, None);
    let past_end = message_range(&snapshot, &draft.input, usize::MAX, 128).unwrap();
    assert!(past_end.entries.is_empty());
    assert_eq!(past_end.unresolved_messages, 1);
    snapshot.messages.push(message(200));
    assert!(plan(&snapshot, Revision(0), &draft).is_ok());
}

#[test]
fn duplicate_message_numbers_and_wrong_or_reused_identities_are_not_resolved() {
    let mut snapshot = message_snapshot();
    let draft = message_draft(&snapshot);
    snapshot.messages.push(message(3));
    let duplicate = message_range(&snapshot, &draft.input, 1, 1).unwrap();
    assert_eq!(duplicate.entries[0].status, MessageRangeStatus::Ambiguous);
    assert_eq!(duplicate.entries[0].identity, None);
    assert!(plan(&snapshot, Revision(0), &draft).is_err());
    snapshot.messages.pop();
    snapshot
        .messages
        .iter_mut()
        .find(|message| message.native_id.0 == 3)
        .unwrap()
        .identity = StableId("wrong-message".into());
    let wrong = message_range(&snapshot, &draft.input, 1, 1).unwrap();
    assert_eq!(wrong.entries[0].status, MessageRangeStatus::InvalidIdentity);
    assert!(plan(&snapshot, Revision(0), &draft).is_err());
    snapshot
        .messages
        .iter_mut()
        .find(|message| message.native_id.0 == 3)
        .unwrap()
        .identity = StableId("message:3".into());
    snapshot
        .messages
        .iter_mut()
        .find(|message| message.native_id.0 == 8)
        .unwrap()
        .identity = StableId("message:3".into());
    assert_eq!(
        message_range(&snapshot, &draft.input, 1, 1)
            .unwrap()
            .entries[0]
            .status,
        MessageRangeStatus::InvalidIdentity
    );
}

#[test]
fn zero_signed_reversed_and_wrapped_ranges_keep_their_actual_results() {
    let mut snapshot = message_snapshot();
    snapshot.messages = (1..=32768).map(message).collect();
    for (low, high, expected, wait, blank) in [
        (0, 0, vec![0], MessageWaitMode::NoMessage, true),
        (-1, 1, vec![-1, 0, 1], MessageWaitMode::Mixed, true),
        (147, 145, vec![147], MessageWaitMode::Always, false),
        (
            i16::MIN,
            i16::MAX,
            vec![i16::MIN],
            MessageWaitMode::Never,
            false,
        ),
        (
            i16::MAX,
            i16::MIN,
            vec![i16::MAX, i16::MIN],
            MessageWaitMode::Mixed,
            false,
        ),
    ] {
        let input = RandomMessageInput {
            first_message: low.to_string(),
            last_message: high.to_string(),
            retained: [17, -6, 9],
        };
        let range = message_range(&snapshot, &input, 0, 128).unwrap();
        assert_eq!(
            range
                .entries
                .iter()
                .map(|entry| entry.value)
                .collect::<Vec<_>>(),
            expected
        );
        assert_eq!(range.wait_mode, wait);
        assert_eq!(range.includes_no_message, blank);
        assert!(range.errors.is_empty());
        assert_eq!(
            input.values(&snapshot).unwrap().primary,
            [low, high, 17, -6, 9]
        );
        if low == 0 {
            assert_eq!(range.entries[0].status, MessageRangeStatus::NoMessage);
            assert_eq!(range.entries[0].identity, None);
            assert_eq!(range.unique_messages, 0);
        }
    }
}

#[test]
fn private_single_row_repair_uses_a_lone_free_slot_and_keeps_other_actions() {
    let mut snapshot = message_snapshot();
    snapshot
        .extra_codes
        .extend([row(0, [99; 5]), row(2, [11; 5])]);
    snapshot.extra_action_points.push(caller(159, 19, 10));
    snapshot.extra_action_points.push(caller(160, 15, 3));
    snapshot.normalize();
    let mut draft = message_draft(&snapshot);
    change(&snapshot, &mut draft, "firstMessage", "3").unwrap();
    let (edit, intent) = plan(&snapshot, Revision(0), &draft).unwrap();
    assert_eq!(edit.target_native_id, 1);
    assert_eq!(edit.secondary_values, None);
    assert!(edit.guard.as_ref().unwrap().require_available_rows);
    assert_eq!(intent.row_ids, [1, 10]);
    let mut session = EditorSession::new(snapshot.clone());
    apply(&mut session, edit);
    assert_eq!(
        &session.snapshot().extra_action_points[1..],
        &snapshot.extra_action_points[1..]
    );
    for original in &snapshot.extra_codes {
        assert!(session.snapshot().extra_codes.contains(original));
    }
    assert_eq!(
        reconcile(session.snapshot(), session.revision(), &intent, false),
        RepairOutcome::MatchesRepair
    );
}

#[test]
fn single_row_shared_repair_is_rejected_including_companion_overlaps() {
    let mut snapshot = message_snapshot();
    snapshot
        .extra_action_points
        .extend((200..459).map(|id| caller(id, 19, 10)));
    for overlap in [false, true] {
        if overlap {
            snapshot.extra_action_points.push(caller(700, 92, 9));
        }
        let mut draft = message_draft(&snapshot);
        let (page, total) = uses(&snapshot, Revision(0), &draft, 0, usize::MAX).unwrap();
        assert_eq!(page.len(), 128);
        assert_eq!(total, if overlap { 261 } else { 260 });
        assert!(change(&snapshot, &mut draft, "scope", "shared-actions").is_err());
        draft.scope = RepairScope::SharedActions;
        assert!(
            plan(&snapshot, Revision(0), &draft)
                .unwrap_err()
                .contains("legacy shared-write request is unsupported")
        );
    }
}

#[test]
fn ambiguous_rows_supply_only_agreed_words_and_never_replace_an_original() {
    let mut snapshot = message_snapshot();
    snapshot
        .extra_codes
        .push(row(10, [3, 4, i16::MIN, 731, i16::MAX]));
    let mut draft = message_draft(&snapshot);
    assert_eq!(draft.input.first_message, "");
    assert_eq!(draft.input.last_message, "4");
    assert_eq!(draft.input.retained, [i16::MIN, 731, i16::MAX]);
    change(&snapshot, &mut draft, "firstMessage", "2").unwrap();
    let (edit, intent) = plan(&snapshot, Revision(0), &draft).unwrap();
    assert_eq!(edit.target_native_id, 0);
    let mut session = EditorSession::new(snapshot.clone());
    apply(&mut session, edit);
    for original in &snapshot.extra_codes {
        assert!(session.snapshot().extra_codes.contains(original));
    }
    assert_eq!(
        reconcile(session.snapshot(), session.revision(), &intent, true),
        RepairOutcome::MatchesRepair
    );
}

#[test]
fn single_row_rebase_retains_current_spare_words_and_resets_sharing() {
    let mut snapshot = message_snapshot();
    let mut draft = message_draft(&snapshot);
    draft.scope = RepairScope::SharedActions;
    change(&snapshot, &mut draft, "firstMessage", "3").unwrap();
    snapshot.extra_codes[0].values[2..].copy_from_slice(&[7, 8, 9]);
    assert!(plan(&snapshot, Revision(1), &draft).is_err());
    let rebased = rebase(&snapshot, Revision(1), &draft).unwrap();
    assert_eq!(rebased.scope, RepairScope::OnlyThisAction);
    assert_eq!(rebased.input.first_message, "3");
    assert_eq!(rebased.input.retained, [7, 8, 9]);
    assert!(plan(&snapshot, Revision(1), &rebased).is_ok());
    snapshot.extra_action_points[0].actions[0].raw_opcode = 92;
    assert!(rebase(&snapshot, Revision(2), &draft).is_err());
}

#[test]
fn uncertain_single_row_results_never_trigger_or_infer_an_automatic_retry() {
    let snapshot = message_snapshot();
    let mut draft = message_draft(&snapshot);
    change(&snapshot, &mut draft, "firstMessage", "3").unwrap();
    let (edit, intent) = plan(&snapshot, Revision(0), &draft).unwrap();
    assert_eq!(
        reconcile(&snapshot, Revision(0), &intent, false),
        RepairOutcome::Unknown
    );
    assert_eq!(
        reconcile(&snapshot, Revision(1), &intent, true),
        RepairOutcome::Unknown
    );
    let mut session = EditorSession::new(snapshot);
    apply(&mut session, edit);
    assert_eq!(
        reconcile(session.snapshot(), session.revision(), &intent, false),
        RepairOutcome::MatchesRepair
    );
    let mut changed = session.snapshot().clone();
    changed.extra_codes[0].values[4] -= 1;
    assert_eq!(
        reconcile(&changed, session.revision(), &intent, true),
        RepairOutcome::Unknown
    );
    changed.extra_action_points.clear();
    assert_eq!(
        reconcile(&changed, session.revision(), &intent, true),
        RepairOutcome::SourceGone
    );
}

#[test]
fn the_current_native_form_does_not_silently_accept_the_new_core_input() {
    let snapshot = message_snapshot();
    let native_draft = draft(&snapshot);
    assert_eq!(
        preview(&snapshot, Revision(0), &native_draft).phase,
        "unsupported"
    );
    assert!(!preview(&snapshot, Revision(0), &native_draft).can_apply);
    let message_draft = message_draft(&snapshot);
    let wire = serde_json::to_value(&message_draft).unwrap();
    assert!(serde_json::from_value::<RepairDraft>(wire.clone()).is_err());
    assert_eq!(
        serde_json::from_value::<RepairDraft<RandomMessageInput>>(wire).unwrap(),
        message_draft
    );
}

#[test]
fn a_semantic_edit_changes_only_the_two_consumed_words_and_preserves_the_source_tail() {
    use crate::codecs::encode_extra_codes;

    let snapshot = message_snapshot();
    let mut source = encode_extra_codes(&snapshot.extra_codes, None).unwrap();
    source.extend_from_slice(&[0x55, 0x66, 0x77]);
    let mut draft = message_draft(&snapshot);
    change(&snapshot, &mut draft, "firstMessage", "-4").unwrap();
    change(&snapshot, &mut draft, "lastMessage", "-2").unwrap();
    let (edit, _) = plan(&snapshot, Revision(0), &draft).unwrap();
    let mut session = EditorSession::new(snapshot);
    apply(&mut session, edit);
    let encoded = encode_extra_codes(&session.snapshot().extra_codes, Some(&source)).unwrap();
    assert_eq!(encoded.len(), source.len());
    let changed: Vec<_> = source
        .iter()
        .zip(&encoded)
        .enumerate()
        .filter_map(|(offset, (before, after))| (before != after).then_some(offset))
        .collect();
    assert_eq!(changed, [100, 101, 102, 103]);
    assert_eq!(&encoded[104..], &source[104..]);
}

#[test]
fn the_last_single_slot_is_usable_and_full_capacity_never_recycles_existing_rows() {
    let mut snapshot = message_snapshot();
    snapshot.extra_action_points[0].actions[0].target_native_id = -1;
    snapshot.extra_codes = (0..32767).map(|id| row(id, [1, 1, 7, 8, 9])).collect();
    let mut draft = message_draft(&snapshot);
    change(&snapshot, &mut draft, "firstMessage", "1").unwrap();
    change(&snapshot, &mut draft, "lastMessage", "1").unwrap();
    let (edit, intent) = plan(&snapshot, Revision(0), &draft).unwrap();
    assert_eq!(edit.target_native_id, i16::MAX);
    assert_eq!(edit.secondary_values, None);
    assert_eq!(intent.row_ids, [32767]);
    let original_draft = draft.clone();
    snapshot.extra_codes.push(row(32767, [1, 1, 7, 8, 9]));
    assert!(
        plan(&snapshot, Revision(0), &draft)
            .unwrap_err()
            .contains("No separate settings")
    );
    assert_eq!(draft, original_draft);
    assert_eq!(snapshot.extra_codes.len(), 32768);
}

#[test]
fn single_row_allocation_is_guarded_against_new_occupancy_before_apply() {
    let mut snapshot = message_snapshot();
    snapshot.extra_action_points.push(caller(159, 19, 10));
    let mut draft = message_draft(&snapshot);
    change(&snapshot, &mut draft, "firstMessage", "3").unwrap();
    let (edit, _) = plan(&snapshot, Revision(0), &draft).unwrap();
    assert_eq!(edit.target_native_id, 0);
    snapshot.extra_codes.push(row(0, [99; 5]));
    let mut session = EditorSession::new(snapshot);
    let before = serde_json::to_value(session.persisted_state()).unwrap();
    let error = session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::ApplyActionSettings { edit },
        })
        .unwrap_err();
    assert!(error.to_string().contains("available rows"));
    assert_eq!(
        serde_json::to_value(session.persisted_state()).unwrap(),
        before
    );
}

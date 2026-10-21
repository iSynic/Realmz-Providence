use super::*;

#[test]
fn choosing_preserves_wait_while_clear_and_no_message_remain_distinct() {
    let snapshot = message_snapshot();
    let mut draft = message_draft(&snapshot);
    change(&snapshot, &mut draft, "firstMessage", "-2").unwrap();
    choose_message(
        &snapshot,
        &mut draft,
        "firstMessage",
        Some(&StableId("message:5".into())),
        None,
    )
    .unwrap();
    assert_eq!(draft.input.first_message, "-5");
    choose_message(
        &snapshot,
        &mut draft,
        "lastMessage",
        Some(&StableId("message:5".into())),
        None,
    )
    .unwrap();
    assert_eq!(draft.input.last_message, "5");
    choose_message(&snapshot, &mut draft, "firstMessage", None, None).unwrap();
    assert_eq!(draft.input.first_message, "0");
    change(&snapshot, &mut draft, "firstMessage", "").unwrap();
    assert_eq!(draft.input.first_message, "");
    assert!(!preview_random_message(&snapshot, Revision(0), &draft, 0).can_apply);
}

#[test]
fn exact_picker_rejects_substitutes_ambiguity_and_unrepresentable_wait() {
    let mut snapshot = message_snapshot();
    snapshot.messages.push(message(32768));
    let mut draft = message_draft(&snapshot);
    for id in ["message:0002", "message:9", "message:32769", "text:2"] {
        assert!(
            choose_message(
                &snapshot,
                &mut draft,
                "firstMessage",
                Some(&StableId(id.into())),
                None
            )
            .is_err()
        );
    }
    let target = StableId("message:32768".into());
    assert!(
        choose_message(
            &snapshot,
            &mut draft,
            "lastMessage",
            Some(&target),
            Some(true)
        )
        .is_err()
    );
    choose_message(
        &snapshot,
        &mut draft,
        "lastMessage",
        Some(&target),
        Some(false),
    )
    .unwrap();
    assert_eq!(draft.input.last_message, "-32768");
    snapshot.messages.push(message(2));
    assert!(
        choose_message(
            &snapshot,
            &mut draft,
            "firstMessage",
            Some(&StableId("message:2".into())),
            None
        )
        .is_err()
    );
    assert!(peek_message(&snapshot, &StableId("message:2".into())).is_err());
}

#[test]
fn bounded_search_and_exact_peek_do_not_edit_or_truncate_source() {
    let mut snapshot = message_snapshot();
    snapshot.messages[0].text = "café\n  preserved spacing  ".repeat(20);
    snapshot.messages.push(message(2));
    let before = snapshot.clone();
    let page = message_choices(&snapshot, "authored", 1, 2);
    assert_eq!(page.total, 7);
    assert_eq!(page.items.len(), 2);
    assert_eq!(page.items[0].identity, StableId("message:3".into()));
    let duplicate = message_choices(&snapshot, "2", 0, 0);
    assert_eq!(duplicate.limit, 1);
    assert!(!duplicate.items[0].selectable);
    let peek = peek_message(&snapshot, &StableId("message:1".into())).unwrap();
    assert_eq!(peek.text, snapshot.messages[0].text);
    assert!(peek.text.chars().count() > 120);
    assert_eq!(message_choices(&snapshot, "CAFÉ", 0, 128).total, 1);
    assert_eq!(snapshot, before);
}

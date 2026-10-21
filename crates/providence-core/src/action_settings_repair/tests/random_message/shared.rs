use super::*;

#[test]
fn confirmed_message_repair_updates_exact_callers_and_undo_restores_all() {
    let mut before = message_snapshot();
    before
        .extra_action_points
        .extend([caller(200, 19, 10), caller(201, -19, 10)]);
    let mut draft = message_draft(&before);
    change(&before, &mut draft, "firstMessage", "3").unwrap();
    change(&before, &mut draft, "scope", "confirmed-actions").unwrap();
    assert_eq!(draft.confirmed_callers.len(), 2);
    let (edit, intent) = plan(&before, Revision(0), &draft).unwrap();
    assert_eq!(edit.target_native_id, 10);
    assert!(!edit.allow_shared_updates);
    assert!(matches!(
        edit.scope,
        crate::session::ActionSettingsWriteScope::UpdateAffected { .. }
    ));
    let mut session = EditorSession::new(before.clone());
    apply(&mut session, edit);
    assert_eq!(
        session.snapshot().extra_codes,
        [row(10, [3, 4, i16::MIN, 731, i16::MAX])]
    );
    assert_eq!(
        session.snapshot().extra_action_points,
        before.extra_action_points
    );
    assert_eq!(
        reconcile(session.snapshot(), session.revision(), &intent, true),
        RepairOutcome::MatchesRepair
    );
    assert_eq!(session.undo_history().len(), 1);
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: session.revision(),
            command: EditorCommand::Undo,
        })
        .unwrap();
    assert_eq!(session.snapshot(), &before);
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: session.revision(),
            command: EditorCommand::Redo,
        })
        .unwrap();
    assert_eq!(session.snapshot().extra_codes[0].values[0], 3);
}

#[test]
fn shared_confirmation_is_exact_and_new_typing_resets_it() {
    let mut snapshot = message_snapshot();
    snapshot.extra_action_points.push(caller(200, 19, 10));
    let mut draft = message_draft(&snapshot);
    change(&snapshot, &mut draft, "firstMessage", "3").unwrap();
    change(&snapshot, &mut draft, "scope", "confirmed-actions").unwrap();
    let confirmed = draft.clone();
    draft.confirmed_callers.clear();
    assert!(
        plan(&snapshot, Revision(0), &draft)
            .unwrap_err()
            .contains("confirm")
    );
    draft = confirmed;
    change(&snapshot, &mut draft, "lastMessage", "5").unwrap();
    assert_eq!(draft.scope, RepairScope::OnlyThisAction);
    assert!(draft.confirmed_callers.is_empty());
    let (edit, _) = plan(&snapshot, Revision(0), &draft).unwrap();
    assert_ne!(edit.target_native_id, 10);
    change(&snapshot, &mut draft, "scope", "confirmed-actions").unwrap();
    snapshot.extra_action_points.push(caller(201, 19, 10));
    assert!(plan(&snapshot, Revision(0), &draft).is_err());
    assert!(plan(&snapshot, Revision(1), &draft).is_err());
    let rebased = rebase(&snapshot, Revision(1), &draft).unwrap();
    assert_eq!(rebased.scope, RepairScope::OnlyThisAction);
    assert!(rebased.confirmed_callers.is_empty());
}

#[test]
fn incompatible_missing_and_ambiguous_shared_rows_are_never_confirmed() {
    for mode in 0..4 {
        let mut snapshot = message_snapshot();
        match mode {
            0 => snapshot.extra_codes.clear(),
            1 => snapshot.extra_codes.push(snapshot.extra_codes[0].clone()),
            2 => snapshot.extra_action_points.push(caller(200, 20, 10)),
            _ => snapshot.extra_action_points.push(caller(200, 92, 9)),
        }
        let mut draft = message_draft(&snapshot);
        change(&snapshot, &mut draft, "firstMessage", "3").unwrap();
        change(&snapshot, &mut draft, "lastMessage", "4").unwrap();
        assert!(change(&snapshot, &mut draft, "scope", "confirmed-actions").is_err());
        assert_eq!(draft.scope, RepairScope::OnlyThisAction);
        assert!(draft.confirmed_callers.is_empty());
    }
}

#[test]
fn confirmed_scope_does_not_enable_legacy_area_or_shared_flags() {
    let snapshot = snapshot();
    let mut draft = complete(&snapshot);
    assert!(change(&snapshot, &mut draft, "scope", "confirmed-actions").is_err());
    draft.scope = RepairScope::ConfirmedActions;
    assert!(plan(&snapshot, Revision(0), &draft).is_err());
}

#[test]
fn message_view_preserves_read_only_state_and_reports_off_page_problems() {
    let mut snapshot = message_snapshot();
    snapshot.extra_action_points.push(caller(200, 19, 10));
    let original = snapshot.clone();
    let mut draft = message_draft(&snapshot);
    let view = preview_random_message(&snapshot, Revision(0), &draft, 0);
    assert_eq!(view.phase, "editing");
    assert!(view.share_allowed);
    assert!(!view.dirty);
    change(&snapshot, &mut draft, "lastMessage", "9").unwrap();
    let view = preview_random_message(&snapshot, Revision(0), &draft, 0);
    assert!(view.dirty);
    assert!(!view.can_apply);
    let page = view.range.unwrap();
    assert_eq!(page.entries.len(), 4);
    assert_eq!(
        page.first_unresolved.unwrap().native_id,
        Some(NativeRecordId(9))
    );
    assert_eq!(snapshot, original);
    assert_eq!(
        preview_random_message(&snapshot, Revision(1), &draft, 0).phase,
        "stale"
    );
    snapshot.extra_codes[0].values[2] = 12;
    let comparison = compare_random_message(&snapshot, Revision(1), &draft);
    assert!(comparison.can_rebase);
    assert!(comparison.context_message.contains("current values"));
    assert_eq!(
        rebase(&snapshot, Revision(1), &draft)
            .unwrap()
            .input
            .retained[0],
        12
    );
}

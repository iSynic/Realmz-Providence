use super::*;
use crate::session::MonsterRecordDraft;
use serde_json::json;

fn draft_session() -> EditorSession {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("monster-draft-test".into()));
    let mut bytes = vec![0; crate::codecs::MONSTER_RECORD_BYTES * 2];
    bytes[crate::codecs::MONSTER_RECORD_BYTES] = 2;
    for (set_id, path) in [(0, "Data MD"), (1, "Data MD1"), (-1, "Data MD-1")] {
        let mut set = crate::codecs::decode_monster_set(&bytes, path, set_id);
        set.monsters[1].display_name = "Source monster".into();
        set.monsters[1].spells[0] = -1101;
        set.monsters[1].type_flags[0] = 7;
        set.monsters[1].conditions[0] = -9;
        snapshot.monster_sets.push(set);
    }
    let descriptions = vec![0; crate::codecs::MONSTER_DESCRIPTION_RECORD_BYTES * 2];
    snapshot.monster_descriptions =
        crate::codecs::decode_monster_descriptions(&descriptions).records;
    EditorSession::new(snapshot)
}

fn draft() -> MonsterRecordDraft {
    MonsterRecordDraft {
        set_id: -1,
        native_id: NativeRecordId(1),
        fields: [("armor".into(), json!(18)), ("items.2".into(), json!(-93))].into(),
        description: Some("Shared authored description".into()),
        normal_not_on_menu: Some(true),
    }
}

#[test]
fn monster_draft_field_issues_are_complete_pure_and_preserve_unedited_imported_values() {
    let session = draft_session();
    let before = session.snapshot().clone();
    let mut draft = draft();
    draft.fields.insert("armor".into(), json!(999));
    draft
        .fields
        .insert("conditions.39".into(), json!("not an integer"));
    draft.description = Some("x".repeat(256));
    let issues = session.monster_draft_issues(&draft);
    assert_eq!(
        issues
            .iter()
            .map(|issue| issue.field.as_str())
            .collect::<Vec<_>>(),
        ["armor", "conditions.39", "description"]
    );
    assert!(issues.iter().all(|issue| !issue.message.is_empty()));
    assert_eq!(issues[0].message, "Enter a whole number from -128 to 127.");
    assert!(issues[0].diagnostic.contains("i8"));
    assert!(!issues[0].message.contains("monster:"));
    assert_eq!(session.snapshot(), &before);
    assert_eq!(session.revision(), Revision(0));
    assert!(session.undo_history().is_empty());
    assert!(
        session
            .monster_draft_issues(&super::monster_drafts::draft())
            .is_empty()
    );
}

#[test]
fn selected_variant_shared_text_and_normal_bestiary_apply_as_one_history_entry() {
    let mut session = draft_session();
    let before = session.snapshot().clone();
    assert_eq!(session.monster_draft_changes(&draft()).unwrap().len(), 4);
    let change = session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::ApplyMonsterDraft { draft: draft() },
        })
        .unwrap();
    assert_eq!(change.revision, Revision(1));
    assert_eq!(change.changed_entities_total, 3);
    assert_eq!(session.undo_history().len(), 1);
    let mega = &session
        .snapshot()
        .monster_sets
        .iter()
        .find(|s| s.set_id == -1)
        .unwrap()
        .monsters[1];
    assert_eq!((mega.armor, mega.items[2]), (18, -93));
    assert_eq!(
        (mega.spells[0], mega.type_flags[0], mega.conditions[0]),
        (-1101, 7, -9)
    );
    let normal = &session
        .snapshot()
        .monster_sets
        .iter()
        .find(|s| s.set_id == 0)
        .unwrap()
        .monsters[1];
    assert!(normal.not_on_menu);
    assert_eq!(normal.armor, 0);
    let applied = session.snapshot().clone();
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(1),
            command: EditorCommand::Undo,
        })
        .unwrap();
    assert_eq!(session.snapshot(), &before);
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(2),
            command: EditorCommand::Redo,
        })
        .unwrap();
    assert_eq!(session.snapshot(), &applied);
}

#[test]
fn rejected_draft_never_partially_writes_any_owner() {
    let mut session = draft_session();
    let before = session.snapshot().clone();
    let mut cases = Vec::new();
    let mut too_long = draft();
    too_long.description = Some("x".repeat(256));
    cases.push(too_long);
    let mut invalid_slot = draft();
    invalid_slot.fields.insert("spells.10".into(), json!(1));
    cases.push(invalid_slot);
    let mut runtime = draft();
    runtime.fields.insert("target".into(), json!(1));
    cases.push(runtime);
    let mut overflow = draft();
    overflow.fields.insert("armor".into(), json!(128));
    cases.push(overflow);
    let mut fractional = draft();
    fractional.fields.insert("armor".into(), json!(1.5));
    cases.push(fractional);
    let mut unsupported = draft();
    unsupported.description = Some("A dragon 🐉".into());
    cases.push(unsupported);
    for draft in cases {
        assert!(
            session
                .execute(ExpectedRevisionCommand {
                    expected_revision: Revision(0),
                    command: EditorCommand::ApplyMonsterDraft { draft }
                })
                .is_err()
        );
        assert_eq!(session.snapshot(), &before);
        assert_eq!(session.revision(), Revision(0));
        assert!(!session.can_undo());
    }
}

#[test]
fn missing_normal_bestiary_and_stale_revision_leave_the_variant_unchanged() {
    let mut session = draft_session();
    session.snapshot.monster_sets.retain(|s| s.set_id != 0);
    let before = session.snapshot().clone();
    assert!(
        session
            .execute(ExpectedRevisionCommand {
                expected_revision: Revision(0),
                command: EditorCommand::ApplyMonsterDraft { draft: draft() }
            })
            .is_err()
    );
    assert_eq!(session.snapshot(), &before);
    let mut edit = draft();
    edit.normal_not_on_menu = None;
    assert!(matches!(
        session.execute(ExpectedRevisionCommand {
            expected_revision: Revision(1),
            command: EditorCommand::ApplyMonsterDraft { draft: edit }
        }),
        Err(SessionError::RevisionConflict { .. })
    ));
    assert_eq!(session.snapshot(), &before);
}

#[test]
fn same_values_preserve_revision_history_and_imported_authorship() {
    let mut session = draft_session();
    let before = session.snapshot().clone();
    let draft = MonsterRecordDraft {
        set_id: -1,
        native_id: NativeRecordId(1),
        fields: [("armor".into(), json!(0))].into(),
        description: Some(String::new()),
        normal_not_on_menu: Some(false),
    };
    let result = session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::ApplyMonsterDraft { draft },
        })
        .unwrap();
    assert_eq!(result.revision, Revision(0));
    assert_eq!(result.changed_entities_total, 0);
    assert_eq!(session.snapshot(), &before);
    assert!(!session.can_undo());
}

use super::*;
use crate::monster_library::{MonsterLibraryCatalog, MonsterLibraryCommand, MonsterLibraryOrigin};
use crate::session::{ExpectedRevisionCommand, Revision};

fn session() -> MonsterLibrarySession {
    let mut session = MonsterLibrarySession::new(MonsterLibraryCatalog::new(StableId(
        "library:drafts".into(),
    )))
    .unwrap();
    let template =
        crate::codecs::decode_monsters(&vec![0; crate::codecs::MONSTER_RECORD_BYTES], "Data MD", 0)
            .records
            .remove(0);
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: MonsterLibraryCommand::CreateCustom {
                label: "Library source".into(),
                preferred_scenario_monster_id: NativeRecordId(7),
                template: Box::new(template),
                description: "Saved description".into(),
                origin: MonsterLibraryOrigin::Blank,
            },
        })
        .unwrap();
    session
}

fn draft(session: &MonsterLibrarySession) -> MonsterLibraryDraft {
    MonsterLibraryDraft {
        identity: session.catalog().custom_entries[0].identity.clone(),
        fields: [("armor".into(), serde_json::json!(18))].into(),
        preferred_scenario_monster_id: Some(NativeRecordId(300)),
        description: Some("Edited library description".into()),
        not_on_menu: Some(true),
    }
}

#[test]
fn monster_library_draft_issues_identify_each_invalid_control_without_changing_catalog_or_history()
{
    let session = session();
    let before = session.persisted_state();
    let mut draft = draft(&session);
    draft.fields.insert("armor".into(), serde_json::json!(999));
    draft
        .fields
        .insert("money.2".into(), serde_json::json!("invalid"));
    draft.description = Some("x".repeat(256));
    let issues = session.monster_library_draft_issues(&draft);
    assert_eq!(
        issues
            .iter()
            .map(|issue| issue.field.as_str())
            .collect::<Vec<_>>(),
        ["armor", "money.2", "description"]
    );
    assert_eq!(session.persisted_state(), before);
}

#[test]
fn library_record_mask_shared_fields_and_preferred_identity_apply_atomically() {
    let mut session = session();
    let before = session.catalog().clone();
    let draft = draft(&session);
    let changes = session.monster_library_draft_changes(&draft).unwrap();
    assert!(
        changes
            .iter()
            .any(|change| change.field == "template.nameId")
    );
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(1),
            command: MonsterLibraryCommand::ApplyDraft { draft },
        })
        .unwrap();
    let entry = &session.catalog().custom_entries[0];
    assert_eq!(entry.preferred_scenario_monster_id, NativeRecordId(300));
    assert_eq!(entry.template.name_id, 44);
    assert_eq!(entry.template.armor, 18);
    assert!(entry.template.not_on_menu);
    assert_eq!(entry.description, "Edited library description");
    assert_eq!(session.persisted_state().undo.len(), 2);
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(2),
            command: MonsterLibraryCommand::Undo,
        })
        .unwrap();
    let mut original = before;
    original.revision = Revision(3);
    assert_eq!(session.catalog(), &original);
}

#[test]
fn rejected_library_drafts_and_legacy_updates_never_partially_replace_a_label() {
    let mut session = session();
    let before = session.persisted_state();
    let mut draft = draft(&session);
    draft
        .fields
        .insert("displayName".into(), serde_json::json!("Replacement label"));
    draft.description = Some("x".repeat(256));
    assert!(
        session
            .execute(ExpectedRevisionCommand {
                expected_revision: Revision(1),
                command: MonsterLibraryCommand::ApplyDraft { draft }
            })
            .is_err()
    );
    assert_eq!(session.persisted_state(), before);
    let entry = session.catalog().custom_entries[0].clone();
    let update = MonsterLibraryCommand::UpdateCustom {
        identity: entry.identity,
        label: "Changed".into(),
        preferred_scenario_monster_id: NativeRecordId(40000),
        template: Box::new(entry.template),
        description: entry.description,
    };
    assert!(
        session
            .execute(ExpectedRevisionCommand {
                expected_revision: Revision(1),
                command: update
            })
            .is_err()
    );
    assert_eq!(session.persisted_state(), before);
}

#[test]
fn unchanged_library_draft_preserves_history_and_rejects_foreign_identity() {
    let mut session = session();
    let before = session.persisted_state();
    let mut draft = MonsterLibraryDraft {
        identity: session.catalog().custom_entries[0].identity.clone(),
        fields: BTreeMap::new(),
        preferred_scenario_monster_id: None,
        description: None,
        not_on_menu: None,
    };
    let projection = session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(1),
            command: MonsterLibraryCommand::ApplyDraft {
                draft: draft.clone(),
            },
        })
        .unwrap();
    assert_eq!(projection.revision, Revision(1));
    assert_eq!(session.persisted_state(), before);
    draft.identity = StableId("protected:foreign".into());
    assert!(session.monster_library_draft_changes(&draft).is_err());
}

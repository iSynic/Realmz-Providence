use super::*;
use crate::monster_library::{
    MONSTER_SCRAPBOOK_RECORD_BYTES, MonsterLibraryCatalog, decode_monster_scrapbook,
};

fn session() -> MonsterLibrarySession {
    let mut bytes = vec![0; MONSTER_SCRAPBOOK_RECORD_BYTES];
    bytes[0] = 3;
    let decoded =
        decode_monster_scrapbook(&bytes, "fixture", "fixture-revision", "fixture/scrapbook");
    let mut session = MonsterLibrarySession::new(MonsterLibraryCatalog::new(StableId(
        "library:review".into(),
    )))
    .unwrap();
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: MonsterLibraryCommand::ImportBuiltIns {
                source: decoded.source,
                entries: decoded.entries,
            },
        })
        .unwrap();
    session
}

#[test]
fn protected_customization_review_is_pure_complete_and_receives_one_history_entry() {
    let mut session = session();
    let source = session.catalog().built_ins[0].identity.clone();
    let before = session.persisted_state();
    let command = MonsterLibraryCommand::CustomizeBuiltIn {
        source: source.clone(),
        label: Some("Custom source".into()),
    };
    let review = session.review_operation(&command).unwrap();
    assert_eq!(session.persisted_state(), before);
    assert!(
        review
            .changes
            .iter()
            .any(|change| change.field == "template.conditions.39")
    );
    assert!(
        review
            .changes
            .iter()
            .any(|change| change.field == "template.items.5")
    );
    assert!(
        session
            .execute_reviewed(session.revision(), command.clone(), "foreign-hash")
            .is_err()
    );
    assert_eq!(session.persisted_state(), before);
    session
        .execute_reviewed(session.revision(), command, &review.review_hash)
        .unwrap();
    assert_eq!(session.persisted_state().undo.len(), before.undo.len() + 1);
    assert_eq!(session.catalog().built_ins[0], before.catalog.built_ins[0]);
    let identity = review.selected_identity.unwrap();
    assert_eq!(
        session.catalog().entry(&identity).unwrap().label,
        "Custom source"
    );
    let restore = MonsterLibraryCommand::RestoreBuiltIn { source };
    let review = session.review_operation(&restore).unwrap();
    assert!(
        review
            .changes
            .iter()
            .any(|change| change.field == "template.conditions.39" && change.after.is_null())
    );
    session
        .execute_reviewed(session.revision(), restore, &review.review_hash)
        .unwrap();
    assert!(session.catalog().custom_entries.is_empty());
}

#[test]
fn protected_removal_stale_review_and_unrelated_commands_do_not_mutate_the_library() {
    let mut session = session();
    let identity = session.catalog().built_ins[0].identity.clone();
    let before = session.persisted_state();
    assert!(
        session
            .review_operation(&MonsterLibraryCommand::DeleteCustom {
                identity: identity.clone()
            })
            .is_err()
    );
    assert!(
        session
            .review_operation(&MonsterLibraryCommand::Undo)
            .is_err()
    );
    let command = MonsterLibraryCommand::Duplicate {
        source: identity,
        label: "Independent copy".into(),
    };
    let review = session.review_operation(&command).unwrap();
    assert!(
        session
            .execute_reviewed(Revision(0), command, &review.review_hash)
            .is_err()
    );
    assert_eq!(session.persisted_state(), before);
}

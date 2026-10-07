use super::*;
use crate::monster_library::{MonsterLibraryCopyMode, MonsterLibraryScenarioCopy};

fn copies() -> Vec<MonsterLibraryScenarioCopy> {
    [3, 4]
        .into_iter()
        .map(|id| MonsterLibraryScenarioCopy {
            target_id: NativeRecordId(id),
            template: Box::new(crate::session::new_monster_template(NativeRecordId(id)).unwrap()),
            description: format!("Shared description {id}"),
            mode: MonsterLibraryCopyMode::ExactAllSets,
            replace: false,
        })
        .collect()
}

#[test]
fn reviewed_library_transfer_is_one_history_entry_with_complete_variants_and_shared_text() {
    let mut session =
        EditorSession::new(ProjectSnapshot::new_authored(StableId("transfer".into())));
    let before = session.snapshot().clone();
    let copies = copies();
    let review = session.review_monster_library_transfer(&copies).unwrap();
    assert_transfer_review_fields(&review);
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::CommitMonsterLibraryTransfer {
                copies,
                review_hash: review.review_hash,
            },
        })
        .unwrap();
    assert_eq!(session.undo_history().len(), 1);
    assert_eq!(session.snapshot().monster_sets.len(), 3);
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
    assert!(
        session
            .snapshot()
            .monster_sets
            .iter()
            .all(|set| set.monsters.iter().any(|monster| monster.native_id.0 == 4))
    );
}

#[test]
fn bulk_population_matches_sequential_templates_in_every_mode() {
    for mode in [
        MonsterLibraryCopyMode::Normal,
        MonsterLibraryCopyMode::ExactAllSets,
        MonsterLibraryCopyMode::GenerateVariants,
    ] {
        let snapshot = ProjectSnapshot::new_authored(StableId("bulk-equivalence".into()));
        let mut batch = EditorSession::new(snapshot.clone());
        let mut individual = EditorSession::new(snapshot);
        let copies = copies()
            .into_iter()
            .map(|mut copy| {
                copy.mode = mode;
                copy
            })
            .collect::<Vec<_>>();
        batch
            .execute(ExpectedRevisionCommand {
                expected_revision: batch.revision(),
                command: EditorCommand::PopulateMonsterLibraryTemplates {
                    copies: copies.clone(),
                },
            })
            .unwrap();
        for copy in copies {
            individual
                .execute(ExpectedRevisionCommand {
                    expected_revision: individual.revision(),
                    command: EditorCommand::ApplyMonsterLibraryTemplate {
                        target_id: copy.target_id,
                        template: copy.template,
                        description: copy.description,
                        mode: copy.mode,
                        replace: copy.replace,
                    },
                })
                .unwrap();
        }
        assert_eq!(batch.snapshot(), individual.snapshot());
        assert_eq!(batch.undo_history().len(), 1);
        assert_eq!(individual.undo_history().len(), 2);
    }
}

#[test]
fn transfer_review_tracks_changed_copy_intent_and_current_destination() {
    let mut session = EditorSession::new(ProjectSnapshot::new_authored(StableId(
        "review-state".into(),
    )));
    let mut copies = copies();
    copies.iter_mut().for_each(|copy| copy.replace = true);
    let first = session
        .shared_monster_library_transfer_review(&copies)
        .unwrap();
    copies[0].template.armor = 9;
    let source_changed = session
        .shared_monster_library_transfer_review(&copies)
        .unwrap();
    assert_ne!(first.review_hash, source_changed.review_hash);
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: session.revision(),
            command: EditorCommand::CreateMonster {
                set_id: 0,
                native_id: NativeRecordId(3),
            },
        })
        .unwrap();
    let mut monster = session
        .snapshot()
        .monster_sets
        .iter()
        .find(|set| set.set_id == 0)
        .unwrap()
        .monsters
        .iter()
        .find(|row| row.native_id.0 == 3)
        .unwrap()
        .clone();
    monster.armor = 5;
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: session.revision(),
            command: EditorCommand::UpdateMonster {
                set_id: 0,
                monster: Box::new(monster),
            },
        })
        .unwrap();
    let current = session
        .shared_monster_library_transfer_review(&copies)
        .unwrap();
    assert_ne!(source_changed.review_hash, current.review_hash);
    let armor = current
        .comparison
        .iter()
        .find(|row| row.entity.0 == "monster:0:3" && row.field == "armor")
        .unwrap();
    assert_eq!(armor.source, serde_json::json!(9));
    assert_eq!(armor.before, serde_json::json!(5));
    assert_eq!(armor.after, serde_json::json!(9));
}

#[test]
fn transfer_hash_mismatch_and_late_occupied_destination_never_publish_a_partial_allocation() {
    let mut session = EditorSession::new(ProjectSnapshot::new_authored(StableId(
        "transfer-failure".into(),
    )));
    let review = session.review_monster_library_transfer(&copies()).unwrap();
    let before = session.snapshot().clone();
    assert!(
        session
            .execute(ExpectedRevisionCommand {
                expected_revision: Revision(0),
                command: EditorCommand::CommitMonsterLibraryTransfer {
                    copies: copies(),
                    review_hash: "wrong".into()
                }
            })
            .is_err()
    );
    assert_eq!(session.snapshot(), &before);
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::CreateMonster {
                set_id: 0,
                native_id: NativeRecordId(4),
            },
        })
        .unwrap();
    let before = session.snapshot().clone();
    assert!(
        session
            .execute(ExpectedRevisionCommand {
                expected_revision: Revision(1),
                command: EditorCommand::CommitMonsterLibraryTransfer {
                    copies: copies(),
                    review_hash: review.review_hash
                }
            })
            .is_err()
    );
    assert_eq!(session.snapshot(), &before);
    assert_eq!(session.undo_history().len(), 1);
}

fn assert_transfer_review_fields(
    review: &crate::session::monster_library_transfers::MonsterLibraryTransferReview,
) {
    let final_condition = review
        .comparison
        .iter()
        .find(|row| row.entity.0 == "monster:-1:4" && row.field == "conditions.39")
        .unwrap();
    assert_eq!(final_condition.before, serde_json::Value::Null);
    assert_eq!(final_condition.source, serde_json::json!(0));
    assert_eq!(final_condition.after, serde_json::json!(0));
    assert!(
        review
            .comparison
            .iter()
            .all(|row| !row.field.contains("nativeMetadata"))
    );
    assert!(
        review
            .changes
            .iter()
            .any(|change| change.entity.0 == "monster:-1:4" && change.field == "conditions.39")
    );
    assert!(
        review
            .changes
            .iter()
            .any(|change| change.entity.0 == "monster-description:3"
                && change.field == "description")
    );
}

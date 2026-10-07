use super::*;
use crate::session::{ChangeProjection, MonsterOperation, MonsterRecordOperation, MonsterUseEdit};
use serde_json::json;

fn session() -> EditorSession {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("monster-operations".into()));
    let mut normal = crate::codecs::decode_monster_set(
        &vec![0; crate::codecs::MONSTER_RECORD_BYTES * 6],
        "Data MD",
        0,
    );
    for id in [0, 1, 3, 5] {
        normal.monsters[id].hit_dice = 3;
    }
    normal.monsters[3].not_on_menu = true;
    normal.monsters[4].hit_dice = 255;
    let mut mega = normal.clone();
    mega.set_id = -1;
    mega.native_path = "Data MD-1".into();
    for record in &mut mega.monsters {
        record.identity = StableId(format!("monster:-1:{}", record.native_id.0));
        record.items[5] = -93;
        record.conditions[39] = -12;
        record.attacks[4][3] = 19;
    }
    snapshot.monster_sets = vec![normal, mega];
    snapshot.monster_descriptions =
        crate::codecs::decode_monster_descriptions(&vec![0; 256 * 6]).records;
    snapshot.monster_descriptions[1].text = "Shared source text".into();
    let mut battle = crate::codecs::decode_battles(&vec![0; crate::codecs::BATTLE_RECORD_BYTES])
        .records
        .remove(0);
    battle.grid[0] = -1;
    battle.grid[1] = 1;
    snapshot.battles.push(battle);
    EditorSession::new(snapshot)
}

fn apply(
    session: &mut EditorSession,
    operation: MonsterOperation,
    hash: String,
) -> Result<ChangeProjection, SessionError> {
    session.execute(ExpectedRevisionCommand {
        expected_revision: session.revision(),
        command: EditorCommand::CommitMonsterOperation {
            operation,
            review_hash: hash,
        },
    })
}

#[test]
fn reviewed_clear_retargets_signed_battle_uses_with_one_atomic_history_entry() {
    let mut session = session();
    let before = session.snapshot().clone();
    let operation = MonsterOperation {
        action: MonsterRecordOperation::Clear {
            set_id: 0,
            native_id: NativeRecordId(1),
        },
        retarget_uses: vec![MonsterUseEdit {
            source: StableId("battle:0".into()),
            field: "grid[0].monster".into(),
            target_id: 3,
        }],
    };
    let review = session.review_monster_operation(&operation).unwrap();
    assert_eq!(review.uses.len(), 2);
    assert!(review.changes.iter().any(|change| change.field == "grid.0"
        && change.before == json!(-1)
        && change.after == json!(-3)));
    assert!(
        !review
            .changes
            .iter()
            .any(|change| change.field == "description")
    );
    apply(&mut session, operation, review.review_hash).unwrap();
    assert_eq!(session.undo_history().len(), 1);
    assert_eq!(&session.snapshot().battles[0].grid[..2], &[-3, 1]);
    assert_eq!(
        session.snapshot().monster_descriptions[1].text,
        "Shared source text"
    );
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(1),
            command: EditorCommand::Undo,
        })
        .unwrap();
    assert_eq!(session.snapshot(), &before);
}

#[test]
fn invalid_reference_or_changed_review_leaves_every_record_untouched() {
    let mut session = session();
    let before = session.snapshot().clone();
    let mut operation = MonsterOperation {
        action: MonsterRecordOperation::Clear {
            set_id: 0,
            native_id: NativeRecordId(1),
        },
        retarget_uses: vec![],
    };
    let review = session.review_monster_operation(&operation).unwrap();
    assert!(apply(&mut session, operation.clone(), "foreign-review".into()).is_err());
    operation.retarget_uses.push(MonsterUseEdit {
        source: StableId("battle:0".into()),
        field: "grid[0].monster".into(),
        target_id: 2,
    });
    assert!(apply(&mut session, operation, review.review_hash).is_err());
    assert_eq!(session.snapshot(), &before);
    assert_eq!(session.revision(), Revision(0));
}

#[test]
fn generation_reviews_complete_field_replacements_and_exact_exclusions() {
    let mut session = session();
    let operation = MonsterOperation {
        action: MonsterRecordOperation::GenerateAllVariants,
        retarget_uses: vec![],
    };
    let review = session.review_monster_operation(&operation).unwrap();
    assert_eq!(
        review
            .excluded
            .iter()
            .map(|entry| entry.0.0)
            .collect::<Vec<_>>(),
        [0, 2, 4, 5]
    );
    assert!(
        review
            .changes
            .iter()
            .any(|change| change.entity.0 == "monster:-1:3" && change.field == "items.5")
    );
    assert!(
        review
            .changes
            .iter()
            .any(|change| change.field == "conditions.39" && change.before == json!(-12))
    );
    assert!(
        review
            .changes
            .iter()
            .any(|change| change.field == "attacks.4.3" && change.before == json!(19))
    );
    assert!(review.changes.len() > 9);
    apply(&mut session, operation, review.review_hash).unwrap();
    assert_eq!(session.undo_history().len(), 1);
    let normal = session
        .snapshot()
        .monster_sets
        .iter()
        .find(|set| set.set_id == 0)
        .unwrap();
    assert!(normal.monsters[3].not_on_menu);
    assert_eq!(normal.monsters[4].hit_dice, 255);
    assert_eq!(
        session
            .snapshot()
            .monster_sets
            .iter()
            .find(|set| set.set_id == -1)
            .unwrap()
            .monsters[5]
            .items[5],
        -93
    );
}

#[test]
fn ally_use_retains_runtime_context_and_retargets_with_the_record_operation() {
    let (mut session, source) = session_with_ally_use();
    let before = session.snapshot().clone();
    let history = session.undo_history().len();
    let operation = MonsterOperation {
        action: MonsterRecordOperation::Clear {
            set_id: 0,
            native_id: NativeRecordId(1),
        },
        retarget_uses: vec![MonsterUseEdit {
            source: source.clone(),
            field: "actions[0].target".into(),
            target_id: 3,
        }],
    };
    let review = session.review_monster_operation(&operation).unwrap();
    let ally = review
        .uses
        .iter()
        .find(|usage| usage.source == source)
        .unwrap();
    assert!(ally.context.contains("difficulty selected at runtime") && ally.can_retarget);
    assert_eq!((ally.target_id, ally.raw_value), (1, 1));
    assert!(
        review
            .changes
            .iter()
            .any(|change| change.entity == source && change.field == "actions.0.targetNativeId")
    );
    apply(&mut session, operation, review.review_hash).unwrap();
    assert_eq!(session.undo_history().len(), history + 1);
    assert_eq!(
        session
            .snapshot()
            .extra_action_points
            .iter()
            .find(|row| row.identity == source)
            .unwrap()
            .actions[0]
            .target_native_id,
        3
    );
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: session.revision(),
            command: EditorCommand::Undo,
        })
        .unwrap();
    assert_eq!(session.snapshot(), &before);
}

fn session_with_ally_use() -> (EditorSession, StableId) {
    let mut session = session();
    let source = StableId("extra-action-point:4".into());
    for command in [
        EditorCommand::CreateExtraActionPoint {
            native_id: Some(NativeRecordId(4)),
        },
        EditorCommand::SetActionOpcode {
            source: source.clone(),
            slot: 0,
            raw_opcode: 89,
        },
        EditorCommand::RetargetActionReference {
            source: source.clone(),
            slot: 0,
            target_native_id: 1,
        },
    ] {
        session
            .execute(ExpectedRevisionCommand {
                expected_revision: session.revision(),
                command,
            })
            .unwrap();
    }
    (session, source)
}

use super::*;
use crate::model::{BlobId, LevelType};
use crate::session::{EditorCommand, EditorSession, ExpectedRevisionCommand, Revision};

fn fixture() -> EditorSession {
    let mut session = EditorSession::new(ProjectSnapshot::new_authored(StableId("regions".into())));
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::CreateMap {
                level_type: LevelType::Land,
            },
        })
        .unwrap();
    session
}

pub fn region(identity: &str) -> RandomRectangle {
    RandomRectangle {
        identity: StableId(identity.into()),
        top: 2,
        left: 3,
        bottom: 6,
        right: 9,
        chance_ten_thousand: 0,
        battle_range: [0, 0],
        random_doors: [0; 3],
        random_door_percent: [-100, 0, 100],
        only: false,
        option: -12,
        sound_id: 0,
        text_id: 0,
    }
}

#[test]
fn region_atomic_validation_preview_overlap_and_history() {
    let mut session = fixture();
    let owner = StableId("land:0".into());
    let edit = region("land:0:rect:3");
    let plan = preview(session.snapshot(), &owner, &edit).unwrap();
    assert_eq!(plan.covered_cells, 24);
    assert!(plan.creating && plan.can_apply);
    let original = session.snapshot().clone();
    let mut bad = edit.clone();
    bad.random_door_percent[1] = 101;
    assert!(
        session
            .execute(ExpectedRevisionCommand {
                expected_revision: Revision(1),
                command: EditorCommand::ApplyRandomRectangleDraft {
                    map: owner.clone(),
                    rectangle: Box::new(bad)
                }
            })
            .is_err()
    );
    assert_eq!(session.snapshot(), &original);
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(1),
            command: EditorCommand::ApplyRandomRectangleDraft {
                map: owner.clone(),
                rectangle: Box::new(edit.clone()),
            },
        })
        .unwrap();
    assert!(
        !preview(session.snapshot(), &owner, &edit)
            .unwrap()
            .can_apply
    );
    let mut touching = region("land:0:rect:19");
    touching.left = 9;
    assert!(preview(session.snapshot(), &owner, &touching).is_err());
    touching.right = 14;
    assert!(
        preview(session.snapshot(), &owner, &touching)
            .unwrap()
            .overlaps
            .is_empty()
    );
    touching.left = 8;
    assert_eq!(
        preview(session.snapshot(), &owner, &touching)
            .unwrap()
            .overlaps[0]
            .priority_slot,
        19
    );
    assert_region_history(&mut session, &original, &edit);
}

fn assert_region_history(
    session: &mut EditorSession,
    original: &ProjectSnapshot,
    edit: &RandomRectangle,
) {
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(2),
            command: EditorCommand::Undo,
        })
        .unwrap();
    assert_eq!(session.snapshot(), original);
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(3),
            command: EditorCommand::Redo,
        })
        .unwrap();
    let runtime = session.snapshot().world.maps[0].runtime.as_ref().unwrap();
    assert_eq!(&runtime.random_rectangles[0], edit);
}

#[test]
fn malformed_import_is_preserved_until_its_fields_are_explicitly_repaired() {
    let mut snapshot = fixture().snapshot().clone();
    snapshot.origin = ProjectOrigin::Imported {
        compatibility_annex: BlobId("a".repeat(64)),
    };
    let mut old = region("land:0:rect:2");
    old.top = -22;
    old.right = -3;
    old.random_door_percent[0] = -233;
    old.text_id = -123;
    snapshot.world.maps[0]
        .runtime
        .as_mut()
        .unwrap()
        .random_rectangles
        .push(old.clone());
    let mut session = EditorSession::new(snapshot);
    let mut edited = old.clone();
    edited.only = true;
    let owner = StableId("land:0".into());
    assert_eq!(
        preview(session.snapshot(), &owner, &edited)
            .unwrap()
            .preserved_warnings
            .len(),
        2
    );
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::ApplyRandomRectangleDraft {
                map: owner.clone(),
                rectangle: Box::new(edited.clone()),
            },
        })
        .unwrap();
    assert_eq!(
        session.snapshot().world.maps[0]
            .runtime
            .as_ref()
            .unwrap()
            .random_rectangles[0],
        edited
    );
    edited.right = -5;
    assert!(preview(session.snapshot(), &owner, &edited).is_err());
    edited = region("land:0:rect:20");
    assert!(preview(session.snapshot(), &owner, &edited).is_err());
}

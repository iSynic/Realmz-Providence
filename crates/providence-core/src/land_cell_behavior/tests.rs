use super::*;
use crate::{
    model::{BlobId, SpecialLandSolidityCatalog},
    session::{EditorCommand, EditorSession, ExpectedRevisionCommand},
};

fn execute(session: &mut EditorSession, command: EditorCommand) {
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: session.revision(),
            command,
        })
        .unwrap();
}
fn fixture() -> EditorSession {
    let mut session = EditorSession::new(ProjectSnapshot::new_authored(StableId(
        "cell-behavior".into(),
    )));
    for _ in 0..2 {
        execute(
            &mut session,
            EditorCommand::CreateMap {
                level_type: LevelType::Land,
            },
        );
    }
    session
}
fn edit(secret: LandSecretState) -> LandCellBehaviorEdit {
    LandCellBehaviorEdit {
        x: 3,
        y: 4,
        secret,
        solid: None,
        remove_placement: false,
    }
}
fn apply(session: &mut EditorSession, edit: LandCellBehaviorEdit) {
    execute(
        session,
        EditorCommand::ApplyLandCellBehavior {
            identity: StableId("land:0".into()),
            edit,
        },
    );
}

#[test]
fn secrets_preserve_positive_metadata_signed_values_and_dormant_action_points() {
    let mut session = fixture();
    execute(
        &mut session,
        EditorCommand::UpdateLandMapCell {
            identity: StableId("land:0".into()),
            x: 3,
            y: 4,
            tile: 0x6000 | 112,
        },
    );
    apply(&mut session, edit(LandSecretState::Hidden));
    assert_eq!(session.snapshot().world.maps[0].tiles[363], 0x6000 | 3112);
    execute(
        &mut session,
        EditorCommand::CreateActionPoint {
            map: StableId("land:0".into()),
            coordinate: MapCoordinate { x: 3, y: 4 },
        },
    );
    let mut snapshot = session.snapshot().clone();
    snapshot.world.action_points[0].chance_percent = 0;
    session = EditorSession::new(snapshot);
    apply(&mut session, edit(LandSecretState::Normal));
    assert_eq!(session.snapshot().world.maps[0].tiles[363], 0x6000 | 1112);
    execute(
        &mut session,
        EditorCommand::UpdateLandMapCell {
            identity: StableId("land:0".into()),
            x: 3,
            y: 4,
            tile: -3112,
        },
    );
    apply(&mut session, edit(LandSecretState::Revealed));
    assert_eq!(session.snapshot().world.maps[0].tiles[363], -2112);
    assert_eq!(session.snapshot().world.action_points.len(), 1);
}

#[test]
fn removal_uses_configured_clear_preserves_scripts_and_shared_edit_is_one_history() {
    let mut session = fixture();
    for identity in ["land:0", "land:1"] {
        execute(
            &mut session,
            EditorCommand::UpdateLandMapCell {
                identity: StableId(identity.into()),
                x: 3,
                y: 4,
                tile: -2112,
            },
        );
    }
    let mut snapshot = session.snapshot().clone();
    snapshot.world.maps[0].runtime.as_mut().unwrap().base_tile = Some(7);
    snapshot.world.special_land_solidity = Some(SpecialLandSolidityCatalog {
        source: "Data Solids".into(),
        source_blob: BlobId(format!("sha256:{}", "1".repeat(64))),
        solid: vec![false; 1024],
    });
    session = EditorSession::new(snapshot);
    let before = session.snapshot().clone();
    let mut draft = edit(LandSecretState::Normal);
    draft.solid = Some(true);
    let plan = preview(session.snapshot(), &StableId("land:0".into()), &draft).unwrap();
    assert_eq!(plan.affected_maps.len(), 2);
    assert_eq!(session.snapshot(), &before);
    apply(&mut session, draft);
    assert_eq!(session.undo_history().len(), 1);
    assert_eq!(session.snapshot().world.maps[0].tiles[363], -112);
    assert!(
        session
            .snapshot()
            .world
            .special_land_solidity
            .as_ref()
            .unwrap()
            .solid[112]
    );
    execute(&mut session, EditorCommand::Undo);
    assert_eq!(session.snapshot(), &before);
    let mut remove = edit(LandSecretState::Revealed);
    remove.remove_placement = true;
    apply(&mut session, remove);
    assert_eq!(session.snapshot().world.maps[0].tiles[363], 2007);
    assert_eq!(session.snapshot().world.maps[1].tiles[363], -2112);
}

#[test]
fn missing_or_unrepresentable_passability_and_invalid_destinations_remain_unmodified() {
    let mut session = fixture();
    execute(
        &mut session,
        EditorCommand::UpdateLandMapCell {
            identity: StableId("land:0".into()),
            x: 3,
            y: 4,
            tile: -30000,
        },
    );
    let before = session.snapshot().clone();
    let mut draft = edit(LandSecretState::Hidden);
    draft.solid = Some(true);
    assert!(preview(session.snapshot(), &StableId("land:0".into()), &draft).is_err());
    draft.x = 90;
    assert!(preview(session.snapshot(), &StableId("land:0".into()), &draft).is_err());
    assert_eq!(session.snapshot(), &before);
}

#[test]
fn passability_only_does_not_rewrite_an_imported_word_with_a_dormant_script_coordinate() {
    let mut session = fixture();
    execute(
        &mut session,
        EditorCommand::CreateActionPoint {
            map: StableId("land:0".into()),
            coordinate: MapCoordinate { x: 3, y: 4 },
        },
    );
    let mut before = session.snapshot().clone();
    before.world.maps[0].tiles[363] = -112;
    before.world.action_points[0].chance_percent = 0;
    before.world.special_land_solidity = Some(SpecialLandSolidityCatalog {
        source: "Data Solids".into(),
        source_blob: BlobId("a".repeat(64)),
        solid: vec![false; 1024],
    });
    session = EditorSession::new(before.clone());
    let mut draft = edit(LandSecretState::Normal);
    draft.solid = Some(true);
    apply(&mut session, draft);
    assert_eq!(session.snapshot().world.maps[0].tiles[363], -112);
    assert_eq!(
        session.snapshot().world.action_points,
        before.world.action_points
    );
    execute(&mut session, EditorCommand::Undo);
    assert_eq!(session.snapshot(), &before);
}

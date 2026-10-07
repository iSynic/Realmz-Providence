use super::*;
use crate::session::{EditorCommand, EditorSession, ExpectedRevisionCommand, Revision};

pub(super) fn fixture() -> (ProjectSnapshot, AtlasEvidence, Intent) {
    let mut session = EditorSession::new(ProjectSnapshot::new_authored(StableId("magic".into())));
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::CreateMap {
                level_type: LevelType::Land,
            },
        })
        .unwrap();
    let mut snapshot = session.snapshot().clone();
    snapshot.world.maps[0].tiles.fill(156);
    let atlas = AtlasEvidence {
        tileset_id: StableId("classic.landlook.0".into()),
        asset_identity: StableId("stock:plains".into()),
        blob: BlobId("a".repeat(64)),
        scenario_owned: false,
        tile_fingerprints: crate::terrain_joining::layouts()[0]
            .tile_fingerprints
            .clone(),
    };
    let intent = Intent {
        tileset_id: atlas.tileset_id.clone(),
        atlas_blob: Some(atlas.blob.clone()),
        mapping_revision: 0,
        tolerance: ShapeTolerance::Literal,
        strokes: vec![],
    };
    (snapshot, atlas, intent)
}

pub(super) fn stroke(tile: u16, coordinates: impl Iterator<Item = (u8, u8)>) -> Stroke {
    Stroke {
        sampled_tile: tile,
        cells: coordinates.map(|(x, y)| MapCoordinate { x, y }).collect(),
    }
}

#[test]
fn accumulated_water_strokes_join_and_commit_as_one_history_entry() {
    let (snapshot, atlas, mut intent) = fixture();
    intent.strokes.push(stroke(
        60,
        (20..26).flat_map(|y| (20..26).map(move |x| (x, y))),
    ));
    intent.strokes.push(stroke(39, (26..34).map(|x| (x, 23))));
    let identity = StableId("land:0".into());
    let plan = preview(&snapshot, &identity, &intent, &atlas, &mut || false).unwrap();
    assert!(plan.unresolved.is_empty(), "{:?}", plan.unresolved_reason);
    assert!(
        plan.paint
            .painted_cells
            .iter()
            .any(|cell| (21..=24).contains(&cell.tile))
    );
    assert_eq!(
        plan.paint,
        preview(&snapshot, &identity, &intent, &atlas, &mut || false)
            .unwrap()
            .paint
    );
    let mut session = EditorSession::new(snapshot.clone());
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::ApplyMagicBrush(Apply {
                identity,
                intent,
                atlas,
            }),
        })
        .unwrap();
    assert_eq!(session.undo_history().len(), 1);
    for cell in plan.paint.painted_cells {
        assert_eq!(
            session.snapshot().world.maps[0].tiles[usize::from(cell.y) * 90 + usize::from(cell.x)],
            cell.tile
        );
    }
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(1),
            command: EditorCommand::Undo,
        })
        .unwrap();
    assert_eq!(session.snapshot(), &snapshot);
}

#[test]
fn later_exact_tiles_replace_artwork_while_markers_survive() {
    let (mut snapshot, atlas, mut intent) = fixture();
    snapshot.world.maps[0].tiles[20 * 90 + 20] = 0x6000 + 1156;
    snapshot.world.maps[0].tiles[20 * 90 + 21] = -91;
    intent.strokes.push(stroke(151, (20..24).map(|x| (x, 20))));
    intent
        .strokes
        .push(stroke(155, [(20, 20), (22, 20)].into_iter()));
    let plan = preview(
        &snapshot,
        &StableId("land:0".into()),
        &intent,
        &atlas,
        &mut || false,
    )
    .unwrap();
    assert!(plan.unresolved.is_empty());
    assert!(plan.paint.protected_cells.is_empty());
    assert_eq!(
        plan.paint
            .painted_cells
            .iter()
            .find(|cell| cell.x == 21)
            .unwrap()
            .tile,
        151
    );
    assert_eq!(
        plan.paint
            .painted_cells
            .iter()
            .find(|c| c.x == 20)
            .unwrap()
            .tile,
        0x6000 + 1155
    );
    assert_eq!(
        plan.paint
            .painted_cells
            .iter()
            .find(|c| c.x == 22)
            .unwrap()
            .tile,
        155
    );
    assert_eq!(
        plan.paint
            .painted_cells
            .iter()
            .find(|c| c.x == 23)
            .unwrap()
            .tile,
        151
    );
}

#[test]
fn approximate_staged_boundaries_warn_and_commit_the_complete_preview() {
    let (snapshot, atlas, mut intent) = fixture();
    // The joining atlas has no isolated water tile with four dry edges.
    intent.strokes.push(stroke(60, [(20, 20)].into_iter()));
    intent.strokes.push(stroke(151, [(40, 20)].into_iter()));
    let plan = preview(
        &snapshot,
        &StableId("land:0".into()),
        &intent,
        &atlas,
        &mut || false,
    )
    .unwrap();
    assert!(!plan.unresolved.is_empty());
    let mut session = EditorSession::new(snapshot.clone());
    assert!(
        session
            .execute(ExpectedRevisionCommand {
                expected_revision: Revision(0),
                command: EditorCommand::ApplyMagicBrush(Apply {
                    identity: StableId("land:0".into()),
                    intent,
                    atlas
                })
            })
            .is_ok()
    );
    assert_ne!(session.snapshot(), &snapshot);
    assert_eq!(session.undo_history().len(), 1);
    for cell in plan.paint.painted_cells {
        assert_eq!(
            session.snapshot().world.maps[0].tiles[cell.y as usize * 90 + cell.x as usize],
            cell.tile
        );
    }
}

#[test]
fn unmapped_art_uses_exact_tiles_and_stale_or_special_samples_fail() {
    let (snapshot, mut atlas, mut intent) = fixture();
    atlas.tile_fingerprints.fill("b".repeat(64));
    intent
        .strokes
        .push(stroke(38, [(20, 20), (21, 20)].into_iter()));
    let identity = StableId("land:0".into());
    let plan = preview(&snapshot, &identity, &intent, &atlas, &mut || false).unwrap();
    assert!(plan.unresolved.is_empty());
    assert!(plan.paint.painted_cells.iter().all(|cell| cell.tile == 38));
    intent.mapping_revision = 1;
    assert!(preview(&snapshot, &identity, &intent, &atlas, &mut || false).is_err());
    intent.mapping_revision = 0;
    intent.strokes[0].sampled_tile = 999;
    assert!(preview(&snapshot, &identity, &intent, &atlas, &mut || false).is_err());
}

use super::{
    tests::{fixture, stroke},
    *,
};
use crate::session::{EditorCommand, EditorSession, ExpectedRevisionCommand, Revision};

fn setup(look: i8) -> (ProjectSnapshot, AtlasEvidence, Intent) {
    let (mut snapshot, mut atlas, mut intent) = fixture();
    atlas.tile_fingerprints = crate::terrain_joining::layouts()
        .iter()
        .find(|layout| layout.landlook == look)
        .unwrap()
        .tile_fingerprints
        .clone();
    atlas.tileset_id = StableId(format!("classic.landlook.{look}"));
    intent.tileset_id = atlas.tileset_id.clone();
    let runtime = snapshot.world.maps[0].runtime.as_mut().unwrap();
    runtime.tileset_id = atlas.tileset_id.clone();
    runtime.landlook = Some(look);
    (snapshot, atlas, intent)
}

fn draw(snapshot: &ProjectSnapshot, atlas: &AtlasEvidence, intent: &Intent) -> Vec<i16> {
    let mut tiles = snapshot.world.maps[0].tiles.clone();
    let plan = preview(
        snapshot,
        &StableId("land:0".into()),
        intent,
        atlas,
        &mut || false,
    )
    .unwrap();
    assert!(plan.unresolved.is_empty());
    for cell in plan.paint.painted_cells {
        tiles[cell.y as usize * 90 + cell.x as usize] = cell.tile;
    }
    tiles
}

#[test]
fn road_and_wall_turns_endpoints_and_junctions_follow_all_four_directions() {
    for (look, sample, tiles) in [
        (
            0,
            94,
            [
                94, 95, 98, 94, 94, 103, 96, 95, 99, 95, 101, 104, 97, 102, 100,
            ],
        ),
        (
            0,
            132,
            [
                146, 143, 141, 144, 133, 139, 137, 145, 140, 132, 136, 142, 138, 135, 134,
            ],
        ),
        (
            4,
            1,
            [20, 21, 13, 22, 1, 15, 11, 23, 14, 2, 17, 16, 12, 18, 19],
        ),
    ] {
        let (snapshot, atlas, mut intent) = setup(look);
        for ports in 1..=15 {
            let mut cells = vec![(20, 20)];
            for (port, cell) in [(1, (20, 19)), (2, (21, 20)), (4, (20, 21)), (8, (19, 20))] {
                if ports & port != 0 {
                    cells.push(cell);
                }
            }
            intent.strokes = vec![stroke(sample, cells.into_iter())];
            let result = draw(&snapshot, &atlas, &intent);
            assert_eq!(
                result[20 * 90 + 20],
                tiles[ports - 1],
                "look {look}, ports {ports}"
            );
            assert_eq!(result, draw(&snapshot, &atlas, &intent));
        }
    }
}

#[test]
fn extension_retiles_existing_endpoint_preserves_markers_and_later_exact_strokes() {
    let (mut snapshot, atlas, mut intent) = setup(0);
    snapshot.world.maps[0].tiles[20 * 90 + 18] = 143;
    snapshot.world.maps[0].tiles[20 * 90 + 19] = 1145;
    intent.strokes = vec![stroke(132, [(20, 20), (21, 20), (21, 21)].into_iter())];
    let result = draw(&snapshot, &atlas, &intent);
    assert_eq!(result[20 * 90 + 19], 1132);
    assert_eq!(result[20 * 90 + 21], 142);
    assert_eq!(result[21 * 90 + 21], 146);
    intent.strokes.push(stroke(151, [(21, 20)].into_iter()));
    assert_eq!(draw(&snapshot, &atlas, &intent)[20 * 90 + 21], 151);
    let identity = StableId("land:0".into());
    let expected = draw(&snapshot, &atlas, &intent);
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
    assert_eq!(session.snapshot().world.maps[0].tiles, expected);
    assert_eq!(session.undo_history().len(), 1);
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(1),
            command: EditorCommand::Undo,
        })
        .unwrap();
    assert_eq!(session.snapshot(), &snapshot);
}

#[test]
fn line_families_require_matching_artwork_and_leave_special_pieces_exact() {
    let (snapshot, mut atlas, _) = setup(0);
    assert_eq!(behavior(&snapshot, &atlas, Some(0), 132), Some("road"));
    for tile in [130, 131, 147, 184, 185] {
        assert_eq!(behavior(&snapshot, &atlas, Some(0), tile), None);
    }
    atlas.tile_fingerprints[149] = "changed unrelated prop".into();
    assert_eq!(behavior(&snapshot, &atlas, Some(0), 132), Some("road"));
    atlas.tile_fingerprints[140] = "changed corner".into();
    assert_eq!(behavior(&snapshot, &atlas, Some(0), 132), None);
    let (snapshot, atlas, _) = setup(4);
    for tile in [7, 8, 9, 10, 24, 40, 74, 75, 76, 77] {
        assert_eq!(behavior(&snapshot, &atlas, Some(4), tile), None);
    }
}

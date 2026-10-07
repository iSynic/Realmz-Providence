use super::*;
use crate::{
    model::{ActionPoint, MapRuntimeMetadata},
    session::{EditorCommand, EditorSession, ExpectedRevisionCommand, Revision},
};

fn fixture() -> ProjectSnapshot {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("terrain-paint".into()));
    snapshot.world.maps.push(MapLevel {
        identity: StableId("land:0".into()),
        level_type: LevelType::Land,
        native_index: 0,
        name: "Paint fixture".into(),
        tiles: vec![1; CLASSIC_MAP_SIZE * CLASSIC_MAP_SIZE],
        runtime: Some(MapRuntimeMetadata {
            source: "Data RD".into(),
            source_blob: None,
            dark: false,
            uses_los: false,
            landlook: Some(0),
            base_scale: None,
            tileset_id: StableId("landlook:0".into()),
            base_tile: Some(1),
            random_rectangles: Vec::new(),
        }),
    });
    snapshot
}

fn brush(cells: Vec<LandMapCellPaint>) -> LandTerrainPaint {
    LandTerrainPaint {
        tileset_id: StableId("landlook:0".into()),
        cells,
    }
}

#[test]
fn terrain_payload_replacement_preserves_every_marker_band_and_metadata_combination() {
    let identity = StableId("land:0".into());
    let mut snapshot = fixture();
    for metadata in [0, 0x2000, 0x4000, 0x6000] {
        for band in 0..=3 {
            for source in 0..=200 {
                snapshot.world.maps[0].tiles[0] = metadata | (band * 1000 + source);
                for replacement in [1, 90, 156, 200] {
                    let preview = preview_land_terrain_paint(
                        &snapshot,
                        &identity,
                        &brush(vec![LandMapCellPaint {
                            x: 0,
                            y: 0,
                            tile: replacement,
                        }]),
                    )
                    .unwrap();
                    assert!(preview.protected_cells.is_empty());
                    if source == replacement {
                        assert!(preview.painted_cells.is_empty());
                        assert_eq!(preview.unchanged_cells, 1);
                    } else {
                        assert_eq!(
                            preview.painted_cells[0].tile as u16,
                            (metadata | (band * 1000 + replacement)) as u16
                        );
                    }
                }
            }
        }
    }
}

#[test]
fn explicit_paint_replaces_special_and_unknown_payloads_with_exact_history() {
    let mut snapshot = fixture();
    for (index, raw) in [-1, -1090, -3090, 201, 1999, 3999, 4001, i16::MIN]
        .into_iter()
        .enumerate()
    {
        snapshot.world.maps[0].tiles[index] = raw;
        assert_eq!(terrain_tile(raw), None);
    }
    let paint = brush(
        (0..8)
            .map(|x| LandMapCellPaint { x, y: 0, tile: 5 })
            .collect(),
    );
    let preview =
        preview_land_terrain_paint(&snapshot, &StableId("land:0".into()), &paint).unwrap();
    assert!(preview.protected_cells.is_empty());
    assert_eq!(preview.painted_cells.len(), 8);
    let mut session = EditorSession::new(snapshot.clone());
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::PaintLandTerrain {
                identity: StableId("land:0".into()),
                paint,
            },
        })
        .unwrap();
    assert_eq!(&session.snapshot().world.maps[0].tiles[..8], &[5; 8]);
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(1),
            command: EditorCommand::Undo,
        })
        .unwrap();
    assert_eq!(session.snapshot(), &snapshot);
    assert_eq!(session.revision(), Revision(2));
    assert!(session.can_redo());
}

#[test]
fn terrain_preview_and_commit_match_and_preserve_action_records_with_one_undo_redo() {
    let snapshot = fixture_with_overlays_and_action_point();
    let paint = brush(
        (0..4)
            .map(|x| LandMapCellPaint { x, y: 0, tile: 90 })
            .collect(),
    );
    let identity = StableId("land:0".into());
    let preview = preview_land_terrain_paint(&snapshot, &identity, &paint).unwrap();
    assert_eq!(preview.painted_cells.len(), 4);
    assert!(preview.protected_cells.is_empty());
    let mut session = EditorSession::new(snapshot.clone());
    let command = EditorCommand::PaintLandTerrain { identity, paint };
    let delta = session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: command.clone(),
        })
        .unwrap();
    assert_eq!(delta.changed_entities, vec![StableId("land:0".into())]);
    assert!(delta.reference_changes.is_empty());
    for cell in preview.painted_cells {
        assert_eq!(
            session.snapshot().world.maps[0].tiles[usize::from(cell.x)],
            cell.tile
        );
    }
    assert_eq!(session.snapshot().world.maps[0].tiles[1], 90);
    assert_eq!(
        session.snapshot().world.action_points,
        snapshot.world.action_points
    );
    let after = session.snapshot().clone();
    assert!(
        session
            .execute(ExpectedRevisionCommand {
                expected_revision: Revision(0),
                command
            })
            .is_err()
    );
    assert_eq!(session.snapshot(), &after);
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(1),
            command: EditorCommand::Undo,
        })
        .unwrap();
    assert_eq!(session.snapshot(), &snapshot);
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(2),
            command: EditorCommand::Redo,
        })
        .unwrap();
    assert_eq!(session.snapshot(), &after);
}

#[test]
fn invalid_terrain_gestures_reject_atomically() {
    let snapshot = fixture();
    let valid = LandMapCellPaint {
        x: 0,
        y: 0,
        tile: 90,
    };
    let mut cases = vec![
        brush(vec![]),
        brush(vec![valid, valid]),
        brush(vec![valid; 8101]),
    ];
    for tile in [0, -1, 201, 1090, 0x6000 | 90] {
        cases.push(brush(vec![
            valid,
            LandMapCellPaint {
                x: 1,
                tile,
                ..valid
            },
        ]));
    }
    cases.push(brush(vec![valid, LandMapCellPaint { x: 90, ..valid }]));
    cases.push(LandTerrainPaint {
        tileset_id: StableId("other-atlas".into()),
        cells: vec![valid],
    });
    for paint in cases {
        let mut session = EditorSession::new(snapshot.clone());
        assert!(
            session
                .execute(ExpectedRevisionCommand {
                    expected_revision: Revision(0),
                    command: EditorCommand::PaintLandTerrain {
                        identity: StableId("land:0".into()),
                        paint
                    },
                })
                .is_err()
        );
        assert_eq!(session.snapshot(), &snapshot);
        assert_eq!(session.revision(), Revision(0));
        assert!(!session.can_undo());
    }
    for malformed in [0, 8099, 8101] {
        let mut snapshot = snapshot.clone();
        snapshot.world.maps[0].tiles.resize(malformed, 1);
        assert!(
            preview_land_terrain_paint(&snapshot, &StableId("land:0".into()), &brush(vec![valid]))
                .is_err()
        );
    }
    let mut snapshot = snapshot;
    snapshot.world.maps[0].level_type = LevelType::Dungeon;
    assert!(
        preview_land_terrain_paint(&snapshot, &StableId("land:0".into()), &brush(vec![valid]))
            .is_err()
    );
}

fn fixture_with_overlays_and_action_point() -> ProjectSnapshot {
    let mut snapshot = fixture();
    snapshot.world.maps[0].tiles[0] = (0x6000 | 1112) as i16;
    snapshot.world.maps[0].tiles[1] = -1112;
    snapshot.world.maps[0].tiles[2] = 3112;
    snapshot.world.action_points.push(ActionPoint {
        identity: StableId("action-point:land:0:0".into()),
        level_type: LevelType::Land,
        level_index: 0,
        record_index: 0,
        classic_door_id: 0,
        coordinate: Some(MapCoordinate { x: 0, y: 0 }),
        post_action_level: 0,
        post_action_x: 0,
        post_action_y: 0,
        chance_percent: 100,
        actions: Vec::new(),
    });
    snapshot
}

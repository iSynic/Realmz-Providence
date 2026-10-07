use super::*;
use crate::session::{EditorCommand, EditorSession, ExpectedRevisionCommand};

fn fixture() -> ProjectSnapshot {
    let mut session = EditorSession::new(ProjectSnapshot::new_authored(StableId("smart".into())));
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: session.revision(),
            command: EditorCommand::CreateMap {
                level_type: LevelType::Land,
            },
        })
        .unwrap();
    session.snapshot().clone()
}
fn intent(preset: &str, cells: &[(u8, u8)]) -> SmartTerrainIntent {
    SmartTerrainIntent {
        tileset_id: StableId("classic.landlook.0".into()),
        preset: preset.into(),
        atlas_blob: None,
        mapping_revision: 0,
        tolerance: ShapeTolerance::Literal,
        mask: cells
            .iter()
            .map(|(x, y)| MapCoordinate { x: *x, y: *y })
            .collect(),
    }
}

#[test]
fn reviewed_mask_replaces_artwork_and_impossible_joins_remain_explicit() {
    let mut snapshot = fixture();
    snapshot.world.maps[0].tiles[0] = -1091;
    let request = intent("water", &[(0, 0), (4, 4), (5, 4), (6, 4)]);
    let before = snapshot.clone();
    let plan = preview(&snapshot, &StableId("land:0".into()), &request).unwrap();
    assert_eq!(snapshot, before);
    assert!(plan.paint.protected_cells.is_empty());
    assert!(plan.unresolved.is_empty());
    assert_eq!(plan.paint.painted_cells.len(), 4);
    let unresolved = preview(
        &snapshot,
        &StableId("land:0".into()),
        &intent("forest", &[(5, 5)]),
    )
    .unwrap();
    assert_eq!(unresolved.unresolved, vec![MapCoordinate { x: 5, y: 5 }]);
    assert_eq!(unresolved.paint.painted_cells.len(), 1);
}

#[test]
fn explicit_fill_closes_existing_rings_but_leaves_open_outlines_alone() {
    let identity = StableId("land:0".into());
    let outline: Vec<_> = (20..=28)
        .flat_map(|y| (20..=28).map(move |x| MapCoordinate { x, y }))
        .filter(|cell| cell.x == 20 || cell.x == 28 || cell.y == 20 || cell.y == 28)
        .collect();
    let filled = reshape_mask(&identity, &outline, "fill").unwrap();
    assert_eq!(filled.len(), 81);
    assert!(filled.contains(&MapCoordinate { x: 24, y: 24 }));
    assert_eq!(reshape_mask(&identity, &filled, "fill").unwrap(), filled);
    let open: Vec<_> = outline
        .into_iter()
        .filter(|cell| *cell != MapCoordinate { x: 24, y: 20 })
        .collect();
    assert_eq!(reshape_mask(&identity, &open, "fill").unwrap(), open);
    assert!(reshape_mask(&identity, &[MapCoordinate { x: 90, y: 0 }], "fill").is_err());
}

#[test]
fn morphology_uses_bounded_orthogonal_neighbors_and_does_not_write() {
    let identity = StableId("land:0".into());
    let original = vec![MapCoordinate { x: 0, y: 0 }];
    let grown = reshape_mask(&identity, &original, "grow").unwrap();
    assert_eq!(
        grown,
        vec![
            MapCoordinate { x: 0, y: 0 },
            MapCoordinate { x: 1, y: 0 },
            MapCoordinate { x: 0, y: 1 }
        ]
    );
    assert!(
        reshape_mask(&identity, &grown, "shrink")
            .unwrap()
            .is_empty()
    );
    assert!(reshape_mask(&identity, &grown, "clear").unwrap().is_empty());
    assert!(reshape_mask(&identity, &[MapCoordinate { x: 90, y: 0 }], "grow").is_err());
}

#[test]
fn profile_availability_never_infers_custom_or_unreviewed_castle_artwork() {
    let mut snapshot = fixture();
    let identity = StableId("land:0".into());
    assert!(availability(&snapshot, &identity).is_ok());
    for look in [4, 6, 7, 8] {
        snapshot.world.maps[0].runtime.as_mut().unwrap().landlook = Some(look);
        assert!(availability(&snapshot, &identity).is_err());
    }
}

#[test]
fn topology_and_signed_seed_match_source_oracles() {
    assert_eq!(topology::role(12, true), "northEast");
    assert_eq!(topology::role(239, true), "notchNorthEast");
    assert_eq!(topology::role(15, false), "center");
    assert_eq!(topology::broad_water(76, "northEast"), Some(26));
    assert!(topology::narrow(7));
    assert!(!topology::narrow(19));
    assert_eq!(
        pick(
            &[33, 34, 35],
            &StableId("land:0".into()),
            "water",
            MapCoordinate { x: 3, y: 4 },
            "curated-mask:north:110"
        ),
        34
    );
}

#[test]
fn approximate_draft_commits_all_previewed_cells_as_one_history_entry() {
    let snapshot = fixture();
    let identity = StableId("land:0".into());
    let intent = intent(
        "forest",
        &[(10, 10), (11, 10), (10, 11), (11, 11), (20, 20)],
    );
    let plan = preview(&snapshot, &identity, &intent).unwrap();
    assert!(!plan.paint.painted_cells.is_empty());
    assert!(!plan.unresolved.is_empty());
    let mut session = EditorSession::new(snapshot.clone());
    let revision = session.revision();
    assert!(
        session
            .execute(ExpectedRevisionCommand {
                expected_revision: revision,
                command: EditorCommand::ApplySmartTerrain(Apply {
                    identity,
                    intent,
                    atlas: None
                }),
            })
            .is_ok()
    );
    assert_eq!(session.revision().0, revision.0 + 1);
    assert_eq!(session.undo_history().len(), 1);
    for cell in plan.paint.painted_cells {
        assert_eq!(
            session.snapshot().world.maps[0].tiles[cell.y as usize * 90 + cell.x as usize],
            cell.tile
        );
    }
}

#[test]
fn decorative_and_special_artwork_can_be_overwritten_inside_the_selection() {
    let mut snapshot = fixture();
    let tiles = [33, 57, 151, 187, 175, -1091];
    for (offset, tile) in tiles.into_iter().enumerate() {
        snapshot.world.maps[0].tiles[10 * 90 + 10 + offset] = tile;
    }
    let cells: Vec<_> = (10..16).map(|x| (x, 10)).collect();
    let plan = preview(
        &snapshot,
        &StableId("land:0".into()),
        &intent("water", &cells),
    )
    .unwrap();
    assert!(plan.paint.protected_cells.is_empty());
    assert_eq!(plan.paint.painted_cells.len(), tiles.len());
    assert!(plan.unresolved.is_empty());
}

#[test]
fn extending_existing_water_retiles_its_shore_and_preserves_markers_atomically() {
    let mut snapshot = fixture();
    let marker = 12 * 90 + 15;
    snapshot.world.maps[0].tiles[marker] = 0x6000 | 1156;
    let identity = StableId("land:0".into());
    let lake: Vec<_> = (10..16)
        .flat_map(|y| (10..16).map(move |x| (x, y)))
        .collect();
    let mut session = EditorSession::new(snapshot);
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: session.revision(),
            command: EditorCommand::ApplySmartTerrain(Apply {
                identity: identity.clone(),
                intent: intent("water", &lake),
                atlas: None,
            }),
        })
        .unwrap();
    let before = session.snapshot().clone();
    let extension: Vec<_> = (11..15)
        .flat_map(|y| (16..20).map(move |x| (x, y)))
        .collect();
    let request = intent("water", &extension);
    let plan = preview(session.snapshot(), &identity, &request).unwrap();
    assert!(plan.unresolved.is_empty(), "{:?}", plan.unresolved_reason);
    assert!(!plan.retiled_neighbors.is_empty());
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: session.revision(),
            command: EditorCommand::ApplySmartTerrain(Apply {
                identity,
                intent: request,
                atlas: None,
            }),
        })
        .unwrap();
    let tiles = &session.snapshot().world.maps[0].tiles;
    let left = map_paint::terrain_tile(tiles[marker]).unwrap() as i16;
    let right = map_paint::terrain_tile(tiles[marker + 1]).unwrap() as i16;
    assert_ne!(water_geometry::fixed_edge(left, 1), 0);
    assert_eq!(
        water_geometry::fixed_edge(left, 1),
        water_geometry::fixed_edge(right, 3)
    );
    assert_eq!(tiles[marker] - left, (0x6000 | 1000));
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: session.revision(),
            command: EditorCommand::Undo,
        })
        .unwrap();
    assert_eq!(session.snapshot(), &before);
}

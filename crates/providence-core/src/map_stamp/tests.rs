use super::*;
use crate::session::{EditorCommand, EditorSession, ExpectedRevisionCommand, Revision};

#[test]
fn custom_atlas_stamp_compatibility_uses_only_the_recipe_tiles() {
    let (session, _) = fixture(LevelType::Land);
    let mut snapshot = session.snapshot().clone();
    let map = &mut snapshot.world.maps[0];
    map.runtime.as_mut().unwrap().landlook = Some(7);
    let layout = crate::terrain_joining::layouts()
        .iter()
        .find(|layout| layout.landlook == 0)
        .unwrap();
    let mut atlas = crate::terrain_joining::AtlasEvidence {
        tileset_id: map.runtime.as_ref().unwrap().tileset_id.clone(),
        asset_identity: StableId("scenario:custom2".into()),
        blob: crate::model::BlobId("a".repeat(64)),
        scenario_owned: true,
        tile_fingerprints: layout.tile_fingerprints.clone(),
    };
    atlas.tile_fingerprints[155 - 1] = "b".repeat(64);
    let tree = StableId("preset:tree-pair-151-152".into());
    let entries = crate::paint_resources::builtins::catalog_mapped(
        &snapshot,
        &snapshot.world.maps[0],
        Some(&atlas),
    );
    assert!(
        entries
            .iter()
            .find(|entry| entry.resource.identity == tree)
            .unwrap()
            .availability_reason
            .is_none()
    );
    atlas.tile_fingerprints[151 - 1] = "c".repeat(64);
    let entries = crate::paint_resources::builtins::catalog_mapped(
        &snapshot,
        &snapshot.world.maps[0],
        Some(&atlas),
    );
    assert!(
        entries
            .iter()
            .find(|entry| entry.resource.identity == tree)
            .unwrap()
            .availability_reason
            .is_some()
    );
}

fn fixture(kind: LevelType) -> (EditorSession, PaintResource) {
    let mut session = EditorSession::new(ProjectSnapshot::new_authored(StableId("stamps".into())));
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::CreateMap { level_type: kind },
        })
        .unwrap();
    let map = &session.snapshot().world.maps[0];
    let resource = PaintResource {
        identity: StableId("stamp:paths".into()),
        name: "Paths".into(),
        collection: "Town".into(),
        kind: PaintResourceKind::Stamp,
        level_type: kind,
        tileset_id: map.runtime.as_ref().unwrap().tileset_id.clone(),
        width: 1,
        height: 1,
        cells: vec![PaintResourceCell {
            x: 0,
            y: 0,
            tile: 5,
        }],
        favorite: false,
    };
    (session, resource)
}

#[test]
fn special_recipes_replace_occupied_cells_and_refresh_references() {
    let (session, mut resource) = fixture(LevelType::Land);
    let mut before = session.snapshot().clone();
    before.world.maps[0].tiles[..5].copy_from_slice(&[7, 0x6000 + 1007, 3007, -92, 0]);
    resource.width = 5;
    resource.cells = (0..5)
        .map(|x| PaintResourceCell { x, y: 0, tile: -91 })
        .collect();
    let identity = before.world.maps[0].identity.clone();
    let placement = StampPlacement {
        resource,
        origin: MapCoordinate { x: 0, y: 0 },
    };
    let plan = preview(&before, &identity, &placement).unwrap();
    assert_eq!(plan.painted_cells.len(), 5);
    assert!(plan.protected_cells.is_empty());
    let mut session = EditorSession::new(before.clone());
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::ApplyMapStamp {
                identity,
                placement,
            },
        })
        .unwrap();
    assert_eq!(session.snapshot().world.maps[0].tiles[..5], [-91; 5]);
    assert!(
        session
            .references()
            .iter()
            .any(|reference| reference.target_kind
                == crate::references::TargetKind::SpecialLandTile
                && reference.target_id == "-91")
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
fn sparse_capture_strips_source_ownership_and_preserves_zero() {
    let (session, resource) = fixture(LevelType::Land);
    let mut snapshot = session.snapshot().clone();
    snapshot.world.maps[0].tiles[0] = 0x6000 + 1007;
    snapshot.world.maps[0].tiles[2] = -10;
    snapshot.world.maps[0].tiles[91] = 0;
    let selection = [
        MapCoordinate { x: 0, y: 0 },
        MapCoordinate { x: 2, y: 0 },
        MapCoordinate { x: 1, y: 1 },
    ];
    let result = capture(
        &snapshot,
        &snapshot.world.maps[0].identity,
        &selection,
        resource.clone(),
    )
    .unwrap();
    assert_eq!(result.omitted_cells, 1);
    assert_eq!((result.resource.width, result.resource.height), (3, 2));
    assert_eq!(
        result.resource.cells,
        [
            PaintResourceCell {
                x: 0,
                y: 0,
                tile: 7
            },
            PaintResourceCell {
                x: 1,
                y: 1,
                tile: 0
            }
        ]
    );
    assert!(
        capture(
            &snapshot,
            &snapshot.world.maps[0].identity,
            &[MapCoordinate { x: 0, y: 0 }, MapCoordinate { x: 32, y: 0 }],
            resource
        )
        .is_err()
    );
}

#[test]
fn reviewed_stamp_preserves_destination_markers_sparse_holes_and_atomic_history() {
    let (session, mut resource) = fixture(LevelType::Land);
    let mut before = session.snapshot().clone();
    before.world.maps[0].tiles[0] = 0x6000 + 3001;
    before.world.maps[0].tiles[1] = -40;
    resource.width = 3;
    resource.cells.push(PaintResourceCell {
        x: 1,
        y: 0,
        tile: 0,
    });
    let placement = StampPlacement {
        resource,
        origin: MapCoordinate { x: 0, y: 0 },
    };
    let identity = before.world.maps[0].identity.clone();
    let plan = preview(&before, &identity, &placement).unwrap();
    assert_eq!(plan.managed_cells, 1);
    assert!(plan.protected_cells.is_empty());
    assert_eq!(plan.painted_cells[0].tile, 0x6000 + 3005);
    let mut session = EditorSession::new(before.clone());
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::ApplyMapStamp {
                identity,
                placement,
            },
        })
        .unwrap();
    assert_eq!(session.undo_history().len(), 1);
    assert_eq!(session.snapshot().world.maps[0].tiles[1], 0);
    assert_eq!(
        session.snapshot().world.maps[0].tiles[2],
        before.world.maps[0].tiles[2]
    );
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
    assert_eq!(session.snapshot().world.maps[0].tiles[0], 0x6000 + 3005);
}

#[test]
fn dungeon_capture_and_placement_preserve_managed_bits_and_reject_stale_atlas() {
    let (session, resource) = fixture(LevelType::Dungeon);
    let mut snapshot = session.snapshot().clone();
    snapshot.world.maps[0].tiles[0] = 0x9161u16 as i16;
    let identity = snapshot.world.maps[0].identity.clone();
    let captured = capture(
        &snapshot,
        &identity,
        &[MapCoordinate { x: 0, y: 0 }],
        resource,
    )
    .unwrap();
    assert_eq!(captured.resource.cells[0].tile, 0x0101);
    snapshot.world.maps[0].tiles[1] = 0x9062u16 as i16;
    let mut placement = StampPlacement {
        resource: captured.resource,
        origin: MapCoordinate { x: 1, y: 0 },
    };
    let plan = preview(&snapshot, &identity, &placement).unwrap();
    assert_eq!(plan.painted_cells[0].tile as u16, 0x9161);
    placement.origin.x = 90;
    assert!(preview(&snapshot, &identity, &placement).is_err());
    placement.origin.x = 1;
    placement.resource.tileset_id = StableId("other-atlas".into());
    assert!(preview(&snapshot, &identity, &placement).is_err());
}

#[test]
fn pinned_presets_keep_atlas_constraints_and_exact_signed_recipes() {
    let (session, _) = fixture(LevelType::Land);
    let map = &session.snapshot().world.maps[0];
    let catalog = crate::paint_resources::builtins::catalog(map);
    assert_eq!(catalog.len(), 29);
    assert_eq!(
        catalog
            .iter()
            .filter(|entry| entry.availability_reason.is_none())
            .count(),
        14
    );
    let tree = crate::paint_resources::builtins::resolve(
        map,
        &StableId("preset:tree-pair-151-152".into()),
    )
    .unwrap();
    let placement = StampPlacement {
        resource: tree,
        origin: MapCoordinate { x: 4, y: 8 },
    };
    let plan = preview(session.snapshot(), &map.identity, &placement).unwrap();
    assert_eq!(
        plan.painted_cells
            .iter()
            .map(|cell| (cell.x, cell.y, cell.tile))
            .collect::<Vec<_>>(),
        [(4, 8, 151), (4, 9, 152)]
    );
    assert!(
        crate::paint_resources::builtins::resolve(
            map,
            &StableId("preset:castle-bed-156-157".into())
        )
        .is_err()
    );
    let house = crate::paint_resources::builtins::resolve(
        map,
        &StableId("preset:structure-house-75-72".into()),
    )
    .unwrap();
    assert_eq!(house.cells[0].tile, -75);
    assert!(crate::special_land_artwork::resolve(session.snapshot(), None, -75).is_err());
    let mut local = crate::paint_resources::PaintResources::default();
    local.entries.push(placement.resource);
    assert!(local.validate().is_err());
}

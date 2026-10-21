use super::*;
use crate::session::{EditorCommand, EditorSession, ExpectedRevisionCommand};

pub(crate) fn fixture() -> (ProjectSnapshot, AtlasEvidence, Intent) {
    let mut session =
        EditorSession::new(ProjectSnapshot::new_authored(StableId("generation".into())));
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: session.revision(),
            command: EditorCommand::CreateMap {
                level_type: LevelType::Land,
            },
        })
        .unwrap();
    let mut snapshot = session.snapshot().clone();
    snapshot.world.maps[0].tiles.fill(156);
    snapshot.world.maps[0].runtime.as_mut().unwrap().base_tile = Some(156);
    let atlas = AtlasEvidence {
        tileset_id: StableId("classic.landlook.0".into()),
        asset_identity: StableId("stock-plains".into()),
        blob: BlobId(format!("sha256:{}", "a".repeat(64))),
        scenario_owned: false,
        tile_fingerprints: crate::terrain_joining::layouts()
            .iter()
            .find(|layout| layout.landlook == 0)
            .unwrap()
            .tile_fingerprints
            .clone(),
    };
    let intent = Intent {
        tileset_id: atlas.tileset_id.clone(),
        atlas_blob: atlas.blob.clone(),
        mapping_revision: 0,
        family: "water".into(),
        density: Density::Dense,
        seed: 47,
        mask: (10..20)
            .flat_map(|y| (10..20).map(move |x| MapCoordinate { x, y }))
            .collect(),
        locks: vec![],
        connections: vec![],
    };
    (snapshot, atlas, intent)
}

#[test]
fn seeded_preview_is_pure_exact_and_repeatable_for_reviewed_families() {
    let (snapshot, atlas, mut intent) = fixture();
    let before = snapshot.clone();
    for family in ["water", "forest", "mountains"] {
        intent.family = family.into();
        let plan = preview(
            &snapshot,
            &StableId("land:0".into()),
            &intent,
            &atlas,
            &mut || false,
        )
        .unwrap();
        assert_eq!(plan.outcome, Outcome::Success, "{family}: {}", plan.reason);
        assert!(!plan.painted_cells.is_empty(), "{family}");
        assert_eq!(
            plan,
            preview(
                &snapshot,
                &StableId("land:0".into()),
                &intent,
                &atlas,
                &mut || false
            )
            .unwrap()
        );
        assert_eq!(snapshot, before);
        let prepared =
            domains::prepare(&snapshot, &StableId("land:0".into()), &intent, &atlas).unwrap();
        let mut tiles = snapshot.world.maps[0].tiles.clone();
        for cell in &plan.painted_cells {
            tiles[cell.y as usize * 90 + cell.x as usize] = cell.tile;
        }
        let edges = |i: usize| {
            prepared
                .pieces
                .iter()
                .find(|(tile, _)| *tile == tiles[i])
                .unwrap()
                .1
        };
        for cell in &intent.mask {
            let i = map_connectivity::index(*cell);
            assert_eq!(edges(i)[1], edges(i + 1)[3]);
            assert_eq!(edges(i)[2], edges(i + 90)[0]);
        }
    }
}

#[test]
fn locks_markers_specials_unclassified_and_neighbors_stay_byte_exact() {
    let (mut snapshot, atlas, mut intent) = fixture();
    for (x, tile) in [
        (10, -1091),
        (11, 1156),
        (12, 2156),
        (13, 3156),
        (14, 94),
        (15, 156 | 0x6000),
    ] {
        snapshot.world.maps[0].tiles[10 * 90 + x] = tile;
    }
    intent.locks.push(MapCoordinate { x: 16, y: 10 });
    let before = snapshot.world.maps[0].tiles.clone();
    let plan = preview(
        &snapshot,
        &StableId("land:0".into()),
        &intent,
        &atlas,
        &mut || false,
    )
    .unwrap();
    assert_eq!(plan.outcome, Outcome::Success);
    assert_eq!(plan.protected_cells.len(), 7);
    for cell in plan.painted_cells {
        assert!(intent.mask.contains(&MapCoordinate {
            x: cell.x,
            y: cell.y
        }));
        assert!((cell.y != 10) || cell.x > 16);
    }
    assert_eq!(snapshot.world.maps[0].tiles, before);
}

#[test]
fn cancellation_and_artwork_changes_cannot_produce_applicable_cells() {
    let (snapshot, mut atlas, intent) = fixture();
    let plan = preview(
        &snapshot,
        &StableId("land:0".into()),
        &intent,
        &atlas,
        &mut || true,
    )
    .unwrap();
    assert_eq!(plan.outcome, Outcome::Canceled);
    assert!(plan.painted_cells.is_empty());
    atlas.tile_fingerprints[0] = "changed".into();
    assert!(
        preview(
            &snapshot,
            &StableId("land:0".into()),
            &intent,
            &atlas,
            &mut || false
        )
        .is_err()
    );
}

#[test]
fn reviewed_application_is_one_undoable_transaction_and_rejects_wrong_hash() {
    let (snapshot, atlas, intent) = fixture();
    let identity = StableId("land:0".into());
    let plan = preview(&snapshot, &identity, &intent, &atlas, &mut || false).unwrap();
    let mut session = EditorSession::new(snapshot.clone());
    let mut apply = Apply {
        identity,
        intent,
        atlas,
        review_hash: "wrong".into(),
    };
    assert!(reviewed_paint(&snapshot, &apply).is_err());
    assert_eq!(session.snapshot(), &snapshot);
    apply.review_hash = plan.review_hash;
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: session.revision(),
            command: EditorCommand::PaintLandTerrain {
                identity: apply.identity.clone(),
                paint: reviewed_paint(&snapshot, &apply).unwrap(),
            },
        })
        .unwrap();
    assert_eq!(session.revision().0, 1);
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: session.revision(),
            command: EditorCommand::Undo,
        })
        .unwrap();
    assert_eq!(session.snapshot(), &snapshot);
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: session.revision(),
            command: EditorCommand::Redo,
        })
        .unwrap();
    assert_ne!(session.snapshot(), &snapshot);
}

#[test]
fn impossible_fixed_boundary_returns_no_partial_map() {
    let (mut snapshot, atlas, mut intent) = fixture();
    intent.mask = vec![MapCoordinate { x: 10, y: 10 }];
    // Full water to the north, ground on all three other sides has no one-cell exact piece.
    snapshot.world.maps[0].tiles[9 * 90 + 10] = 60;
    let plan = preview(
        &snapshot,
        &StableId("land:0".into()),
        &intent,
        &atlas,
        &mut || false,
    )
    .unwrap();
    assert_eq!(plan.outcome, Outcome::Contradiction);
    assert!(plan.painted_cells.is_empty());
}

#[test]
fn an_unsatisfied_required_route_exhausts_search_without_an_applicable_partial_map() {
    let (mut snapshot, atlas, mut intent) = fixture();
    snapshot.world.maps[0].tiles[10 * 90 + 10] = 94;
    intent.connections = vec![map_connectivity::Connection {
        from: MapCoordinate { x: 10, y: 10 },
        to: MapCoordinate { x: 20, y: 20 },
    }];
    let before = snapshot.clone();
    let plan = preview(
        &snapshot,
        &StableId("land:0".into()),
        &intent,
        &atlas,
        &mut || false,
    )
    .unwrap();
    assert_eq!(plan.outcome, Outcome::BudgetExhausted);
    assert!(plan.painted_cells.is_empty());
    assert_eq!(snapshot, before);
}

#[test]
fn full_map_requests_complete_within_the_deterministic_work_budget() {
    let (snapshot, atlas, mut intent) = fixture();
    intent.mask = (0..90)
        .flat_map(|y| (0..90).map(move |x| MapCoordinate { x, y }))
        .collect();
    for family in ["forest", "mountains", "water"] {
        intent.family = family.into();
        let started = std::time::Instant::now();
        let plan = preview(
            &snapshot,
            &StableId("land:0".into()),
            &intent,
            &atlas,
            &mut || false,
        )
        .unwrap();
        println!(
            "{family}: {:?}, {} cells, {} decisions, {} work, {:?}",
            plan.outcome,
            plan.painted_cells.len(),
            plan.decisions,
            plan.work,
            started.elapsed()
        );
        assert_eq!(plan.outcome, Outcome::Success, "{family}: {}", plan.reason);
        assert!(!plan.painted_cells.is_empty());
    }
}

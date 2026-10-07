use super::*;
use crate::session::{EditorCommand, EditorSession, ExpectedRevisionCommand, Revision};

fn fixture() -> ProjectSnapshot {
    let mut session =
        EditorSession::new(ProjectSnapshot::new_authored(StableId("selection".into())));
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::CreateMap {
                level_type: LevelType::Dungeon,
            },
        })
        .unwrap();
    session.snapshot().clone()
}

fn request(shape: SelectionShape, start: (u8, u8), end: (u8, u8)) -> MapSelectionRequest {
    MapSelectionRequest {
        shape,
        start: MapCoordinate {
            x: start.0,
            y: start.1,
        },
        end: MapCoordinate { x: end.0, y: end.1 },
        filled: true,
        operation: SelectionOperation::Replace,
        current: Vec::new(),
        path: Vec::new(),
    }
}

fn selected(snapshot: &ProjectSnapshot, request: &MapSelectionRequest) -> Vec<MapCoordinate> {
    preview_map_selection(snapshot, &StableId("dungeon:0".into()), request).unwrap()
}

#[test]
fn shape_selection_preserves_donor_geometry_and_row_order_without_mutations() {
    let snapshot = fixture();
    let before = snapshot.clone();
    let line = selected(&snapshot, &request(SelectionShape::Line, (0, 0), (4, 2)));
    assert_eq!(line.len(), 7);
    for cells in line.windows(2) {
        assert_eq!(
            cells[0].x.abs_diff(cells[1].x) + cells[0].y.abs_diff(cells[1].y),
            1
        );
    }
    let mut rectangle = request(SelectionShape::Rectangle, (1, 1), (3, 3));
    assert_eq!(selected(&snapshot, &rectangle).len(), 9);
    rectangle.filled = false;
    assert_eq!(selected(&snapshot, &rectangle).len(), 8);
    let mut ellipse = request(SelectionShape::Ellipse, (1, 1), (5, 5));
    let filled = selected(&snapshot, &ellipse);
    assert!(filled.contains(&MapCoordinate { x: 3, y: 3 }));
    assert!(filled.iter().all(|cell| filled.contains(&MapCoordinate {
        x: 6 - cell.x,
        y: cell.y
    })));
    ellipse.filled = false;
    assert!(!selected(&snapshot, &ellipse).contains(&MapCoordinate { x: 3, y: 3 }));
    assert_eq!(
        selected(&snapshot, &request(SelectionShape::Ellipse, (2, 1), (2, 5))).len(),
        5
    );
    assert_eq!(snapshot, before);
}

#[test]
fn connected_selection_uses_eight_neighbors_and_names_the_feature_matching_boundary() {
    let mut snapshot = fixture();
    snapshot.world.maps[0].tiles.fill(0);
    snapshot.world.maps[0].tiles[0] = 1;
    snapshot.world.maps[0].tiles[91] = 1;
    snapshot.world.maps[0].tiles[182] = 0x9061_u16 as i16;
    let exact = request(SelectionShape::ConnectedExact, (0, 0), (0, 0));
    assert_eq!(selected(&snapshot, &exact).len(), 2);
    let features = request(SelectionShape::ConnectedFeatures, (0, 0), (0, 0));
    assert_eq!(selected(&snapshot, &features).len(), 3);
    snapshot.world.maps[0].level_type = LevelType::Land;
    assert!(preview_map_selection(&snapshot, &StableId("dungeon:0".into()), &features).is_err());
}

#[test]
fn selection_add_subtract_empty_and_invalid_boundaries_are_explicit() {
    let snapshot = fixture();
    let mut draft = request(SelectionShape::Cell, (2, 2), (2, 2));
    draft.current = vec![MapCoordinate { x: 1, y: 1 }];
    draft.operation = SelectionOperation::Add;
    assert_eq!(selected(&snapshot, &draft).len(), 2);
    draft.operation = SelectionOperation::Subtract;
    draft.start = MapCoordinate { x: 1, y: 1 };
    assert!(selected(&snapshot, &draft).is_empty());
    draft.start.x = 90;
    assert!(preview_map_selection(&snapshot, &StableId("dungeon:0".into()), &draft).is_err());
    draft.start.x = 1;
    draft.current.resize(8101, MapCoordinate { x: 0, y: 0 });
    assert!(preview_map_selection(&snapshot, &StableId("dungeon:0".into()), &draft).is_err());
    assert_eq!(
        selected(
            &snapshot,
            &request(SelectionShape::Rectangle, (0, 0), (89, 89))
        )
        .len(),
        8100
    );
}

#[test]
fn freehand_interpolates_row_order_and_bounds_its_derived_cells() {
    let mut path = request(SelectionShape::Freehand, (1, 1), (4, 4));
    path.path = vec![
        MapCoordinate { x: 1, y: 1 },
        MapCoordinate { x: 4, y: 1 },
        MapCoordinate { x: 4, y: 4 },
    ];
    assert_eq!(
        selected(&fixture(), &path)
            .iter()
            .map(|cell| (cell.x, cell.y))
            .collect::<Vec<_>>(),
        vec![(1, 1), (2, 1), (3, 1), (4, 1), (4, 2), (4, 3), (4, 4)]
    );
    path.path.clear();
    assert!(preview_map_selection(&fixture(), &StableId("dungeon:0".into()), &path).is_err());
}

fn outline(points: &[(u8, u8)]) -> MapSelectionRequest {
    let mut draft = request(SelectionShape::Freehand, points[0], *points.last().unwrap());
    draft.path = points
        .iter()
        .map(|&(x, y)| MapCoordinate { x, y })
        .collect();
    draft
}

#[test]
fn filled_freehand_closes_touching_edges_without_closing_an_open_stroke() {
    let snapshot = fixture();
    let before = snapshot.clone();
    let mut closed = outline(&[(1, 1), (5, 1), (5, 5), (1, 5), (1, 2)]);
    let filled = selected(&snapshot, &closed);
    assert_eq!(filled.len(), 25);
    assert!(filled.contains(&MapCoordinate { x: 3, y: 3 }));
    assert_eq!(filled, selected(&snapshot, &closed));
    closed.filled = false;
    assert_eq!(selected(&snapshot, &closed).len(), 16);
    closed.filled = true;
    closed.path.last_mut().unwrap().y = 3;
    assert_eq!(selected(&snapshot, &closed).len(), 15);
    assert_eq!(snapshot, before);
}

#[test]
fn filled_freehand_handles_concavity_and_the_complete_map_boundary() {
    let snapshot = fixture();
    let concave = outline(&[
        (10, 10),
        (14, 10),
        (14, 12),
        (12, 12),
        (12, 14),
        (10, 14),
        (10, 10),
    ]);
    let cells = selected(&snapshot, &concave);
    assert_eq!(cells.len(), 21);
    assert!(cells.contains(&MapCoordinate { x: 11, y: 13 }));
    assert!(!cells.contains(&MapCoordinate { x: 13, y: 13 }));
    let edge = outline(&[(0, 0), (89, 0), (89, 89), (0, 89), (0, 0)]);
    assert_eq!(selected(&snapshot, &edge).len(), 8100);
    let open = outline(&[(0, 0), (0, 5), (5, 5), (5, 0)]);
    assert!(!selected(&snapshot, &open).contains(&MapCoordinate { x: 2, y: 2 }));
}

#[test]
fn added_freehand_strokes_fill_only_new_enclosures() {
    let snapshot = fixture();
    let open = outline(&[(1, 1), (5, 1), (5, 5), (1, 5)]);
    let mut close = outline(&[(1, 5), (1, 1)]);
    close.operation = SelectionOperation::Add;
    close.current = selected(&snapshot, &open);
    assert_eq!(selected(&snapshot, &close).len(), 25);
    close.filled = false;
    let ring = selected(&snapshot, &close);
    assert_eq!(ring.len(), 16);
    let mut unrelated = outline(&[(10, 10), (14, 10), (14, 14), (10, 14), (10, 10)]);
    unrelated.operation = SelectionOperation::Add;
    unrelated.current = ring;
    let combined = selected(&snapshot, &unrelated);
    assert_eq!(combined.len(), 41);
    assert!(!combined.contains(&MapCoordinate { x: 3, y: 3 }));
    assert!(combined.contains(&MapCoordinate { x: 12, y: 12 }));
}

#[test]
fn filled_freehand_subtraction_remains_a_hole_after_later_additions() {
    let snapshot = fixture();
    let mut subtract = outline(&[(3, 3), (5, 3), (5, 5), (3, 5), (3, 3)]);
    subtract.operation = SelectionOperation::Subtract;
    subtract.current = selected(
        &snapshot,
        &request(SelectionShape::Rectangle, (1, 1), (9, 9)),
    );
    let mut add = outline(&[(10, 1), (10, 9)]);
    add.operation = SelectionOperation::Add;
    add.current = selected(&snapshot, &subtract);
    let cells = selected(&snapshot, &add);
    assert_eq!(cells.len(), 81);
    assert!(!cells.contains(&MapCoordinate { x: 4, y: 4 }));
    assert!(cells.contains(&MapCoordinate { x: 10, y: 4 }));
}

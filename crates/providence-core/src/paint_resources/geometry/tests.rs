use super::*;
use crate::model::{LevelType, StableId};

fn stamp() -> PaintResource {
    PaintResource {
        identity: StableId("paint:geometry".into()),
        name: "Bridge".into(),
        collection: "Terrain".into(),
        kind: PaintResourceKind::Stamp,
        level_type: LevelType::Land,
        tileset_id: StableId("landlook:0".into()),
        width: 2,
        height: 2,
        cells: vec![
            PaintResourceCell {
                x: 0,
                y: 0,
                tile: 0,
            },
            PaintResourceCell {
                x: 1,
                y: 1,
                tile: 2,
            },
        ],
        favorite: true,
    }
}

#[test]
fn sparse_resize_and_hole_keep_empty_tile_distinct() {
    let source = stamp();
    let grown = preview(
        &source,
        GeometryEdit::Resize {
            width: 4,
            height: 3,
            fill: 9,
        },
    )
    .unwrap();
    assert_eq!(grown.resource.cells, source.cells);
    assert_eq!(grown.added, 0);
    let hole = preview(&grown.resource, GeometryEdit::RemoveCell { x: 0, y: 0 }).unwrap();
    assert_eq!(hole.removed[0].tile, 0);
    assert_eq!(hole.resource.cells.len(), 1);
    assert!(
        preview(
            &hole.resource,
            GeometryEdit::Resize {
                width: 1,
                height: 1,
                fill: 9
            }
        )
        .is_err()
    );
    assert_eq!(source, stamp());
}

#[test]
fn dense_palette_expansion_uses_exact_fill_and_shrink_names_removed_cells() {
    let mut source = stamp();
    source.kind = PaintResourceKind::Palette;
    source.cells = (0..2)
        .flat_map(|y| (0..2).map(move |x| PaintResourceCell { x, y, tile: 4 }))
        .collect();
    let grown = preview(
        &source,
        GeometryEdit::Resize {
            width: 3,
            height: 2,
            fill: 17,
        },
    )
    .unwrap();
    assert_eq!(grown.added, 2);
    assert_eq!(grown.resource.cells[2].tile, 17);
    assert!(preview(&source, GeometryEdit::RemoveCell { x: 0, y: 0 }).is_err());
    let shrunk = preview(
        &grown.resource,
        GeometryEdit::Resize {
            width: 1,
            height: 1,
            fill: 2,
        },
    )
    .unwrap();
    assert_eq!(shrunk.removed.len(), 5);
    assert_eq!(shrunk.resource.cells[0].tile, 4);
}

#[test]
fn coordinate_edits_remain_bounded_and_validate_managed_bits() {
    let source = stamp();
    let filled = preview(
        &source,
        GeometryEdit::SetCell {
            x: 1,
            y: 0,
            tile: 31,
        },
    )
    .unwrap();
    assert_eq!(filled.added, 1);
    assert!(
        preview(
            &source,
            GeometryEdit::SetCell {
                x: 2,
                y: 0,
                tile: 1
            }
        )
        .is_err()
    );
    assert!(
        preview(
            &source,
            GeometryEdit::Resize {
                width: 33,
                height: 2,
                fill: 1
            }
        )
        .is_err()
    );
    let mut dungeon = source;
    dungeon.level_type = LevelType::Dungeon;
    assert!(
        preview(
            &dungeon,
            GeometryEdit::SetCell {
                x: 1,
                y: 0,
                tile: 0x9060u16 as i16
            }
        )
        .is_err()
    );
}

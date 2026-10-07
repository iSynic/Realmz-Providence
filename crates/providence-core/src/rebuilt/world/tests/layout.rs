use super::super::*;
use super::fixtures::*;
use crate::codecs::{LAND_LAYOUT_CELLS, LAND_LAYOUT_COLUMNS};
use crate::model::LandLayout;

#[test]
fn land_layout_projects_exact_diagonal_transitions_in_both_directions() {
    let mut snapshot = snapshot();
    let mut second = snapshot.world.maps[0].clone();
    second.identity = StableId("land:1".into());
    second.native_index = 1;
    second.name = "Thornwatch East".into();
    snapshot.world.maps.push(second);
    let mut cells = vec![0; LAND_LAYOUT_CELLS];
    cells[0] = -1;
    cells[LAND_LAYOUT_COLUMNS + 1] = 1;
    snapshot.world.land_layout = Some(LandLayout {
        cells: cells.clone(),
    });

    let world = project_rebuilt_v3_world(&snapshot).expect("project layout transitions");

    assert_eq!(
        world.land_layout,
        Some(RebuiltV3LandLayout {
            rows: 8,
            cols: 16,
            cells,
        })
    );
    assert_eq!(world.transitions.len(), 2);
    assert_eq!(world.transitions[0].source.edge, "southeast");
    assert_eq!(world.transitions[0].target.edge, "northwest");
    assert_eq!(world.transitions[1].source.edge, "northwest");
    assert_eq!(world.transitions[1].target.edge, "southeast");
}

#[test]
fn land_layout_rejects_dangling_invalid_and_duplicate_placements() {
    let mut snapshot = snapshot();
    let mut cells = vec![0; LAND_LAYOUT_CELLS];
    cells[0] = 4;
    snapshot.world.land_layout = Some(LandLayout {
        cells: cells.clone(),
    });
    assert_eq!(
        project_rebuilt_v3_world(&snapshot),
        Err(RebuiltV3WorldError::MissingLandLayoutMap {
            row: 0,
            column: 0,
            native_index: 4,
        })
    );

    cells[0] = -2;
    snapshot.world.land_layout = Some(LandLayout {
        cells: cells.clone(),
    });
    assert_eq!(
        project_rebuilt_v3_world(&snapshot),
        Err(RebuiltV3WorldError::InvalidLandLayoutValue {
            row: 0,
            column: 0,
            value: -2,
        })
    );

    cells[0] = -1;
    cells[1] = -1;
    snapshot.world.land_layout = Some(LandLayout { cells });
    assert_eq!(
        project_rebuilt_v3_world(&snapshot),
        Err(RebuiltV3WorldError::DuplicateLandLayoutPlacement {
            map: StableId("land:0".into()),
        })
    );
}

use super::super::*;
use super::fixtures::{player_map, snapshot};
use crate::codecs::{LAND_LAYOUT_CELLS, LAND_LAYOUT_COLUMNS};
use crate::model::{BlobId, ClassicAction, LandLayout, ProjectOrigin};

#[test]
fn map_identity_and_layout_errors_precede_missing_runtime_inputs() {
    let mut source = snapshot();
    source.world.land_layout = Some(LandLayout { cells: Vec::new() });
    source.world.maps[0].runtime = None;
    source.world.maps.push(source.world.maps[0].clone());
    assert_eq!(
        project_rebuilt_v3_world(&source),
        Err(RebuiltV3WorldError::DuplicateMapId(StableId(
            "land:0".into()
        )))
    );
    source.world.maps.pop();
    assert_eq!(
        project_rebuilt_v3_world(&source),
        Err(RebuiltV3WorldError::InvalidLandLayoutCellCount(0))
    );
    source.world.land_layout = None;
    assert_eq!(
        project_rebuilt_v3_world(&source),
        Err(RebuiltV3WorldError::MapInputsUnavailable)
    );
    source.world.maps.clear();
    assert_eq!(
        project_rebuilt_v3_world(&source),
        Err(RebuiltV3WorldError::EmptyMaps)
    );
}

#[test]
fn imported_duplicate_layout_uses_the_first_row_major_source_location() {
    let mut source = snapshot();
    source.origin = ProjectOrigin::Imported {
        compatibility_annex: BlobId(format!("sha256:{}", "a".repeat(64))),
    };
    add_land_maps(&mut source, &[1, 2]);
    let mut cells = vec![0; LAND_LAYOUT_CELLS];
    cells[0] = -1;
    cells[1] = 1;
    cells[2 * LAND_LAYOUT_COLUMNS] = -1;
    cells[2 * LAND_LAYOUT_COLUMNS + 1] = 2;
    source.world.land_layout = Some(LandLayout {
        cells: cells.clone(),
    });
    let world = project_rebuilt_v3_world(&source).unwrap();
    assert_eq!(world.land_layout.unwrap().cells, cells);
    let outgoing = world
        .transitions
        .iter()
        .filter(|t| t.source.map_id.0 == "land:0")
        .map(|t| (&t.source.edge, &t.target.map_id.0))
        .collect::<Vec<_>>();
    assert_eq!(outgoing, vec![(&"east".to_owned(), &"land:1".to_owned())]);
}

#[test]
fn player_map_duplicates_precede_range_checks_and_signed_ids_keep_their_target() {
    let mut source = snapshot();
    source.world.action_points[0].actions = vec![ClassicAction {
        slot: 0,
        raw_opcode: 29,
        target_native_id: -20,
    }];
    source.world.player_maps = vec![
        player_map(0, false, 0, 0, 0, Vec::new()),
        player_map(0, false, 0, 0, 0, Vec::new()),
    ];
    assert_eq!(
        project_rebuilt_v3_world(&source),
        Err(RebuiltV3WorldError::DuplicatePlayerMapId(0))
    );
    source.world.player_maps.clear();
    assert!(matches!(
        project_rebuilt_v3_world(&source),
        Err(RebuiltV3WorldError::PlayerMapIdOutOfRange { native_id: -20, .. })
    ));
    source.world.action_points[0].actions[0].target_native_id = -3;
    assert!(matches!(
        project_rebuilt_v3_world(&source),
        Err(RebuiltV3WorldError::MissingPlayerMap { native_id: 3, .. })
    ));
}

#[test]
fn world_map_order_is_canonical_identity_order_not_native_index_order() {
    let mut source = snapshot();
    add_land_maps(&mut source, &[2, 10]);
    let world = project_rebuilt_v3_world(&source).unwrap();
    assert_eq!(
        world
            .maps
            .iter()
            .map(|m| m.id.0.as_str())
            .collect::<Vec<_>>(),
        vec!["land:0", "land:10", "land:2"]
    );
    assert_eq!(
        world.maps.iter().map(|m| m.level_index).collect::<Vec<_>>(),
        vec![0, 10, 2]
    );
}

fn add_land_maps(source: &mut ProjectSnapshot, indices: &[u32]) {
    for index in indices {
        let mut map = source.world.maps[0].clone();
        map.identity = StableId(format!("land:{index}"));
        map.native_index = *index;
        source.world.maps.push(map);
    }
}

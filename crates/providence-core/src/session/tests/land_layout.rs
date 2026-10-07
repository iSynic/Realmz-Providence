use super::*;

#[test]
fn land_layout_cells_are_typed_map_references_and_move_atomically() {
    let snapshot = single_land_snapshot();
    let mut session = EditorSession::new(snapshot);

    let first = session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::SetLandLayoutCell {
                row: 0,
                column: 0,
                target: Some(StableId("land:0".into())),
            },
        })
        .expect("place map in Layout");
    assert_eq!(
        first.changed_entities,
        [StableId("land-layout".into()), StableId("land:0".into())]
    );
    assert_layout_reference(&session);

    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(1),
            command: EditorCommand::SetLandLayoutCell {
                row: 1,
                column: 1,
                target: Some(StableId("land:0".into())),
            },
        })
        .expect("move map atomically");
    let cells = &session.snapshot().world.land_layout.as_ref().unwrap().cells;
    assert_eq!(cells[0], 0);
    assert_eq!(cells[LAND_LAYOUT_COLUMNS + 1], -1);

    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(2),
            command: EditorCommand::Undo,
        })
        .expect("undo Layout move");
    let cells = &session.snapshot().world.land_layout.as_ref().unwrap().cells;
    assert_eq!(cells[0], -1);
    assert_eq!(cells[LAND_LAYOUT_COLUMNS + 1], 0);
}

fn single_land_snapshot() -> ProjectSnapshot {
    let mut snapshot = sample_snapshot();
    snapshot.world.maps.push(MapLevel {
        identity: StableId("land:0".into()),
        level_type: LevelType::Land,
        native_index: 0,
        name: "Ashen Coast".into(),
        tiles: vec![0; CLASSIC_MAP_SIZE * CLASSIC_MAP_SIZE],
        runtime: None,
    });
    snapshot
}

fn assert_layout_reference(session: &EditorSession) {
    let reference = session
        .references()
        .into_iter()
        .find(|reference| reference.source == StableId("land-layout".into()))
        .expect("typed Layout reference");
    assert_eq!(reference.field, FieldPath("cells[0][0]".into()));
    assert_eq!(reference.target_kind, TargetKind::Map);
    assert_eq!(reference.target_id, "land:0");
    assert_eq!(reference.resolution, ResolutionState::Resolved);
    assert_eq!(
        reference.byte_provenance,
        Some(ByteProvenance {
            native_path: "Layout".into(),
            record_index: 0,
            byte_start: 0,
            byte_end: 2,
        })
    );
}

#[test]
fn malformed_land_layout_geometry_is_rejected() {
    let mut malformed = sample_snapshot();
    malformed.world.land_layout = Some(LandLayout {
        cells: vec![0; LAND_LAYOUT_CELLS - 1],
    });
    let mut malformed_session = EditorSession::new(malformed);
    assert_eq!(
        malformed_session.execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::SetLandLayoutCell {
                row: 0,
                column: 0,
                target: None,
            },
        }),
        Err(SessionError::InvalidLandLayoutCellCount(
            LAND_LAYOUT_CELLS - 1
        ))
    );
}

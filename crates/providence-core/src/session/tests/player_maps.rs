use super::*;

#[test]
fn player_maps_have_revisioned_edits_and_typed_runtime_references() {
    let snapshot = player_map_reference_snapshot();
    let mut session = EditorSession::new(snapshot);
    assert_player_map_runtime_references(&session);

    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::UpdatePlayerMapNames {
                native_id: 0,
                available_name: "Northern Marches".into(),
                unavailable_name: "Uncharted North".into(),
            },
        })
        .expect("edit Player Map resource names");
    assert_eq!(
        session
            .snapshot()
            .player_map_names
            .as_ref()
            .unwrap()
            .available_names[0],
        "Northern Marches"
    );
    assert!(!session.snapshot().world.player_maps[0].authored);
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(1),
            command: EditorCommand::Undo,
        })
        .expect("undo Player Map resource-name edit");
    assert_eq!(
        session
            .snapshot()
            .player_map_names
            .as_ref()
            .unwrap()
            .available_names[0],
        "Northern March"
    );

    let mut edited = session.snapshot().world.player_maps[0].clone();
    edited.note = "The bridge has been repaired.".into();
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(2),
            command: EditorCommand::UpdatePlayerMap {
                player_map: Box::new(edited),
            },
        })
        .expect("edit Data MD2 Player Map body");
    assert!(session.snapshot().world.player_maps[0].authored);
}

fn party_marker_asset() -> AssetDescriptor {
    AssetDescriptor {
        identity: StableId("party-marker".into()),
        label: "Current Party".into(),
        kind: "icon".into(),
        mime_type: None,
        classic_resource: Some(ClassicResourceKey {
            resource_type: "cicn".into(),
            resource_id: 138,
        }),
        scenario_music_slot: None,
        blob: BlobId(format!("sha256:{}", "a".repeat(64))),
        byte_length: 1,
        classic_payload_blob: None,
        classic_payload_byte_length: None,
        extension: None,
        width: None,
        height: None,
        duration_ms: None,
        sample_rate: None,
        channels: None,
        tile_width: None,
        tile_height: None,
        columns: None,
        rows: None,
        landlook: None,
        base_tile: None,
        source: "controlled player-map fixture".into(),
    }
}

fn northern_march_player_map() -> crate::model::PlayerMapRecord {
    let mut markers = vec![
        crate::model::PlayerMapMarker {
            icon_id: 0,
            x: 0,
            y: 0,
        };
        crate::codecs::PLAYER_MAP_MARKER_SLOTS
    ];
    markers[0] = crate::model::PlayerMapMarker {
        icon_id: 143,
        x: 18,
        y: 23,
    };
    crate::model::PlayerMapRecord {
        identity: StableId("player-map:0".into()),
        native_id: NativeRecordId(0),
        markers,
        start_x: 4,
        start_y: 5,
        level: 0,
        picture_id: 0,
        icon_size: 16,
        show: 0,
        is_dungeon: false,
        picture_rect: crate::model::PlayerMapRect::default(),
        note: "The road east is washed out.".into(),
        authored: false,
    }
}

fn player_map_reference_snapshot() -> ProjectSnapshot {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("player-map-session".into()));
    snapshot.world.maps.push(MapLevel {
        identity: StableId("land:0".into()),
        level_type: LevelType::Land,
        native_index: 0,
        name: "Thornwatch".into(),
        tiles: vec![0; CLASSIC_MAP_SIZE * CLASSIC_MAP_SIZE],
        runtime: None,
    });
    snapshot.world.player_maps.push(northern_march_player_map());
    snapshot.player_map_names = Some(crate::model::PlayerMapNameCatalog {
        source_blob: None,
        available_names: std::iter::once("Northern March".into())
            .chain((2..=20).map(|index| format!("Known Map {index}")))
            .collect(),
        unavailable_names: std::iter::once("Uncharted North".into())
            .chain((2..=20).map(|index| format!("Unknown Map {index}")))
            .collect(),
    });
    snapshot.assets.push(party_marker_asset());
    snapshot.extra_action_points.push(ExtraActionPoint {
        identity: StableId("extra-action-point:0".into()),
        native_id: NativeRecordId(0),
        classic_door_id: 0,
        post_action_level: 0,
        post_action_x: 0,
        post_action_y: 0,
        chance_percent: 100,
        actions: vec![ClassicAction {
            slot: 0,
            raw_opcode: 29,
            target_native_id: 0,
        }],
    });
    snapshot
}

fn assert_player_map_runtime_references(session: &EditorSession) {
    let references = session.references();
    let opcode = references
        .iter()
        .find(|reference| reference.source.0 == "extra-action-point:0")
        .expect("opcode 29 reference");
    assert_eq!(opcode.target_kind, TargetKind::PlayerMap);
    assert_eq!(opcode.target_id, "player-map:0");
    assert_eq!(opcode.resolution, ResolutionState::Resolved);
    let marker = references
        .iter()
        .find(|reference| reference.field.0 == "markers[0].icon")
        .expect("marker reference");
    assert_eq!(marker.target_kind, TargetKind::Icon);
    assert_eq!(marker.resolution, ResolutionState::Missing);
    assert_eq!(
        marker.byte_provenance.as_ref().unwrap().native_path,
        "Data MD2"
    );
}

#[test]
fn player_map_draft_commits_body_and_names_in_one_history_entry() {
    let before = player_map_reference_snapshot();
    let mut session = EditorSession::new(before.clone());
    let mut record = before.world.player_maps[0].clone();
    record.note = "Caf\u{e9} by the bridge".into();
    let names = crate::session::PlayerMapNamesDraft {
        available_name: "Bridge survey".into(),
        unavailable_name: "Unknown bridge".into(),
    };
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::ApplyPlayerMapDraft {
                player_map: Box::new(record),
                names: Some(names),
            },
        })
        .unwrap();
    let applied = session.snapshot().clone();
    assert_eq!(applied.world.player_maps[0].note, "Caf\u{e9} by the bridge");
    assert_eq!(
        applied.player_map_names.as_ref().unwrap().available_names[0],
        "Bridge survey"
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
    assert_eq!(session.snapshot(), &applied);
}

#[test]
fn rejected_player_map_names_leave_body_and_revision_unchanged() {
    let before = player_map_reference_snapshot();
    let mut session = EditorSession::new(before.clone());
    let mut record = before.world.player_maps[0].clone();
    record.note = "Must not commit".into();
    let result = session.execute(ExpectedRevisionCommand {
        expected_revision: Revision(0),
        command: EditorCommand::ApplyPlayerMapDraft {
            player_map: Box::new(record),
            names: Some(crate::session::PlayerMapNamesDraft {
                available_name: "Not MacRoman: \u{1f409}".into(),
                unavailable_name: String::new(),
            }),
        },
    });
    assert!(result.is_err());
    assert_eq!(session.snapshot(), &before);
    assert_eq!(session.revision(), Revision(0));
}

#[test]
fn player_map_creation_counts_empty_imported_slots_and_exhaustion_is_atomic() {
    let mut snapshot = player_map_reference_snapshot();
    snapshot.world.player_maps =
        crate::codecs::decode_player_maps(&vec![0; 20 * crate::codecs::PLAYER_MAP_RECORD_BYTES])
            .records;
    snapshot.world.player_maps.remove(7);
    let mut session = EditorSession::new(snapshot);
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::CreatePlayerMap,
        })
        .unwrap();
    let row = &session.snapshot().world.player_maps[7];
    assert_eq!(row.identity.0, "player-map:7");
    assert_eq!(row.show, 1);
    assert!(row.authored);
    let full = session.snapshot().clone();
    assert!(
        session
            .execute(ExpectedRevisionCommand {
                expected_revision: Revision(1),
                command: EditorCommand::CreatePlayerMap
            })
            .is_err()
    );
    assert_eq!(session.snapshot(), &full);
    assert_eq!(session.revision(), Revision(1));
}

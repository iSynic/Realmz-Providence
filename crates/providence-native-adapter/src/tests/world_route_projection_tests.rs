use crate::demo::demo_snapshot;
use crate::dispatch_result;
use providence_core::codecs::LAND_LAYOUT_COLUMNS;
use providence_core::codecs::LAND_LAYOUT_ROWS;
use providence_core::codecs::PLAYER_MAP_RECORD_BYTES;
use providence_core::codecs::decode_player_maps;
use providence_core::model::AssetDescriptor;
use providence_core::model::ClassicResourceKey;
use providence_core::model::ClassicSourceBlob;
use providence_core::model::PlayerMapNameCatalog;
use providence_core::model::StableId;
use providence_core::session::EditorSession;
use serde_json::Value;
use serde_json::json;

fn source_blob(path: &str) -> ClassicSourceBlob {
    ClassicSourceBlob {
        native_path: path.into(),
        blob: providence_core::model::BlobId(format!("sha256:{}", "a".repeat(64))),
        byte_length: 1,
    }
}

fn assert_route_metadata(value: &Value, source_present: bool) {
    assert_eq!(value["sourcePresent"], source_present);
    assert_eq!(value["editability"], "editable");
    assert!(value["referenceSummary"]["outgoing"].is_u64());
    assert!(value["referenceSummary"]["usedBy"].is_u64());
    assert!(value["diagnosticCount"].is_u64());
}

#[test]
fn world_packet_projections_are_bounded_source_aware_and_editable() {
    let mut snapshot = demo_snapshot();
    snapshot.classic_sources = ["Data LD", "Data LL", "Data MD2"]
        .into_iter()
        .map(source_blob)
        .collect();
    snapshot.world.land_layout = Some(providence_core::model::LandLayout {
        cells: vec![0; LAND_LAYOUT_ROWS * LAND_LAYOUT_COLUMNS],
    });
    let player_map = decode_player_maps(&vec![0; PLAYER_MAP_RECORD_BYTES])
        .records
        .into_iter()
        .next()
        .expect("controlled Player Map row");
    snapshot.world.player_maps.push(player_map);
    snapshot.player_map_names = Some(PlayerMapNameCatalog {
        source_blob: Some(providence_core::model::BlobId(format!(
            "sha256:{}",
            "b".repeat(64)
        ))),
        available_names: vec!["Northwatch Survey".into()],
        unavailable_names: vec!["Uncharted Northwatch".into()],
    });
    snapshot.assets.push(AssetDescriptor {
        identity: StableId("special-land:-91".into()),
        label: "Cracked Causeway".into(),
        kind: "special-land-tile".into(),
        mime_type: Some("image/png".into()),
        classic_resource: Some(ClassicResourceKey {
            resource_type: "cicn".into(),
            resource_id: -91,
        }),
        scenario_music_slot: None,
        blob: providence_core::model::BlobId(format!("sha256:{}", "c".repeat(64))),
        byte_length: 1024,
        classic_payload_blob: Some(providence_core::model::BlobId(format!(
            "sha256:{}",
            "d".repeat(64)
        ))),
        classic_payload_byte_length: Some(2048),
        extension: Some("png".into()),
        width: Some(32),
        height: Some(32),
        duration_ms: None,
        sample_rate: None,
        channels: None,
        tile_width: None,
        tile_height: None,
        columns: None,
        rows: None,
        landlook: Some(0),
        base_tile: Some(7),
        source: "controlled scenario resource".into(),
    });
    let mut session = EditorSession::new(snapshot);

    let maps = dispatch_result(&mut session, "map.catalog", json!({"limit": 1}))
        .expect("bounded map catalog");
    assert_route_metadata(&maps["items"][0], true);
    assert!(maps.get("snapshot").is_none());
    let map = dispatch_result(&mut session, "map.open", json!({"identity": "land:0"}))
        .expect("bounded map detail");
    assert_route_metadata(&map, true);

    let player_maps = dispatch_result(&mut session, "player-map.list", json!({"limit": 1}))
        .expect("bounded Player Map catalog");
    assert_route_metadata(&player_maps["records"][0], true);
    assert_eq!(player_maps["records"][0]["name"], "Northwatch Survey");
    let player_map = dispatch_result(
        &mut session,
        "player-map.open",
        json!({"identity": "player-map:0"}),
    )
    .expect("bounded Player Map detail");
    assert_route_metadata(&player_map, true);

    let layout = dispatch_result(&mut session, "land-layout.open", json!({}))
        .expect("bounded Land Layout detail");
    assert_route_metadata(&layout, true);
    assert_eq!(layout["rows"], LAND_LAYOUT_ROWS);
    assert_eq!(layout["columns"], LAND_LAYOUT_COLUMNS);

    let tiles = dispatch_result(&mut session, "special-land.list", json!({"limit": 1}))
        .expect("bounded Special Land catalog");
    assert_route_metadata(&tiles["items"][0], true);
    let tile = dispatch_result(
        &mut session,
        "special-land.open",
        json!({"identity": "special-land:-91"}),
    )
    .expect("bounded Special Land detail");
    assert_route_metadata(&tile["tile"], true);
}

#[test]
fn authored_world_projections_do_not_claim_classic_source_evidence() {
    let mut session = EditorSession::new(demo_snapshot());
    let maps = dispatch_result(&mut session, "map.catalog", json!({"limit": 1}))
        .expect("authored map catalog");
    assert_route_metadata(&maps["items"][0], false);
    let map = dispatch_result(&mut session, "map.open", json!({"identity": "land:0"}))
        .expect("authored map detail");
    assert_route_metadata(&map, false);
}

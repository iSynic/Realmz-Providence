use super::*;

#[path = "map_artwork_ownership.rs"]
mod ownership;

#[path = "map_view_overlays.rs"]
mod view_overlays;

#[test]
fn map_overlay_ids_use_the_same_complete_classic_land_cell_decode_as_authoring() {
    assert_eq!(
        crate::map_overlays::map_overlay_resource_id(-1091),
        Some(-91)
    );
    assert_eq!(crate::map_overlays::map_overlay_resource_id(379), Some(379));
    assert_eq!(crate::map_overlays::map_overlay_resource_id(2147), None);
    assert_eq!(
        crate::map_overlays::map_overlay_resource_id(4201),
        Some(1201)
    );
}

#[test]
fn map_render_atlas_prefers_the_scenario_override_and_returns_one_bounded_payload() {
    let temporary = tempdir().expect("temporary map atlas project");
    let mut snapshot = demo_snapshot();
    snapshot.world.maps[0].runtime = Some(land_renderer_runtime(7, 156));
    snapshot.world.maps[0].tiles[0] = -1091;
    let store = ProjectStore::create(temporary.path().join("project"), &snapshot)
        .expect("create project store");
    let scenario_pixels = crate::map_artwork::tests::png(640, 320);
    let scenario_png = scenario_pixels.as_slice();
    let scenario_blob = store.put_blob(scenario_png).expect("store scenario atlas");
    let overlay_png = b"scenario overlay png";
    let overlay_blob = store.put_blob(overlay_png).expect("store scenario overlay");
    snapshot.assets.push(scenario_atlas_descriptor(
        scenario_blob.clone(),
        scenario_png,
    ));
    snapshot.assets.push(scenario_overlay_descriptor(
        overlay_blob.clone(),
        overlay_png,
    ));
    let requested_png = b"requested icon png";
    let requested_blob = store.put_blob(requested_png).expect("store requested icon");
    let mut requested = scenario_overlay_descriptor(requested_blob, requested_png);
    requested.identity = StableId("icon.379".into());
    requested.label = "cicn 379".into();
    requested.kind = "icon".into();
    requested.classic_resource.as_mut().unwrap().resource_id = 379;
    snapshot.assets.push(requested);
    store.save_snapshot(&snapshot).expect("save scenario atlas");
    let mut session = EditorSession::new(snapshot);

    let result = dispatch_result_with_application_store(
        &mut session,
        Some(&store),
        None,
        None,
        None,
        "map.render-atlas",
        json!({"identity": "land:0", "overlayResourceIds": [379]}),
    )
    .expect("read map atlas");

    assert_atlas_metadata(&result, &scenario_blob);
    assert_atlas_payloads(&result, scenario_png, overlay_png, requested_png);
    assert_eq!(session.revision(), Revision(0));
}

fn assert_atlas_metadata(result: &serde_json::Value, scenario_blob: &BlobId) {
    assert_eq!(result["available"], true);
    assert_eq!(result["mapIdentity"], "land:0");
    assert_eq!(result["tilesetId"], "classic.landlook.7");
    assert_eq!(result["sourceRole"], "scenario-override");
    assert_eq!(result["blob"], scenario_blob.0);
    assert_eq!(result["baseTile"], 156);
    assert_eq!(result["tileWidth"], 32);
    assert_eq!(result["columns"], 20);
    assert_eq!(result["overlayCandidates"], 2);
    assert_eq!(result["overlays"][0]["resourceId"], -91);
    assert_eq!(result["overlays"][0]["sourceRole"], "scenario-override");
    assert_eq!(result["unresolvedOverlayResourceIds"], json!([]));
    assert_eq!(result["overlays"][1]["resourceId"], 379);
}

fn assert_atlas_payloads(result: &serde_json::Value, base: &[u8], overlay: &[u8], icon: &[u8]) {
    let decode = |value: &serde_json::Value| BASE64.decode(value.as_str().unwrap()).unwrap();
    assert_eq!(decode(&result["base64"]), base);
    assert_eq!(decode(&result["overlays"][0]["base64"]), overlay);
    assert_eq!(decode(&result["overlays"][1]["base64"]), icon);
    assert!(result.get("map").is_none());
    assert!(result.get("snapshot").is_none());
}

#[test]
fn map_render_atlas_rejects_unbounded_or_malformed_overlay_requests() {
    let too_many =
        json!({"overlayResourceIds": vec![1; crate::map_overlays::MAX_MAP_OVERLAY_CANDIDATES + 1]});
    assert_eq!(
        crate::map_rendering::requested_overlay_ids(&too_many).unwrap_err(),
        "too many requested map-overlay previews"
    );
    assert_eq!(
        crate::map_rendering::requested_overlay_ids(&json!({"overlayResourceIds": "379"}))
            .unwrap_err(),
        "overlayResourceIds must be an array"
    );
    assert_eq!(
        crate::map_rendering::requested_overlay_ids(&json!({"overlayResourceIds": [379, "bad"]}),)
            .unwrap_err(),
        "overlayResourceIds must contain integers"
    );
}

#[test]
fn dungeon_render_projection_decodes_renderer_layers_without_exposing_bitfield_rules() {
    let map = renderer_dungeon();
    let asset = dungeon_atlas_descriptor();

    let result = map_atlas_projection(
        &map,
        &asset,
        "classic-application-fallback",
        b"controlled dungeon atlas".to_vec(),
    )
    .expect("project dungeon renderer inputs");

    assert_eq!(result["renderMode"], "dungeon-top-down");
    assert_eq!(
        result["dungeonRender"]["format"],
        "realmz.dungeon-render.v1"
    );
    assert_eq!(result["dungeonRender"]["cellCount"], 8_100);
    assert_eq!(result["dungeonRender"]["spriteLayerMasks"][0], 0b010_1001);
    assert_eq!(result["dungeonRender"]["spriteLayerMasks"][1], 0b100_0010);
    assert_eq!(result["dungeonRender"]["spriteLayerMasks"][2], 0b000_0100);
    assert_eq!(result["dungeonRender"]["behaviorOverlayMasks"][0], 0);
    assert_eq!(
        result["dungeonRender"]["behaviorOverlayMasks"][1],
        0b10_0011
    );
    assert_eq!(
        result["dungeonRender"]["behaviorOverlayMasks"][2],
        0b01_1100
    );
    assert!(result.get("map").is_none());
    assert!(result.get("snapshot").is_none());
}

#[test]
fn map_render_atlas_uses_the_validated_application_fallback_without_copying_it() {
    let temporary = tempdir().expect("temporary application map atlas");
    let library_store = ReferenceLibraryStore::create(temporary.path().join("library")).unwrap();
    let atlas_pixels = crate::map_artwork::tests::png(640, 320);
    let atlas_png = atlas_pixels.as_slice();
    let overlay_png = b"application overlay png";
    let (catalog, atlas_blob, overlay_blob) =
        application_atlas_catalog(&library_store, atlas_png, overlay_png);
    let mut snapshot = demo_snapshot();
    snapshot.world.maps[0].runtime = Some(land_renderer_runtime(0, 4));
    snapshot.world.maps[0].tiles[0] = -4;
    let mut session = EditorSession::new(snapshot);

    let result = dispatch_result_with_application_store(
        &mut session,
        None,
        Some(&catalog),
        Some(&library_store),
        None,
        "map.render-atlas",
        json!({"identity": "land:0"}),
    )
    .expect("read application fallback atlas");

    assert_eq!(result["available"], true);
    assert_eq!(result["sourceRole"], "classic-application-fallback");
    assert_eq!(result["blob"], atlas_blob.0);
    assert_eq!(result["baseTile"], 4);
    assert_eq!(result["overlayCandidates"], 1);
    assert_eq!(result["overlays"][0]["resourceId"], -4);
    assert_eq!(
        result["overlays"][0]["sourceRole"],
        "classic-application-fallback"
    );
    assert_eq!(result["overlays"][0]["blob"], overlay_blob.0);
    assert_eq!(result["unresolvedOverlayResourceIds"], json!([]));
    assert_eq!(
        BASE64.decode(result["base64"].as_str().unwrap()).unwrap(),
        atlas_png
    );

    assert_application_fallback_validation(&mut session, &catalog, &library_store);
}
fn land_renderer_runtime(landlook: i8, base_tile: i16) -> MapRuntimeMetadata {
    MapRuntimeMetadata {
        source: "controlled map stats".into(),
        source_blob: None,
        dark: false,
        uses_los: false,
        landlook: Some(landlook),
        base_scale: Some(100),
        tileset_id: StableId(format!("classic.landlook.{landlook}")),
        base_tile: Some(base_tile),
        random_rectangles: Vec::new(),
    }
}

fn scenario_atlas_descriptor(scenario_blob: BlobId, scenario_png: &[u8]) -> AssetDescriptor {
    AssetDescriptor {
        identity: StableId("classic.landlook.7".into()),
        label: "PICT 307".into(),
        kind: "tileset".into(),
        mime_type: Some("image/png".into()),
        classic_resource: Some(ClassicResourceKey {
            resource_type: "PICT".into(),
            resource_id: 307,
        }),
        scenario_music_slot: None,
        blob: scenario_blob.clone(),
        byte_length: scenario_png.len() as u64,
        classic_payload_blob: None,
        classic_payload_byte_length: None,
        extension: Some("png".into()),
        width: Some(640),
        height: Some(320),
        duration_ms: None,
        sample_rate: None,
        channels: None,
        tile_width: Some(32),
        tile_height: Some(32),
        columns: Some(20),
        rows: Some(10),
        landlook: Some(7),
        base_tile: None,
        source: "controlled Scenario.rsrc".into(),
    }
}

fn scenario_overlay_descriptor(overlay_blob: BlobId, overlay_png: &[u8]) -> AssetDescriptor {
    AssetDescriptor {
        identity: StableId("special-land.-91".into()),
        label: "cicn -91".into(),
        kind: "special-land-tile".into(),
        mime_type: Some("image/png".into()),
        classic_resource: Some(ClassicResourceKey {
            resource_type: "cicn".into(),
            resource_id: -91,
        }),
        scenario_music_slot: None,
        blob: overlay_blob.clone(),
        byte_length: overlay_png.len() as u64,
        classic_payload_blob: None,
        classic_payload_byte_length: None,
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
        landlook: Some(7),
        base_tile: Some(156),
        source: "controlled Scenario.rsrc".into(),
    }
}

fn dungeon_atlas_descriptor() -> AssetDescriptor {
    AssetDescriptor {
        identity: StableId("dungeon-top-down-302".into()),
        label: "PICT 302 dungeon atlas".into(),
        kind: "tileset".into(),
        mime_type: Some("image/png".into()),
        classic_resource: Some(ClassicResourceKey {
            resource_type: "PICT".into(),
            resource_id: 302,
        }),
        scenario_music_slot: None,
        blob: providence_core::model::BlobId(format!("sha256:{}", "d".repeat(64))),
        byte_length: 24,
        classic_payload_blob: None,
        classic_payload_byte_length: None,
        extension: Some("png".into()),
        width: Some(64),
        height: Some(64),
        duration_ms: None,
        sample_rate: None,
        channels: None,
        tile_width: Some(16),
        tile_height: Some(16),
        columns: Some(4),
        rows: Some(4),
        landlook: Some(2),
        base_tile: None,
        source: "controlled PICT 302".into(),
    }
}

fn renderer_dungeon() -> MapLevel {
    let mut tiles = vec![0; CLASSIC_MAP_SIZE * CLASSIC_MAP_SIZE];
    tiles[0] = 0x0001 | 0x0008 | 0x0020;
    tiles[1] = (0x0002 | 0x0040 | 0x0100 | 0x2000 | 0x4000) as i16;
    tiles[2] = 0x0004 | 0x0200 | 0x0400 | 0x0800;
    MapLevel {
        identity: StableId("dungeon:0".into()),
        level_type: LevelType::Dungeon,
        native_index: 0,
        name: "Dungeon level 0".into(),
        tiles,
        runtime: Some(MapRuntimeMetadata {
            source: "controlled Data RDD".into(),
            source_blob: None,
            dark: true,
            uses_los: true,
            landlook: Some(2),
            base_scale: None,
            tileset_id: StableId("dungeon-top-down-302".into()),
            base_tile: None,
            random_rectangles: Vec::new(),
        }),
    }
}

fn application_atlas_descriptor(
    atlas_blob: BlobId,
    source_blob: BlobId,
    atlas_png: &[u8],
) -> AssetDescriptor {
    AssetDescriptor {
        identity: StableId("classic-application:family-jewels:pict:300".into()),
        label: "PICT 300".into(),
        kind: "tileset".into(),
        mime_type: Some("image/png".into()),
        classic_resource: Some(ClassicResourceKey {
            resource_type: "PICT".into(),
            resource_id: 300,
        }),
        scenario_music_slot: None,
        blob: atlas_blob.clone(),
        byte_length: atlas_png.len() as u64,
        classic_payload_blob: Some(source_blob),
        classic_payload_byte_length: Some(b"application resource fork".len() as u64),
        extension: Some("png".into()),
        width: Some(640),
        height: Some(320),
        duration_ms: None,
        sample_rate: None,
        channels: None,
        tile_width: Some(32),
        tile_height: Some(32),
        columns: Some(20),
        rows: Some(10),
        landlook: Some(0),
        base_tile: None,
        source: "Classic application/The Family Jewels.rsrc".into(),
    }
}

fn application_overlay_descriptor(overlay_blob: BlobId, overlay_png: &[u8]) -> AssetDescriptor {
    AssetDescriptor {
        identity: StableId("classic-application:family-jewels:cicn:-4".into()),
        label: "cicn -4".into(),
        kind: "special-land-tile".into(),
        mime_type: Some("image/png".into()),
        classic_resource: Some(ClassicResourceKey {
            resource_type: "cicn".into(),
            resource_id: -4,
        }),
        scenario_music_slot: None,
        blob: overlay_blob.clone(),
        byte_length: overlay_png.len() as u64,
        classic_payload_blob: None,
        classic_payload_byte_length: None,
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
        landlook: None,
        base_tile: None,
        source: "Classic application/The Family Jewels.rsrc".into(),
    }
}

fn application_atlas_catalog(
    library_store: &ReferenceLibraryStore,
    atlas_png: &[u8],
    overlay_png: &[u8],
) -> (ApplicationMediaCatalog, BlobId, BlobId) {
    let atlas_blob = library_store.put_blob(atlas_png).unwrap();
    let overlay_blob = library_store.put_blob(overlay_png).unwrap();
    let source_blob = library_store
        .put_blob(b"application resource fork")
        .unwrap();
    let source_identity = StableId("classic-application:family-jewels".into());
    let catalog = ApplicationMediaCatalog {
        format_version: APPLICATION_MEDIA_CATALOG_FORMAT_VERSION,
        library_id: StableId("controlled-application-library".into()),
        sources: vec![ApplicationMediaSource {
            identity: source_identity.clone(),
            native_name: "The Family Jewels.rsrc".into(),
            priority: 0,
            blob: source_blob.clone(),
            byte_length: b"application resource fork".len() as u64,
        }],
        assets: vec![
            ApplicationMediaAsset {
                source: source_identity.clone(),
                source_priority: 0,
                descriptor: application_atlas_descriptor(
                    atlas_blob.clone(),
                    source_blob,
                    atlas_png,
                ),
            },
            ApplicationMediaAsset {
                source: source_identity,
                source_priority: 0,
                descriptor: application_overlay_descriptor(overlay_blob.clone(), overlay_png),
            },
        ],
        ambiguous_resources: Vec::new(),
        failures: Vec::new(),
    };
    (catalog, atlas_blob, overlay_blob)
}

fn assert_application_fallback_validation(
    session: &mut EditorSession,
    catalog: &ApplicationMediaCatalog,
    library_store: &ReferenceLibraryStore,
) {
    let project_only = validation_list_projection(session, None, &json!({"limit": 128}))
        .expect("project-only diagnostics");
    assert!(
        project_only["items"]
            .as_array()
            .unwrap()
            .iter()
            .any(|diagnostic| {
                diagnostic["code"] == "reference.special-land-tile.missing"
                    && diagnostic["entity"] == "land:0"
                    && diagnostic["field"] == "tiles[0][0].specialLand"
            })
    );

    let application_aware = dispatch_result_with_application_store(
        session,
        None,
        Some(catalog),
        Some(library_store),
        None,
        "validation.list",
        json!({"limit": 128}),
    )
    .expect("application-aware diagnostics");
    assert_eq!(application_aware["applicationFallbacks"], 1);
    let filtered = dispatch_result_with_application_store(
        session,
        None,
        Some(catalog),
        Some(library_store),
        None,
        "validation.list",
        json!({"query": "reference.special-land-tile.missing"}),
    )
    .expect("search excludes resolved application resources before grouping");
    assert_eq!(filtered["total"], 0);
    assert_eq!(filtered["matchedBeforeGroup"], 0);
    assert_eq!(filtered["groups"], json!([]));
    assert_eq!(filtered["applicationFallbacks"], 1);
    assert!(
        application_aware["items"]
            .as_array()
            .unwrap()
            .iter()
            .all(|diagnostic| {
                diagnostic["code"] != "reference.special-land-tile.missing"
                    || diagnostic["entity"] != "land:0"
                    || diagnostic["field"] != "tiles[0][0].specialLand"
            })
    );
    assert!(session.snapshot().assets.is_empty());
    assert_eq!(session.revision(), Revision(0));
}

use crate::demo::demo_snapshot;
use crate::dispatch_result_with_application_store;
use crate::map_rendering::map_atlas_projection;
use crate::text_export::validation_list_projection;
use base64::Engine as _;
use base64::engine::general_purpose::STANDARD as BASE64;
use providence_core::model::AssetDescriptor;
use providence_core::model::BlobId;
use providence_core::model::CLASSIC_MAP_SIZE;
use providence_core::model::ClassicResourceKey;
use providence_core::model::LevelType;
use providence_core::model::MapLevel;
use providence_core::model::MapRuntimeMetadata;
use providence_core::model::StableId;
use providence_core::rebuilt::APPLICATION_MEDIA_CATALOG_FORMAT_VERSION;
use providence_core::rebuilt::ApplicationMediaAsset;
use providence_core::rebuilt::ApplicationMediaCatalog;
use providence_core::rebuilt::ApplicationMediaSource;
use providence_core::session::EditorSession;
use providence_core::session::Revision;
use providence_storage::ProjectStore;
use providence_storage::ReferenceLibraryStore;
use serde_json::json;

use super::*;

pub(super) fn removable_icons() -> Vec<u8> {
    crate::codecs::write_resource_fork(&[
        crate::codecs::ResourceEntry {
            resource_type: *b"cicn",
            id: 392,
            name: "Giant Frog".into(),
            attributes: 1,
            data: vec![1, 2, 3],
        },
        crate::codecs::ResourceEntry {
            resource_type: *b"cicn",
            id: 700,
            name: "Giant Frog Facing".into(),
            attributes: 2,
            data: vec![4, 5, 6],
        },
        crate::codecs::ResourceEntry {
            resource_type: *b"TEXT",
            id: 42,
            name: "Evidence".into(),
            attributes: 3,
            data: b"preserve me".to_vec(),
        },
    ])
    .unwrap()
}

pub(super) fn application_special_land() -> (ProjectSnapshot, ApplicationMediaCatalog) {
    let mut tiles = vec![0; CLASSIC_MAP_SIZE * CLASSIC_MAP_SIZE];
    tiles[0] = -1091;
    let mut snapshot = ProjectSnapshot::new_authored(StableId("application-fallback".into()));
    snapshot.world.maps.push(MapLevel {
        identity: StableId("land:0".into()),
        level_type: LevelType::Land,
        native_index: 0,
        name: "Fallback proof".into(),
        tiles,
        runtime: None,
    });
    let source = StableId("classic-application:appearance".into());
    let application = ApplicationMediaCatalog {
        format_version: crate::rebuilt::APPLICATION_MEDIA_CATALOG_FORMAT_VERSION,
        library_id: StableId("classic-application".into()),
        sources: vec![crate::rebuilt::ApplicationMediaSource {
            identity: source.clone(),
            native_name: "Tacticals.rsrc".into(),
            priority: 0,
            blob: BlobId(format!("sha256:{}", "a".repeat(64))),
            byte_length: 1,
        }],
        assets: vec![crate::rebuilt::ApplicationMediaAsset {
            source,
            source_priority: 0,
            descriptor: special_land_descriptor(),
        }],
        ambiguous_resources: Vec::new(),
        failures: Vec::new(),
    };
    (snapshot, application)
}

fn special_land_descriptor() -> AssetDescriptor {
    AssetDescriptor {
        identity: StableId("application:special-land:-91".into()),
        label: "Application Special Land -91".into(),
        kind: "special-land-tile".into(),
        mime_type: Some("image/png".into()),
        classic_resource: Some(ClassicResourceKey {
            resource_type: "cicn".into(),
            resource_id: -91,
        }),
        scenario_music_slot: None,
        blob: BlobId(format!("sha256:{}", "b".repeat(64))),
        byte_length: 64,
        classic_payload_blob: Some(BlobId(format!("sha256:{}", "c".repeat(64)))),
        classic_payload_byte_length: Some(512),
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
        source: "controlled application media".into(),
    }
}

use super::*;

pub(super) fn scenario_icon() -> AssetDescriptor {
    let payload = BlobId(format!("sha256:{}", "f".repeat(64)));
    AssetDescriptor {
        identity: StableId("icon:30126".into()),
        label: "Ashen Gate Sigil With A Very Long Corpus Name".into(),
        kind: "icon".into(),
        mime_type: Some("image/png".into()),
        classic_resource: Some(ClassicResourceKey {
            resource_type: "cicn".into(),
            resource_id: 30_126,
        }),
        scenario_music_slot: None,
        blob: BlobId(format!("sha256:{}", "e".repeat(64))),
        byte_length: 64,
        classic_payload_blob: Some(payload),
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
        landlook: None,
        base_tile: None,
        source: "controlled icon fixture".into(),
    }
}

pub(super) fn special_land_tile() -> AssetDescriptor {
    AssetDescriptor {
        identity: StableId("special-land.-91".into()),
        label: "Western Moon Gate With Broken Portcullis".into(),
        kind: "special-land-tile".into(),
        mime_type: Some("image/png".into()),
        classic_resource: Some(ClassicResourceKey {
            resource_type: "cicn".into(),
            resource_id: -91,
        }),
        scenario_music_slot: None,
        blob: BlobId(format!("sha256:{}", "1".repeat(64))),
        byte_length: 64,
        classic_payload_blob: Some(BlobId(format!("sha256:{}", "2".repeat(64)))),
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
        source: "controlled Special Land fixture".into(),
    }
}

pub(super) fn party_marker_reference() -> ReferenceDescriptor {
    ReferenceDescriptor {
        source: StableId("player-map:0".into()),
        field: crate::references::FieldPath("partyMarker.icon".into()),
        target_kind: TargetKind::Icon,
        target_id: "138".into(),
        required: true,
        stock_fallback: None,
        resolution: ResolutionState::Missing,
        repair_actions: Vec::new(),
        byte_provenance: None,
    }
}

pub(super) fn imported_picture() -> AssetDescriptor {
    let blob = || BlobId(format!("sha256:{}", "a".repeat(64)));
    AssetDescriptor {
        identity: StableId("picture:12".into()),
        label: "Imported PICT 12".into(),
        kind: "picture".into(),
        mime_type: Some("image/png".into()),
        classic_resource: Some(ClassicResourceKey {
            resource_type: "PICT".into(),
            resource_id: 12,
        }),
        scenario_music_slot: None,
        blob: blob(),
        byte_length: 8,
        classic_payload_blob: Some(blob()),
        classic_payload_byte_length: Some(8),
        extension: Some("png".into()),
        width: Some(512),
        height: Some(342),
        duration_ms: None,
        sample_rate: None,
        channels: None,
        tile_width: None,
        tile_height: None,
        columns: None,
        rows: None,
        landlook: None,
        base_tile: None,
        source: CLASSIC_SCENARIO_RESOURCE_SOURCE.into(),
    }
}

pub(super) fn imported_sound() -> AssetDescriptor {
    let blob = || BlobId(format!("sha256:{}", "a".repeat(64)));
    AssetDescriptor {
        identity: StableId("sound:603".into()),
        label: "Imported snd 603".into(),
        kind: "sound".into(),
        mime_type: Some("audio/wav".into()),
        classic_resource: Some(ClassicResourceKey {
            resource_type: "snd ".into(),
            resource_id: 603,
        }),
        scenario_music_slot: None,
        blob: blob(),
        byte_length: 48,
        classic_payload_blob: Some(blob()),
        classic_payload_byte_length: Some(24),
        extension: Some("wav".into()),
        width: None,
        height: None,
        duration_ms: Some(4),
        sample_rate: Some(11_025),
        channels: Some(1),
        tile_width: None,
        tile_height: None,
        columns: None,
        rows: None,
        landlook: None,
        base_tile: None,
        source: CLASSIC_SCENARIO_RESOURCE_SOURCE.into(),
    }
}

pub(super) fn imported_icon() -> AssetDescriptor {
    let blob = || BlobId(format!("sha256:{}", "a".repeat(64)));
    AssetDescriptor {
        identity: StableId("icon:13307".into()),
        label: "Imported cicn 13307".into(),
        kind: "icon".into(),
        mime_type: Some("image/png".into()),
        classic_resource: Some(ClassicResourceKey {
            resource_type: "cicn".into(),
            resource_id: 13_307,
        }),
        scenario_music_slot: None,
        blob: blob(),
        byte_length: 64,
        classic_payload_blob: Some(blob()),
        classic_payload_byte_length: Some(512),
        extension: Some("png".into()),
        width: Some(40),
        height: Some(52),
        duration_ms: None,
        sample_rate: None,
        channels: None,
        tile_width: None,
        tile_height: None,
        columns: None,
        rows: None,
        landlook: None,
        base_tile: None,
        source: CLASSIC_SCENARIO_RESOURCE_SOURCE.into(),
    }
}

pub(super) fn application_special_land_asset(
    source: StableId,
    special_land_resource: ClassicResourceKey,
) -> crate::rebuilt::ApplicationMediaAsset {
    crate::rebuilt::ApplicationMediaAsset {
        source: source.clone(),
        source_priority: 0,
        descriptor: AssetDescriptor {
            identity: StableId("application:special-land:-91".into()),
            label: "Application Special Land -91".into(),
            kind: "special-land-tile".into(),
            mime_type: Some("image/png".into()),
            classic_resource: Some(special_land_resource.clone()),
            scenario_music_slot: None,
            blob: BlobId(format!("sha256:{}", "d".repeat(64))),
            byte_length: 64,
            classic_payload_blob: Some(BlobId(format!("sha256:{}", "e".repeat(64)))),
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
        },
    }
}

pub(super) fn decoded_special_land_tile() -> AssetDescriptor {
    AssetDescriptor {
        identity: StableId("special-land.-99".into()),
        label: "Moon Gate".into(),
        kind: "special-land-tile".into(),
        mime_type: Some("image/png".into()),
        classic_resource: Some(ClassicResourceKey {
            resource_type: "cicn".into(),
            resource_id: -99,
        }),
        scenario_music_slot: None,
        blob: BlobId(
            "sha256:f16d05ec6b29248d2c61adb1e9263f78e4f7bace1b955014a2d17872cfe4064d".into(),
        ),
        byte_length: 7,
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
        source: "controlled decoded CICN".into(),
    }
}

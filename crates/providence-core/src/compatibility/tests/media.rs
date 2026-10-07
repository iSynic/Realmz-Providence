use super::*;

#[test]
fn classic_picture_requires_unique_in_range_identity_and_compiled_payload() {
    let mut snapshot = slice_snapshot(47);
    let payload = BlobId(format!("sha256:{}", "b".repeat(64)));
    let picture = AssetDescriptor {
        identity: StableId("picture:30000".into()),
        label: "The Observatory Door Beyond the Long Western Passage".into(),
        kind: "picture".into(),
        mime_type: Some("image/png".into()),
        classic_resource: Some(ClassicResourceKey {
            resource_type: "PICT".into(),
            resource_id: 30_000,
        }),
        scenario_music_slot: None,
        blob: BlobId(format!("sha256:{}", "a".repeat(64))),
        byte_length: 8,
        classic_payload_blob: Some(payload),
        classic_payload_byte_length: Some(4),
        extension: Some("png".into()),
        width: Some(2),
        height: Some(2),
        duration_ms: None,
        sample_rate: None,
        channels: None,
        tile_width: None,
        tile_height: None,
        columns: None,
        rows: None,
        landlook: None,
        base_tile: None,
        source: "controlled picture fixture".into(),
    };
    snapshot.assets.push(picture.clone());
    assert!(
        !classify_classic_slice(&snapshot)
            .blockers
            .iter()
            .any(|blocker| blocker.code == "classic.scenario-picture.invalid")
    );

    let mut duplicate = picture;
    duplicate.identity = StableId("picture:duplicate".into());
    snapshot.assets.push(duplicate);
    assert_eq!(
        classify_classic_slice(&snapshot)
            .blockers
            .iter()
            .filter(|blocker| blocker.code == "classic.scenario-picture.invalid")
            .count(),
        2
    );
}

#[test]
fn classic_sound_requires_unique_in_range_identity_and_decoded_metadata() {
    let mut snapshot = slice_snapshot(47);
    let payload = BlobId(format!("sha256:{}", "d".repeat(64)));
    let sound = AssetDescriptor {
        identity: StableId("sound:200".into()),
        label: "Thornwatch Portcullis and Western Bell".into(),
        kind: "sound".into(),
        mime_type: Some("audio/wav".into()),
        classic_resource: Some(ClassicResourceKey {
            resource_type: "snd ".into(),
            resource_id: 200,
        }),
        scenario_music_slot: None,
        blob: BlobId(format!("sha256:{}", "c".repeat(64))),
        byte_length: 48,
        classic_payload_blob: Some(payload),
        classic_payload_byte_length: Some(24),
        extension: Some("wav".into()),
        width: None,
        height: None,
        duration_ms: Some(4),
        sample_rate: Some(11_025),
        channels: Some(2),
        tile_width: None,
        tile_height: None,
        columns: None,
        rows: None,
        landlook: None,
        base_tile: None,
        source: "controlled sound fixture".into(),
    };
    snapshot.assets.push(sound.clone());
    assert!(
        !classify_classic_slice(&snapshot)
            .blockers
            .iter()
            .any(|blocker| blocker.code == "classic.scenario-sound.invalid")
    );

    let mut duplicate = sound;
    duplicate.identity = StableId("sound:duplicate".into());
    snapshot.assets.push(duplicate);
    assert_eq!(
        classify_classic_slice(&snapshot)
            .blockers
            .iter()
            .filter(|blocker| blocker.code == "classic.scenario-sound.invalid")
            .count(),
        2
    );
}

#[test]
fn classic_icon_accepts_signed_unique_identity_and_requires_compiled_payload() {
    let mut snapshot = slice_snapshot(47);
    let icon = scenario_icon();
    snapshot.assets.push(icon.clone());
    assert!(
        !classify_classic_slice(&snapshot)
            .blockers
            .iter()
            .any(|blocker| blocker.code == "classic.scenario-icon.invalid")
    );

    let mut duplicate = icon;
    duplicate.identity = StableId("icon:duplicate".into());
    snapshot.assets.push(duplicate);
    assert_eq!(
        classify_classic_slice(&snapshot)
            .blockers
            .iter()
            .filter(|blocker| blocker.code == "classic.scenario-icon.invalid")
            .count(),
        2
    );

    snapshot.assets[1]
        .classic_resource
        .as_mut()
        .unwrap()
        .resource_id = -1;
    snapshot.assets[1].identity = StableId("icon:negative-item-picture".into());
    assert!(
        !classify_classic_slice(&snapshot)
            .blockers
            .iter()
            .any(|blocker| blocker.entity == Some(StableId("icon:negative-item-picture".into())))
    );
    snapshot.assets[1].kind = "portrait".into();
    assert!(
        classify_classic_slice(&snapshot)
            .blockers
            .iter()
            .any(|blocker| blocker.entity == Some(StableId("icon:negative-item-picture".into())))
    );
}

#[test]
fn imported_scenario_media_preserves_signed_short_ids_and_decoded_native_geometry() {
    let mut snapshot = slice_snapshot(47);
    snapshot.assets.push(imported_picture());
    snapshot.assets.push(imported_sound());
    snapshot.assets.push(imported_icon());

    let blockers = classify_classic_slice(&snapshot).blockers;
    assert!(!blockers.iter().any(|blocker| matches!(
        blocker.code.as_str(),
        "classic.scenario-picture.invalid"
            | "classic.scenario-sound.invalid"
            | "classic.scenario-icon.invalid"
    )));
}

#[test]
fn classic_special_land_tile_requires_negative_unique_identity_and_compiled_payload() {
    let mut snapshot = slice_snapshot(47);
    let tile = special_land_tile();
    snapshot.assets.push(tile.clone());
    assert!(
        !classify_classic_slice(&snapshot)
            .blockers
            .iter()
            .any(|blocker| blocker.code == "classic.special-land-tile.invalid")
    );

    let mut duplicate = tile;
    duplicate.identity = StableId("special-land.duplicate".into());
    snapshot.assets.push(duplicate);
    assert_eq!(
        classify_classic_slice(&snapshot)
            .blockers
            .iter()
            .filter(|blocker| blocker.code == "classic.special-land-tile.invalid")
            .count(),
        2
    );

    snapshot.assets[1]
        .classic_resource
        .as_mut()
        .unwrap()
        .resource_id = 91;
    snapshot.assets[1].identity = StableId("special-land.positive".into());
    assert!(
        classify_classic_slice(&snapshot)
            .blockers
            .iter()
            .any(|blocker| blocker.entity == Some(StableId("special-land.positive".into())))
    );
}

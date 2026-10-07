use super::*;

#[test]
fn asset_metadata_is_revisioned_and_exact_resource_keys_stay_unique() {
    let mut session = EditorSession::new(sample_snapshot());
    let asset = special_land_asset();
    let projection = session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::UpsertAsset {
                asset: Box::new(asset.clone()),
            },
        })
        .expect("register asset");
    assert_eq!(
        projection.changed_entities,
        std::slice::from_ref(&asset.identity)
    );

    assert_duplicate_resource_rejected(&mut session, &asset);
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(1),
            command: EditorCommand::Undo,
        })
        .expect("undo asset registration");
    assert!(session.snapshot().assets.is_empty());
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(2),
            command: EditorCommand::Redo,
        })
        .expect("redo asset registration");
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(3),
            command: EditorCommand::RemoveAsset {
                identity: asset.identity.clone(),
            },
        })
        .expect("remove asset");
    assert!(session.snapshot().assets.is_empty());
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(4),
            command: EditorCommand::Undo,
        })
        .expect("undo asset removal");
    assert_eq!(session.snapshot().assets, vec![asset]);
}

#[test]
fn imported_asset_removal_is_durable_undoable_and_cleared_by_replacement() {
    let mut snapshot = sample_snapshot();
    snapshot.origin = ProjectOrigin::Imported {
        compatibility_annex: BlobId(format!("sha256:{}", "a".repeat(64))),
    };
    let resource = ClassicResourceKey {
        resource_type: "cicn".into(),
        resource_id: 392,
    };
    let asset = imported_combat_asset(resource.clone());
    snapshot.assets.push(asset.clone());
    let mut session = EditorSession::new(snapshot);

    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::RemoveAsset {
                identity: asset.identity.clone(),
            },
        })
        .expect("remove imported resource");
    assert!(session.snapshot().assets.is_empty());
    assert_eq!(
        session.snapshot().classic_resource_removals.as_slice(),
        std::slice::from_ref(&resource)
    );

    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(1),
            command: EditorCommand::Undo,
        })
        .expect("undo imported resource removal");
    assert_eq!(
        session.snapshot().assets.as_slice(),
        std::slice::from_ref(&asset)
    );
    assert!(session.snapshot().classic_resource_removals.is_empty());

    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(2),
            command: EditorCommand::Redo,
        })
        .expect("redo imported resource removal");
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(3),
            command: EditorCommand::UpsertAsset {
                asset: Box::new(asset.clone()),
            },
        })
        .expect("replace imported resource");
    assert_eq!(session.snapshot().assets, [asset]);
    assert!(session.snapshot().classic_resource_removals.is_empty());
}

#[test]
fn monster_appearance_pair_commands_are_atomic_revisioned_and_restore_fallback_together() {
    let original_base = appearance_asset(392, "icon:392", 'a');
    let original_facing = appearance_asset(700, "icon:700", 'b');
    let replacement_base = appearance_asset(392, "monster-appearance:392:base", 'c');
    let replacement_facing = appearance_asset(700, "monster-appearance:392:facing", 'd');
    let mut snapshot = sample_snapshot();
    snapshot.origin = ProjectOrigin::Imported {
        compatibility_annex: BlobId(format!("sha256:{}", "e".repeat(64))),
    };
    snapshot
        .assets
        .extend([original_base.clone(), original_facing.clone()]);
    let mut session = EditorSession::new(snapshot);

    assert_incomplete_pair_removal_rejected(&mut session, &original_base);
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::UpsertMonsterAppearancePair {
                base: Box::new(replacement_base.clone()),
                facing: Box::new(replacement_facing.clone()),
            },
        })
        .expect("replace complete pair");
    assert_eq!(
        session.snapshot().assets,
        [replacement_base.clone(), replacement_facing.clone()]
    );
    assert!(session.snapshot().classic_resource_removals.is_empty());

    assert_pair_replacement_history(
        &mut session,
        [original_base, original_facing],
        [replacement_base, replacement_facing],
    );
}

fn special_land_asset() -> AssetDescriptor {
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
        source: "synthetic decoded CICN".into(),
    }
}

fn imported_combat_asset(resource: ClassicResourceKey) -> AssetDescriptor {
    AssetDescriptor {
        identity: StableId("classic-resource:cicn:392".into()),
        label: "Giant Frog".into(),
        kind: "combat-icon".into(),
        mime_type: Some("image/png".into()),
        classic_resource: Some(resource.clone()),
        scenario_music_slot: None,
        blob: BlobId(format!("sha256:{}", "b".repeat(64))),
        byte_length: 8292,
        classic_payload_blob: Some(BlobId(format!("sha256:{}", "c".repeat(64)))),
        classic_payload_byte_length: Some(8292),
        extension: Some("png".into()),
        width: Some(64),
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
        source: CLASSIC_SCENARIO_RESOURCE_SOURCE.into(),
    }
}

fn appearance_asset(id: i32, identity: &str, digest: char) -> AssetDescriptor {
    AssetDescriptor {
        identity: StableId(identity.into()),
        label: format!("Monster appearance {id}"),
        kind: "icon".into(),
        mime_type: Some("image/png".into()),
        classic_resource: Some(ClassicResourceKey {
            resource_type: "cicn".into(),
            resource_id: id,
        }),
        scenario_music_slot: None,
        blob: BlobId(format!("sha256:{}", digest.to_string().repeat(64))),
        byte_length: 8292,
        classic_payload_blob: Some(BlobId(format!(
            "sha256:{}",
            digest.to_ascii_uppercase().to_string().repeat(64)
        ))),
        classic_payload_byte_length: Some(8292),
        extension: Some("png".into()),
        width: Some(64),
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
        source: CLASSIC_SCENARIO_RESOURCE_SOURCE.into(),
    }
}

fn assert_incomplete_pair_removal_rejected(
    session: &mut EditorSession,
    original_base: &AssetDescriptor,
) {
    assert!(matches!(
        session.check_asset_removal(&original_base.identity),
        Err(SessionError::InvalidMonsterAppearance(_))
    ));
    assert!(matches!(
        session.check_asset_removal(&StableId("missing-artwork".into())),
        Err(SessionError::AssetNotFound(_))
    ));
    assert_eq!(session.revision(), Revision(0));

    let error = session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::RemoveAsset {
                identity: original_base.identity.clone(),
            },
        })
        .expect_err("one pair half cannot be removed");
    assert!(matches!(error, SessionError::InvalidMonsterAppearance(_)));
    assert_eq!(session.revision(), Revision(0));
}

fn assert_pair_replacement_history(
    session: &mut EditorSession,
    original: [AssetDescriptor; 2],
    replacement: [AssetDescriptor; 2],
) {
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(1),
            command: EditorCommand::Undo,
        })
        .expect("undo pair replacement");
    assert_eq!(session.snapshot().assets, original);
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(2),
            command: EditorCommand::Redo,
        })
        .expect("redo pair replacement");
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(3),
            command: EditorCommand::RemoveMonsterAppearancePair { icon_id: 392 },
        })
        .expect("restore application fallback");
    assert!(session.snapshot().assets.is_empty());
    assert_eq!(
        session.snapshot().classic_resource_removals,
        [
            ClassicResourceKey {
                resource_type: "cicn".into(),
                resource_id: 392,
            },
            ClassicResourceKey {
                resource_type: "cicn".into(),
                resource_id: 700,
            },
        ]
    );
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(4),
            command: EditorCommand::Undo,
        })
        .expect("undo fallback restoration");
    assert_eq!(session.snapshot().assets, replacement);
    assert!(session.snapshot().classic_resource_removals.is_empty());
}

fn assert_duplicate_resource_rejected(session: &mut EditorSession, asset: &AssetDescriptor) {
    let mut duplicate = asset.clone();
    duplicate.identity = StableId("special-land.duplicate".into());
    let error = session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(1),
            command: EditorCommand::UpsertAsset {
                asset: Box::new(duplicate),
            },
        })
        .expect_err("resource key must remain unique");
    assert_eq!(
        error,
        SessionError::DuplicateAssetResource {
            resource_type: "cicn".into(),
            resource_id: -99,
        }
    );
}

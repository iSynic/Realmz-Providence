use super::*;

#[test]
fn current_exports_preserve_exact_native_words_for_both_origins() {
    let mut authored = snapshot();
    authored.world.maps[0].tiles[2 * 90 + 3] = 0x2007;
    let before = authored.clone();
    let legacy = compile_rebuilt_document_set(&authored, &compiler(), &[]).unwrap();
    assert_eq!(legacy.manifest.manifest.schema_version, 6);
    assert_eq!(
        legacy.world.document.maps[0].classic_tile_values.as_ref(),
        Some(&authored.world.maps[0].tiles)
    );
    assert_eq!(authored, before);
    authored.origin = ProjectOrigin::Imported {
        compatibility_annex: BlobId(format!("sha256:{}", "a".repeat(64))),
    };
    let imported_before = authored.clone();
    let imported = compile_rebuilt_document_set(&authored, &compiler(), &[]).unwrap();
    assert_eq!(imported.manifest.manifest.schema_version, 6);
    assert_eq!(
        imported.world.document.maps[0]
            .classic_tile_values
            .as_ref()
            .unwrap(),
        &authored.world.maps[0].tiles
    );
    assert_eq!(
        imported.world.document.maps[0].cells,
        legacy.world.document.maps[0].cells
    );
    assert_eq!(authored, imported_before);
}

#[test]
fn historical_entry_point_retains_authored_v3_without_native_words() {
    let authored = snapshot();
    let legacy = compile_rebuilt_v3_document_set(&authored, &compiler(), &[]).unwrap();
    assert_eq!(legacy.manifest.manifest.schema_version, 3);
    assert_eq!(legacy.content.document.schema_version, 3);
    assert_eq!(
        legacy.manifest.manifest.content_id,
        "14d49c9819a491daefa70b18f765fc6242346a4d7c45c487798185fbc9ebe99f"
    );
    assert_eq!(legacy.world.document.schema_version, 3);
    assert!(legacy.world.document.maps[0].classic_tile_values.is_none());
    let mut layered_snapshot = authored.clone();
    let path = add_media(&mut layered_snapshot);
    let application = application_media_for(&layered_snapshot);
    let payload = [RebuiltV3FileInput {
        path: &path,
        bytes: MEDIA,
    }];
    let layered = compile_rebuilt_v3_document_set_with_application(
        &layered_snapshot,
        &application,
        &compiler(),
        &payload,
    )
    .unwrap();
    assert_eq!(layered.manifest.manifest.schema_version, 3);
    assert_eq!(layered.content.document.schema_version, 3);
    assert!(layered.world.document.maps[0].classic_tile_values.is_none());
    let mut wider = authored;
    let mut set = crate::codecs::decode_monster_set(
        &vec![0; crate::codecs::MONSTER_RECORD_BYTES],
        "Data MD",
        0,
    );
    set.monsters[0].magic_to_hit = -5;
    wider.monster_sets.push(set);
    assert!(compile_rebuilt_v3_document_set(&wider, &compiler(), &[]).is_err());
    assert!(compile_rebuilt_document_set(&wider, &compiler(), &[]).is_ok());
    layered_snapshot.monster_sets = wider.monster_sets;
    let rejected = compile_rebuilt_v3_document_set_with_application(
        &layered_snapshot,
        &application,
        &compiler(),
        &payload,
    )
    .unwrap_err();
    assert!(rejected.to_string().contains("magicToHit"), "{rejected}");
}

#[test]
fn current_fresh_monsters_keep_signed_magic_but_reject_undefined_random_tables() {
    let mut authored = snapshot();
    let mut set = crate::codecs::decode_monster_set(
        &vec![0; crate::codecs::MONSTER_RECORD_BYTES],
        "Data MD",
        0,
    );
    set.monsters[0].magic_to_hit = -5;
    set.monsters[0].authored = true;
    authored.monster_sets.push(set);
    let artifact = compile_rebuilt_document_set(&authored, &compiler(), &[]).unwrap();
    assert_eq!(artifact.content.document.monsters[0].magic_to_hit, -5);
    assert!(
        !crate::compatibility::classify_rebuilt_v3(&authored)
            .blockers
            .iter()
            .any(|b| b.code == "rebuilt.monsters.invalid")
    );
    authored.monster_sets[0].monsters[0].weapon = -11;
    assert!(compile_rebuilt_document_set(&authored, &compiler(), &[]).is_err());
    assert!(
        crate::compatibility::classify_rebuilt_v3(&authored)
            .blockers
            .iter()
            .any(|b| b.code == "rebuilt.monsters.invalid")
    );
}

use super::*;

#[test]
fn imported_maps_preserve_exact_words_and_authored_maps_keep_v3() {
    let mut authored = snapshot();
    authored.world.maps[0].tiles[2 * 90 + 3] = 0x2007;
    let before = authored.clone();
    let legacy = compile_rebuilt_v3_document_set(&authored, &compiler(), &[]).unwrap();
    assert_eq!(legacy.manifest.manifest.schema_version, 3);
    assert!(legacy.world.document.maps[0].classic_tile_values.is_none());
    assert_eq!(authored, before);
    authored.origin = ProjectOrigin::Imported {
        compatibility_annex: BlobId(format!("sha256:{}", "a".repeat(64))),
    };
    let imported_before = authored.clone();
    let imported = compile_rebuilt_v3_document_set(&authored, &compiler(), &[]).unwrap();
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

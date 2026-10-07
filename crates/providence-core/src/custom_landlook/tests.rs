use super::*;
use crate::session::{EditorCommand, EditorSession, ExpectedRevisionCommand, Revision};

#[test]
fn import_geometry_protects_locked_tiles_and_unchanged_pixels() {
    assert!(artwork_tiles(ArtworkMode::Tile, 60, 32, 32).is_err());
    assert!(artwork_tiles(ArtworkMode::Block, 59, 64, 32).is_err());
    assert!(artwork_tiles(ArtworkMode::Block, 200, 64, 32).is_err());
    assert!(artwork_tiles(ArtworkMode::Full, 1, 320, 640).is_err());
    let original = vec![7; 640 * 320 * 4];
    let source = vec![13; 640 * 320 * 4];
    let result = compose_artwork(&original, &source, ArtworkMode::Full, 1, 640, 320).unwrap();
    for tile in 1..=200 {
        let index = (tile - 1) as usize;
        let offset = (index / 20 * 32 * 640 + index % 20 * 32) * 4;
        assert_eq!(
            result[offset],
            if [60, 61].contains(&tile) { 7 } else { 13 }
        );
    }
    let result = compose_artwork(
        &original,
        &vec![19; 64 * 64 * 4],
        ArtworkMode::Block,
        22,
        64,
        64,
    )
    .unwrap();
    assert_eq!(
        artwork_tiles(ArtworkMode::Block, 22, 64, 64).unwrap(),
        vec![22, 23, 42, 43]
    );
    assert_eq!(result[(32 * 640 + 32) * 4], 19);
    assert_eq!(result[0], 7);
}

#[test]
fn cloning_overlays_current_values_but_preserves_unowned_source_bytes() {
    let mut bytes = vec![0; 8104];
    bytes[18..20].copy_from_slice(&[0x82, 0x17]);
    bytes[38..40].copy_from_slice(&[0, 7]);
    bytes[8102..8104].copy_from_slice(&[0x88, 0x11]);
    let decoded =
        decode_landlook_mapstats(&bytes, 0, "Data P BD", BlobId("source".into())).unwrap();
    let mut snapshot = ProjectSnapshot::new_authored(StableId("clone".into()));
    snapshot.landlook_catalogs.push(decoded.catalog);
    snapshot.terrain_catalog = decoded.profiles;
    snapshot.terrain_catalog[1].movement_cost = 17;
    let copied = clone_metadata(&snapshot, 0, 6, &bytes).unwrap();
    assert_eq!(&copied[18..20], &bytes[18..20]);
    assert_eq!(&copied[38..40], &bytes[38..40]);
    assert_eq!(&copied[8102..], &bytes[8102..]);
    assert_eq!(
        decode_custom_landlook_mapstats(&copied, 6, BlobId("target".into()))
            .unwrap()
            .profiles[1]
            .movement_cost,
        17
    );
    assert!(clone_metadata(&snapshot, 0, 0, &bytes).is_err());
}

pub(crate) fn asset() -> AssetDescriptor {
    serde_json::from_value(serde_json::json!({"identity":"custom-art","label":"Custom 1","kind":"tileset","mimeType":"image/png","classicResource":{"resourceType":"PICT","resourceId":306},"scenarioMusicSlot":null,"blob":"art","byteLength":8,"extension":"png","width":640,"height":320,"durationMs":null,"sampleRate":null,"channels":null,"tileWidth":32,"tileHeight":32,"columns":20,"rows":10,"landlook":6,"baseTile":null,"source":"scenario"})).unwrap()
}

#[test]
fn custom_copy_is_one_history_step_and_replacement_requires_review() {
    let bytes = vec![0; 8104];
    let decoded = decode_custom_landlook_mapstats(&bytes, 6, BlobId("behavior".into())).unwrap();
    let mut session = EditorSession::new(ProjectSnapshot::new_authored(StableId("atomic".into())));
    let command = EditorCommand::ApplyCustomLandlook {
        landlook: 6,
        catalog: Some(Box::new(decoded.catalog)),
        profiles: decoded.profiles,
        asset: Box::new(asset()),
        assign_map: None,
        replace: false,
    };
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: command.clone(),
        })
        .unwrap();
    assert_eq!(session.snapshot().assets.len(), 1);
    assert_eq!(session.snapshot().terrain_catalog.len(), 201);
    let kept = session.snapshot().clone();
    assert!(
        session
            .execute(ExpectedRevisionCommand {
                expected_revision: Revision(1),
                command
            })
            .is_err()
    );
    assert_eq!(session.snapshot(), &kept);
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(1),
            command: EditorCommand::Undo,
        })
        .unwrap();
    assert!(session.snapshot().assets.is_empty());
    assert!(session.snapshot().landlook_catalogs.is_empty());
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(2),
            command: EditorCommand::Redo,
        })
        .unwrap();
    assert_eq!(session.snapshot(), &kept);
}

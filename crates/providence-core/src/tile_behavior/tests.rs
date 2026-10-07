use super::*;
use crate::{
    codecs::{MAPSTATS_REFERENCE_BYTES, decode_custom_landlook_mapstats},
    model::BlobId,
    session::{EditorCommand, EditorSession, ExpectedRevisionCommand, Revision},
};

fn fixture() -> (ProjectSnapshot, Vec<u8>) {
    let mut bytes = vec![0; MAPSTATS_REFERENCE_BYTES];
    for index in 0..201 {
        let offset = index * 40;
        bytes[offset + 18..offset + 20].copy_from_slice(&[0x82, 0x17]);
        bytes[offset + 38..offset + 40].copy_from_slice(&7i16.to_be_bytes());
    }
    bytes[40 + 4..40 + 6].copy_from_slice(&2i16.to_be_bytes());
    bytes[40 + 6..40 + 8].copy_from_slice(&9i16.to_be_bytes());
    bytes[8040..8042].copy_from_slice(&155i16.to_be_bytes());
    let decoded = decode_custom_landlook_mapstats(&bytes, 6, BlobId("a".repeat(64))).unwrap();
    let mut snapshot = ProjectSnapshot::new_authored(StableId("behavior".into()));
    snapshot.landlook_catalogs.push(decoded.catalog);
    snapshot.terrain_catalog = decoded.profiles;
    (snapshot, bytes)
}

#[test]
fn atomic_behavior_edit_preserves_source_words_and_shared_erase_setting() {
    let (snapshot, bytes) = fixture();
    let original = inspect(&snapshot, 6, 1, &bytes).unwrap();
    let mut edit = original.edit.clone();
    edit.movement_time = 12;
    edit.clear_tile = 13;
    edit.combat_build[2][1] = 400;
    edit.path = true;
    let plan = prepare(&snapshot, 6, 1, &bytes, &edit).unwrap();
    let mut permitted = [42, 43, 50, 51, 74, 75, 78, 79];
    permitted.sort();
    for (index, byte) in bytes.iter().enumerate() {
        if !permitted.contains(&index) {
            assert_eq!(plan.bytes[index], *byte, "unowned byte {index}");
        }
    }
    let decoded = decode_custom_landlook_mapstats(&plan.bytes, 6, BlobId("b".repeat(64))).unwrap();
    assert_eq!(decoded.catalog.base_tile, 155);
    assert_eq!(decoded.profiles[1].solid_type, 2);
    assert_eq!(plan.bytes[46..48], 9i16.to_be_bytes());
    let mut session = EditorSession::new(snapshot.clone());
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::ImportLandlookMapstatsCatalog {
                catalog: Box::new(decoded.catalog),
                profiles: decoded.profiles,
            },
        })
        .unwrap();
    assert_eq!(session.snapshot().terrain_catalog[1].movement_cost, 12);
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(1),
            command: EditorCommand::Undo,
        })
        .unwrap();
    assert_eq!(session.snapshot(), &snapshot);
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(2),
            command: EditorCommand::Redo,
        })
        .unwrap();
    assert_eq!(session.snapshot().terrain_catalog[1].movement_cost, 12);
}

#[test]
fn same_and_preserved_invalid_values_are_no_op_but_new_invalid_values_are_rejected() {
    let (mut snapshot, mut bytes) = fixture();
    bytes[78..80].copy_from_slice(&(-3i16).to_be_bytes());
    snapshot.terrain_catalog[1].combat_build[0][0] = -17;
    let context = inspect(&snapshot, 6, 1, &bytes).unwrap();
    assert_eq!(context.edit.clear_tile, -3);
    let plan = prepare(&snapshot, 6, 1, &bytes, &context.edit).unwrap();
    assert!(plan.changed_fields.is_empty());
    assert_eq!(plan.bytes, context.effective_source);
    let mut invalid = context.edit.clone();
    invalid.clear_tile = 201;
    assert!(prepare(&snapshot, 6, 1, &bytes, &invalid).is_err());
    invalid = context.edit.clone();
    invalid.combat_build[0][0] = -18;
    assert!(prepare(&snapshot, 6, 1, &bytes, &invalid).is_err());
    assert!(inspect(&snapshot, 0, 1, &bytes).is_err());
    snapshot
        .landlook_catalogs
        .push(snapshot.landlook_catalogs[0].clone());
    assert!(inspect(&snapshot, 6, 1, &bytes).is_err());
}

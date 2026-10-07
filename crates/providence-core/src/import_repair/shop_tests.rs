use super::*;
use crate::model::{BlobId, ProjectOrigin, ProjectSnapshot, StableId};
use crate::{
    codecs::{SHOP_RECORD_BYTES, decode_shops, encode_shops, source_shop_record},
    model::{ClassicSourceBlob, NativeRecordId},
    session::{EditorCommand, EditorSession, ExpectedRevisionCommand, Revision},
};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;

fn fixture() -> (ProjectSnapshot, BTreeMap<String, Vec<u8>>) {
    let mut bytes = vec![0; 3 * SHOP_RECORD_BYTES];
    bytes[..2].copy_from_slice(&7_i16.to_be_bytes());
    for (slot, item) in [(0, 3000_i16), (1, 3001)] {
        let start = SHOP_RECORD_BYTES + slot * 2;
        bytes[start..start + 2].copy_from_slice(&item.to_be_bytes());
    }
    let blob = BlobId(format!("sha256:{:x}", Sha256::digest(&bytes)));
    let mut snapshot = ProjectSnapshot::new_authored(StableId("shop-repair".into()));
    snapshot.origin = ProjectOrigin::Imported {
        compatibility_annex: blob.clone(),
    };
    snapshot.import_interpretation_version = 1;
    snapshot.classic_sources.push(ClassicSourceBlob {
        native_path: "Data SD".into(),
        blob,
        byte_length: bytes.len() as u64,
    });
    snapshot.shops = (0..3)
        .map(|id| source_shop_record(&bytes, NativeRecordId(id)).unwrap())
        .collect();
    (snapshot, BTreeMap::from([("Data SD".into(), bytes)]))
}

fn command(assessment: RepairAssessment, replace_conflicts: bool) -> RepairCommand {
    RepairCommand {
        expected_source_identity: assessment.source_identity,
        expected_previous_version: assessment.previous_version,
        changes: assessment
            .entries
            .into_iter()
            .filter(|entry| replace_conflicts || !entry.conflict)
            .collect(),
    }
}

#[test]
fn old_interpretation_is_corrected_without_changing_source_and_with_one_undo() {
    let (snapshot, files) = fixture();
    let assessment = assess(&snapshot, &files).unwrap();
    assert_eq!(assessment.entries.len(), 2);
    assert!(assessment.entries.iter().all(|entry| !entry.conflict));
    let original = snapshot.clone();
    let mut session = EditorSession::new(snapshot);
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::RepairImportedContent(command(assessment, false)),
        })
        .unwrap();
    assert_eq!(
        session.snapshot().shops,
        decode_shops(&files["Data SD"]).records
    );
    assert_eq!(
        encode_shops(&session.snapshot().shops, Some(&files["Data SD"])).unwrap(),
        files["Data SD"]
    );
    assert_eq!(session.undo_history().len(), 1);
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(1),
            command: EditorCommand::Undo,
        })
        .unwrap();
    assert_eq!(session.snapshot(), &original);
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(2),
            command: EditorCommand::Redo,
        })
        .unwrap();
    assert_eq!(session.snapshot().shops.len(), 1);
}

#[test]
fn authored_inventory_is_retained_by_default_and_requires_explicit_replacement() {
    let (mut snapshot, files) = fixture();
    snapshot.shops[1].inflation = 150;
    snapshot.shops[1].authored = true;
    let assessment = assess(&snapshot, &files).unwrap();
    assert!(
        assessment
            .entries
            .iter()
            .find(|entry| entry.entity.0 == "shop:1")
            .unwrap()
            .conflict
    );
    let mut explicit = snapshot.clone();
    apply(&mut snapshot, command(assessment.clone(), false)).unwrap();
    assert_eq!(snapshot.shops.len(), 2);
    assert!(
        snapshot
            .shops
            .iter()
            .any(|shop| shop.native_id.0 == 1 && shop.inflation == 150)
    );
    apply(&mut explicit, command(assessment, true)).unwrap();
    assert_eq!(explicit.shops.len(), 1);
}

#[test]
fn changed_inventory_or_source_rejects_the_review_without_partial_mutation() {
    let (mut snapshot, mut files) = fixture();
    let review = assess(&snapshot, &files).unwrap();
    snapshot.shops[2].inflation = 5;
    let before = snapshot.clone();
    assert!(apply(&mut snapshot, command(review, true)).is_err());
    assert_eq!(snapshot, before);
    files.get_mut("Data SD").unwrap()[0] ^= 1;
    assert!(assess(&snapshot, &files).is_err());
}

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

fn legacy_removal(snapshot: &ProjectSnapshot) -> RepairCommand {
    let assessment = assess(snapshot, &fixture().1).unwrap();
    RepairCommand {
        expected_source_identity: assessment.source_identity,
        expected_previous_version: assessment.previous_version,
        changes: vec![RepairEntry {
            key: "shop:1:quarantine".into(),
            family: "Shops".into(),
            entity: StableId("shop:1".into()),
            field: "inventory interpretation".into(),
            conflict: false,
            change: RepairChange::ShopQuarantine {
                expected: Box::new(snapshot.shops[1].clone()),
                reason: "persisted legacy review".into(),
            },
        }],
    }
}

#[test]
fn assessment_retains_native_rows_and_authored_edits_as_preservation_diagnostics() {
    let (mut snapshot, files) = fixture();
    snapshot.shops[1].authored = true;
    snapshot.shops[1].inflation = 150;
    let before = snapshot.clone();
    let assessment = assess(&snapshot, &files).unwrap();
    assert!(
        assessment
            .entries
            .iter()
            .all(|entry| !matches!(entry.change, RepairChange::ShopQuarantine { .. }))
    );
    assert_eq!(assessment.preservation_diagnostics.len(), 2);
    assert!(
        assessment
            .preservation_diagnostics
            .iter()
            .all(|message| message.contains("separate project"))
    );
    assert_eq!(snapshot, before);
    assert_eq!(
        encode_shops(
            &decode_shops(&files["Data SD"]).records,
            Some(&files["Data SD"])
        )
        .unwrap(),
        files["Data SD"]
    );
}

#[test]
fn persisted_legacy_removal_is_rejected_without_canonical_or_history_mutation() {
    let (mut snapshot, files) = fixture();
    snapshot.shops[1].authored = true;
    snapshot.shops[1].inflation = 150;
    let command = legacy_removal(&snapshot);
    let before = snapshot.clone();
    let mut direct = snapshot.clone();
    assert!(
        apply(&mut direct, command.clone())
            .unwrap_err()
            .contains("cannot be removed")
    );
    assert_eq!(direct, before);
    let mut session = EditorSession::new(snapshot);
    assert!(
        session
            .execute(ExpectedRevisionCommand {
                expected_revision: Revision(0),
                command: EditorCommand::RepairImportedContent(command)
            })
            .is_err()
    );
    assert_eq!(session.snapshot(), &before);
    assert_eq!(session.revision(), Revision(0));
    assert!(session.undo_history().is_empty());
    assert_eq!(files, fixture().1);
}

#[test]
fn omitted_native_rows_are_diagnosed_without_restoring_over_authored_state() {
    let (mut snapshot, files) = fixture();
    snapshot.shops.remove(2);
    snapshot.shops[0].inflation = 77;
    let before = snapshot.clone();
    let assessment = assess(&snapshot, &files).unwrap();
    assert!(assessment.preservation_diagnostics.iter().any(
        |message| message.contains("Shop 2") && message.contains("import preservation defect")
    ));
    assert!(assessment.entries.is_empty());
    assert_eq!(snapshot, before);
    let mut changed_source = files;
    changed_source.get_mut("Data SD").unwrap()[0] ^= 1;
    assert!(assess(&snapshot, &changed_source).is_err());
}

#[test]
fn current_interpretation_still_diagnoses_a_previously_omitted_shop() {
    let (mut snapshot, files) = fixture();
    snapshot.import_interpretation_version = INTERPRETATION_VERSION;
    snapshot.shops.remove(2);
    let assessment = assess(&snapshot, &files).unwrap();
    assert!(assessment.entries.is_empty());
    assert!(
        assessment
            .preservation_diagnostics
            .iter()
            .any(|message| message.contains("Shop 2"))
    );
}

use super::*;
use crate::{codecs::*, model::*};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;

#[test]
fn option_label_edits_record_exact_effective_preimages_without_changing_shop_facts() {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("option-edit".into()));
    let mut original = vec![0; OPTION_LABEL_RECORD_BYTES];
    original[..5].copy_from_slice(&[4, b'G', b'o', 0, b'X']);
    original.extend_from_slice(&[0xde, 0xad]);
    let shop = vec![0; SHOP_RECORD_BYTES];
    let sources: BTreeMap<String, Vec<u8>> = BTreeMap::from([
        ("Data OD".into(), original.clone()),
        ("Data SD".into(), shop.clone()),
    ]);
    snapshot.classic_sources = sources
        .iter()
        .map(|(path, bytes)| ClassicSourceBlob {
            native_path: path.clone(),
            blob: BlobId(format!("sha256:{:x}", Sha256::digest(bytes))),
            byte_length: bytes.len() as u64,
        })
        .collect();
    snapshot.option_labels = decode_option_labels(&original).records;
    snapshot.shops = decode_shops(&shop).records;
    let unchanged = project_rebuilt_v7_effective_records(&snapshot, &sources).unwrap();
    snapshot.option_labels[0].authored = true;
    snapshot.option_labels[0].text = "Changed  ".into();
    let expected = encode_option_labels(&snapshot.option_labels, Some(&original)).unwrap();
    let records = project_rebuilt_v7_effective_records(&snapshot, &sources).unwrap();
    let facts = records
        .sources
        .iter()
        .find(|source| source.native_path == "Data OD")
        .unwrap();
    assert_eq!(facts.sha256, format!("{:x}", Sha256::digest(&original)));
    assert_eq!(
        facts.effective_sha256,
        format!("{:x}", Sha256::digest(&expected))
    );
    assert_ne!(facts.sha256, facts.effective_sha256);
    assert_eq!(facts.edits.len(), 1);
    let edit = &facts.edits[0];
    assert_eq!(
        original[edit.offset..edit.offset + edit.before.len()],
        edit.before
    );
    let mut replay = original.clone();
    replay.splice(
        edit.offset..edit.offset + edit.before.len(),
        edit.after.clone(),
    );
    assert_eq!(replay, expected);
    assert_eq!(&replay[25..], &[0xde, 0xad]);
    assert_eq!(records.shops, unchanged.shops);
    assert_eq!(records.shops.len(), 1);
    assert!(sources["Data SD"].iter().all(|byte| *byte == 0));
}

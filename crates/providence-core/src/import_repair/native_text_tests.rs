use super::*;
use crate::{
    codecs::*,
    model::{BlobId, ClassicSourceBlob, ProjectOrigin, ProjectSnapshot, StableId},
};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;

fn fixture(authored: bool) -> (ProjectSnapshot, BTreeMap<String, Vec<u8>>) {
    let mut bytes = vec![0; SIMPLE_ENCOUNTER_RECORD_BYTES];
    bytes[106..109].copy_from_slice(&[2, 0x8e, b' ']);
    let blob = BlobId(format!("sha256:{:x}", Sha256::digest(&bytes)));
    let mut project = ProjectSnapshot::new_authored(StableId("old-text".into()));
    project.origin = ProjectOrigin::Imported {
        compatibility_annex: blob.clone(),
    };
    project.import_interpretation_version = 2;
    project.classic_sources.push(ClassicSourceBlob {
        native_path: "Data ED".into(),
        blob,
        byte_length: bytes.len() as u64,
    });
    project.simple_encounters = decode_simple_encounters(&bytes).records;
    project.simple_encounters[0].texts[0] = "".into();
    project.simple_encounters[0].authored = authored;
    (project, BTreeMap::from([("Data ED".into(), bytes)]))
}

#[test]
fn untouched_legacy_text_recovers_without_changing_source_or_authored_flag() {
    let (mut project, files) = fixture(false);
    let review = assess(&project, &files).unwrap();
    assert_eq!(review.entries.len(), 1);
    assert!(!review.entries[0].conflict);
    apply(&mut project, review.reviewed_command(&[]).unwrap()).unwrap();
    assert_eq!(project.simple_encounters[0].texts[0], "é ");
    assert!(!project.simple_encounters[0].authored);
    assert_eq!(
        encode_simple_encounters(&project.simple_encounters, Some(&files["Data ED"])).unwrap(),
        files["Data ED"]
    );
    assert!(assess(&project, &files).unwrap().entries.is_empty());
}

#[test]
fn authored_value_matching_lossy_text_is_still_an_explicit_conflict() {
    let (mut project, files) = fixture(true);
    let review = assess(&project, &files).unwrap();
    assert!(review.entries[0].conflict);
    apply(&mut project, review.reviewed_command(&[]).unwrap()).unwrap();
    assert_eq!(project.simple_encounters[0].texts[0], "");
}

#[test]
fn changed_value_is_never_implicitly_recovered() {
    let (mut project, files) = fixture(false);
    project.simple_encounters[0].texts[0] = "Keep this intentional value".into();
    let review = assess(&project, &files).unwrap();
    assert!(review.entries[0].conflict);
    apply(&mut project, review.reviewed_command(&[]).unwrap()).unwrap();
    assert_eq!(
        project.simple_encounters[0].texts[0],
        "Keep this intentional value"
    );
}

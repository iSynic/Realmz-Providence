use super::*;

pub(super) fn caste_table() -> (ProjectSnapshot, Vec<u8>) {
    let mut source = vec![0u8; crate::codecs::CASTE_RECORD_BYTES * 30];
    source[240..248].fill(0xa5);
    source[446..crate::codecs::CASTE_RECORD_BYTES].fill(0xc3);
    source[212..214].copy_from_slice(&7_i16.to_be_bytes());
    let mut snapshot = ProjectSnapshot::new_authored(StableId("scenario-castes".into()));
    let source_blob = BlobId(format!("sha256:{}", "c".repeat(64)));
    snapshot.caste_rules = decode_caste_rules(&source, Some(source_blob.clone())).rules;
    snapshot
        .classic_sources
        .push(crate::model::ClassicSourceBlob {
            native_path: "Data Caste".into(),
            blob: source_blob,
            byte_length: source.len() as u64,
        });
    (snapshot, source)
}

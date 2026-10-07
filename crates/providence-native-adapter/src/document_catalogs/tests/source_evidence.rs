use super::*;
use providence_core::model::ClassicSourceBlob;

#[test]
fn retained_source_evidence_names_registered_geometry_without_raw_bytes() {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("source-evidence".into()));
    snapshot.classic_sources = vec![
        ClassicSourceBlob {
            native_path: "Data SD2".into(),
            blob: BlobId(format!("sha256:{}", "b".repeat(64))),
            byte_length: 512,
        },
        ClassicSourceBlob {
            native_path: "Scenario.rsrc".into(),
            blob: BlobId(format!("sha256:{}", "c".repeat(64))),
            byte_length: 4_096,
        },
    ];
    let session = EditorSession::new(snapshot);

    let listed =
        source_evidence_list(&session, &json!({"limit": 500})).expect("bounded evidence catalog");
    assert_eq!(listed["total"], 2);
    assert_eq!(listed["limit"], 128);
    assert!(listed.get("project").is_none());
    assert!(listed.get("snapshot").is_none());

    let opened = source_evidence_open(&session, &json!({"nativePath": "Data SD2"}))
        .expect("source evidence document");
    assert_eq!(opened["kind"], "record-file");
    assert_eq!(opened["registered"], true);
    assert_eq!(opened["codecDescriptors"][0]["family"], "scenario-messages");
    assert_eq!(opened["codecDescriptors"][0]["recordCount"], 2);
    assert_eq!(opened["rawBytesIncluded"], false);
}

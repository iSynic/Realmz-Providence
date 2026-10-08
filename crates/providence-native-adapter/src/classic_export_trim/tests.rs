use super::*;
use providence_core::{
    codecs::NativeFileFamily,
    compiler::export_trim::RETAINED_EXTRA_CODE_BYTES,
    model::{BlobId, ProjectOrigin, ProjectSnapshot, StableId},
};

fn fixture() -> (EditorSession, NativeManifest, Vec<u8>) {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("trim".into()));
    snapshot.origin = ProjectOrigin::Imported {
        compatibility_annex: BlobId("original".into()),
    };
    let bytes = (0..RETAINED_EXTRA_CODE_BYTES + 21)
        .map(|i| (i % 251) as u8)
        .collect::<Vec<_>>();
    let mut manifest = NativeManifest::default();
    manifest.insert_generated("Data EDCD", NativeFileFamily::ExtraCodes, bytes.clone());
    manifest.insert_preserved("Other", BlobId("other".into()), vec![1, 2, 3]);
    (EditorSession::new(snapshot), manifest, bytes)
}

#[test]
fn default_is_exact_and_selected_export_preserves_every_retained_offset() {
    let (session, mut manifest, original) = fixture();
    let before = manifest.clone();
    let snapshot = session.snapshot().clone();
    let unselected = prepare(&session, &mut manifest, Some(&original), &json!({}), false).unwrap();
    assert_eq!(manifest, before);
    assert_eq!(unselected["preview"]["removableBytes"], 21);
    let planned = prepare(
        &session,
        &mut manifest,
        Some(&original),
        &json!({"trimExtraCodeTail":true}),
        false,
    )
    .unwrap();
    assert_eq!(
        manifest.get("Data EDCD").unwrap().bytes,
        original[..RETAINED_EXTRA_CODE_BYTES]
    );
    assert_eq!(manifest.get("Other"), before.get("Other"));
    assert_ne!(
        manifest.deterministic_sha256(),
        before.deterministic_sha256()
    );
    assert_eq!(session.snapshot(), &snapshot);
    let params = json!({"trimExtraCodeTail":true,"acknowledgeTrim":true,
        "expectedRevision":session.revision().0,"manifestSha256":planned["manifestSha256"]});
    let mut publish = before;
    prepare(&session, &mut publish, Some(&original), &params, true).unwrap();
    assert_eq!(manifest, publish);
    let root = tempfile::tempdir().unwrap();
    let output = root.path().join("Trimmed");
    crate::classic_publication::publish_classic_directory(&output, &publish).unwrap();
    assert_eq!(
        std::fs::read(output.join("Data EDCD")).unwrap(),
        original[..RETAINED_EXTRA_CODE_BYTES]
    );
}

#[test]
fn publish_requires_confirmation_current_revision_and_exact_plan() {
    let (session, manifest, original) = fixture();
    for params in [
        json!({"trimExtraCodeTail":"yes"}),
        json!({"trimExtraCodeTail":true,"expectedRevision":session.revision().0}),
        json!({"trimExtraCodeTail":true,"acknowledgeTrim":true,"expectedRevision":999}),
        json!({"trimExtraCodeTail":true,"acknowledgeTrim":true,"expectedRevision":session.revision().0,"manifestSha256":"stale"}),
    ] {
        assert!(
            prepare(
                &session,
                &mut manifest.clone(),
                Some(&original),
                &params,
                true
            )
            .is_err()
        );
    }
}

#[test]
fn missing_source_authored_projects_and_changed_tail_are_not_trimmed() {
    let (session, mut manifest, original) = fixture();
    let selected = json!({"trimExtraCodeTail":true});
    assert!(prepare(&session, &mut manifest, None, &selected, false).is_err());
    let authored = EditorSession::new(ProjectSnapshot::new_authored(StableId("new".into())));
    assert!(prepare(&authored, &mut manifest, Some(&original), &selected, false).is_err());
    let mut edited = original.clone();
    edited[RETAINED_EXTRA_CODE_BYTES + 1] ^= 1;
    manifest.insert_generated("Data EDCD", NativeFileFamily::ExtraCodes, edited);
    let before = manifest.clone();
    assert!(prepare(&session, &mut manifest, Some(&original), &selected, false).is_err());
    assert_eq!(manifest, before);
}

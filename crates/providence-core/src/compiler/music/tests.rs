use super::*;
use crate::{
    compiler::PreservedCompatibilitySource,
    model::{BlobId, ClassicSourceBlob, StableId},
};

fn imported(bytes: &[u8]) -> ProjectSnapshot {
    let mut project = ProjectSnapshot::new_authored(StableId("quarantined-music".into()));
    project.origin = ProjectOrigin::Imported {
        compatibility_annex: BlobId("sha256:annex".into()),
    };
    project.classic_sources.push(ClassicSourceBlob {
        native_path: "Custom 2 Music".into(),
        blob: BlobId("sha256:music".into()),
        byte_length: bytes.len() as u64,
    });
    project
}

#[test]
fn quarantined_optional_import_is_exact_legacy_output() {
    let bytes = b"unsupported optional tracker payload\0\xff";
    let project = imported(bytes);
    let sources = ClassicCompatibilitySources {
        scenario_music: [
            None,
            Some(PreservedCompatibilitySource {
                blob: &project.classic_sources[0].blob,
                bytes,
            }),
            None,
        ],
        ..Default::default()
    };
    let mut manifest = NativeManifest::default();
    compile(&project, sources, &BTreeMap::new(), &mut manifest).unwrap();
    assert_eq!(manifest.get("Custom 2 Music").unwrap().bytes, bytes);
    assert!(
        compile(
            &project,
            ClassicCompatibilitySources::default(),
            &BTreeMap::new(),
            &mut NativeManifest::default()
        )
        .is_err()
    );
}

#[test]
fn removed_valid_music_does_not_reappear_from_source_evidence() {
    let mut bytes = vec![0; 1084 + 1024];
    bytes[950] = 1;
    bytes[1080..1084].copy_from_slice(b"M.K.");
    let project = imported(&bytes);
    let sources = ClassicCompatibilitySources {
        scenario_music: [
            None,
            Some(PreservedCompatibilitySource {
                blob: &project.classic_sources[0].blob,
                bytes: &bytes,
            }),
            None,
        ],
        ..Default::default()
    };
    let mut manifest = NativeManifest::default();
    compile(&project, sources, &BTreeMap::new(), &mut manifest).unwrap();
    assert!(manifest.get("Custom 2 Music").is_none());
}

#[test]
fn old_quarantined_madg_without_descriptor_is_still_exact_native_output() {
    let bytes = b"MADGopaque original source";
    let project = imported(bytes);
    let sources = ClassicCompatibilitySources {
        scenario_music: [
            None,
            Some(PreservedCompatibilitySource {
                blob: &project.classic_sources[0].blob,
                bytes,
            }),
            None,
        ],
        ..Default::default()
    };
    let mut manifest = NativeManifest::default();
    compile(&project, sources, &BTreeMap::new(), &mut manifest).unwrap();
    assert_eq!(manifest.get("Custom 2 Music").unwrap().bytes, bytes);
}

#[test]
fn opaque_imported_descriptor_exports_exactly_but_fresh_compilation_rejects_it() {
    let bytes = b"MADGopaque original source";
    let mut project = imported(bytes);
    let blob = project.classic_sources[0].blob.clone();
    project
        .assets
        .push(crate::codecs::imported_scenario_music_asset(2, bytes, blob.clone()).unwrap());
    let payloads = BTreeMap::from([(blob.0.clone(), bytes.to_vec())]);
    let mut manifest = NativeManifest::default();
    compile(
        &project,
        ClassicCompatibilitySources::default(),
        &payloads,
        &mut manifest,
    )
    .unwrap();
    assert_eq!(manifest.get("Custom 2 Music").unwrap().bytes, bytes);
    project.origin = ProjectOrigin::Authored;
    let mut fresh = NativeManifest::default();
    assert!(
        compile(
            &project,
            ClassicCompatibilitySources::default(),
            &payloads,
            &mut fresh
        )
        .is_err()
    );
    assert!(fresh.get("Custom 2 Music").is_none());
}

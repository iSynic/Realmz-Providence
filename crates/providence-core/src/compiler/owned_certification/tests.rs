use super::*;
use crate::compiler::NamedCompatibilitySource;
use crate::model::*;

fn fixture(
    backup: Option<Vec<u8>>,
) -> (ProjectSnapshot, NativeManifest, BTreeMap<String, Vec<u8>>) {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("scenario-owned-transitions".into()));
    snapshot.campaign = Some(CampaignMetadata::neutral());
    snapshot.start_location = Some(StartLocation {
        map: StableId("land:0".into()),
        coordinate: MapCoordinate { x: 2, y: 3 },
    });
    let mut startup = vec![0; 316];
    startup.extend_from_slice(&[0xa7, 0xb3]);
    let original = ClassicSourceBlob {
        native_path: "Original Marker".into(),
        blob: BlobId("sha256:original".into()),
        byte_length: startup.len() as u64,
    };
    let backup_source = backup.as_ref().map(|bytes| ClassicSourceBlob {
        native_path: "Data CS".into(),
        blob: BlobId("sha256:backup".into()),
        byte_length: bytes.len() as u64,
    });
    snapshot.classic_sources.push(original.clone());
    if let Some(source) = &backup_source {
        snapshot.classic_sources.push(source.clone());
    }
    snapshot.startup_authoring = Some(ScenarioStartupAuthoring {
        marker_filename: "Runtime Marker".into(),
        original_source: Some(original),
        security: Some(ScenarioSecurityAuthoring {
            segment1: "first".into(),
            segment2: "second".into(),
            backup_source,
            backup_mask: backup
                .as_deref()
                .map(crate::codecs::security_backup_mask)
                .unwrap_or([0; 20]),
            repair_backup: backup.as_ref().is_some_and(|bytes| bytes.len() < 316),
        }),
    });
    let restrictions = vec![0; 320];
    let sources = ClassicCompatibilitySources {
        scenario_startup: Some(NamedCompatibilitySource {
            native_path: "Original Marker",
            bytes: &startup,
        }),
        data_ri: Some(&restrictions),
        data_cs: backup.as_deref(),
        ..Default::default()
    };
    let mut manifest = NativeManifest::default();
    super::super::scenario::compile(&snapshot, sources, &mut manifest).unwrap();
    let mut expected = BTreeMap::from([
        ("Original Marker".into(), startup),
        ("Data RI".into(), restrictions),
    ]);
    if let Some(bytes) = backup {
        expected.insert("Data CS".into(), bytes);
    }
    (snapshot, manifest, expected)
}

#[test]
fn reviewed_rename_and_backup_allocation_have_exact_preservation_boundaries() {
    for backup in [None, Some(vec![0xa7; 32]), Some(vec![0xb3; 325])] {
        let (snapshot, manifest, expected) = fixture(backup.clone());
        let ScenarioBaseline {
            files: baseline,
            transitions,
            startup_path: path,
        } = scenario_baseline(&snapshot, &manifest, &expected, Some("Original Marker")).unwrap();
        assert_eq!(
            transitions.len(),
            if backup.as_ref().is_some_and(|bytes| bytes.len() >= 316) {
                1
            } else {
                2
            }
        );
        let output = &manifest.get("Runtime Marker").unwrap().bytes;
        assert_eq!(&output[316..], &[0xa7, 0xb3]);
        let decoded = crate::codecs::decode_scenario_security(
            output,
            Some(&manifest.get("Data CS").unwrap().bytes),
        )
        .unwrap();
        assert_eq!(decoded, ("first".into(), "second".into()));
        assert!(
            certify_classic_manifest_owned_edits(manifest.clone(), &baseline, path.as_deref())
                .is_ok()
        );
        let mut tampered = manifest.clone();
        let mut bytes = output.clone();
        bytes[316] ^= 1;
        tampered.insert_generated(
            "Runtime Marker",
            NativeFileFamily::ScenarioSecurityStartup,
            bytes,
        );
        assert!(
            certify_classic_manifest_owned_edits(tampered, &baseline, path.as_deref()).is_err()
        );
        let mut tampered = manifest.clone();
        let mut bytes = manifest.get("Data CS").unwrap().bytes.clone();
        bytes[0] ^= 1;
        tampered.insert_generated("Data CS", NativeFileFamily::ScenarioSecurityBackup, bytes);
        assert!(
            scenario_baseline(&snapshot, &tampered, &expected, Some("Original Marker")).is_err()
                || certify_classic_manifest_owned_edits(tampered, &baseline, path.as_deref())
                    .is_err()
        );
    }
}

#[test]
fn unreviewed_creation_and_filename_collision_do_not_bypass_the_file_set_gate() {
    let (mut snapshot, manifest, mut expected) = fixture(None);
    snapshot.startup_authoring.as_mut().unwrap().security = None;
    let ScenarioBaseline {
        files: baseline,
        startup_path: path,
        ..
    } = scenario_baseline(&snapshot, &manifest, &expected, Some("Original Marker")).unwrap();
    assert!(
        certify_classic_manifest_owned_edits(manifest.clone(), &baseline, path.as_deref()).is_err()
    );
    expected.insert("Runtime Marker".into(), vec![0; 316]);
    assert!(scenario_baseline(&snapshot, &manifest, &expected, Some("Original Marker")).is_err());
}

#[test]
fn missing_restrictions_allocate_only_the_registered_canonical_record() {
    let (mut snapshot, _, mut expected) = fixture(Some(vec![0; 316]));
    expected.remove("Data RI");
    snapshot
        .campaign
        .as_mut()
        .unwrap()
        .restrictions
        .max_party_size = 5;
    let startup = expected.get("Original Marker").unwrap();
    let backup = expected.get("Data CS").unwrap();
    let sources = ClassicCompatibilitySources {
        scenario_startup: Some(NamedCompatibilitySource {
            native_path: "Original Marker",
            bytes: startup,
        }),
        data_cs: Some(backup),
        ..Default::default()
    };
    let mut manifest = NativeManifest::default();
    super::super::scenario::compile(&snapshot, sources, &mut manifest).unwrap();
    let ScenarioBaseline {
        files: baseline,
        transitions,
        startup_path: path,
    } = scenario_baseline(&snapshot, &manifest, &expected, Some("Original Marker")).unwrap();
    assert!(
        transitions
            .iter()
            .any(|row| row.to_path == "Data RI" && row.before_bytes == 0 && row.after_bytes == 320)
    );
    assert!(
        certify_classic_manifest_owned_edits(manifest.clone(), &baseline, path.as_deref()).is_ok()
    );
    manifest.insert_generated(
        "Data RI",
        NativeFileFamily::ScenarioRestrictions,
        vec![0; 321],
    );
    assert!(scenario_baseline(&snapshot, &manifest, &expected, Some("Original Marker")).is_err());
}

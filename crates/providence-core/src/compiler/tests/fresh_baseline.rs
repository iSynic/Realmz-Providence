use super::*;

fn authored() -> ProjectSnapshot {
    let mut snapshot = bootstrap_fixtures::contact().0;
    let mut campaign = crate::model::CampaignMetadata::neutral();
    campaign.name = "Scenario Folder".into();
    campaign.recommended_party_levels = 1;
    campaign.maximum_party_levels = 10;
    campaign.guidance_authored = true;
    snapshot.campaign = Some(campaign);
    snapshot.world.maps[0].runtime = Some(
        crate::codecs::decode_land_random_levels(&[0; crate::codecs::RANDOM_LEVEL_RECORD_BYTES])
            .records[0]
            .runtime
            .clone(),
    );
    snapshot.startup_authoring = Some(crate::model::ScenarioStartupAuthoring {
        marker_filename: "Scenario Folder".into(),
        original_source: None,
        security: None,
    });
    snapshot
}

#[test]
fn fresh_scenario_exports_empty_native_families_without_inventing_records() {
    let snapshot = authored();
    let manifest = compile_classic_slice(&snapshot, Default::default()).unwrap();
    assert!(manifest.get("Scenario Folder").is_some());
    for &(path, _, _) in crate::codecs::CLASSIC_SCENARIO_BASELINE_FILES {
        assert!(manifest.get(path).is_some(), "missing {path}");
    }
    assert!(manifest.get("Data ED").unwrap().bytes.is_empty());
    assert!(manifest.get("Data TD3").unwrap().bytes.is_empty());
    assert_eq!(manifest.get("Data Solids").unwrap().bytes, vec![0; 1024]);
    let reopened = reimport_classic_slice(&manifest);
    let mut expected_campaign = snapshot.campaign.clone();
    expected_campaign.as_mut().unwrap().guidance_authored = false;
    assert_eq!(reopened.campaign, expected_campaign);
    assert_eq!(reopened.start_location, snapshot.start_location);
    assert!(reopened.simple_encounters.is_empty());
    assert!(reopened.timed_encounters.is_empty());
    assert_eq!(reopened.maps.len(), 1);
    assert_eq!(
        manifest.get("Data RD").unwrap().bytes.len(),
        crate::codecs::RANDOM_LEVEL_RECORD_BYTES
    );
}

#[test]
fn a_complete_fresh_export_never_fills_missing_map_metadata_with_an_empty_table() {
    let mut snapshot = authored();
    snapshot.world.maps[0].runtime = None;
    let error = compile_classic_slice(&snapshot, Default::default()).unwrap_err();
    assert!(matches!(
        error,
        ClassicSliceCompileError::RandomLevels(
            crate::codecs::RandomLevelCodecError::MissingRuntimeMetadata(_)
        )
    ));
}

#[test]
fn imported_and_partial_compiles_keep_their_original_file_presence() {
    let mut snapshot = authored();
    snapshot.origin = ProjectOrigin::Imported {
        compatibility_annex: BlobId(format!("sha256:{}", "a".repeat(64))),
    };
    let imported = compile_classic_slice(&snapshot, Default::default()).unwrap();
    assert!(imported.get("Data TD3").is_none());
    assert!(imported.get("Data Solids").is_none());
    snapshot.origin = ProjectOrigin::Authored;
    snapshot.startup_authoring = None;
    let partial = compile_classic_slice(&snapshot, Default::default()).unwrap();
    assert!(partial.get("Data TD3").is_none());
    assert!(partial.get("Data Solids").is_none());
}

#[test]
fn a_declared_empty_imported_table_is_retained_without_inventing_a_record() {
    let mut snapshot = authored();
    snapshot.origin = ProjectOrigin::Imported {
        compatibility_annex: BlobId(format!("sha256:{}", "a".repeat(64))),
    };
    let blob = BlobId(format!("sha256:{:x}", Sha256::digest([])));
    snapshot
        .classic_sources
        .push(crate::model::ClassicSourceBlob {
            native_path: "Data TD3".into(),
            blob: blob.clone(),
            byte_length: 0,
        });
    let retained = BTreeMap::from([("Data TD3".into(), vec![])]);
    let manifest = compile_classic_slice(
        &snapshot,
        ClassicCompatibilitySources {
            retained_files: Some(&retained),
            data_td3: Some(&[]),
            ..Default::default()
        },
    )
    .unwrap();
    let table = manifest.get("Data TD3").unwrap();
    assert!(table.bytes.is_empty());
    assert_eq!(table.source, ManifestSource::CompatibilityAnnex { blob });
    assert!(
        reimport_classic_slice(&manifest)
            .timed_encounters
            .is_empty()
    );
}

use super::*;

#[test]
fn assembly_reports_the_first_native_failure_without_mutating_inputs() {
    let mut snapshot = world_fixtures::certification();
    snapshot.world.maps[0].tiles.clear();
    snapshot.messages[0].text = "x".repeat(256);
    let unchanged = snapshot.clone();
    let blob = BlobId("sha256:invalid-support".into());
    let support = [0];
    let sources = ClassicCompatibilitySources {
        scenario_support: Some(PreservedCompatibilitySource {
            blob: &blob,
            bytes: &support,
        }),
        ..Default::default()
    };
    assert!(matches!(
        compile_classic_slice_manifest(&snapshot, sources, &BTreeMap::new()),
        Err(ClassicSliceCompileError::ScenarioSupport(_))
    ));
    assert_eq!(snapshot, unchanged);
    assert_eq!(support, [0]);
    assert!(matches!(
        compile_classic_slice_manifest(
            &snapshot,
            ClassicCompatibilitySources::default(),
            &BTreeMap::new()
        ),
        Err(ClassicSliceCompileError::World(_))
    ));
    snapshot.world.maps.clear();
    snapshot.world.action_points.clear();
    assert!(matches!(
        compile_classic_slice_manifest(
            &snapshot,
            ClassicCompatibilitySources::default(),
            &BTreeMap::new()
        ),
        Err(ClassicSliceCompileError::Messages(_))
    ));
}

#[test]
fn manifest_order_and_digest_do_not_depend_on_insertion_order() {
    let mut first = NativeManifest::default();
    first.insert_generated("z-last", NativeFileFamily::ScenarioMessages, vec![9]);
    first.insert_generated("Data SD2", NativeFileFamily::ScenarioMessages, vec![2]);

    let mut second = NativeManifest::default();
    second.insert_generated("Data SD2", NativeFileFamily::ScenarioMessages, vec![2]);
    second.insert_generated("z-last", NativeFileFamily::ScenarioMessages, vec![9]);

    assert_eq!(
        first.files().map(|(path, _)| path).collect::<Vec<_>>(),
        vec!["Data SD2", "z-last"]
    );
    assert_eq!(first.deterministic_sha256(), second.deterministic_sha256());
}

#[test]
fn generated_semantics_overlay_preserved_compatibility_bytes() {
    let mut manifest = NativeManifest::default();
    manifest.insert_preserved("Data SD2", BlobId("sha256:legacy".into()), vec![0xa5]);
    manifest.insert_generated(
        "Data SD2",
        NativeFileFamily::ScenarioMessages,
        vec![0x01, b'X'],
    );

    let (_, entry) = manifest.files().next().expect("manifest entry");
    assert_eq!(entry.bytes, vec![0x01, b'X']);
    assert!(matches!(entry.source, ManifestSource::Generated { .. }));
}

#[test]
fn certification_compile_refuses_an_incomplete_target() {
    let snapshot = ProjectSnapshot::new_authored(StableId("empty".into()));
    let error = compile_classic_slice(&snapshot, ClassicCompatibilitySources::default())
        .expect_err("empty target must not be presented as a successful compile");
    assert!(matches!(
        error,
        ClassicSliceCompileError::Compatibility(codes)
            if codes == vec!["classic.slice.empty"]
    ));
}

#[test]
fn no_edit_certification_reconstructs_exact_bytes_without_waiving_publish_readiness() {
    let mut data_ld = vec![0; CLASSIC_MAP_SIZE * CLASSIC_MAP_SIZE * 2];
    data_ld[0..2].copy_from_slice(&(-1091_i16).to_be_bytes());
    let data_dd = vec![0; crate::codecs::ACTION_POINT_LEVEL_BYTES];
    let mut snapshot = ProjectSnapshot::new_authored(StableId("no-edit-probe".into()));
    let mut tiles = vec![0; CLASSIC_MAP_SIZE * CLASSIC_MAP_SIZE];
    tiles[0] = -1091;
    snapshot.world.maps.push(MapLevel {
        identity: StableId("land:0".into()),
        level_type: LevelType::Land,
        native_index: 0,
        name: "Unresolved legacy overlay".into(),
        tiles,
        runtime: None,
    });
    let sources = ClassicCompatibilitySources {
        data_ld: Some(&data_ld),
        data_dd: Some(&data_dd),
        ..Default::default()
    };
    assert!(matches!(
        compile_classic_slice(&snapshot, sources),
        Err(ClassicSliceCompileError::Compatibility(_))
    ));

    let expected = BTreeMap::from([
        ("Data DD".to_string(), data_dd.clone()),
        ("Data LD".to_string(), data_ld.clone()),
    ]);
    let manifest = certify_classic_no_edit_manifest_with_asset_payloads(
        &snapshot,
        sources,
        &BTreeMap::new(),
        &expected,
    )
    .expect("source-exact no-edit reconstruction");
    assert_eq!(manifest.files().len(), 2);

    snapshot.world.maps[0].tiles[0] = 0;
    assert!(matches!(
        certify_classic_no_edit_manifest_with_asset_payloads(
            &snapshot,
            sources,
            &BTreeMap::new(),
            &expected,
        ),
        Err(ClassicNoEditCertificationError::ByteDifferences(paths))
            if paths == vec!["Data LD"]
    ));
}

#[test]
fn owned_edit_certification_accepts_only_registered_fixed_record_bytes() {
    let mut data_ld = vec![0; CLASSIC_MAP_SIZE * CLASSIC_MAP_SIZE * 2];
    data_ld[0..2].copy_from_slice(&(-1091_i16).to_be_bytes());
    let data_dd = vec![0; crate::codecs::ACTION_POINT_LEVEL_BYTES];
    let mut snapshot = ProjectSnapshot::new_authored(StableId("owned-edit-probe".into()));
    let mut tiles = vec![0; CLASSIC_MAP_SIZE * CLASSIC_MAP_SIZE];
    tiles[0] = -1090;
    snapshot.world.maps.push(MapLevel {
        identity: StableId("land:0".into()),
        level_type: LevelType::Land,
        native_index: 0,
        name: "Edited unresolved legacy overlay".into(),
        tiles,
        runtime: None,
    });
    let sources = ClassicCompatibilitySources {
        data_ld: Some(&data_ld),
        data_dd: Some(&data_dd),
        ..Default::default()
    };
    assert!(matches!(
        compile_classic_slice(&snapshot, sources),
        Err(ClassicSliceCompileError::Compatibility(_))
    ));
    let expected = BTreeMap::from([
        ("Data DD".to_string(), data_dd.clone()),
        ("Data LD".to_string(), data_ld.clone()),
    ]);

    let certification = certify_classic_owned_edit_manifest_with_asset_payloads(
        &snapshot,
        sources,
        &BTreeMap::new(),
        &expected,
    )
    .expect("one fixed-record edit remains within Data LD ownership");
    assert_eq!(certification.exact_file_count, 1);
    assert_eq!(certification.changed_files.len(), 1);
    assert_eq!(
        certification.changed_files[0].family,
        NativeFileFamily::LandMaps
    );
    assert!(certification.changed_files[0].within_declared_ownership);
}

#[test]
fn owned_edit_certification_rejects_unowned_or_unregistered_bytes() {
    let mut unowned_manifest = NativeManifest::default();
    let mut changed_random_level = vec![0; crate::codecs::RANDOM_LEVEL_RECORD_BYTES];
    changed_random_level[crate::codecs::RANDOM_LEVEL_PADDING_OFFSET] = 1;
    unowned_manifest.insert_generated(
        "Data RD",
        NativeFileFamily::LandRandomLevels,
        changed_random_level,
    );
    let expected_random_level = BTreeMap::from([(
        "Data RD".to_string(),
        vec![0; crate::codecs::RANDOM_LEVEL_RECORD_BYTES],
    )]);
    assert!(matches!(
        certify_classic_manifest_owned_edits(
            unowned_manifest,
            &expected_random_level,
            None
        ),
        Err(ClassicOwnedEditCertificationError::OutsideDeclaredOwnership(paths))
            if paths == vec!["Data RD"]
    ));

    let mut unknown_manifest = NativeManifest::default();
    unknown_manifest.insert_preserved("Data NI.rsrc", BlobId("unknown-resource".into()), vec![1]);
    let expected_unknown = BTreeMap::from([("Data NI.rsrc".to_string(), vec![0])]);
    assert!(matches!(
        certify_classic_manifest_owned_edits(unknown_manifest, &expected_unknown, None),
        Err(ClassicOwnedEditCertificationError::UnregisteredChangedFiles(paths))
            if paths == vec!["Data NI.rsrc"]
    ));
}

#[test]
fn compatibility_error_groups_repeated_codes() {
    let error = ClassicSliceCompileError::Compatibility(vec![
        "reference.unresolved".into(),
        "classic.invalid".into(),
        "reference.unresolved".into(),
    ]);

    assert_eq!(
        error.to_string(),
        "Classic certification compile is blocked: classic.invalid, reference.unresolved (2)"
    );
}

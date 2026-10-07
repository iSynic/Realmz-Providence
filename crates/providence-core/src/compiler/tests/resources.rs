use super::*;

#[test]
fn classic_compiler_accepts_only_catalog_verified_application_media_fallbacks() {
    let (snapshot, application) = resources_fixtures::application_special_land();

    assert!(matches!(
        compile_classic_slice(&snapshot, ClassicCompatibilitySources::default()),
        Err(ClassicSliceCompileError::Compatibility(_))
    ));
    let manifest = compile_classic_slice_with_application_and_asset_payloads(
        &snapshot,
        ClassicCompatibilitySources::default(),
        &BTreeMap::new(),
        Some(&application),
    )
    .expect("validated application fallback");

    assert_eq!(
        manifest.get("Data LD").expect("Data LD").bytes[0..2],
        (-1091_i16).to_be_bytes()
    );
    assert_eq!(manifest.files().len(), 2);
    assert!(manifest.get("Data DD").is_some());
}

#[test]
fn declared_resource_removal_is_the_only_scenario_resource_change() {
    let scenario_resources = resources_fixtures::removable_icons();

    let mut snapshot = ProjectSnapshot::new_authored(StableId("resource-removal".into()));
    snapshot.classic_resource_removals.extend([
        ClassicResourceKey {
            resource_type: "cicn".into(),
            resource_id: 392,
        },
        ClassicResourceKey {
            resource_type: "cicn".into(),
            resource_id: 700,
        },
    ]);
    let sources = ClassicCompatibilitySources {
        scenario_resources: Some(&scenario_resources),
        ..Default::default()
    };

    let first = compile_classic_slice_manifest(&snapshot, sources, &BTreeMap::new())
        .expect("compile removal");
    let second = compile_classic_slice_manifest(&snapshot, sources, &BTreeMap::new())
        .expect("repeat removal");
    assert_eq!(first, second);
    let output = &first.get("Scenario.rsrc").unwrap().bytes;
    let entries = crate::codecs::parse_resource_entries(output).unwrap();
    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0].resource_type, *b"TEXT");
    assert_eq!(entries[0].id, 42);
    assert_eq!(entries[0].name, "Evidence");
    assert_eq!(entries[0].attributes, 3);
    assert_eq!(entries[0].data, b"preserve me");
    let owned = BTreeSet::from([
        ResourceIdentity {
            resource_type: *b"cicn",
            id: 392,
        },
        ResourceIdentity {
            resource_type: *b"cicn",
            id: 700,
        },
    ]);
    let report =
        crate::codecs::inspect_resource_fork_diff(&scenario_resources, output, &owned).unwrap();
    assert_eq!(report.changed_resource_count, 2);
    assert_eq!(report.unexpected_change_count, 0);
    assert!(report.within_declared_ownership);
}

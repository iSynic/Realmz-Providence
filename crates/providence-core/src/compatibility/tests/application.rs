use super::*;

#[test]
fn application_catalog_satisfies_appearance_without_becoming_project_assets() {
    let snapshot = slice_snapshot(47);
    let without = classify_rebuilt_v3(&snapshot)
        .blockers
        .into_iter()
        .map(|blocker| blocker.code)
        .collect::<std::collections::BTreeSet<_>>();
    let with = classify_rebuilt_v3_with_application(&snapshot, &application_appearance_catalog())
        .blockers
        .into_iter()
        .map(|blocker| blocker.code)
        .collect::<std::collections::BTreeSet<_>>();
    assert!(without.contains("rebuilt.asset-index.unavailable"));
    assert!(!with.contains("rebuilt.asset-index.unavailable"));
    assert!(!with.contains("rebuilt.asset-index.appearance-catalog"));
    assert!(snapshot.assets.is_empty());
}

#[test]
fn application_backed_rebuilt_readiness_does_not_promote_the_generic_reference_graph() {
    let mut snapshot = slice_snapshot(47);
    snapshot.message_references.push(MessageReference {
        source: StableId("legacy-evidence-only-reference".into()),
        field: "message".into(),
        target_native_id: NativeRecordId(999),
        required: true,
    });

    assert!(
        classify_rebuilt_v3(&snapshot)
            .blockers
            .iter()
            .any(|blocker| blocker.code == "reference.unresolved")
    );
    assert!(
        classify_rebuilt_v3_with_application(&snapshot, &application_appearance_catalog())
            .blockers
            .iter()
            .all(|blocker| blocker.code != "reference.unresolved")
    );
}

#[test]
fn application_backed_rebuilt_readiness_does_not_veto_unreachable_catalog_records() {
    let mut snapshot = slice_snapshot(47);
    snapshot.monster_sets.push(MonsterSet {
        set_id: 99,
        native_path: "Data MD99".into(),
        monsters: Vec::new(),
    });

    assert!(
        classify_rebuilt_v3(&snapshot)
            .blockers
            .iter()
            .any(|blocker| blocker.code == "rebuilt.monsters.invalid")
    );
    assert!(
        classify_rebuilt_v3_with_application(&snapshot, &application_appearance_catalog())
            .blockers
            .iter()
            .all(|blocker| blocker.code != "rebuilt.monsters.invalid")
    );
}

#[test]
fn application_catalog_resolves_exact_missing_media_without_entering_project_truth() {
    let mut snapshot = slice_snapshot(47);
    snapshot.world.maps[0].tiles[0] = -1091;
    let source = StableId("classic-application:appearance".into());
    let special_land_resource = ClassicResourceKey {
        resource_type: "cicn".into(),
        resource_id: -91,
    };
    let mut catalog = application_appearance_catalog();
    catalog.assets.push(application_special_land_asset(
        source.clone(),
        special_land_resource.clone(),
    ));

    assert_eq!(reference_blockers(&snapshot, None).len(), 1);
    assert!(reference_blockers(&snapshot, Some(&catalog)).is_empty());
    assert_eq!(
        classify_classic_slice(&snapshot).status,
        CompatibilityStatus::Blocked
    );
    assert_eq!(
        classify_classic_slice_with_application(&snapshot, &catalog).status,
        CompatibilityStatus::Ready
    );
    assert!(snapshot.assets.is_empty());

    catalog
        .ambiguous_resources
        .push(crate::rebuilt::ApplicationMediaAmbiguity {
            source,
            source_priority: 0,
            resource: special_land_resource,
            occurrences: 2,
        });
    assert_eq!(reference_blockers(&snapshot, Some(&catalog)).len(), 1);
    assert_eq!(
        classify_classic_slice_with_application(&snapshot, &catalog).status,
        CompatibilityStatus::Blocked
    );
}

#[test]
fn declared_stock_fallback_is_not_an_unresolved_reference_blocker() {
    let mut snapshot = slice_snapshot(47);
    snapshot.world.maps[0].runtime = Some(MapRuntimeMetadata {
        source: "Data RD".into(),
        source_blob: None,
        dark: false,
        uses_los: false,
        landlook: Some(0),
        base_scale: None,
        tileset_id: StableId("classic.landlook.0".into()),
        base_tile: None,
        random_rectangles: vec![RandomRectangle {
            identity: StableId("land:0:rect:0".into()),
            top: 1,
            left: 1,
            bottom: 2,
            right: 2,
            chance_ten_thousand: 100,
            battle_range: [0, 0],
            random_doors: [0; 3],
            random_door_percent: [0; 3],
            only: false,
            option: 0,
            sound_id: -82,
            text_id: 0,
        }],
    });

    let classification = classify_classic_slice(&snapshot);
    assert_eq!(classification.status, CompatibilityStatus::Ready);
    assert!(classification.blockers.is_empty());
}

#[test]
fn player_marker_resolution_accepts_portraits_but_monster_icons_require_icon_assets() {
    let mut catalog = application_appearance_catalog();
    let mut icon = application_special_land_asset(
        catalog.assets[0].source.clone(),
        ClassicResourceKey {
            resource_type: "cicn".into(),
            resource_id: 138,
        },
    );
    icon.descriptor.identity = StableId("application:icon:138".into());
    icon.descriptor.label = "Application Icon 138".into();
    icon.descriptor.kind = "portrait".into();
    catalog.assets.push(icon);
    let icon_reference = media_fixtures::party_marker_reference();
    assert!(reference_is_resolved_by_application(
        &icon_reference,
        Some(&catalog)
    ));
    let mut non_player_map_icon = icon_reference.clone();
    non_player_map_icon.source = StableId("monster:0".into());
    assert!(!reference_is_resolved_by_application(
        &non_player_map_icon,
        Some(&catalog)
    ));
}

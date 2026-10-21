use super::*;

#[test]
fn sparse_native_tables_survive_full_import_reopen_and_selected_package_finalization() {
    for count in [0, 2] {
        let root = tempfile::tempdir().unwrap();
        let (store, mut session, source) = complete_import(root.path());
        let package = application_package(root.path(), session.snapshot());
        let races = vec![0; count * RACE_RECORD_BYTES + 56];
        let castes = vec![0; count * CASTE_RECORD_BYTES + 13];
        fs::write(source.join("Data Race"), &races).unwrap();
        fs::write(source.join("Data Caste"), &castes).unwrap();
        let application =
            Path::new(env!("CARGO_MANIFEST_DIR")).join("../../godot/bundled/realmz-reference");
        request(
            &mut session,
            &store,
            "project.import-classic-scenario",
            json!({"directory":source,"applicationDataDirectory":application}),
        );
        assert_eq!(
            (
                session.snapshot().race_rules.len(),
                session.snapshot().caste_rules.len()
            ),
            (count, count)
        );
        let (_, mut reopened) = ProjectStore::open_session(store.root()).unwrap();
        let (preview, _) = selection_and_readiness(&mut reopened, &store, &package);
        assert_eq!(preview["ready"], true, "{preview}");
        supply_catalog(&reopened, &store, &package);
        let path = root.path().join("sparse.realmz2");
        let revision = reopened.revision();
        dispatch_result_with_store(&mut reopened, Some(&store), "project.compile-rebuilt-package",
            json!({"path":path,"minimumEngineVersion":"0.1.0","packageFinalization":package,"expectedRevision":revision})).unwrap();
        let inspected = providence_rebuilt_package::inspect_rebuilt_v3_archive(Cursor::new(
            fs::read(path).unwrap(),
        ))
        .unwrap();
        assert_sparse_content(inspected.content, count);
        assert_eq!(fs::read(source.join("Data Race")).unwrap(), races);
        assert_eq!(fs::read(source.join("Data Caste")).unwrap(), castes);
    }
}

#[test]
fn selected_native_export_binds_original_context_through_application_finalization() {
    let root = tempfile::tempdir().unwrap();
    let (store, mut session, _) = complete_import(root.path());
    let package = application_package(root.path(), session.snapshot());
    let (preview, _) = selection_and_readiness(&mut session, &store, &package);
    assert_eq!(preview["ready"], true, "{preview}");
    supply_catalog(&session, &store, &package);
    let original = session.snapshot().clone();
    let path = root.path().join("selected.realmz2");
    let revision = session.revision();
    dispatch_result_with_store(
        &mut session,
        Some(&store),
        "project.compile-rebuilt-package",
        json!({"path":path,"minimumEngineVersion":"0.1.0","packageFinalization":package,"expectedRevision":revision}),
    )
    .unwrap();
    let inspected = providence_rebuilt_package::inspect_rebuilt_v3_archive(Cursor::new(
        fs::read(path).unwrap(),
    ))
    .unwrap();
    let selection = inspected
        .content
        .classic_records
        .unwrap()
        .rule_selection
        .unwrap();
    assert_eq!(selection.native_menu_selection, 20);
    assert_eq!(
        selection.captured_source_set_sha256,
        classic_source_set_sha256(&original).unwrap()
    );
    assert_eq!(selection.projected_rules.races.len(), 30);
    assert_eq!(selection.projected_rules.castes.len(), 30);
    assert_eq!(*session.snapshot(), original);
}

fn supply_catalog(session: &EditorSession, store: &ProjectStore, package: &Value) {
    use providence_core::rebuilt::*;
    let options = serde_json::from_value(package.clone()).unwrap();
    let path = package["applicationMediaCatalogPath"].as_str().unwrap();
    let mut catalog: ApplicationMediaCatalog =
        serde_json::from_slice(&fs::read(path).unwrap()).unwrap();
    let selected =
        crate::classic_rule_selection::prepare(session, store, Some(&catalog), Some(&options))
            .unwrap()
            .unwrap();
    let snapshot = &selected.effective_snapshot;
    let runtime = project_rebuilt_v3_runtime(snapshot).unwrap();
    let references = derive_rebuilt_v3_reachable_media_references(
        snapshot,
        &runtime.scenario,
        &runtime.item_spells.items,
        &runtime.item_spells.spells,
        runtime.combat.all_monsters(),
        &runtime.rogue_encounters,
        !runtime.combat.battles.is_empty(),
    );
    let source = StableId("fixture:application-media".into());
    catalog.sources.push(ApplicationMediaSource {
        identity: source.clone(),
        native_name: "generated fixture".into(),
        priority: 0,
        blob: BlobId(format!("sha256:{}", "a".repeat(64))),
        byte_length: 1,
    });
    let mut resources = std::collections::BTreeMap::new();
    for reference in references {
        if reference.requirement != RebuiltV3MediaRequirement::PackageRequired
            && let Some(resource) = reference.classic_resource
        {
            resources
                .entry(resource)
                .or_insert(reference.expected_asset_kind);
        }
    }
    catalog.assets = resources
        .into_iter()
        .map(|(resource, kind)| ApplicationMediaAsset {
            source: source.clone(),
            source_priority: 0,
            descriptor: descriptor(resource, kind),
        })
        .collect();
    fs::write(path, serde_json::to_vec(&catalog).unwrap()).unwrap();
    let application = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../godot/bundled/realmz-reference/Data Caste");
    fs::copy(
        application,
        Path::new(package["classicApplicationDataDirectory"].as_str().unwrap()).join("Data Caste"),
    )
    .unwrap();
}

fn descriptor(resource: ClassicResourceKey, kind: Option<String>) -> AssetDescriptor {
    let kind = if resource.resource_type == "PICT" && resource.resource_id == 302 {
        "tileset".into()
    } else {
        kind.unwrap_or_else(|| {
            match resource.resource_type.as_str() {
                "snd " => "sound",
                "PICT" => "picture",
                "TEXT" => "text",
                _ => "icon",
            }
            .into()
        })
    };
    let size = if resource.resource_type == "PICT" {
        640
    } else {
        32
    };
    serde_json::from_value(json!({
        "identity":format!("fixture:{}:{}",resource.resource_type,resource.resource_id),
        "label":"Generated application metadata fixture","kind":kind,"classicResource":resource,
        "blob":format!("sha256:{}","b".repeat(64)),"byteLength":1,"source":"controlled metadata fixture",
        "extension":"png","mimeType":"image/png","width":size,"height":size,
        "tileWidth":32,"tileHeight":32,"columns":size/32,"rows":size/32,
    })).unwrap()
}

fn assert_sparse_content(
    content: providence_core::rebuilt::RebuiltV3ContentDocument,
    count: usize,
) {
    assert_eq!((content.races.len(), content.castes.len()), (count, count));
    let facts = content.classic_records.unwrap();
    assert_eq!((facts.races.len(), facts.castes.len()), (count, count));
    assert!(
        facts
            .sources
            .iter()
            .filter(|row| matches!(row.native_path.as_str(), "Data Race" | "Data Caste"))
            .all(|row| row.edits.is_empty())
    );
    let selected = facts.rule_selection.unwrap();
    assert_eq!(
        selected
            .projected_rules
            .races
            .iter()
            .filter(|row| row.sha256.is_some())
            .count(),
        count
    );
    assert_eq!(
        selected
            .projected_rules
            .castes
            .iter()
            .filter(|row| row.sha256.is_some())
            .count(),
        count
    );
}

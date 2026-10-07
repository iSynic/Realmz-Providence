use super::*;

#[test]
fn version_thirty_seven_preserves_authored_state_and_requires_source_interpretation_review() {
    let temporary = tempfile::tempdir().unwrap();
    let project = snapshot("Authored value survives migration");
    let store = ProjectStore::create(temporary.path(), &project).unwrap();
    let mut manifest = store
        .portable_snapshot_manifest(&fs::read(store.snapshot_path()).unwrap())
        .unwrap()
        .unwrap();
    manifest.snapshot_format_version = 37;
    manifest.segments.remove("importInterpretationVersion");
    manifest
        .segments
        .insert("formatVersion".into(), store.put_blob(b"37").unwrap());
    fs::write(
        store.snapshot_path(),
        serde_json::to_vec(&manifest).unwrap(),
    )
    .unwrap();
    let (_, migrated) = ProjectStore::open(temporary.path()).unwrap();
    assert_eq!(migrated.messages, project.messages);
    assert_eq!(migrated.import_interpretation_version, 0);
    assert_eq!(migrated.format_version, SNAPSHOT_FORMAT_VERSION);
}

#[test]
fn version_thirty_one_segmented_snapshot_reopens_without_inventing_quest_labels() {
    let temporary = tempfile::tempdir().expect("temporary project");
    let project = snapshot("Legacy segmented snapshot");
    let store = ProjectStore::create(temporary.path(), &project).expect("create store");
    let bytes = fs::read(store.snapshot_path()).expect("read manifest");
    let mut manifest = store
        .portable_snapshot_manifest(&bytes)
        .expect("parse manifest")
        .expect("segmented manifest");
    manifest.snapshot_format_version = PRE_QUEST_LABEL_SNAPSHOT_FORMAT_VERSION;
    manifest.segments.remove("questLabels");
    manifest.segments.remove("classicResourceRemovals");
    manifest.segments.remove("scriptDescriptors");
    manifest.segments.remove("startupAuthoring");
    manifest.segments.remove("classicRuleSelection");
    manifest.segments.remove("terrainMappings");
    manifest.segments.remove("importInterpretationVersion");
    manifest
        .segments
        .insert("formatVersion".into(), store.put_blob(b"31").unwrap());
    fs::write(
        store.snapshot_path(),
        serde_json::to_vec_pretty(&manifest).unwrap(),
    )
    .expect("write legacy manifest");

    let (_reopened, migrated) =
        ProjectStore::open(temporary.path()).expect("migrate segmented v31");
    assert_eq!(migrated.format_version, SNAPSHOT_FORMAT_VERSION);
    assert!(migrated.quest_labels.is_empty());
}

#[test]
fn version_thirty_one_history_reuses_the_migrated_base_snapshot() {
    let temporary = tempfile::tempdir().expect("temporary project");
    let current = snapshot("Current message");
    let store = ProjectStore::create(temporary.path(), &current).expect("create store");
    let bytes = fs::read(store.snapshot_path()).expect("read current manifest");
    let mut base_manifest = store
        .portable_snapshot_manifest(&bytes)
        .expect("parse current manifest")
        .expect("segmented current manifest");
    base_manifest.snapshot_format_version = PRE_QUEST_LABEL_SNAPSHOT_FORMAT_VERSION;
    base_manifest.segments.remove("questLabels");
    base_manifest.segments.remove("classicResourceRemovals");
    base_manifest.segments.remove("scriptDescriptors");
    base_manifest.segments.remove("startupAuthoring");
    base_manifest.segments.remove("classicRuleSelection");
    base_manifest.segments.remove("terrainMappings");
    base_manifest.segments.remove("importInterpretationVersion");
    base_manifest
        .segments
        .insert("formatVersion".into(), store.put_blob(b"31").unwrap());

    let mut history_manifest = base_manifest.clone();
    let previous_messages = snapshot("Previous message").messages;
    history_manifest.segments.insert(
        "messages".into(),
        store
            .put_blob(&serde_json::to_vec(&previous_messages).unwrap())
            .unwrap(),
    );

    let reconstructed = store
        .load_segmented_snapshot_from_base(&history_manifest, &base_manifest, &current)
        .expect("reconstruct history from migrated base");
    let fully_loaded = store
        .load_segmented_snapshot(&history_manifest)
        .expect("load every legacy history segment");
    assert_eq!(reconstructed, fully_loaded);
    assert_eq!(reconstructed.format_version, SNAPSHOT_FORMAT_VERSION);
    assert_eq!(reconstructed.messages[0].text, "Previous message");
    assert!(reconstructed.quest_labels.is_empty());
    assert!(reconstructed.classic_resource_removals.is_empty());
}

#[test]
fn version_thirty_two_segmented_snapshot_reopens_without_inventing_resource_removals() {
    let temporary = tempfile::tempdir().expect("temporary project");
    let project = snapshot("Legacy segmented snapshot");
    let store = ProjectStore::create(temporary.path(), &project).expect("create store");
    let bytes = fs::read(store.snapshot_path()).expect("read manifest");
    let mut manifest = store
        .portable_snapshot_manifest(&bytes)
        .expect("parse manifest")
        .expect("segmented manifest");
    manifest.snapshot_format_version = PRE_CLASSIC_RESOURCE_REMOVALS_SNAPSHOT_FORMAT_VERSION;
    manifest.segments.remove("classicResourceRemovals");
    manifest.segments.remove("scriptDescriptors");
    manifest.segments.remove("startupAuthoring");
    manifest.segments.remove("classicRuleSelection");
    manifest.segments.remove("terrainMappings");
    manifest.segments.remove("importInterpretationVersion");
    manifest
        .segments
        .insert("formatVersion".into(), store.put_blob(b"32").unwrap());
    fs::write(
        store.snapshot_path(),
        serde_json::to_vec_pretty(&manifest).unwrap(),
    )
    .expect("write legacy manifest");

    let (_reopened, migrated) =
        ProjectStore::open(temporary.path()).expect("migrate segmented v32");
    assert_eq!(migrated.format_version, SNAPSHOT_FORMAT_VERSION);
    assert!(migrated.classic_resource_removals.is_empty());
}

#[test]
fn version_thirty_three_segmented_snapshot_reopens_without_inventing_script_descriptors() {
    let temporary = tempfile::tempdir().expect("temporary project");
    let mut project = snapshot("Legacy segmented snapshot");
    project
        .script_descriptors
        .push(providence_core::model::ScriptDescriptor {
            source: StableId("extra-action-point:17".into()),
            text: "Moon Gate battle".into(),
        });
    let store = ProjectStore::create(temporary.path(), &project).expect("create store");
    let bytes = fs::read(store.snapshot_path()).expect("read manifest");
    let mut manifest = store
        .portable_snapshot_manifest(&bytes)
        .expect("parse manifest")
        .expect("segmented manifest");
    manifest.snapshot_format_version = PRE_SCRIPT_DESCRIPTOR_SNAPSHOT_FORMAT_VERSION;
    manifest.segments.remove("scriptDescriptors");
    manifest.segments.remove("startupAuthoring");
    manifest.segments.remove("classicRuleSelection");
    manifest.segments.remove("terrainMappings");
    manifest.segments.remove("importInterpretationVersion");
    manifest
        .segments
        .insert("formatVersion".into(), store.put_blob(b"33").unwrap());
    fs::write(
        store.snapshot_path(),
        serde_json::to_vec_pretty(&manifest).unwrap(),
    )
    .expect("write legacy manifest");

    let (_reopened, migrated) =
        ProjectStore::open(temporary.path()).expect("migrate segmented v33");
    assert_eq!(migrated.format_version, SNAPSHOT_FORMAT_VERSION);
    assert!(migrated.script_descriptors.is_empty());
}

#[test]
fn version_thirty_four_migration_preserves_descriptors_and_exact_original_startup() {
    let temporary = tempfile::tempdir().unwrap();
    let mut project = snapshot("Version 34");
    project.campaign = Some(providence_core::model::CampaignMetadata::neutral());
    project
        .script_descriptors
        .push(providence_core::model::ScriptDescriptor {
            source: StableId("extra-action-point:17".into()),
            text: "Gate".into(),
        });
    let store = ProjectStore::create(temporary.path(), &project).unwrap();
    let source = providence_core::model::ClassicSourceBlob {
        native_path: "Untitled scenario".into(),
        blob: store.put_blob(&[0; 316]).unwrap(),
        byte_length: 316,
    };
    project.classic_sources.push(source.clone());
    store.save_snapshot(&project).unwrap();
    let bytes = fs::read(store.snapshot_path()).unwrap();
    let mut manifest = store.portable_snapshot_manifest(&bytes).unwrap().unwrap();
    manifest.snapshot_format_version = PRE_STARTUP_AUTHORING_SNAPSHOT_FORMAT_VERSION;
    manifest.segments.remove("startupAuthoring");
    manifest.segments.remove("classicRuleSelection");
    manifest.segments.remove("terrainMappings");
    manifest.segments.remove("importInterpretationVersion");
    manifest
        .segments
        .insert("formatVersion".into(), store.put_blob(b"34").unwrap());
    fs::write(
        store.snapshot_path(),
        serde_json::to_vec_pretty(&manifest).unwrap(),
    )
    .unwrap();
    let (_, migrated) = ProjectStore::open(temporary.path()).unwrap();
    assert_eq!(migrated.script_descriptors, project.script_descriptors);
    assert_eq!(migrated.classic_sources, project.classic_sources);
    let metadata = migrated.startup_authoring.unwrap();
    assert_eq!(metadata.original_source, Some(source));
    assert_eq!(metadata.marker_filename, "Untitled scenario");
    assert!(metadata.security.is_none());
}

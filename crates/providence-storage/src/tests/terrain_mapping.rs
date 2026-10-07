use super::*;

#[test]
fn invalid_terrain_mapping_cannot_replace_a_saved_project() {
    use providence_core::model::{StableId, TerrainMapping};
    let temporary = tempfile::tempdir().unwrap();
    let mut project = snapshot("Mapping validation");
    let store = ProjectStore::create(temporary.path(), &project).unwrap();
    let before = store.load_snapshot().unwrap();
    project.terrain_mappings.push(TerrainMapping {
        tileset_id: StableId("tileset".into()),
        asset_identity: StableId("artwork".into()),
        scenario_owned: true,
        revision: 1,
        layout_identity: "classic-plains".into(),
        layout_revision: 1,
        accepted_tile_fingerprints: vec!["invalid".into(); 200],
        reviewed_families: Default::default(),
        excluded_tiles: Default::default(),
        tile_labels: Default::default(),
        category_labels: Default::default(),
    });
    assert!(store.save_snapshot(&project).is_err());
    assert_eq!(store.load_snapshot().unwrap(), before);
    let bytes = fs::read(store.snapshot_path()).unwrap();
    let base = store.portable_snapshot_manifest(&bytes).unwrap().unwrap();
    let mut corrupt = base.clone();
    corrupt.segments.insert(
        "terrainMappings".into(),
        store
            .put_blob(&serde_json::to_vec(&project.terrain_mappings).unwrap())
            .unwrap(),
    );
    assert!(
        store
            .load_segmented_snapshot_from_base(&corrupt, &base, &before)
            .is_err()
    );
}

#[test]
fn version_36_segmented_migration_preserves_explicit_classic_selection() {
    use providence_core::model::{
        ClassicRuleSelectionContextV1, ClassicRuleSelectionEvidence, classic_source_set_sha256,
    };
    let temporary = tempfile::tempdir().unwrap();
    let mut project = snapshot("Previous portable format");
    let store = ProjectStore::create(temporary.path(), &project).unwrap();
    project.origin = ProjectOrigin::Imported {
        compatibility_annex: store.put_blob(b"annex").unwrap(),
    };
    project.classic_rule_selection = Some(ClassicRuleSelectionContextV1 {
        record_version: 1,
        project_id: project.project_id.clone(),
        captured_source_set_sha256: classic_source_set_sha256(&project).unwrap(),
        native_menu_selection: 20,
        evidence_origin: ClassicRuleSelectionEvidence::OwnerConfigured,
    });
    store.save_snapshot(&project).unwrap();
    let bytes = fs::read(store.snapshot_path()).unwrap();
    let mut manifest = store.portable_snapshot_manifest(&bytes).unwrap().unwrap();
    manifest.snapshot_format_version = 36;
    manifest.segments.remove("terrainMappings");
    manifest.segments.remove("importInterpretationVersion");
    manifest
        .segments
        .insert("formatVersion".into(), store.put_blob(b"36").unwrap());
    fs::write(
        store.snapshot_path(),
        serde_json::to_vec(&manifest).unwrap(),
    )
    .unwrap();
    let reopened = store.load_snapshot().unwrap();
    assert_eq!(reopened, project);
    store.save_snapshot(&reopened).unwrap();
    assert_eq!(store.load_snapshot().unwrap(), project);
}

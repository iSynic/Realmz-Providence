use super::*;
use crate::session::*;

fn fixture() -> (ProjectSnapshot, AtlasEvidence, MappingEdit) {
    let mut session = EditorSession::new(ProjectSnapshot::new_authored(StableId(
        "mapping-test".into(),
    )));
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: session.revision(),
            command: EditorCommand::CreateMap {
                level_type: LevelType::Land,
            },
        })
        .unwrap();
    let snapshot = session.snapshot().clone();
    let layout = &terrain_joining::layouts()[0];
    let atlas = AtlasEvidence {
        tileset_id: snapshot.world.maps[0]
            .runtime
            .as_ref()
            .unwrap()
            .tileset_id
            .clone(),
        asset_identity: StableId("application-plains".into()),
        blob: BlobId(format!("sha256:{}", "a".repeat(64))),
        scenario_owned: false,
        tile_fingerprints: layout.tile_fingerprints.clone(),
    };
    let edit = MappingEdit {
        expected_mapping_revision: 0,
        layout_identity: layout.identity.clone(),
        layout_revision: layout.revision,
        reviewed_families: BTreeSet::from(["water".into()]),
        excluded_tiles: BTreeSet::new(),
        tile_labels: BTreeMap::from([(
            5,
            TerrainTileLabel {
                name: Some("Red coast phase one".into()),
                material: Some("Red water".into()),
            },
        )]),
        category_labels: BTreeMap::new(),
    };
    (snapshot, atlas, edit)
}

#[test]
fn reviewed_recolor_is_portable_atomic_and_family_invalidation_is_local() {
    let (before, mut atlas, edit) = fixture();
    atlas.tile_fingerprints[4] = "a".repeat(64);
    assert!(family_layout(&before, &atlas, "water", Some(0)).is_none());
    let mut session = EditorSession::new(before.clone());
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: session.revision(),
            command: EditorCommand::AcceptTerrainMapping(Acceptance {
                identity: StableId("land:0".into()),
                edit: edit.clone(),
                atlas: atlas.clone(),
            }),
        })
        .unwrap();
    assert_eq!(session.snapshot().world, before.world);
    assert_eq!(session.snapshot().assets, before.assets);
    assert!(family_layout(session.snapshot(), &atlas, "water", Some(0)).is_some());
    let json = crate::snapshot::to_deterministic_json(session.snapshot()).unwrap();
    assert_eq!(
        crate::snapshot::from_json(&json).unwrap(),
        *session.snapshot()
    );
    let saved = session.snapshot().clone();
    assert!(accept(&mut saved.clone(), &StableId("land:0".into()), edit, &atlas).is_err());
    atlas.tile_fingerprints[20] = "b".repeat(64);
    assert!(family_layout(&saved, &atlas, "water", Some(0)).is_none());
    assert!(family_layout(&saved, &atlas, "forest", Some(0)).is_some());
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: session.revision(),
            command: EditorCommand::Undo,
        })
        .unwrap();
    assert_eq!(session.snapshot(), &before);
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: session.revision(),
            command: EditorCommand::Redo,
        })
        .unwrap();
    assert_eq!(session.snapshot(), &saved);
}

#[test]
fn explicit_exclusions_disable_affected_family_and_malformed_labels_do_not_write() {
    let (mut snapshot, atlas, mut edit) = fixture();
    edit.excluded_tiles.insert(21);
    accept(
        &mut snapshot,
        &StableId("land:0".into()),
        edit.clone(),
        &atlas,
    )
    .unwrap();
    assert!(family_layout(&snapshot, &atlas, "water", Some(0)).is_none());
    assert!(family_layout(&snapshot, &atlas, "mountains", Some(0)).is_some());
    let before = snapshot.clone();
    edit.expected_mapping_revision = 1;
    edit.tile_labels.get_mut(&5).unwrap().name = Some("bad\nlabel".into());
    assert!(accept(&mut snapshot, &StableId("land:0".into()), edit, &atlas).is_err());
    assert_eq!(snapshot, before);
}

#[test]
fn version_36_migrates_empty_mapping_without_losing_classic_rule_selection() {
    let (mut snapshot, _, _) = fixture();
    snapshot.origin = ProjectOrigin::Imported {
        compatibility_annex: BlobId(format!("sha256:{}", "1".repeat(64))),
    };
    snapshot.classic_rule_selection = Some(ClassicRuleSelectionContextV1 {
        record_version: 1,
        project_id: snapshot.project_id.clone(),
        captured_source_set_sha256: classic_source_set_sha256(&snapshot).unwrap(),
        native_menu_selection: 20,
        evidence_origin: ClassicRuleSelectionEvidence::OwnerConfigured,
    });
    let mut old = serde_json::to_value(&snapshot).unwrap();
    old["formatVersion"] = 36.into();
    old.as_object_mut().unwrap().remove("terrainMappings");
    let migrated = crate::snapshot::from_json(&old.to_string()).unwrap();
    assert_eq!(migrated, snapshot);
    old["formatVersion"] = 35.into();
    assert!(
        crate::snapshot::from_json(&old.to_string())
            .unwrap()
            .classic_rule_selection
            .is_none()
    );
}

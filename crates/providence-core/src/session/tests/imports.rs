use super::*;

#[test]
fn classic_land_import_is_one_revision_and_undo_restores_authored_truth() {
    let command = land_slice_import();
    let mut snapshot = ProjectSnapshot::new_authored(StableId("import-session".into()));
    snapshot.world.maps.push(MapLevel {
        identity: StableId("dungeon:0".into()),
        level_type: LevelType::Dungeon,
        native_index: 0,
        name: "Existing dungeon".into(),
        tiles: vec![0; crate::model::CLASSIC_MAP_SIZE * crate::model::CLASSIC_MAP_SIZE],
        runtime: None,
    });
    let mut session = EditorSession::new(snapshot);

    let projection = session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command,
        })
        .expect("atomic Classic import");

    assert_eq!(projection.revision, Revision(1));
    assert_eq!(projection.changed_entities_total, 104);
    assert_eq!(
        projection.changed_entities[0],
        StableId("import-session".into())
    );
    assert_eq!(session.snapshot().classic_sources.len(), 4);
    assert_eq!(session.snapshot().world.maps.len(), 2);
    assert!(
        session
            .snapshot()
            .world
            .maps
            .iter()
            .any(|map| map.level_type == LevelType::Dungeon)
    );
    assert!(matches!(
        session.snapshot().origin,
        ProjectOrigin::Imported { .. }
    ));
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(1),
            command: EditorCommand::Undo,
        })
        .expect("undo import");
    assert_eq!(session.snapshot().origin, ProjectOrigin::Authored);
    assert!(session.snapshot().classic_sources.is_empty());
    assert_eq!(session.snapshot().world.maps.len(), 1);
    assert_eq!(
        session.snapshot().world.maps[0].level_type,
        LevelType::Dungeon
    );
}

#[test]
fn classic_land_import_without_global_accepts_only_an_explicit_empty_hook_contract() {
    let mut command = land_slice_import();
    let EditorCommand::ImportClassicLandSlice {
        sources,
        global_macro_hooks,
        ..
    } = &mut command
    else {
        unreachable!();
    };
    assert!(!sources.iter().any(|source| source.native_path == "Global"));
    *global_macro_hooks = Some(Box::default());

    let mut session = EditorSession::new(ProjectSnapshot::new_authored(StableId(
        "optional-global-import".into(),
    )));
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command,
        })
        .expect("an absent optional Global imports an explicit empty contract");
    assert_eq!(
        session.snapshot().scenario_application,
        Some(crate::model::ScenarioApplicationContract::default())
    );

    let mut command = land_slice_import();
    let EditorCommand::ImportClassicLandSlice {
        global_macro_hooks, ..
    } = &mut command
    else {
        unreachable!();
    };
    let mut hooks = crate::model::ScenarioApplicationContract::default();
    hooks.hooks.start_game = Some(StableId("extra-action-point:0".into()));
    *global_macro_hooks = Some(Box::new(hooks));
    let mut strict_session = EditorSession::new(ProjectSnapshot::new_authored(StableId(
        "nonempty-global-import".into(),
    )));
    let before = strict_session.persisted_state();
    assert!(matches!(
        strict_session.execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command,
        }),
        Err(SessionError::InvalidClassicImport(message))
            if message == "decoded global macro hooks require Global provenance"
    ));
    assert_eq!(strict_session.persisted_state(), before);
}

#[test]
fn classic_dungeon_import_is_atomic_and_preserves_unrelated_world_facts() {
    let command = dungeon_slice_import();
    let mut snapshot = ProjectSnapshot::new_authored(StableId("dungeon-import".into()));
    snapshot.world.maps.push(MapLevel {
        identity: StableId("land:0".into()),
        level_type: LevelType::Land,
        native_index: 0,
        name: "Ashen Coast".into(),
        tiles: vec![0; crate::model::CLASSIC_MAP_SIZE * crate::model::CLASSIC_MAP_SIZE],
        runtime: None,
    });
    let mut session = EditorSession::new(snapshot);

    let projection = session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command,
        })
        .expect("atomic dungeon import");

    assert_eq!(projection.revision, Revision(1));
    assert_eq!(projection.changed_entities_total, 102);
    assert_eq!(session.snapshot().world.maps.len(), 2);
    assert_eq!(session.snapshot().world.maps[0].level_type, LevelType::Land);
    assert_eq!(
        session.snapshot().world.maps[1].level_type,
        LevelType::Dungeon
    );
    assert_eq!(session.snapshot().world.action_points.len(), 100);
    assert_eq!(session.snapshot().classic_sources.len(), 3);
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(1),
            command: EditorCommand::Undo,
        })
        .expect("undo dungeon import");
    assert_eq!(session.snapshot().world.maps.len(), 1);
    assert_eq!(session.snapshot().world.maps[0].level_type, LevelType::Land);
    assert!(session.snapshot().world.action_points.is_empty());
}

#[test]
fn incomplete_extra_code_tail_imports_with_exact_provenance_and_warning() {
    let mut command = land_slice_import();
    let EditorCommand::ImportClassicLandSlice {
        sources,
        extra_codes,
        ..
    } = &mut command
    else {
        unreachable!()
    };
    sources.push(ClassicSourceBlob {
        native_path: "Data EDCD".into(),
        blob: BlobId(format!("sha256:{}", "d".repeat(64))),
        byte_length: 16,
    });
    *extra_codes = crate::codecs::decode_extra_codes(&[0; 16]).rows;
    let mut session = EditorSession::new(ProjectSnapshot::new_authored(StableId(
        "partial-extra-code".into(),
    )));
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command,
        })
        .expect("complete prefix imports");
    assert_eq!(session.snapshot().extra_codes.len(), 1);
    assert_eq!(
        session
            .snapshot()
            .classic_sources
            .iter()
            .find(|s| s.native_path == "Data EDCD")
            .unwrap()
            .byte_length,
        16
    );
    let application =
        crate::rebuilt::ApplicationMediaCatalog::empty(StableId("fixture-application".into()));
    let classification = crate::compatibility::classify_rebuilt_v3_with_application(
        session.snapshot(),
        &application,
    );
    assert!(classification.warnings.iter().any(|w| {
        w.message
            .contains("'Data EDCD' preserves 6 trailing byte(s) after 1 complete")
    }));
}

#[test]
fn classic_scenario_bootstrap_import_is_source_backed_and_requires_its_land_map() {
    let snapshot = snapshot_with_start_map();
    let mut session = EditorSession::new(snapshot.clone());
    let mut restricted_session = EditorSession::new(snapshot);
    let blob = || BlobId(format!("sha256:{}", "a".repeat(64)));
    let campaign = half_truth_campaign();
    let sources = half_truth_sources();

    let mut restricted_campaign = campaign.clone();
    restricted_campaign.restrictions.max_level = 12;
    assert!(matches!(
        restricted_session.execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::ImportClassicScenarioBootstrap {
                annex_blob: blob(),
                sources: sources.clone(),
                startup_native_path: "Half Truth".into(),
                campaign: Box::new(restricted_campaign),
                start_location: StartLocation {
                    map: StableId("land:0".into()),
                    coordinate: crate::model::MapCoordinate { x: 42, y: 71 },
                },
            },
        }),
        Err(SessionError::InvalidClassicImport(message))
            if message == "scenario bootstrap has authored restrictions without a Data RI source"
    ));

    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::ImportClassicScenarioBootstrap {
                annex_blob: blob(),
                sources,
                startup_native_path: "Half Truth".into(),
                campaign: Box::new(campaign),
                start_location: StartLocation {
                    map: StableId("land:0".into()),
                    coordinate: crate::model::MapCoordinate { x: 42, y: 71 },
                },
            },
        })
        .expect("import scenario bootstrap");

    assert_eq!(session.revision(), Revision(1));
    assert_eq!(
        session.snapshot().campaign.as_ref().unwrap().name,
        "Half Truth"
    );
    assert_eq!(
        session.snapshot().start_location.as_ref().unwrap().map.0,
        "land:0"
    );
    assert_eq!(session.snapshot().classic_sources.len(), 1);
    assert!(matches!(
        session.snapshot().origin,
        ProjectOrigin::Imported { .. }
    ));
}

#[test]
fn whole_scenario_commit_is_one_revision_non_undoable_and_failure_atomic() {
    let mut session = EditorSession::new(sample_snapshot());
    let original = session.snapshot().clone();
    let mut imported = original.clone();
    imported.origin = ProjectOrigin::Imported {
        compatibility_annex: BlobId(format!("sha256:{}", "b".repeat(64))),
    };
    imported.messages[0].text = "Imported".into();

    let projection = session
        .commit_classic_scenario_import(Revision(0), imported)
        .expect("commit whole scenario");
    assert_eq!(projection.previous_revision, Revision(0));
    assert_eq!(projection.revision, Revision(1));
    assert_eq!(session.snapshot().messages[0].text, "Imported");

    assert!(!session.can_undo());
    assert!(!session.can_redo());
    assert!(
        session
            .execute(ExpectedRevisionCommand {
                expected_revision: Revision(1),
                command: EditorCommand::Undo,
            })
            .is_err()
    );
    assert_eq!(session.snapshot().messages[0].text, "Imported");

    let before = session.persisted_state();
    let mut wrong_project = original.clone();
    wrong_project.project_id = StableId("different".into());
    wrong_project.origin = ProjectOrigin::Imported {
        compatibility_annex: BlobId(format!("sha256:{}", "c".repeat(64))),
    };
    assert!(
        session
            .commit_classic_scenario_import(Revision(1), wrong_project)
            .is_err()
    );
    assert_eq!(session.persisted_state(), before);
}

fn land_slice_import() -> EditorCommand {
    let data_ld = vec![0u8; crate::codecs::MAP_LEVEL_BYTES];
    let data_dd = vec![0u8; crate::codecs::ACTION_POINT_LEVEL_BYTES];
    let data_sd2 = vec![0u8; 256];
    let mut data_ed = vec![0u8; crate::codecs::SIMPLE_ENCOUNTER_RECORD_BYTES];
    data_ed.extend_from_slice(&[0xca, 0xfe]);
    let sources = [
        ("Data DD", data_dd.len()),
        ("Data ED", data_ed.len()),
        ("Data LD", data_ld.len()),
        ("Data SD2", data_sd2.len()),
    ]
    .into_iter()
    .map(|(native_path, byte_length)| ClassicSourceBlob {
        native_path: native_path.into(),
        blob: BlobId(format!("sha256:{}", native_path.replace(' ', "").repeat(8))),
        byte_length: byte_length as u64,
    })
    .collect();
    EditorCommand::ImportClassicLandSlice {
        annex_blob: BlobId(format!("sha256:{}", "a".repeat(64))),
        sources,
        maps: crate::codecs::decode_land_maps(&data_ld).records,
        action_points: crate::codecs::decode_land_action_points(&data_dd).records,
        messages: crate::codecs::decode_messages(&data_sd2).messages,
        simple_encounters: crate::codecs::decode_simple_encounters(&data_ed).records,
        extra_codes: Vec::new(),
        extra_action_points: Vec::new(),
        global_macro_hooks: None,
        land_layout: None,
    }
}

fn dungeon_slice_import() -> EditorCommand {
    let data_dl = vec![0u8; crate::codecs::MAP_LEVEL_BYTES];
    let data_ddd = vec![0u8; crate::codecs::ACTION_POINT_LEVEL_BYTES];
    let data_rdd = vec![0u8; crate::codecs::RANDOM_LEVEL_RECORD_BYTES];
    let data_rdd_blob = BlobId(format!("sha256:{}", "c".repeat(64)));
    let sources = [
        ClassicSourceBlob {
            native_path: "Data DL".into(),
            blob: BlobId(format!("sha256:{}", "a".repeat(64))),
            byte_length: data_dl.len() as u64,
        },
        ClassicSourceBlob {
            native_path: "Data DDD".into(),
            blob: BlobId(format!("sha256:{}", "b".repeat(64))),
            byte_length: data_ddd.len() as u64,
        },
        ClassicSourceBlob {
            native_path: "Data RDD".into(),
            blob: data_rdd_blob.clone(),
            byte_length: data_rdd.len() as u64,
        },
    ];
    let mut maps = crate::codecs::decode_dungeon_maps(&data_dl).records;
    let runtime = crate::codecs::decode_dungeon_random_levels(&data_rdd)
        .records
        .remove(0)
        .runtime;
    maps[0].runtime = Some(MapRuntimeMetadata {
        source_blob: Some(data_rdd_blob),
        ..runtime
    });
    let dungeon_action_points = crate::codecs::decode_dungeon_action_points(&data_ddd).records;
    EditorCommand::ImportClassicDungeonSlice {
        annex_blob: BlobId(format!("sha256:{}", "d".repeat(64))),
        sources: sources.into(),
        maps,
        action_points: dungeon_action_points,
    }
}

fn half_truth_campaign() -> CampaignMetadata {
    CampaignMetadata {
        name: "Half Truth".into(),
        version: String::new(),
        author: "Fantasoft".into(),
        creator_user_check: "Fantasoft".into(),
        contact: CampaignContact {
            title: String::new(),
            email: String::new(),
            web: String::new(),
            date: String::new(),
            fee: String::new(),
        },
        contact_provenance: crate::model::CampaignContactProvenance::Absent,
        description: String::new(),
        splash_asset_id: String::new(),
        recommended_party_levels: 54,
        maximum_party_levels: 81,
        guidance_authored: false,
        restrictions: CampaignRestrictions {
            description: String::new(),
            max_party_size: 6,
            max_level: 0,
            banned_races: Vec::new(),
            banned_castes: Vec::new(),
        },
    }
}

fn half_truth_sources() -> Vec<ClassicSourceBlob> {
    vec![ClassicSourceBlob {
        native_path: "Half Truth".into(),
        blob: BlobId(format!("sha256:{}", "a".repeat(64))),
        byte_length: 320,
    }]
}

fn snapshot_with_start_map() -> ProjectSnapshot {
    let mut snapshot = sample_snapshot();
    snapshot.world.maps.push(MapLevel {
        identity: StableId("land:0".into()),
        level_type: LevelType::Land,
        native_index: 0,
        name: "Start".into(),
        tiles: vec![0; CLASSIC_MAP_SIZE * CLASSIC_MAP_SIZE],
        runtime: None,
    });
    snapshot
}

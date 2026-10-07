use crate::{demo::demo_snapshot, dispatch_result, dispatch_result_with_application};
use providence_core::{
    model::*,
    session::{EditorSession, Revision},
};
use providence_storage::ProjectStore;
use serde_json::{Value, json};

#[test]
fn fresh_scenario_sections_are_atomic_and_security_generator_is_read_only() {
    let temporary = tempfile::tempdir().unwrap();
    let store = ProjectStore::create(temporary.path(), &demo_snapshot()).unwrap();
    let mut session = EditorSession::new(demo_snapshot());
    for method in [
        "scenario-startup.open",
        "scenario-contact.open",
        "scenario-restrictions.open",
        "scenario-security.open",
    ] {
        assert!(
            dispatch_result_with_application(&mut session, Some(&store), None, method, json!({}))
                .is_ok()
        );
    }
    let before = session.snapshot().clone();
    let draft = json!({"name": "Display name", "markerFilename": "Runtime Marker", "creatorUserCheck": "",
        "recommendedPartyLevels": 4, "maximumPartyLevels": 16,
        "startLocation": {"map": "land:0", "coordinate": {"x": 18, "y": 23}}});
    dispatch_result(
        &mut session,
        "scenario-startup.update",
        json!({"expectedRevision": 0, "startup": draft}),
    )
    .unwrap();
    assert_eq!(
        session.snapshot().campaign.as_ref().unwrap().name,
        "Display name"
    );
    assert_eq!(
        session
            .snapshot()
            .startup_authoring
            .as_ref()
            .unwrap()
            .marker_filename,
        "Runtime Marker"
    );
    dispatch_result(&mut session, "history.undo", json!({"expectedRevision": 1})).unwrap();
    assert_eq!(session.snapshot(), &before);
    dispatch_result(&mut session, "history.redo", json!({"expectedRevision": 2})).unwrap();
    dispatch_result_with_application(&mut session, Some(&store), None, "scenario-security.update",
        json!({"expectedRevision": 3, "segment1": "ABCDEFGHIJKLMNOPQRST", "segment2": "preservation"})).unwrap();
    let applied = session.snapshot().clone();
    let generated = dispatch_result_with_application(&mut session, Some(&store), None, "scenario-registration.generate",
        json!({"expectedRevision": 4, "segment1": "ABCDEFGHIJKLMNOPQRST", "segment2": "preservation",
            "registrationName": "Author", "serialNumber": "9140886"})).unwrap();
    assert_eq!(generated["variants"].as_array().unwrap().len(), 4);
    assert_eq!(session.snapshot(), &applied);
    assert_eq!(session.revision(), Revision(4));
    store.save_snapshot(session.snapshot()).unwrap();
    let reopened = store.load_snapshot().unwrap();
    assert_eq!(reopened, applied);
    assert!(reopened.classic_sources.is_empty());
}

#[test]
fn rejected_atomic_drafts_do_not_initialize_or_partially_change_a_fresh_scenario() {
    let mut session = EditorSession::new(demo_snapshot());
    let before = session.snapshot().clone();
    assert!(dispatch_result(&mut session, "scenario-startup.update", json!({"expectedRevision": 0,
        "startup": {"name": "Should not apply", "markerFilename": "Bad/Marker", "creatorUserCheck": "",
            "recommendedPartyLevels": 1, "maximumPartyLevels": 10,
            "startLocation": {"map": "land:0", "coordinate": {"x": 90, "y": 0}}}})).is_err());
    assert!(dispatch_result(&mut session, "scenario-restrictions.update", json!({"expectedRevision": 0,
        "restrictions": {"description": "", "maxPartySize": 7, "maxLevel": 0, "bannedRaces": [], "bannedCastes": []}})).is_err());
    assert_eq!(session.snapshot(), &before);
    assert_eq!(session.revision(), Revision(0));
}

#[test]
fn backup_repair_requires_a_current_source_receipt_and_keeps_original_bytes() {
    let (_root, store, mut session, source, backup) = short_backup_fixture();
    let preview = dispatch_result_with_application(
        &mut session,
        Some(&store),
        None,
        "scenario-security.repair-preview",
        json!({"expectedRevision": 0}),
    )
    .unwrap();
    assert_eq!(preview["initializedBytes"], 284);
    let params = json!({"expectedRevision": 0, "segment1": "first", "segment2": "second"});
    assert!(
        dispatch_result_with_application(
            &mut session,
            Some(&store),
            None,
            "scenario-security.update",
            params.clone()
        )
        .is_err()
    );
    let mut stale = params.clone();
    stale["repairPreview"] = preview.clone();
    stale["repairPreview"]["revision"] = Value::from(99);
    assert!(
        dispatch_result_with_application(
            &mut session,
            Some(&store),
            None,
            "scenario-security.update",
            stale
        )
        .is_err()
    );
    let mut accepted = params;
    accepted["repairPreview"] = preview;
    dispatch_result_with_application(
        &mut session,
        Some(&store),
        None,
        "scenario-security.update",
        accepted,
    )
    .unwrap();
    assert_eq!(store.read_blob(&source.blob).unwrap(), backup);
    assert_eq!(session.snapshot().classic_sources[0], source);
    let security = session
        .snapshot()
        .startup_authoring
        .as_ref()
        .unwrap()
        .security
        .as_ref()
        .unwrap();
    assert!(security.repair_backup);
    assert_repaired_backup_preserves_prefix(&backup, security);
}

#[test]
fn legacy_startup_source_preview_and_rejection_preserve_the_entire_draft() {
    let mut fixture = legacy_startup_fixture();
    let opened = fixture
        .request("scenario-security.open", json!({}))
        .unwrap();
    assert_eq!(opened["sourceSelectionRequired"], true);
    assert_eq!(opened["sourceCandidates"], json!([fixture.source]));
    let source = fixture.source.clone();
    let preview = fixture
        .request(
            "scenario-security.source-preview",
            json!({"expectedRevision":0,"startupSource":source}),
        )
        .unwrap();
    assert_eq!(preview["sourceSelectionRequired"], false);
    let mut wrong =
        json!({"expectedRevision":0,"segment1":"first","segment2":"second","startupSource":source});
    wrong["startupSource"]["byteLength"] = json!(316);
    assert!(fixture.request("scenario-security.update", wrong).is_err());
    assert!(
        fixture
            .request(
                "scenario-security.update",
                json!({"expectedRevision":0,"segment1":"first","segment2":"second"})
            )
            .is_err()
    );
    assert_eq!(fixture.session.snapshot(), &fixture.snapshot);
}

#[test]
fn legacy_startup_source_and_security_share_one_history_entry_and_persist() {
    let mut fixture = legacy_startup_fixture();
    let source = fixture.source.clone();
    fixture.request("scenario-security.update",
        json!({"expectedRevision":0,"segment1":"first","segment2":"second","startupSource":source})).unwrap();
    assert_eq!(
        fixture
            .session
            .snapshot()
            .startup_authoring
            .as_ref()
            .unwrap()
            .original_source
            .as_ref(),
        Some(&source)
    );
    assert_eq!(
        fixture.store.read_blob(&source.blob).unwrap(),
        fixture.bytes
    );
    let saved = fixture.session.snapshot().clone();
    dispatch_result(
        &mut fixture.session,
        "history.undo",
        json!({"expectedRevision":1}),
    )
    .unwrap();
    assert_eq!(fixture.session.snapshot(), &fixture.snapshot);
    dispatch_result(
        &mut fixture.session,
        "history.redo",
        json!({"expectedRevision":2}),
    )
    .unwrap();
    assert_eq!(fixture.session.snapshot(), &saved);
    fixture
        .store
        .save_snapshot(fixture.session.snapshot())
        .unwrap();
    assert_eq!(fixture.store.load_snapshot().unwrap(), saved);
}

struct SourceFixture {
    _root: tempfile::TempDir,
    store: ProjectStore,
    session: EditorSession,
    snapshot: ProjectSnapshot,
    source: ClassicSourceBlob,
    bytes: Vec<u8>,
}

impl SourceFixture {
    fn request(&mut self, method: &str, params: Value) -> Result<Value, String> {
        dispatch_result_with_application(&mut self.session, Some(&self.store), None, method, params)
    }
}

fn legacy_startup_fixture() -> SourceFixture {
    let temporary = tempfile::tempdir().unwrap();
    let mut snapshot = demo_snapshot();
    snapshot.campaign = Some(CampaignMetadata::neutral());
    snapshot.campaign.as_mut().unwrap().name = "Renamed display".into();
    let store = ProjectStore::create(temporary.path(), &snapshot).unwrap();
    let bytes = vec![0; 319];
    let source = ClassicSourceBlob {
        native_path: "Original Marker".into(),
        blob: store.put_blob(&bytes).unwrap(),
        byte_length: 319,
    };
    snapshot.origin = ProjectOrigin::Imported {
        compatibility_annex: store.put_blob(b"retained evidence").unwrap(),
    };
    snapshot.classic_sources.push(source.clone());
    let session = EditorSession::new(snapshot.clone());
    SourceFixture {
        _root: temporary,
        store,
        session,
        snapshot,
        source,
        bytes,
    }
}

fn short_backup_fixture() -> (
    tempfile::TempDir,
    ProjectStore,
    EditorSession,
    ClassicSourceBlob,
    Vec<u8>,
) {
    let temporary = tempfile::tempdir().unwrap();
    let store = ProjectStore::create(temporary.path(), &demo_snapshot()).unwrap();
    let backup = vec![0xa7; 32];
    let source = ClassicSourceBlob {
        native_path: "Data CS".into(),
        blob: store.put_blob(&backup).unwrap(),
        byte_length: 32,
    };
    let mut snapshot = demo_snapshot();
    snapshot.classic_sources.push(source.clone());
    let session = EditorSession::new(snapshot);
    (temporary, store, session, source, backup)
}

fn assert_repaired_backup_preserves_prefix(backup: &[u8], security: &ScenarioSecurityAuthoring) {
    let mut startup = vec![0; 316];
    let output =
        providence_core::codecs::encode_scenario_security(&mut startup, Some(backup), security)
            .unwrap();
    assert_eq!(&output[..32], backup);
    assert_eq!(output.len(), 316);
}

#[test]
fn source_search_covers_the_entire_retained_catalog_with_bounded_pages() {
    let mut fixture = legacy_startup_fixture();
    let mut snapshot = fixture.snapshot.clone();
    for id in 0..190 {
        let mut source = fixture.source.clone();
        source.native_path = format!("Retained Marker {id:03}");
        snapshot.classic_sources.push(source);
    }
    fixture.session = EditorSession::new(snapshot);
    let first = fixture
        .request(
            "scenario-security.source-list",
            json!({"expectedRevision":0}),
        )
        .unwrap();
    assert_eq!(first["total"], 191);
    assert_eq!(first["items"].as_array().unwrap().len(), 64);
    let last = fixture
        .request(
            "scenario-security.source-list",
            json!({"expectedRevision":0,"offset":128}),
        )
        .unwrap();
    assert_eq!(last["items"].as_array().unwrap().len(), 63);
    let found = fixture
        .request(
            "scenario-security.source-list",
            json!({"expectedRevision":0,"search":"marker 189"}),
        )
        .unwrap();
    assert_eq!(found["total"], 1);
    assert_eq!(found["items"][0]["nativePath"], "Retained Marker 189");
    assert_eq!(fixture.session.revision(), Revision(0));
}

#[test]
fn startup_validation_and_apply_reject_the_same_retained_filename_collision() {
    let mut fixture = legacy_startup_fixture();
    let draft = json!({"name":"Display name","markerFilename":"Original Marker",
        "recommendedPartyLevels":1,"maximumPartyLevels":10,"creatorUserCheck":"",
        "startLocation":{"map":"land:0","coordinate":{"x":1,"y":2}}});
    let params = json!({"expectedRevision":0,"startup":draft});
    let before = fixture.session.snapshot().clone();
    let checked = dispatch_result(
        &mut fixture.session,
        "scenario-startup.validate",
        params.clone(),
    )
    .unwrap();
    assert_eq!(checked["valid"], false);
    assert!(
        dispatch_result(
            &mut fixture.session,
            "scenario-startup.update",
            params.clone()
        )
        .is_err()
    );
    assert_eq!(fixture.session.snapshot(), &before);
    assert_eq!(fixture.session.revision(), Revision(0));
    assert!(
        dispatch_result(
            &mut fixture.session,
            "scenario-startup.validate",
            json!({"expectedRevision":1,"startup":draft})
        )
        .is_err()
    );
}

#[test]
fn full_import_retains_the_exact_security_backup_source() {
    let temporary = tempfile::tempdir().unwrap();
    let directory = temporary.path().join("Scenario");
    std::fs::create_dir(&directory).unwrap();
    let store = ProjectStore::create(temporary.path().join("project"), &demo_snapshot()).unwrap();
    let backup: Vec<u8> = (0..325).map(|index| index as u8).collect();
    std::fs::write(directory.join("Data CS"), &backup).unwrap();
    let (sources, count, unowned) =
        crate::scenario_import::capture_scenario_sources(&store, &directory, "Scenario").unwrap();
    assert_eq!(count, backup.len() as u64);
    assert!(unowned.is_empty());
    assert_eq!(sources.len(), 1);
    assert_eq!(sources[0].native_path, "Data CS");
    assert_eq!(store.read_blob(&sources[0].blob).unwrap(), backup);
}

#[test]
fn scenario_security_imported_c_string_residue_does_not_block_generation() {
    let mut fixture = legacy_startup_fixture();
    // Sword Lands security fields, source marker SHA-256 84e877c0…b12467.
    fixture.bytes[20..60].copy_from_slice(&[
        137, 229, 205, 236, 148, 82, 133, 129, 200, 212, 222, 148, 32, 167, 212, 116, 109, 97, 110,
        0, 209, 84, 57, 101, 180, 132, 189, 161, 28, 67, 67, 7, 64, 233, 53, 232, 218, 194, 220, 0,
    ]);
    let mut backup = vec![0; 316];
    backup[20..40].copy_from_slice(&fixture.bytes[20..40]);
    let source = ClassicSourceBlob {
        blob: fixture.store.put_blob(&fixture.bytes).unwrap(),
        ..fixture.source.clone()
    };
    let backup_source = ClassicSourceBlob {
        native_path: "Data CS".into(),
        blob: fixture.store.put_blob(&backup).unwrap(),
        byte_length: 316,
    };
    let mut snapshot = fixture.snapshot.clone();
    snapshot.classic_sources = vec![source.clone(), backup_source.clone()];
    snapshot.startup_authoring = Some(ScenarioStartupAuthoring {
        marker_filename: source.native_path.clone(),
        original_source: Some(source.clone()),
        security: None,
    });
    fixture.session = EditorSession::new(snapshot.clone());
    let snapshot = fixture.session.snapshot().clone();
    let decoded = fixture
        .request("scenario-security.open", json!({}))
        .unwrap();
    assert_eq!(decoded["decodingAvailable"], true);
    assert_eq!(decoded["segment1"], "Avast Matey!");
    assert_eq!(decoded["segment2"], "Holy 28 Toes Batman");
    assert!(decoded["reason"].is_null());
    let codes = fixture.request("scenario-registration.generate",json!({"expectedRevision":0,
        "segment1":decoded["segment1"],"segment2":decoded["segment2"],"registrationName":"Author","serialNumber":"9140886"})).unwrap();
    assert_eq!(codes["variants"].as_array().unwrap().len(), 4);
    assert_eq!(fixture.session.snapshot(), &snapshot);
    assert_eq!(fixture.session.revision(), Revision(0));
    fixture
        .store
        .save_snapshot(fixture.session.snapshot())
        .unwrap();
    fixture.session = EditorSession::new(fixture.store.load_snapshot().unwrap());
    assert_eq!(
        fixture
            .request("scenario-security.open", json!({}))
            .unwrap(),
        decoded
    );
    assert_eq!(
        fixture.store.read_blob(&source.blob).unwrap(),
        fixture.bytes
    );
    assert_eq!(
        fixture.store.read_blob(&backup_source.blob).unwrap(),
        backup
    );
}

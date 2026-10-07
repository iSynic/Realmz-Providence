use super::*;
use crate::{demo::demo_snapshot, dispatch_result_with_store};
use providence_core::{
    model::{ClassicSourceBlob, classic_source_set_sha256},
    session::{EditorSession, Revision},
};
use providence_storage::ProjectStore;

fn imported() -> (tempfile::TempDir, ProjectStore, EditorSession) {
    let temporary = tempdir().unwrap();
    let store = ProjectStore::create(temporary.path(), &demo_snapshot()).unwrap();
    let mut snapshot = demo_snapshot();
    let blob = store.put_blob(b"captured original rules").unwrap();
    snapshot.origin = ProjectOrigin::Imported {
        compatibility_annex: blob.clone(),
    };
    snapshot.classic_sources.push(ClassicSourceBlob {
        native_path: "Data Race".into(),
        blob,
        byte_length: 23,
    });
    (temporary, store, EditorSession::new(snapshot))
}

fn guards(session: &EditorSession) -> Value {
    json!({"expectedRevision":session.revision(), "expectedProjectId":session.snapshot().project_id,
        "expectedPreviousIdentity":session.snapshot().classic_rule_selection.as_ref().map(|context| context.identity()),
        "expectedSourceSetSha256":classic_source_set_sha256(session.snapshot()).unwrap()})
}

#[test]
fn captured_scenario_race_table_remains_exact_and_distinct_from_an_absent_caste_table() {
    let (temporary, store, _session) = imported();
    let source = temporary.path().join("scenario-source");
    std::fs::create_dir(&source).unwrap();
    let bytes = b"source-owned Race bytes, including unowned residue";
    std::fs::write(source.join("Data Race"), bytes).unwrap();
    let (sources, size, unowned) =
        crate::scenario_import::capture_scenario_sources(&store, &source, "Scenario").unwrap();
    assert_eq!(sources.len(), 1);
    assert_eq!(sources[0].native_path, "Data Race");
    assert_eq!(store.read_blob(&sources[0].blob).unwrap(), bytes);
    assert_eq!(size, bytes.len() as u64);
    assert!(unowned.is_empty());
}

#[test]
fn old_incomplete_race_inventory_cannot_claim_absence_but_new_complete_inventory_can() {
    let (_temporary, store, session) = imported();
    let mut snapshot = session.snapshot().clone();
    snapshot.classic_sources.clear();
    for rule in &mut snapshot.race_rules {
        rule.source_blob = Some(store.put_blob(b"original rules").unwrap());
    }
    snapshot.classic_rule_selection = Some(providence_core::model::ClassicRuleSelectionContextV1 {
        record_version: 1,
        project_id: snapshot.project_id.clone(),
        captured_source_set_sha256: classic_source_set_sha256(&snapshot).unwrap(),
        native_menu_selection: 20,
        evidence_origin: providence_core::model::ClassicRuleSelectionEvidence::OwnerConfigured,
    });
    snapshot.origin = ProjectOrigin::Imported {
        compatibility_annex: store
            .put_blob(br#"{"format":"providence-classic-source-annex-v1","files":[]}"#)
            .unwrap(),
    };
    assert!(
        crate::classic_rule_selection::validate_race_absence(&snapshot, &store)
            .unwrap_err()
            .contains("Reimport")
    );
    snapshot.origin = ProjectOrigin::Imported {compatibility_annex:store.put_blob(br#"{"format":"providence-classic-source-annex-v1","sourceInventoryVersion":2,"files":[]}"#).unwrap()};
    assert!(crate::classic_rule_selection::validate_race_absence(&snapshot, &store).is_ok());
    snapshot
        .classic_rule_selection
        .as_mut()
        .unwrap()
        .native_menu_selection = 19;
    snapshot.origin = ProjectOrigin::Imported {
        compatibility_annex: store.put_blob(b"old unstructured annex").unwrap(),
    };
    assert!(crate::classic_rule_selection::validate_race_absence(&snapshot, &store).is_ok());
}

#[test]
fn readonly_preview_and_guarded_commands_preserve_the_originating_draft() {
    let (_temporary, store, mut session) = imported();
    let before = session.snapshot().clone();
    let opened = dispatch_result_with_store(
        &mut session,
        Some(&store),
        "classic-rule-selection.open",
        json!({}),
    )
    .unwrap();
    assert_eq!(opened["projectId"], json!(before.project_id));
    assert!(opened["context"].is_null());
    let mut params = guards(&session);
    params["nativeMenuSelection"] = json!(10);
    let preview = dispatch_result_with_store(
        &mut session,
        Some(&store),
        "classic-rule-selection.preview",
        params.clone(),
    )
    .unwrap();
    assert_eq!(preview["validChoice"], true);
    assert_eq!(preview["ready"], false);
    assert!(
        preview["message"]
            .as_str()
            .unwrap()
            .contains("application package context")
    );
    assert_eq!(*session.snapshot(), before);
    assert_eq!(session.revision(), Revision(0));
    let mut stale = params.clone();
    stale["expectedProjectId"] = json!("different-project");
    assert!(
        dispatch_result_with_store(
            &mut session,
            Some(&store),
            "classic-rule-selection.set",
            stale
        )
        .unwrap_err()
        .contains("different project")
    );
    dispatch_result_with_store(
        &mut session,
        Some(&store),
        "classic-rule-selection.set",
        params.clone(),
    )
    .unwrap();
    store
        .checkpoint_session(&session, &json!({"method":"classic-rule-selection.set"}))
        .unwrap();
    assert_eq!(session.snapshot().classic_sources, before.classic_sources);
    assert_committed_selection_guards(&mut session, &store, params);
}

#[test]
fn preview_rejects_invalid_slots_stale_sources_and_new_projects_without_mutating() {
    let (_temporary, store, mut session) = imported();
    let mut params = guards(&session);
    params["nativeMenuSelection"] = json!(0);
    assert!(
        dispatch_result_with_store(
            &mut session,
            Some(&store),
            "classic-rule-selection.preview",
            params.clone()
        )
        .unwrap_err()
        .contains("positive native")
    );
    params["nativeMenuSelection"] = Value::Null;
    let clear = dispatch_result_with_store(
        &mut session,
        Some(&store),
        "classic-rule-selection.preview",
        params.clone(),
    )
    .unwrap();
    assert_eq!(clear["raceSource"], "unresolved");
    params["expectedSourceSetSha256"] = json!("stale");
    assert!(
        dispatch_result_with_store(
            &mut session,
            Some(&store),
            "classic-rule-selection.preview",
            params
        )
        .unwrap_err()
        .contains("sources changed")
    );
    let mut fresh = EditorSession::new(demo_snapshot());
    let mut params = guards(&fresh);
    params["nativeMenuSelection"] = json!(10);
    assert!(
        dispatch_result_with_store(
            &mut fresh,
            Some(&store),
            "classic-rule-selection.set",
            params
        )
        .unwrap_err()
        .contains("imported projects")
    );
    assert_eq!(session.revision(), Revision(0));
    assert_eq!(fresh.revision(), Revision(0));
}

fn assert_committed_selection_guards(
    session: &mut EditorSession,
    store: &ProjectStore,
    params: Value,
) {
    assert!(
        dispatch_result_with_store(
            session,
            Some(store),
            "classic-rule-selection.preview",
            params
        )
        .unwrap_err()
        .contains("revision conflict")
    );
    let mut noop = guards(session);
    noop["nativeMenuSelection"] = json!(10);
    let revision = session.revision();
    dispatch_result_with_store(session, Some(store), "classic-rule-selection.set", noop).unwrap();
    assert_eq!(session.revision(), revision);
    let clear = guards(session);
    dispatch_result_with_store(session, Some(store), "classic-rule-selection.clear", clear)
        .unwrap();
    assert!(session.snapshot().classic_rule_selection.is_none());
}

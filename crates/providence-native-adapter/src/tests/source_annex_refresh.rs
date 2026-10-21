use crate::{dispatch_result_with_store, transport::serve_io};
use providence_core::{codecs::*, model::*, session::EditorSession};
use providence_storage::ProjectStore;
use serde_json::{Value, json};
use std::{fs, io::Cursor, path::Path};

mod fixture;
mod rule_selection_publication;
use fixture::*;

fn request(
    session: &mut EditorSession,
    store: &ProjectStore,
    method: &str,
    mut params: Value,
) -> Value {
    params["expectedRevision"] = json!(session.revision());
    let request = json!({"id":1,"method":method,"params":params}).to_string() + "\n";
    let mut output = Vec::new();
    serve_io(session, Some(store), Cursor::new(request), &mut output).unwrap();
    let response: Value = serde_json::from_slice(&output).unwrap();
    assert_eq!(response["ok"], true, "{method}: {response}");
    response["result"].clone()
}

fn annex(session: &EditorSession, store: &ProjectStore) -> Value {
    let ProjectOrigin::Imported {
        compatibility_annex,
    } = &session.snapshot().origin
    else {
        panic!("imported")
    };
    serde_json::from_slice(&store.read_blob(compatibility_annex).unwrap()).unwrap()
}

fn selection_params(session: &EditorSession, package: &Value) -> Value {
    json!({"expectedRevision":session.revision(), "expectedProjectId":session.snapshot().project_id,
        "expectedPreviousIdentity":session.snapshot().classic_rule_selection.as_ref().map(|context| context.identity()),
        "expectedSourceSetSha256":classic_source_set_sha256(session.snapshot()).unwrap(),
        "nativeMenuSelection":20,"packageFinalization":package})
}

fn selection_and_readiness(
    session: &mut EditorSession,
    store: &ProjectStore,
    package: &Value,
) -> (Value, Value) {
    let params = selection_params(session, package);
    let preview = dispatch_result_with_store(
        session,
        Some(store),
        "classic-rule-selection.preview",
        params.clone(),
    )
    .unwrap();
    request(session, store, "classic-rule-selection.set", params);
    let readiness = request(
        session,
        store,
        "project.inspect-rebuilt-readiness",
        json!({"packageFinalization":package,"limit":200}),
    );
    (preview, readiness)
}

#[test]
fn complete_import_then_monster_refresh_save_reopen_preserves_rule_selection_and_readiness() {
    let temporary = tempfile::tempdir().unwrap();
    let (store, mut session, source) = complete_import(temporary.path());
    let original = annex(&session, &store);
    assert_eq!(original["sourceInventoryVersion"], 2);
    assert!(
        !session
            .snapshot()
            .classic_sources
            .iter()
            .any(|source| source.native_path == "Data Race")
    );
    let package = application_package(temporary.path(), session.snapshot());
    let (before_preview, before_ready) = selection_and_readiness(&mut session, &store, &package);
    assert_eq!(before_preview["ready"], true, "{before_preview}");
    let before_sources = session.snapshot().classic_sources.clone();
    request(
        &mut session,
        &store,
        "project.import-classic-monsters",
        json!({"directory":source}),
    );
    assert_eq!(annex(&session, &store), original);
    assert_eq!(session.snapshot().classic_sources, before_sources);
    let (_, mut reopened) = ProjectStore::open_session(store.root()).unwrap();
    let (after_preview, after_ready) = selection_and_readiness(&mut reopened, &store, &package);
    assert_eq!(after_preview["ready"], true, "{after_preview}");
    for key in [
        "status",
        "blockerCount",
        "blockers",
        "warnings",
        "warningCount",
    ] {
        assert_eq!(after_ready[key], before_ready[key], "readiness field {key}");
    }
}

#[test]
fn every_partial_annex_owner_retains_the_complete_inventory_and_updates_exact_files() {
    let temporary = tempfile::tempdir().unwrap();
    let (store, mut session, source) = complete_import(temporary.path());
    for method in [
        "land-slice",
        "dungeon-slice",
        "monsters",
        "battles",
        "complex-encounters",
        "rogue-encounters",
        "timed-encounters",
        "treasures",
        "shops",
        "option-labels",
        "player-maps",
        "player-map-names",
        "media",
        "spells",
    ] {
        let mut params = json!({"directory":source});
        if method == "spells" {
            params["path"] = json!(source.join("Data Spell"));
            params["textPath"] = json!(source.join("Data Spell.rsrc"));
        }
        request(
            &mut session,
            &store,
            &format!("project.import-classic-{method}"),
            params,
        );
        let inventory = annex(&session, &store);
        assert_eq!(inventory["sourceInventoryVersion"], 2, "{method}");
        assert_eq!(
            inventory["files"],
            json!(session.snapshot().classic_sources),
            "{method}"
        );
    }
    let mut changed = fs::read(source.join("Data MD")).unwrap();
    changed[170..176].copy_from_slice(b"Edited");
    fs::write(source.join("Data MD"), &changed).unwrap();
    request(
        &mut session,
        &store,
        "project.import-classic-monsters",
        json!({"directory":source}),
    );
    let descriptor = session
        .snapshot()
        .classic_sources
        .iter()
        .find(|source| source.native_path == "Data MD")
        .unwrap();
    assert_eq!(store.read_blob(&descriptor.blob).unwrap(), changed);
    assert_eq!(
        annex(&session, &store)["files"],
        json!(session.snapshot().classic_sources)
    );
}

#[test]
fn legacy_inventory_refresh_cannot_make_absent_race_selection_ready() {
    let temporary = tempfile::tempdir().unwrap();
    let (store, session, source) = complete_import(temporary.path());
    let package = application_package(temporary.path(), session.snapshot());
    for evidence in [None, Some(1), Some(3)] {
        let mut snapshot = session.snapshot().clone();
        let mut legacy = annex(&session, &store);
        legacy
            .as_object_mut()
            .unwrap()
            .remove("sourceInventoryVersion");
        if let Some(version) = evidence {
            legacy["sourceInventoryVersion"] = json!(version);
        }
        snapshot.origin = ProjectOrigin::Imported {
            compatibility_annex: store
                .put_blob(&serde_json::to_vec(&legacy).unwrap())
                .unwrap(),
        };
        let mut refreshed = EditorSession::new(snapshot);
        crate::combat_import::import_classic_monsters(
            &mut refreshed,
            Some(&store),
            json!({"expectedRevision":0,"directory":source}),
        )
        .unwrap();
        assert_ne!(
            annex(&refreshed, &store)["sourceInventoryVersion"],
            json!(2)
        );
        assert_absence_is_unproven(&mut refreshed, &store, &package);
    }
}

fn assert_absence_is_unproven(session: &mut EditorSession, store: &ProjectStore, package: &Value) {
    let params = selection_params(session, package);
    let preview = dispatch_result_with_store(
        session,
        Some(store),
        "classic-rule-selection.preview",
        params.clone(),
    )
    .unwrap();
    assert_eq!(preview["ready"], false);
    assert!(
        preview["message"]
            .as_str()
            .unwrap()
            .contains("cannot establish whether Data Race is absent")
    );
    dispatch_result_with_store(session, Some(store), "classic-rule-selection.set", params).unwrap();
    let readiness = dispatch_result_with_store(
        session,
        Some(store),
        "project.inspect-rebuilt-readiness",
        json!({"packageFinalization":package}),
    )
    .unwrap();
    assert_eq!(readiness["status"], "blocked");
    assert!(
        readiness["blockers"]
            .as_array()
            .unwrap()
            .iter()
            .any(
                |blocker| blocker["code"] == "rebuilt.rule-selection.unresolved"
                    && blocker["message"]
                        .as_str()
                        .unwrap()
                        .contains("cannot establish whether Data Race is absent")
            )
    );
}

#[test]
fn inconsistent_complete_annex_aborts_partial_refresh_without_mutation() {
    let temporary = tempfile::tempdir().unwrap();
    let (store, session, source) = complete_import(temporary.path());
    let mut snapshot = session.snapshot().clone();
    snapshot.origin = ProjectOrigin::Imported { compatibility_annex:store.put_blob(
        br#"{"format":"providence-classic-source-annex-v1","sourceInventoryVersion":2,"files":[]}"#).unwrap() };
    let mut invalid = EditorSession::new(snapshot.clone());
    let error = crate::combat_import::import_classic_monsters(
        &mut invalid,
        Some(&store),
        json!({"expectedRevision":0,"directory":source}),
    )
    .unwrap_err();
    assert!(error.contains("does not match captured project sources"));
    assert_eq!(invalid.revision().0, 0);
    assert_eq!(invalid.snapshot(), &snapshot);
}

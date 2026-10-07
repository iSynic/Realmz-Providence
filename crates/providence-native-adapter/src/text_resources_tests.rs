use crate::classic_compilation::compile_project_classic_slice;
use crate::classic_media_import::import_classic_media;
use crate::dispatch_result;
use crate::dispatch_result_with_store;
use crate::reference_strings::list_reference_strings;
use crate::reference_strings::open_reference_string;
use crate::text_resources::read_text_resource;
use crate::text_resources::update_text_resource;
use providence_core::codecs::decode_classic_text_assets;
use providence_core::model::NativeRecordId;
use providence_core::model::ProjectSnapshot;
use providence_core::model::ScenarioMessage;
use providence_core::model::StableId;
use providence_core::session::EditorSession;
use providence_core::session::Revision;
use providence_storage::ProjectStore;
use serde_json::json;
use std::fs;

use providence_core::codecs::{
    ResourceEntry, parse_resource_entries_preserving_duplicates, write_resource_fork,
};
use std::path::Path;

#[test]
fn classic_text_resource_edit_is_revisioned_durable_and_preserves_style_and_neighbors() {
    let temporary = tempfile::tempdir().expect("temporary project");
    let scenario_resources = controlled_resource_fork();
    let (store, mut session) = import_text_project(temporary.path(), &scenario_resources);
    assert_text_browsing(&mut session, &store);
    assert_reference_browsing(&session, &store);
    edit_with_revision_guards(&mut session, &store);
    undo_redo_and_checkpoint(&mut session, &store);

    let (store, reopened) =
        ProjectStore::open_session(store.root()).expect("reopen edited text project");
    assert_reopened_text(&reopened, &store);
    let compiled = compile_twice(&reopened, &store, temporary.path());
    assert_owned_resource_bytes(&scenario_resources, &compiled);
}

fn controlled_resource_fork() -> Vec<u8> {
    write_resource_fork(&[
        ResourceEntry {
            resource_type: *b"TEXT",
            id: -201,
            name: "Moon Gate Chronicle".into(),
            attributes: 5,
            data: b"Chronicle\rSecond page".to_vec(),
        },
        ResourceEntry {
            resource_type: *b"styl",
            id: -201,
            name: "Chronicle styles".into(),
            attributes: 3,
            data: vec![0, 1, 2, 3, 4, 5],
        },
        ResourceEntry {
            resource_type: *b"PICT",
            id: 128,
            name: "Untouched neighbor".into(),
            attributes: 7,
            data: vec![9, 8, 7, 6],
        },
    ])
    .expect("controlled resource fork")
}

fn import_text_project(root: &Path, scenario_resources: &[u8]) -> (ProjectStore, EditorSession) {
    let source_directory = root.join("classic-text-source");
    fs::create_dir(&source_directory).expect("create source directory");
    fs::write(source_directory.join("Scenario.rsrc"), scenario_resources)
        .expect("write source resource fork");

    let mut snapshot = ProjectSnapshot::new_authored(StableId("text-edit".into()));
    snapshot.messages.push(ScenarioMessage {
        identity: StableId("message:0".into()),
        native_id: NativeRecordId(0),
        text: "Text resource certification anchor".into(),
        authored: true,
    });
    let store =
        ProjectStore::create(root.join("project"), &snapshot).expect("create project store");
    let mut session = EditorSession::new(snapshot);
    import_classic_media(
        &mut session,
        Some(&store),
        json!({"expectedRevision": 0, "directory": source_directory}),
    )
    .expect("import Classic text resources");
    assert_eq!(session.revision(), Revision(1));

    (store, session)
}

fn assert_text_browsing(session: &mut EditorSession, store: &ProjectStore) {
    let listed = dispatch_result(session, "text-resource.list", json!({"limit": 1}))
        .expect("list text resources");
    assert_eq!(listed["total"], 1);
    assert_eq!(listed["items"][0]["resourceId"], -201);
    assert_eq!(listed["items"][0]["hasStyleCompanion"], true);
    let resolved = dispatch_result_with_store(
        session,
        None,
        "text-resource.resolve-exact",
        json!({"resourceId": -201}),
    )
    .expect("resolve exact scenario scrolling text");
    assert_eq!(resolved["resource"]["resourceType"], "TEXT");
    assert_eq!(resolved["resource"]["resourceId"], -201);
    assert_eq!(resolved["ownership"], "scenario");
    assert!(
        dispatch_result_with_store(
            session,
            None,
            "text-resource.resolve-exact",
            json!({"resourceId": 201}),
        )
        .unwrap_err()
        .contains("was not found")
    );
    let opened = read_text_resource(
        session,
        Some(store),
        json!({"identity": "classic-resource:TEXT:-201"}),
    )
    .expect("open text resource");
    assert_eq!(opened["text"], "Chronicle\nSecond page");
    assert_eq!(
        opened["styleCompanion"]["ownership"],
        "compatibility-preserved"
    );
}

fn assert_reference_browsing(session: &EditorSession, store: &ProjectStore) {
    let references =
        list_reference_strings(session, Some(store), json!({"offset": 0, "limit": 128}))
            .expect("list current text and style reference groups");
    assert_eq!(references["counts"]["text"], 1);
    assert_eq!(references["counts"]["styles"], 1);
    assert_eq!(references["counts"]["stringLists"], 0);
    assert_eq!(references["total"], 2);
    let text_group = references["items"]
        .as_array()
        .unwrap()
        .iter()
        .find(|item| item["resourceType"] == "TEXT")
        .expect("TEXT reference group");
    assert_eq!(text_group["preview"], "Chronicle\nSecond page");
    let reference_open = open_reference_string(
        session,
        Some(store),
        json!({"identity": text_group["identity"], "entryLimit": 128}),
    )
    .expect("open current TEXT reference group");
    assert_eq!(reference_open["entryTotal"], 1);
    assert_eq!(
        reference_open["entries"][0]["text"],
        "Chronicle\nSecond page"
    );
    assert_eq!(
        reference_open["editableDocument"]["command"],
        "text-resource.open"
    );
    assert!(reference_open.get("snapshot").is_none());
}

fn edit_with_revision_guards(session: &mut EditorSession, store: &ProjectStore) {
    let unrepresentable = update_text_resource(
        session,
        Some(store),
        json!({
            "expectedRevision": 1,
            "identity": "classic-resource:TEXT:-201",
            "text": "A dragon 🐉"
        }),
    )
    .expect_err("Classic text must reject unrepresentable characters");
    assert!(unrepresentable.contains("not representable in Classic MacRoman"));
    assert_eq!(session.revision(), Revision(1));

    let update = update_text_resource(
        session,
        Some(store),
        json!({
            "expectedRevision": 1,
            "identity": "classic-resource:TEXT:-201",
            "text": "Edited café\nSecond page"
        }),
    )
    .expect("update text resource");
    assert_eq!(update["revision"], 2);
    assert_eq!(update["resourceType"], "TEXT");
    assert_eq!(update["resourceId"], -201);
    let stale = update_text_resource(
        session,
        Some(store),
        json!({
            "expectedRevision": 1,
            "identity": "classic-resource:TEXT:-201",
            "text": "Stale edit"
        }),
    )
    .expect_err("stale edit must be rejected before blob writes");
    assert!(stale.contains("revision conflict"));
}

fn undo_redo_and_checkpoint(session: &mut EditorSession, store: &ProjectStore) {
    dispatch_result(session, "history.undo", json!({"expectedRevision": 2}))
        .expect("undo text edit");
    assert_eq!(
        read_text_resource(
            session,
            Some(store),
            json!({"identity": "classic-resource:TEXT:-201"})
        )
        .unwrap()["text"],
        "Chronicle\nSecond page"
    );
    dispatch_result(session, "history.redo", json!({"expectedRevision": 3}))
        .expect("redo text edit");
    store
        .checkpoint_session(session, &json!({"method": "text-resource.update"}))
        .expect("checkpoint text edit");
}

fn assert_reopened_text(reopened: &EditorSession, store: &ProjectStore) {
    assert_eq!(reopened.revision(), Revision(4));
    assert_eq!(
        read_text_resource(
            reopened,
            Some(store),
            json!({"identity": "classic-resource:TEXT:-201"})
        )
        .unwrap()["text"],
        "Edited café\nSecond page"
    );
    let edited_reference = open_reference_string(
        reopened,
        Some(store),
        json!({
            "identity": "reference-string:asset:classic-resource:TEXT:-201",
            "entryLimit": 128
        }),
    )
    .expect("reopen edited TEXT through reference catalog");
    assert_eq!(
        edited_reference["entries"][0]["text"],
        "Edited café\nSecond page"
    );
}

fn compile_twice(reopened: &EditorSession, store: &ProjectStore, root: &Path) -> Vec<u8> {
    let first_directory = root.join("compiled-text-first");
    let second_directory = root.join("compiled-text-second");
    let first =
        compile_project_classic_slice(reopened, store, json!({"directory": first_directory}))
            .expect("compile edited text");
    let second =
        compile_project_classic_slice(reopened, store, json!({"directory": second_directory}))
            .expect("repeat edited text compile");
    assert_eq!(first["manifestSha256"], second["manifestSha256"]);
    let compiled = fs::read(root.join("compiled-text-first/Scenario.rsrc"))
        .expect("read compiled resource fork");
    assert_eq!(
        compiled,
        fs::read(root.join("compiled-text-second/Scenario.rsrc")).unwrap()
    );
    compiled
}

fn assert_owned_resource_bytes(scenario_resources: &[u8], compiled: &[u8]) {
    let before = parse_resource_entries_preserving_duplicates(scenario_resources).unwrap();
    let after = parse_resource_entries_preserving_duplicates(compiled).unwrap();
    assert_eq!(before.len(), after.len());
    for original in before {
        let compiled_entry = after
            .iter()
            .find(|entry| entry.resource_type == original.resource_type && entry.id == original.id)
            .expect("resource preserved");
        if original.resource_type == *b"TEXT" {
            assert_eq!(compiled_entry.data, b"Edited caf\x8e\rSecond page");
            assert_eq!(compiled_entry.name, "Moon Gate Chronicle");
            assert_eq!(compiled_entry.attributes, 5);
        } else {
            assert_eq!(compiled_entry, &original);
        }
    }
    let reimported = decode_classic_text_assets(compiled, "Scenario.rsrc")
        .expect("fresh reimport of compiled text");
    let text = reimported
        .iter()
        .find(|asset| asset.asset.kind == "text-resource")
        .expect("reimported TEXT");
    assert_eq!(text.runtime_payload, b"Edited caf\xc3\xa9\nSecond page");
}

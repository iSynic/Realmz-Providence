use super::*;
use providence_core::personal_library::{LibraryCommand, PersonalAsset};
use std::fs;

mod assignment;
mod copying;

#[test]
fn collections_are_paged_with_stable_identities() {
    let temp = tempfile::Builder::new()
        .prefix("providence-collections-")
        .tempdir()
        .unwrap();
    let store = PersonalLibraryStore::create(temp.path().join("library")).unwrap();
    for index in 0..3 {
        dispatch(Some(&store), "personal-library.create-collection", &json!({"expectedRevision":index,"identity":format!("collection:{index}"),"name":format!("Collection {index}")})).unwrap();
    }
    let page = dispatch(
        Some(&store),
        "personal-library.collections",
        &json!({"offset":1,"limit":1}),
    )
    .unwrap();
    assert_eq!(page["items"].as_array().unwrap().len(), 1);
    assert_eq!(page["items"][0]["identity"], "collection:1");
    assert_eq!(page["truncated"], true);
    assert_eq!(page["total"], 3);
    assert_eq!(page["revision"], 3);
}

#[test]
fn collection_seek_reveals_current_identity_beyond_first_page() {
    let temp = tempfile::tempdir().unwrap();
    let store = PersonalLibraryStore::create(temp.path().join("library")).unwrap();
    for index in 0..140 {
        dispatch(
            Some(&store),
            "personal-library.create-collection",
            &json!({
            "expectedRevision":index,"identity":format!("collection:{index:03}"),
            "name":format!("Collection {index}")}),
        )
        .unwrap();
    }
    let sought = dispatch(
        Some(&store),
        "personal-library.collections",
        &json!({"seekIdentity":"collection:139","limit":128}),
    )
    .unwrap();
    assert_eq!(sought["offset"], 128);
    assert_eq!(sought["items"].as_array().unwrap().len(), 12);
    assert_eq!(sought["items"][11]["identity"], "collection:139");
    assert_eq!(sought["total"], 140);
    assert_eq!(sought["revision"], 140);
    assert_eq!(store.load_manifest().unwrap().revision(), 140);
}

#[test]
fn image_import_reopens_with_preview_and_keeps_original_unchanged() {
    let temp = tempfile::Builder::new()
        .prefix("providence-personal-image-")
        .tempdir()
        .unwrap();
    let root = temp.path().join("library");
    let store = PersonalLibraryStore::create(&root).unwrap();
    let original =
        providence_core::codecs::encode_runtime_rgba_png(&[120, 20, 30, 128], 1, 1).unwrap();
    let path = temp.path().join("art.png");
    fs::write(&path, &original).unwrap();
    dispatch(
        Some(&store),
        "personal-library.import-image",
        &json!({"identity":"personal:art","name":"Ruby","expectedRevision":0,"path":path}),
    )
    .unwrap();
    let (reopened, manifest) = PersonalLibraryStore::open(&root).unwrap();
    let asset = manifest.asset(&StableId("personal:art".into())).unwrap();
    assert_eq!(asset.mime_type, "image/png");
    assert_eq!(reopened.read_original(&asset.original).unwrap(), original);
    let result = dispatch(
        Some(&reopened),
        "personal-library.preview",
        &json!({"identity":"personal:art"}),
    )
    .unwrap();
    assert_eq!(result["width"], 1);
    assert_eq!(result["height"], 1);
    assert_eq!(
        BASE64.decode(result["base64"].as_str().unwrap()).unwrap(),
        original
    );
    fs::write(&path, b"not an image").unwrap();
    assert!(
        dispatch(
            Some(&reopened),
            "personal-library.import-image",
            &json!({"identity":"personal:bad","name":"Bad","expectedRevision":1,"path":path})
        )
        .is_err()
    );
    assert_eq!(reopened.load_manifest().unwrap().revision(), 1);
    assert_eq!(reopened.read_original(&asset.original).unwrap(), original);
}

#[test]
fn personal_library_configuration_reopens_and_reports_unconfigured_state() {
    assert_eq!(
        dispatch(None, "personal-library.describe", &json!({})).unwrap(),
        json!({"configured":false})
    );
    assert!(dispatch(None, "personal-library.list", &json!({})).is_err());
    let temp = tempfile::Builder::new()
        .prefix("providence-personal-config-")
        .tempdir()
        .unwrap();
    let root = temp.path().join("library").to_string_lossy().into_owned();
    let args = || vec!["--personal-library-root".to_owned(), root.clone()].into_iter();
    let configured = crate::open_library_arguments(&mut args()).unwrap();
    dispatch(
        configured.personal_library.as_ref(),
        "personal-library.create-collection",
        &json!({"expectedRevision":0,"identity":"collection:one","name":"My additions"}),
    )
    .unwrap();
    let reopened = crate::open_library_arguments(&mut args()).unwrap();
    assert_eq!(
        dispatch(
            reopened.personal_library.as_ref(),
            "personal-library.describe",
            &json!({})
        )
        .unwrap()["revision"],
        1
    );
    assert!(
        crate::open_library_arguments(&mut vec!["--personal-library-root".to_owned()].into_iter())
            .is_err()
    );
}

#[test]
fn personal_library_transport_keeps_scenario_revision_and_snapshot_unchanged() {
    let temp = tempfile::Builder::new()
        .prefix("providence-personal-transport-")
        .tempdir()
        .unwrap();
    let store = PersonalLibraryStore::create(temp.path().join("library")).unwrap();
    let mut session = providence_core::session::EditorSession::new(crate::demo::demo_ui_snapshot());
    let before = serde_json::to_value(session.snapshot()).unwrap();
    let revision = session.revision();
    let requests = [
        json!({"id":1,"method":"personal-library.create-collection","params":{"expectedRevision":0,"identity":"collection:forest","name":"Forest"}}),
        json!({"id":2,"method":"personal-library.create-collection","params":{"expectedRevision":0,"identity":"collection:stale","name":"Stale"}}),
        json!({"id":3,"method":"personal-library.describe","params":{}}),
    ];
    let input = requests
        .iter()
        .map(Value::to_string)
        .collect::<Vec<_>>()
        .join("\n");
    let mut output = Vec::new();
    crate::transport::serve_io_with_libraries(
        &mut session,
        None,
        crate::CatalogViews {
            personal_library: Some(&store),
            ..Default::default()
        },
        None,
        None,
        std::io::Cursor::new(input),
        &mut output,
    )
    .unwrap();
    let responses = String::from_utf8(output)
        .unwrap()
        .lines()
        .map(|line| serde_json::from_str::<Value>(line).unwrap())
        .collect::<Vec<_>>();
    assert_eq!(responses.len(), 3);
    assert_eq!(responses[0]["ok"], true);
    assert_eq!(responses[0]["result"]["revision"], 1);
    assert_eq!(responses[1]["ok"], false);
    assert_eq!(responses[2]["result"]["collections"], 1);
    assert_eq!(session.revision(), revision);
    assert_eq!(serde_json::to_value(session.snapshot()).unwrap(), before);
    assert!(responses[0]["result"].get("snapshot").is_none());
}

#[test]
fn personal_commands_persist_and_list_bounded_results_without_a_project() {
    let temp = tempfile::Builder::new()
        .prefix("providence-personal-adapter-")
        .tempdir()
        .unwrap();
    let store = PersonalLibraryStore::create(temp.path().join("library")).unwrap();
    let original = temp.path().join("original.bin");
    fs::write(&original, b"original").unwrap();
    let result=dispatch(Some(&store),"personal-library.import-original",&json!({"expectedRevision":0,"identity":"personal:1","name":"Woodland token","path":original})).unwrap();
    assert_eq!(result["revision"], 1);
    dispatch(
        Some(&store),
        "personal-library.rename",
        &json!({"expectedRevision":1,"identity":"personal:1","name":"Forest token"}),
    )
    .unwrap();
    let list = dispatch(
        Some(&store),
        "personal-library.list",
        &json!({"query":"forest","limit":100000}),
    )
    .unwrap();
    assert_eq!(list["limit"], 128);
    assert_eq!(list["total"], 1);
    assert_eq!(list["items"][0]["name"], "Forest token");
    assert!(
        dispatch(
            Some(&store),
            "personal-library.remove",
            &json!({"expectedRevision":1,"identity":"personal:1"})
        )
        .is_err()
    );
    dispatch(
        Some(&store),
        "personal-library.remove",
        &json!({"expectedRevision":2,"identity":"personal:1"}),
    )
    .unwrap();
    assert_eq!(store.load().unwrap().assets().count(), 0);
    assert_eq!(fs::read(original).unwrap(), b"original");
}

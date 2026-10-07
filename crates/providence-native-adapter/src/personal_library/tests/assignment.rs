use super::*;
use providence_core::{
    model::ProjectSnapshot,
    session::{EditorCommand, EditorSession},
};
use providence_storage::ProjectStore;
use std::path::Path;

#[test]
fn personal_item_assignment_is_one_undoable_change() {
    let temp = tempfile::Builder::new()
        .prefix("providence-personal-assignment-")
        .tempdir()
        .unwrap();
    let (library, project, snapshot) = assignment_fixture(temp.path());
    let mut session = EditorSession::new(snapshot.clone());
    let mut params = json!({"identity":"personal:ruby","resourceId":30126,"recordIndex":999,"expectedRevision":0,"expectedLibraryRevision":1});
    assert!(
        apply_item_artwork(&mut session, Some(&project), Some(&library), None, &params).is_err()
    );
    assert_eq!(session.snapshot(), &snapshot);
    params["recordIndex"] = json!(0);
    crate::dispatch_result_with_catalogs(
        &mut session,
        Some(&project),
        crate::CatalogViews {
            personal_library: Some(&library),
            ..Default::default()
        },
        None,
        "personal-library.apply-item-artwork",
        params,
    )
    .unwrap();
    assert_eq!(session.revision().0, 1);
    assert_preview_matches_native(&library, &project, &session);
    assert_eq!(session.snapshot().assets.len(), 1);
    assert_eq!(
        session.snapshot().scenario_item_rules[0].definition.icon_id,
        30126
    );
    assert_assignment_history(&project, &mut session);
    assert_eq!(library.load().unwrap().revision(), 1);
}

fn assignment_fixture(root: &Path) -> (PersonalLibraryStore, ProjectStore, ProjectSnapshot) {
    let library = PersonalLibraryStore::create(root.join("library")).unwrap();
    let bytes =
        providence_core::codecs::encode_runtime_rgba_png(&[200, 20, 40, 255], 1, 1).unwrap();
    library
        .apply(
            0,
            LibraryCommand::Import(
                (PersonalAsset {
                    identity: StableId("personal:ruby".into()),
                    name: "Ruby".into(),
                    collection: None,
                    original: library.put_original(&bytes).unwrap(),
                    byte_length: bytes.len() as u64,
                    mime_type: "image/png".into(),
                    media: None,
                    import_kind: None,
                })
                .into(),
            ),
        )
        .unwrap();
    let mut snapshot = ProjectSnapshot::new_authored(StableId("assignment".into()));
    let project = ProjectStore::create(root.join("project"), &snapshot).unwrap();
    snapshot.scenario_item_rules = providence_core::codecs::decode_scenario_item_rules(
        &vec![0; 20000],
        None,
        project.put_blob(&vec![0; 20000]).unwrap(),
        None,
    )
    .unwrap()
    .rules;
    (library, project, snapshot)
}

fn assert_preview_matches_native(
    library: &PersonalLibraryStore,
    project: &ProjectStore,
    session: &EditorSession,
) {
    let preview = dispatch(
        Some(library),
        "personal-library.preview-icon",
        &json!({"identity":"personal:ruby","expectedLibraryRevision":1}),
    )
    .unwrap();
    let native = project
        .read_blob(
            session.snapshot().assets[0]
                .classic_payload_blob
                .as_ref()
                .unwrap(),
        )
        .unwrap();
    let decoded = providence_core::codecs::decode_cicn(&native).unwrap();
    let expected_preview = providence_core::codecs::encode_runtime_rgba_png(
        &decoded.rgba,
        decoded.width,
        decoded.height,
    )
    .unwrap();
    assert_eq!(
        BASE64.decode(preview["base64"].as_str().unwrap()).unwrap(),
        expected_preview
    );
    assert!(
        dispatch(
            Some(library),
            "personal-library.preview-icon",
            &json!({"identity":"personal:ruby","expectedLibraryRevision":0})
        )
        .is_err()
    );
}

fn assert_assignment_history(project: &ProjectStore, session: &mut EditorSession) {
    crate::execute(session, &json!({"expectedRevision":1}), EditorCommand::Undo).unwrap();
    assert!(session.snapshot().assets.is_empty());
    assert_eq!(
        session.snapshot().scenario_item_rules[0].definition.icon_id,
        0
    );
    crate::execute(session, &json!({"expectedRevision":2}), EditorCommand::Redo).unwrap();
    project
        .checkpoint_session(session, &json!({"method":"personal-assignment-test"}))
        .unwrap();
    let (_, reopened) = ProjectStore::open_session(project.root()).unwrap();
    assert_eq!(
        reopened.snapshot().scenario_item_rules[0]
            .definition
            .icon_id,
        30126
    );
    assert_eq!(reopened.snapshot().assets.len(), 1);
}

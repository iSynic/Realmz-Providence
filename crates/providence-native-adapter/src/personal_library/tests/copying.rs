use super::*;
use providence_core::{
    model::ProjectSnapshot,
    session::{EditorCommand, EditorSession},
};
use providence_storage::ProjectStore;
use std::path::Path;

#[test]
fn copied_artwork_is_owned_by_each_scenario_and_compiles_deterministically() {
    let temp = tempfile::Builder::new()
        .prefix("providence-copy-artwork-")
        .tempdir()
        .unwrap();
    let library = PersonalLibraryStore::create(temp.path().join("library")).unwrap();
    let png = providence_core::codecs::encode_runtime_rgba_png(&[200, 20, 40, 255], 1, 1).unwrap();
    let path = temp.path().join("ruby.png");
    fs::write(&path, &png).unwrap();
    dispatch(
        Some(&library),
        "personal-library.import-image",
        &json!({"identity":"personal:ruby","name":"Ruby","expectedRevision":0,"path":path}),
    )
    .unwrap();
    let snapshot = ProjectSnapshot::new_authored(StableId("copy-test".into()));
    let first = ProjectStore::create(temp.path().join("first"), &snapshot).unwrap();
    assert_retained_icon_rejects_copy(&first, &library, &snapshot);
    let second = ProjectStore::create(temp.path().join("second"), &snapshot).unwrap();
    for project in [&first, &second] {
        copy_and_checkpoint(project, &library, &snapshot);
    }
    dispatch(
        Some(&library),
        "personal-library.remove",
        &json!({"identity":"personal:ruby","expectedRevision":1}),
    )
    .unwrap();
    let (_, mut first_session) = ProjectStore::open_session(first.root()).unwrap();
    crate::execute(
        &mut first_session,
        &json!({"expectedRevision":3}),
        EditorCommand::RemoveAsset {
            identity: StableId("icon:30126".into()),
        },
    )
    .unwrap();
    first
        .checkpoint_session(&first_session, &json!({"method":"remove-test"}))
        .unwrap();
    let (_, second_session) = ProjectStore::open_session(second.root()).unwrap();
    assert_eq!(second_session.snapshot().assets.len(), 1);
    assert_eq!(
        second
            .read_blob(&second_session.snapshot().assets[0].blob)
            .unwrap(),
        png
    );
    assert_deterministic_compile(temp.path(), &second, &second_session);
    assert!(
        ProjectStore::open_session(first.root())
            .unwrap()
            .1
            .snapshot()
            .assets
            .is_empty()
    );
    assert!(library.load().unwrap().assets().next().is_none());
}

fn assert_retained_icon_rejects_copy(
    first: &ProjectStore,
    library: &PersonalLibraryStore,
    snapshot: &ProjectSnapshot,
) {
    let retained = providence_core::codecs::merge_resource_entries(
        &providence_core::codecs::empty_resource_fork(),
        vec![providence_core::codecs::ResourceEntry {
            resource_type: *b"cicn",
            id: 30126,
            name: "Undecoded artwork".into(),
            attributes: 0,
            data: vec![7, 8, 9],
        }],
    )
    .unwrap();
    let mut retained_snapshot = snapshot.clone();
    retained_snapshot
        .classic_sources
        .push(providence_core::model::ClassicSourceBlob {
            native_path: "Scenario.rsrc".into(),
            blob: first.put_blob(&retained).unwrap(),
            byte_length: retained.len() as u64,
        });
    let mut retained_session = EditorSession::new(retained_snapshot.clone());
    assert!(copy_icon(&mut retained_session,Some(first),Some(library),None,&json!({"identity":"personal:ruby","resourceId":30126,"expectedRevision":0,"expectedLibraryRevision":1})).is_err());
    assert_eq!(retained_session.snapshot(), &retained_snapshot);
}

fn copy_and_checkpoint(
    project: &ProjectStore,
    library: &PersonalLibraryStore,
    snapshot: &ProjectSnapshot,
) {
    let mut session = EditorSession::new(snapshot.clone());
    let params = json!({"identity":"personal:ruby","resourceId":30126,"expectedRevision":0,"expectedLibraryRevision":1});
    copy_icon(&mut session, Some(project), Some(library), None, &params).unwrap();
    assert_eq!(session.snapshot().assets.len(), 1);
    let mut collision = params.clone();
    collision["expectedRevision"] = json!(1);
    assert!(copy_icon(&mut session, Some(project), Some(library), None, &collision).is_err());
    crate::execute(
        &mut session,
        &json!({"expectedRevision":1}),
        EditorCommand::Undo,
    )
    .unwrap();
    assert!(session.snapshot().assets.is_empty());
    crate::execute(
        &mut session,
        &json!({"expectedRevision":2}),
        EditorCommand::Redo,
    )
    .unwrap();
    project
        .checkpoint_session(&session, &json!({"method":"copy-test"}))
        .unwrap();
}

fn assert_deterministic_compile(
    root: &Path,
    second: &ProjectStore,
    second_session: &EditorSession,
) {
    let output_a = root.join("compile-a");
    let output_b = root.join("compile-b");
    let a = crate::classic_compilation::compile_project_classic_slice(
        second_session,
        second,
        json!({"directory":output_a}),
    )
    .unwrap();
    let b = crate::classic_compilation::compile_project_classic_slice(
        second_session,
        second,
        json!({"directory":output_b}),
    )
    .unwrap();
    assert_eq!(a["manifestSha256"], b["manifestSha256"]);
    assert_eq!(
        fs::read(output_a.join("Scenario.rsrc")).unwrap(),
        fs::read(output_b.join("Scenario.rsrc")).unwrap()
    );
}

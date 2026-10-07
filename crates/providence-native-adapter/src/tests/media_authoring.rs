use crate::{catalogs::CatalogViews, transport::serve_io_with_libraries};
use providence_core::{
    codecs::encode_runtime_rgba_png,
    model::{AssetDescriptor, ProjectSnapshot, StableId},
    session::{EditorCommand, EditorSession, ExpectedRevisionCommand, Revision},
};
use providence_storage::{PersonalLibraryStore, ProjectStore};
use serde_json::{Value, json};
use std::{fs, io::Cursor};

mod export_tests;
mod music_playback_tests;
mod music_tests;

struct Fixture {
    temporary: tempfile::TempDir,
    project: ProjectStore,
    library: PersonalLibraryStore,
    session: EditorSession,
}

impl Fixture {
    fn new() -> Self {
        let temporary = tempfile::tempdir().unwrap();
        let snapshot = ProjectSnapshot::new_authored(StableId("media-authoring-test".into()));
        let project = ProjectStore::create(temporary.path().join("project"), &snapshot).unwrap();
        let library = PersonalLibraryStore::create(temporary.path().join("library")).unwrap();
        Self {
            temporary,
            project,
            library,
            session: EditorSession::new(snapshot),
        }
    }

    fn request(&mut self, method: &str, params: Value) -> Value {
        let request = json!({"id":1,"method":method,"params":params});
        let mut output = Vec::new();
        serve_io_with_libraries(
            &mut self.session,
            Some(&self.project),
            CatalogViews {
                personal_library: Some(&self.library),
                ..Default::default()
            },
            None,
            None,
            Cursor::new(format!("{request}\n")),
            &mut output,
        )
        .unwrap();
        serde_json::from_slice(&output).unwrap()
    }

    fn review(&mut self, family: &str, params: &mut Value) {
        let response = self.request(&format!("{family}.prepare"), params.clone());
        assert_eq!(response["ok"], true, "{response}");
        params["reviewHash"] = response["result"]["reviewHash"].clone();
    }

    fn commit(&mut self, family: &str, mut params: Value) {
        self.review(family, &mut params);
        let response = self.request(&format!("{family}.commit"), params);
        assert_eq!(response["ok"], true, "{response}");
    }

    fn png(&self, name: &str, color: [u8; 4]) -> std::path::PathBuf {
        let path = self.temporary.path().join(name);
        write_png(&path, color);
        path
    }

    fn add_style(&mut self, id: i32) -> AssetDescriptor {
        let mut style = self.session.snapshot().assets[0].clone();
        style.identity = StableId(format!("text-style-resource:{id}"));
        style.kind = "text-style-resource".into();
        style.classic_resource.as_mut().unwrap().resource_type = "styl".into();
        style.classic_resource.as_mut().unwrap().resource_id = id;
        style.blob = self.project.put_blob(&[0, 0]).unwrap();
        style.byte_length = 2;
        style.classic_payload_blob = Some(style.blob.clone());
        style.classic_payload_byte_length = Some(2);
        style.mime_type = Some("application/octet-stream".into());
        style.extension = None;
        self.session
            .execute(ExpectedRevisionCommand {
                expected_revision: self.session.revision(),
                command: EditorCommand::UpsertAsset {
                    asset: Box::new(style.clone()),
                },
            })
            .unwrap();
        style
    }
}

fn write_png(path: &std::path::Path, color: [u8; 4]) {
    fs::write(
        path,
        encode_runtime_rgba_png(&color.repeat(64 * 64), 64, 64).unwrap(),
    )
    .unwrap();
}

#[test]
fn reviewed_import_rejects_changed_source_and_persists_exact_output_and_history() {
    let mut f = Fixture::new();
    let path = f.png("picture.png", [10, 20, 30, 255]);
    let mut params = json!({"expectedRevision":0,"destination":"scenario","path":path,"kind":"picture","name":"Scene","resourceId":30000});
    f.review("media.import", &mut params);
    assert_eq!(f.session.revision().0, 0);
    write_png(&path, [40, 50, 60, 255]);
    assert_eq!(
        f.request("media.import.commit", params.clone())["ok"],
        false
    );
    assert_eq!(f.session.revision().0, 0);
    f.review("media.import", &mut params);
    params["operationId"] = json!("a".repeat(64));
    assert_eq!(f.request("media.import.commit", params.clone())["ok"], true);
    let (_, reopened) = ProjectStore::open_session(f.project.root()).unwrap();
    assert_eq!(reopened.snapshot().assets, f.session.snapshot().assets);
    let status = f.request("media.operation.status",json!({"domain":"project","operationId":"a".repeat(64),"expectedIntent":{"method":"media.import.commit","params":params}}));
    assert_eq!(status["result"]["outcome"], "committed");
    assert_eq!(
        f.request("history.undo", json!({"expectedRevision":1}))["ok"],
        true
    );
    assert!(f.session.snapshot().assets.is_empty());
    assert_eq!(
        f.request("history.redo", json!({"expectedRevision":2}))["ok"],
        true
    );
    assert_eq!(f.session.snapshot().assets.len(), 1);
}

#[test]
fn transfer_and_copy_use_independent_revisions_and_never_overwrite() {
    let mut f = Fixture::new();
    let path = f.png("icon.png", [30, 20, 10, 255]);
    f.commit("media.import",json!({"expectedRevision":0,"destination":"scenario","path":path,"kind":"icon","name":"Token","resourceId":30000}));
    f.commit("media.transfer",json!({"expectedRevision":1,"expectedLibraryRevision":0,"identity":"icon:30000","libraryIdentity":"personal:token","name":"Reusable token"}));
    assert_eq!(f.session.revision().0, 1);
    assert_eq!(f.library.load().unwrap().revision(), 1);
    f.commit("media.copy",json!({"expectedRevision":1,"expectedLibraryRevision":1,"identity":"personal:token","resourceId":30001}));
    let copied = f.session.snapshot().assets.clone();
    assert_eq!(f.request("media.copy.prepare",json!({"expectedRevision":2,"expectedLibraryRevision":1,"identity":"personal:token","resourceId":30001}))["ok"],false);
    assert_eq!(f.session.snapshot().assets, copied);
    assert_eq!(
        f.request("personal-library.undo", json!({"expectedRevision":1}))["ok"],
        true
    );
    assert!(f.library.load().unwrap().assets().next().is_none());
    assert_eq!(f.session.snapshot().assets, copied);
}

#[test]
fn signed_text_and_paired_artwork_survive_library_copy() {
    for (kind, id, pair) in [
        ("text-resource", -32768, false),
        ("combat-icon", 31000, true),
    ] {
        let mut f = Fixture::new();
        let path = f.temporary.path().join("source");
        let reverse = f.png("reverse.png", [30, 20, 10, 255]);
        if pair {
            write_png(&path, [10, 20, 30, 255]);
        } else {
            fs::write(&path, "Command of Vixies\nCafé").unwrap();
        }
        f.commit("media.import",json!({"destination":"personal","expectedLibraryRevision":0,"path":path,"reversePath":reverse,"kind":kind,"name":"Reusable","resourceId":id,"libraryIdentity":"personal:entry","width":64,"height":64}));
        f.commit("media.copy",json!({"expectedRevision":0,"expectedLibraryRevision":1,"identity":"personal:entry","resourceId":id}));
        assert_eq!(f.session.snapshot().assets.len(), if pair { 2 } else { 1 });
        if pair {
            assert_eq!(
                f.session.snapshot().assets[1]
                    .classic_resource
                    .as_ref()
                    .unwrap()
                    .resource_id,
                31308
            );
        } else {
            assert_eq!(
                f.session.snapshot().assets[0]
                    .classic_resource
                    .as_ref()
                    .unwrap()
                    .resource_id,
                -32768
            );
        }
    }
}

#[test]
fn text_and_formatting_transfer_copy_and_rejection_are_atomic() {
    let mut f = Fixture::new();
    let path = f.temporary.path().join("text.txt");
    fs::write(&path, "Vixies\nCafé").unwrap();
    f.commit("media.import",json!({"expectedRevision":0,"destination":"scenario","path":path,"kind":"text-resource","name":"Vixies","resourceId":-202}));
    let style = f.add_style(-202);
    f.commit("media.transfer",json!({"expectedRevision":2,"expectedLibraryRevision":0,"identity":"text-resource:-202","libraryIdentity":"personal:styled","name":"Styled text"}));
    f.commit("media.copy",json!({"expectedRevision":2,"expectedLibraryRevision":1,"identity":"personal:styled","resourceId":-32768}));
    assert_eq!(f.session.revision(), Revision(3));
    assert_eq!(f.session.snapshot().assets.len(), 4);
    let copied_style = f
        .session
        .snapshot()
        .assets
        .iter()
        .find(|asset| {
            asset.kind == "text-style-resource"
                && asset.classic_resource.as_ref().unwrap().resource_id == -32768
        })
        .unwrap();
    assert_eq!(copied_style.blob, style.blob);
    assert_eq!(f.project.read_blob(&copied_style.blob).unwrap(), [0, 0]);
    let before = f.session.snapshot().clone();
    let text = before
        .assets
        .iter()
        .find(|asset| asset.identity.0 == "text-resource:-32768")
        .unwrap()
        .clone();
    assert!(
        f.session
            .execute(ExpectedRevisionCommand {
                expected_revision: Revision(3),
                command: EditorCommand::UpsertTextResourcePair {
                    text: Box::new(text),
                    style: Box::new(style)
                }
            })
            .is_err()
    );
    assert_eq!(f.session.snapshot(), &before);
    assert_eq!(f.session.revision(), Revision(3));
    assert_eq!(
        f.request("history.undo", json!({"expectedRevision":3}))["ok"],
        true
    );
    assert_eq!(f.session.snapshot().assets.len(), 2);
    assert_eq!(
        f.request("history.redo", json!({"expectedRevision":4}))["ok"],
        true
    );
    assert_eq!(f.session.snapshot().assets.len(), 4);
}

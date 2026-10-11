use super::*;
use providence_core::{
    model::{ClassicResourceKey, ProjectSnapshot, StableId},
    session::{EditorCommand, ExpectedRevisionCommand, Revision},
};
use std::{fs, path::Path};

mod formats;
mod libraries;
mod output_contract;

struct Fixture {
    temporary: tempfile::TempDir,
    project: ProjectStore,
    session: EditorSession,
}

impl Fixture {
    fn new() -> Self {
        let temporary = tempfile::tempdir().unwrap();
        let snapshot = ProjectSnapshot::new_authored(StableId("asset-export-fixture".into()));
        let project = ProjectStore::create(temporary.path().join("project"), &snapshot).unwrap();
        Self {
            temporary,
            project,
            session: EditorSession::new(snapshot),
        }
    }

    fn add(&mut self, id: &str, kind: &str, mime: &str, bytes: &[u8], native: Option<&[u8]>) {
        let blob = self.project.put_blob(bytes).unwrap();
        let asset = AssetDescriptor {
            identity: StableId(id.into()),
            label: "../CON: same name".into(),
            kind: kind.into(),
            mime_type: Some(mime.into()),
            blob,
            byte_length: bytes.len() as u64,
            classic_resource: Some(ClassicResourceKey {
                resource_type: if kind == "text-resource" {
                    "TEXT"
                } else {
                    "cicn"
                }
                .into(),
                resource_id: 128 + self.session.snapshot().assets.len() as i32,
            }),
            classic_payload_blob: native.map(|b| self.project.put_blob(b).unwrap()),
            classic_payload_byte_length: native.map(|b| b.len() as u64),
            scenario_music_slot: None,
            extension: None,
            width: Some(1),
            height: Some(1),
            duration_ms: None,
            sample_rate: None,
            channels: None,
            tile_width: None,
            tile_height: None,
            columns: None,
            rows: None,
            landlook: None,
            base_tile: None,
            source: "controlled asset-export fixture".into(),
        };
        let revision = self.session.revision();
        self.session
            .execute(ExpectedRevisionCommand {
                expected_revision: revision,
                command: EditorCommand::UpsertAsset {
                    asset: Box::new(asset),
                },
            })
            .unwrap();
    }

    fn selection(&self, categories: Vec<&str>) -> Value {
        json!({"selection":{"scopes":["scenario"],"categories":categories,"identity":null,
            "originals":true,"converted":true}})
    }

    fn request(&self, method: &str, params: &Value) -> Result<Value, String> {
        dispatch(
            &self.session,
            Some(&self.project),
            CatalogViews::default(),
            method,
            params,
        )
    }

    fn write(&self, mut params: Value) -> Value {
        params["reviewHash"] =
            self.request("asset-export.plan", &params).unwrap()["reviewHash"].clone();
        params["directory"] = json!(self.temporary.path());
        self.request("asset-export.write", &params).unwrap()
    }
}

fn png() -> Vec<u8> {
    providence_core::codecs::encode_runtime_rgba_png(&[10, 20, 30, 128], 1, 1).unwrap()
}

fn manifest(result: &Value) -> Value {
    serde_json::from_slice(
        &fs::read(Path::new(result["directory"].as_str().unwrap()).join("export-manifest.json"))
            .unwrap(),
    )
    .unwrap()
}

#[test]
fn export_keeps_one_native_original_and_one_full_resolution_png_without_mutating_session() {
    let mut f = Fixture::new();
    let image =
        providence_core::codecs::encode_runtime_rgba_png(&[10, 20, 30, 128].repeat(42), 7, 6)
            .unwrap();
    let native = b"exact controlled native bytes";
    f.add("asset:icon:128", "icon", "image/png", &image, Some(native));
    let before = f.session.snapshot().clone();
    let revision = f.session.revision();
    let result = f.write(f.selection(vec!["icons"]));
    let receipt = manifest(&result);
    assert_eq!(result["files"], 2);
    assert_eq!(result["issueCount"], 0);
    for file in receipt["files"].as_array().unwrap() {
        let bytes = fs::read(
            Path::new(result["directory"].as_str().unwrap()).join(file["path"].as_str().unwrap()),
        )
        .unwrap();
        assert_eq!(
            bytes,
            if file["format"] == "originals" {
                native.to_vec()
            } else {
                image.clone()
            }
        );
    }
    assert_eq!(f.session.snapshot(), &before);
    assert_eq!(f.session.revision(), revision);
}

#[test]
fn bulk_selection_uses_entire_catalog_and_same_label_files_cannot_collide() {
    let mut f = Fixture::new();
    for index in 0..130 {
        f.add(&format!("asset:{index}"), "icon", "image/png", &png(), None);
    }
    f.add("asset:sound", "sound", "audio/wav", b"not a WAV", None);
    let result = f.write(f.selection(vec!["icons"]));
    assert_eq!(result["assets"], 130);
    assert_eq!(result["files"], 130);
    let paths: std::collections::BTreeSet<_> = manifest(&result)["files"]
        .as_array()
        .unwrap()
        .iter()
        .map(|file| file["path"].as_str().unwrap().to_owned())
        .collect();
    assert_eq!(paths.len(), 130);
    assert!(
        paths
            .iter()
            .all(|path| !path.contains("..") && !path.contains(":"))
    );
}

#[test]
fn changed_options_or_revision_reject_export_before_creating_any_output() {
    let mut f = Fixture::new();
    f.add("asset:first", "icon", "image/png", &png(), None);
    let mut params = f.selection(vec!["icons"]);
    params["reviewHash"] = f.request("asset-export.plan", &params).unwrap()["reviewHash"].clone();
    params["directory"] = json!(f.temporary.path());
    params["selection"]["originals"] = json!(false);
    assert!(f.request("asset-export.write", &params).is_err());
    params["selection"]["originals"] = json!(true);
    f.add("asset:second", "icon", "image/png", &png(), None);
    assert!(f.request("asset-export.write", &params).is_err());
    assert_eq!(fs::read_dir(f.temporary.path()).unwrap().count(), 1);
}

#[test]
fn unsupported_conversions_and_corrupt_media_are_reported_without_losing_originals() {
    let mut f = Fixture::new();
    f.add(
        "asset:style",
        "text-style-resource",
        "application/octet-stream",
        b"exact style",
        None,
    );
    f.add("asset:bad-png", "picture", "image/png", b"not PNG", None);
    let result = f.write(f.selection(vec!["text", "pictures"]));
    assert_eq!(result["files"], 2);
    assert_eq!(result["issueCount"], 2);
    assert_eq!(manifest(&result)["issues"].as_array().unwrap().len(), 2);
}

#[test]
fn export_refuses_source_store_destination_and_preserves_existing_destination_files() {
    let mut f = Fixture::new();
    f.add("asset:icon", "icon", "image/png", &png(), None);
    let mut params = f.selection(vec!["icons"]);
    params["reviewHash"] = f.request("asset-export.plan", &params).unwrap()["reviewHash"].clone();
    params["directory"] = json!(f.project.root());
    assert!(f.request("asset-export.write", &params).is_err());
    let sentinel = f.temporary.path().join("existing.png");
    fs::write(&sentinel, b"keep").unwrap();
    let first = f.write(f.selection(vec!["icons"]));
    let second = f.write(f.selection(vec!["icons"]));
    assert_ne!(first["directory"], second["directory"]);
    assert_eq!(fs::read(sentinel).unwrap(), b"keep");
    assert_eq!(f.session.revision(), Revision(1));
}

#[test]
fn individual_selection_and_utf8_conversion_preserve_exact_text_original() {
    let mut f = Fixture::new();
    f.add(
        "asset:text",
        "text-resource",
        "text/plain",
        "é\rsecond\0".as_bytes(),
        None,
    );
    f.add("asset:other", "text-resource", "text/plain", b"other", None);
    let mut params = f.selection(vec!["text"]);
    params["selection"]["identity"] = json!("asset:text");
    let result = f.write(params);
    assert_eq!(result["assets"], 1);
    for file in manifest(&result)["files"].as_array().unwrap() {
        let bytes = fs::read(
            Path::new(result["directory"].as_str().unwrap()).join(file["path"].as_str().unwrap()),
        )
        .unwrap();
        assert_eq!(
            bytes,
            if file["format"] == "converted" {
                "é\nsecond\0".as_bytes()
            } else {
                "é\rsecond\0".as_bytes()
            }
        );
    }
}

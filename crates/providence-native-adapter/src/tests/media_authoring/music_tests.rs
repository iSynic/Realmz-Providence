use super::*;

pub(super) fn module(title: &str) -> Vec<u8> {
    let mut bytes = vec![0; 1084 + 1024];
    bytes[..title.len()].copy_from_slice(title.as_bytes());
    bytes[950] = 1;
    bytes[1080..1084].copy_from_slice(b"M.K.");
    bytes.extend_from_slice(b"retained trailing bytes");
    bytes
}

pub(super) fn import(f: &Fixture, path: &std::path::Path, slot: i32) -> Value {
    json!({"destination":"scenario","expectedRevision":f.session.revision().0,
        "path":path,"kind":"music","name":"Harbor at Dusk","resourceId":slot})
}

#[test]
fn music_import_preserves_module_and_rejects_unreviewed_source_changes() {
    let mut f = Fixture::new();
    let path = f.temporary.path().join("harbor.mod");
    let bytes = module("Harbor");
    fs::write(&path, &bytes).unwrap();
    let mut params = import(&f, &path, 1);
    let review = f.request("media.import.prepare", params.clone());
    assert_eq!(review["ok"], true, "{review}");
    assert!(
        review["result"]["preview"]["primary"]
            .get("base64")
            .is_none()
    );
    assert_eq!(review["result"]["preview"]["primary"]["exactSource"], true);
    params["reviewHash"] = review["result"]["reviewHash"].clone();
    fs::write(&path, module("Market")).unwrap();
    assert_eq!(
        f.request("media.import.commit", params.clone())["ok"],
        false
    );
    assert_eq!(f.session.revision().0, 0);
    fs::write(&path, &bytes).unwrap();
    params["operationId"] = json!("b".repeat(64));
    assert_eq!(f.request("media.import.commit", params)["ok"], true);
    let asset = f.session.snapshot().assets[0].clone();
    assert_eq!(asset.identity.0, "asset:scenario-music:1");
    assert_eq!(asset.scenario_music_slot, Some(1));
    assert_eq!(f.project.read_blob(&asset.blob).unwrap(), bytes);
    let (_, reopened) = ProjectStore::open_session(f.project.root()).unwrap();
    assert_eq!(reopened.snapshot().assets, f.session.snapshot().assets);
    assert_eq!(
        f.request("history.undo", json!({"expectedRevision":1}))["ok"],
        true
    );
    assert!(f.session.snapshot().assets.is_empty());
    assert_eq!(
        f.request("history.redo", json!({"expectedRevision":2}))["ok"],
        true
    );
    assert_music_export_after_unrelated_edit(&mut f, &bytes);
}

#[test]
fn music_slots_require_explicit_replacement_and_current_revisions() {
    let mut f = Fixture::new();
    let path = f.temporary.path().join("music.mod");
    fs::write(&path, module("Harbor")).unwrap();
    for slot in 1..=3 {
        let params = import(&f, &path, slot);
        f.commit("media.import", params);
    }
    for slot in [0, 1, 2, 3, 4] {
        let params = import(&f, &path, slot);
        assert_eq!(f.request("media.import.prepare", params)["ok"], false);
    }
    let mut replacement = import(&f, &path, 2);
    replacement["replaceIdentity"] = json!("asset:scenario-music:2");
    f.review("media.import", &mut replacement);
    let before = f.session.snapshot().assets.clone();
    replacement["expectedRevision"] = json!(2);
    assert_eq!(
        f.request("media.import.commit", replacement.clone())["ok"],
        false
    );
    assert_eq!(f.session.snapshot().assets, before);
    replacement["expectedRevision"] = json!(3);
    fs::write(&path, module("Market")).unwrap();
    f.commit("media.import", replacement);
    assert_eq!(f.session.snapshot().assets.len(), 3);
    assert_eq!(
        f.session.snapshot().assets[1].identity.0,
        "asset:scenario-music:2"
    );
    assert_eq!(
        f.project
            .read_blob(&f.session.snapshot().assets[1].blob)
            .unwrap(),
        module("Market")
    );
}

#[test]
fn music_library_transfer_and_copy_keep_exact_bytes_and_rebase_slot() {
    let mut f = Fixture::new();
    let path = f.temporary.path().join("music.mod");
    fs::write(&path, module("Harbor")).unwrap();
    let params = import(&f, &path, 1);
    f.commit("media.import", params);
    f.commit(
        "media.transfer",
        json!({"expectedRevision":1,"expectedLibraryRevision":0,
        "identity":"asset:scenario-music:1","libraryIdentity":"personal:harbor","name":"Harbor"}),
    );
    assert_eq!(f.session.revision().0, 1);
    let mut copy = json!({"expectedRevision":1,"expectedLibraryRevision":1,
        "identity":"personal:harbor","resourceId":3});
    f.review("media.copy", &mut copy);
    copy["expectedLibraryRevision"] = json!(0);
    assert_eq!(f.request("media.copy.commit", copy.clone())["ok"], false);
    copy["expectedLibraryRevision"] = json!(1);
    assert_eq!(f.request("media.copy.commit", copy.clone())["ok"], true);
    let copied = f
        .session
        .snapshot()
        .assets
        .iter()
        .find(|asset| asset.scenario_music_slot == Some(3))
        .unwrap();
    assert_eq!(copied.identity.0, "asset:scenario-music:3");
    assert_eq!(copied.source, "Custom 3 Music");
    assert_eq!(f.project.read_blob(&copied.blob).unwrap(), module("Harbor"));
    copy["expectedRevision"] = json!(2);
    assert_eq!(f.request("media.copy.prepare", copy)["ok"], false);
}

#[test]
fn music_invalid_import_does_not_mutate_scenario_or_library() {
    let mut f = Fixture::new();
    let path = f.temporary.path().join("music.mod");
    for bytes in [
        b"MADG unsupported".to_vec(),
        module("Truncated")[..1100].to_vec(),
    ] {
        fs::write(&path, bytes).unwrap();
        for destination in ["scenario", "personal"] {
            let mut params = import(&f, &path, 1);
            params["destination"] = json!(destination);
            params["expectedLibraryRevision"] = json!(0);
            params["libraryIdentity"] = json!("personal:invalid");
            assert_eq!(f.request("media.import.prepare", params)["ok"], false);
        }
    }
    assert_eq!(f.session.revision().0, 0);
    assert_eq!(f.library.load().unwrap().revision(), 0);
}

fn assert_music_export_after_unrelated_edit(f: &mut Fixture, bytes: &[u8]) {
    let picture = f.png("scene.png", [60, 20, 100, 255]);
    f.commit(
        "media.import",
        json!({"expectedRevision":3,"destination":"scenario",
        "path":picture,"kind":"picture","name":"Scene","resourceId":30000}),
    );
    let output = f.temporary.path().join("classic");
    crate::classic_compilation::compile_project_classic_slice(
        &f.session,
        &f.project,
        json!({"directory":output}),
    )
    .unwrap();
    assert_eq!(fs::read(output.join("Custom 1 Music")).unwrap(), bytes);
    let index =
        providence_core::rebuilt::project_rebuilt_v3_asset_index(f.session.snapshot()).unwrap();
    assert!(
        index
            .assets
            .iter()
            .any(|asset| asset.scenario_music_slot == Some(1))
    );
}

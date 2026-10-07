use super::{
    music_tests::{import, module},
    *,
};

#[test]
fn music_audition_is_exact_file_backed_revision_bound_and_never_overwrites() {
    let mut f = Fixture::new();
    let source = f.temporary.path().join("harbor.mod");
    let bytes = module("Harbor");
    fs::write(&source, &bytes).unwrap();
    let params = import(&f, &source, 1);
    f.commit("media.import", params);
    let job = f.temporary.path().join("audition");
    let mut params = json!({"scope":"scenario","identity":"asset:scenario-music:1",
        "expectedRevision":0,"jobRoot":job});
    assert_eq!(
        f.request("media.music-audition.prepare", params.clone())["ok"],
        false
    );
    assert!(!job.exists());
    params["expectedRevision"] = json!(1);
    let response = f.request("media.music-audition.prepare", params.clone());
    assert_eq!(response["ok"], true, "{response}");
    assert!(response["result"].get("base64").is_none());
    assert_eq!(fs::read(job.join("source.mod")).unwrap(), bytes);
    assert_eq!(f.session.revision().0, 1);
    assert_eq!(
        f.request("media.music-audition.prepare", params)["ok"],
        false
    );
    assert_eq!(fs::read(job.join("source.mod")).unwrap(), bytes);
    f.commit(
        "media.transfer",
        json!({"expectedRevision":1,"expectedLibraryRevision":0,
        "identity":"asset:scenario-music:1","libraryIdentity":"personal:harbor","name":"Harbor"}),
    );
    let personal = f.temporary.path().join("personal-audition");
    let mut params = json!({"scope":"personal","identity":"personal:harbor",
        "expectedLibraryRevision":0,"jobRoot":personal});
    assert_eq!(
        f.request("media.music-audition.prepare", params.clone())["ok"],
        false
    );
    assert!(!personal.exists());
    params["expectedLibraryRevision"] = json!(1);
    assert_eq!(
        f.request("media.music-audition.prepare", params)["ok"],
        true
    );
    assert_eq!(fs::read(personal.join("source.mod")).unwrap(), bytes);
    assert_eq!(f.library.load().unwrap().revision(), 1);
}

#[test]
fn music_retained_unusable_native_files_are_not_silent_free_slots() {
    let mut f = Fixture::new();
    let source = f.temporary.path().join("valid.mod");
    fs::write(&source, module("Market")).unwrap();
    let mut snapshot = f.session.snapshot().clone();
    let bytes = b"MADG retained unsupported source";
    snapshot.origin = providence_core::model::ProjectOrigin::Imported {
        compatibility_annex: f
            .project
            .put_blob(b"controlled imported source evidence")
            .unwrap(),
    };
    snapshot
        .classic_sources
        .push(providence_core::model::ClassicSourceBlob {
            native_path: "Custom 3 Music".into(),
            blob: f.project.put_blob(bytes).unwrap(),
            byte_length: bytes.len() as u64,
        });
    f.session = EditorSession::new(snapshot);
    let params = import(&f, &source, 3);
    let response = f.request("media.import.prepare", params);
    assert_eq!(response["ok"], false);
    assert!(
        response["error"]
            .as_str()
            .unwrap()
            .contains("retained or ambiguous")
    );
    assert_eq!(f.session.revision().0, 0);
    assert_eq!(
        f.project
            .read_blob(&f.session.snapshot().classic_sources[0].blob)
            .unwrap(),
        bytes
    );
    let slots = f.request("media.music-slots", json!({"expectedRevision":0}));
    let retained = &slots["result"]["items"][2];
    assert_eq!(retained["slotStatus"], "quarantined");
    assert_eq!(retained["canImport"], false);
    assert_eq!(retained["canReplace"], false);
}

#[test]
fn music_slot_catalog_is_bounded_searchable_and_revision_bound() {
    let mut f = Fixture::new();
    let empty = f.request("media.music-slots", json!({"expectedRevision":0}));
    assert_eq!(empty["result"]["total"], 3);
    assert_eq!(empty["result"]["assigned"], 0);
    assert!(
        empty["result"]["items"]
            .as_array()
            .unwrap()
            .iter()
            .all(|row| row["canImport"] == true)
    );
    let source = f.temporary.path().join("harbor.mod");
    fs::write(&source, module("Harbor")).unwrap();
    let params = import(&f, &source, 2);
    f.commit("media.import", params);
    assert_eq!(
        f.request("media.music-slots", json!({"expectedRevision":0}))["ok"],
        false
    );
    let slots = f.request("media.music-slots", json!({"expectedRevision":1}));
    assert_eq!(slots["result"]["assigned"], 1);
    let assigned = &slots["result"]["items"][1];
    assert_eq!(assigned["identity"], "asset:scenario-music:2");
    assert_eq!(assigned["slotStatus"], "assigned");
    assert_eq!(assigned["canReplace"], true);
    assert_eq!(assigned["canImport"], false);
    let filtered = f.request("media.music-slots", json!({"query":"Custom 3"}));
    assert_eq!(filtered["result"]["total"], 1);
    assert_eq!(filtered["result"]["items"][0]["slot"], 3);
    assert_eq!(
        f.request("media.music-slots", json!({"query":"absent"}))["result"]["total"],
        0
    );
}

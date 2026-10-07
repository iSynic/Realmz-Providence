use crate::{catalogs::OpenMonsterLibrary, monster_library_defaults::initialize};
use providence_core::{
    model::StableId, monster_library::MonsterLibraryCommand, session::ExpectedRevisionCommand,
};
use providence_storage::MonsterLibraryStore;
use std::{fs, path::PathBuf};

fn bundled_manifest() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../godot/bundled/monster-library/manifest.json")
}

#[test]
fn monster_library_defaults_are_protected_pinned_and_do_not_replace_history() {
    let root = tempfile::tempdir().unwrap();
    let (store, session) =
        MonsterLibraryStore::create(root.path().join("library"), StableId("test-library".into()))
            .unwrap();
    let mut library = OpenMonsterLibrary { store, session };
    initialize(&mut library, bundled_manifest().to_str().unwrap()).unwrap();
    let source = &library.session.catalog().sources[0];
    assert_eq!(source.record_count, 201);
    assert_eq!(source.record_bytes, 466);
    assert_eq!(
        source.sha256,
        "fcf1afd726fdc1a08f72ee2393872a8d2d2bda4ffcf1a4b98236feb40daff46c"
    );
    assert_eq!(
        source.evidence_revision,
        "56ac232c22fc321a99cb819f1e2d8c3985ad479a"
    );
    assert_eq!(library.session.catalog().built_ins.len(), 201);
    assert_eq!(library.session.catalog().effective_entries().len(), 190);
    assert!(!library.session.can_undo());
    let identity = library.session.catalog().built_ins[0].identity.clone();
    library
        .session
        .execute(ExpectedRevisionCommand {
            expected_revision: library.session.revision(),
            command: MonsterLibraryCommand::CustomizeBuiltIn {
                source: identity,
                label: Some("Personal Frog".into()),
            },
        })
        .unwrap();
    library.store.checkpoint_session(&library.session).unwrap();
    let before = library.session.persisted_state();
    initialize(
        &mut library,
        "unavailable-manifest-is-not-read-for-existing-catalogs",
    )
    .unwrap();
    assert_eq!(library.session.persisted_state(), before);
    let (_, reopened) = MonsterLibraryStore::open_session(library.store.root()).unwrap();
    assert_eq!(reopened.persisted_state(), before);
}

#[test]
fn monster_library_defaults_reject_changed_source_before_provisioning() {
    let root = tempfile::tempdir().unwrap();
    let source = bundled_manifest();
    fs::copy(&source, root.path().join("manifest.json")).unwrap();
    fs::write(
        root.path().join("Monster Scrap Book"),
        b"untrusted truncated source",
    )
    .unwrap();
    let (store, session) =
        MonsterLibraryStore::create(root.path().join("library"), StableId("test-library".into()))
            .unwrap();
    let mut library = OpenMonsterLibrary { store, session };
    let before = library.session.persisted_state();
    let error = initialize(
        &mut library,
        root.path().join("manifest.json").to_str().unwrap(),
    )
    .unwrap_err();
    assert!(error.contains("differs from its pinned manifest"));
    assert_eq!(library.session.persisted_state(), before);
    assert!(library.store.load_catalog().unwrap().sources.is_empty());
}

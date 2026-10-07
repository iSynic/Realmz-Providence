use crate::catalogs::OpenMonsterLibrary;
use crate::dispatch_result_with_application_store;
use crate::monster_library_routes::dispatch_monster_library;
use crate::monster_population_tests;
use providence_core::model::NativeRecordId;
use providence_core::model::ProjectSnapshot;
use providence_core::model::StableId;
use providence_core::session::EditorSession;
use providence_core::session::Revision;
use providence_storage::MonsterLibraryStore;
use serde_json::json;
use std::fs;

#[test]
fn monster_library_is_portable_protected_and_copies_to_scenario_atomically() {
    let temporary = tempfile::tempdir().expect("temporary Monster Library");
    let library_root = temporary.path().join("library");
    let source_path = temporary.path().join("Monster Scrap Book");
    write_scrapbook(&source_path);
    let (library_store, library_session) = MonsterLibraryStore::create(
        &library_root,
        StableId("monster-library:adapter-test".into()),
    )
    .expect("create portable Monster Library");
    let mut library = OpenMonsterLibrary {
        store: library_store,
        session: library_session,
    };
    let mut project = EditorSession::new(ProjectSnapshot::new_authored(StableId(
        "monster-library-project".into(),
    )));

    let custom = import_and_customize(&mut project, &mut library, &source_path);

    assert_builtin_population(&mut library);

    let before = assert_atomic_variant_copy(&mut project, &mut library, &custom);

    assert_stale_source_rejected(&mut project, &mut library);

    assert_scenario_copy_back(&mut project, &mut library, &before);

    library
        .store
        .checkpoint_session(&library.session)
        .expect("checkpoint library");
    let (_, reopened) = MonsterLibraryStore::open_session(&library_root).expect("reopen library");
    assert_eq!(reopened.revision(), Revision(3));
    assert_eq!(reopened.catalog().built_ins.len(), 1);
    assert_eq!(reopened.catalog().custom_entries.len(), 2);
    assert!(reopened.can_undo());
}

fn write_scrapbook(source_path: &std::path::Path) {
    let mut source = vec![0; providence_core::monster_library::MONSTER_SCRAPBOOK_RECORD_BYTES];
    source[0] = 8;
    source[1] = 3;
    source[170..181].copy_from_slice(b"Bell Keeper");
    let description = b"Guards a bell.";
    source[providence_core::codecs::MONSTER_RECORD_BYTES] = description.len() as u8;
    source[providence_core::codecs::MONSTER_RECORD_BYTES + 1
        ..providence_core::codecs::MONSTER_RECORD_BYTES + 1 + description.len()]
        .copy_from_slice(description);
    fs::write(source_path, &source).expect("write controlled scrapbook");
}

fn import_and_customize(
    project: &mut EditorSession,
    library: &mut OpenMonsterLibrary,
    source_path: &std::path::Path,
) -> StableId {
    let imported = dispatch_monster_library(
        project,
        Some(&mut *library),
        "monster-library.import-built-ins",
        json!({
            "path": source_path,
            "expectedRevision": 0,
            "evidenceRevision": "56ac232c22fc321a99cb819f1e2d8c3985ad479a",
            "evidencePath": "public/bundled-libraries/divinity/Divinity Data/Monster Scrap Book",
        }),
    )
    .expect("import protected built-ins");
    assert_eq!(imported["revision"], 1);
    let built_in = library.session.catalog().built_ins[0].identity.clone();

    dispatch_monster_library(
        project,
        Some(&mut *library),
        "monster-library.customize",
        json!({
            "expectedRevision": 1,
            "source": built_in,
            "label": "Bell Keeper Custom",
        }),
    )
    .expect("customize as override");
    assert_eq!(library.session.catalog().built_ins.len(), 1);
    assert_eq!(library.session.catalog().custom_entries.len(), 1);
    let custom = library.session.catalog().custom_entries[0].identity.clone();
    let listed = dispatch_monster_library(
        project,
        Some(&mut *library),
        "monster-library.filter-ownership",
        json!({"scope": "custom", "query": "keeper"}),
    )
    .expect("filter custom entries");
    assert_eq!(listed["total"], 1);
    assert_eq!(listed["items"][0]["identity"], custom.0);
    custom
}

fn assert_builtin_population(library: &mut OpenMonsterLibrary) {
    let mut populated_project = EditorSession::new(ProjectSnapshot::new_authored(StableId(
        "monster-library-populated-project".into(),
    )));
    monster_population_tests::assert_read_only_plan(&mut populated_project, library);
    let populated = dispatch_monster_library(
        &mut populated_project,
        Some(library),
        "monster-library.populate-scenario",
        json!({
            "expectedRevision": 0,
            "expectedLibraryRevision": 2,
            "ownership": "built-in",
        }),
    )
    .expect("populate selected library ownership in one revision");
    assert_eq!(populated["revision"], 1);
    assert_eq!(populated["changedEntitiesTotal"], 2);
    assert_eq!(
        populated_project.snapshot().monster_sets[0].monsters[0].display_name,
        "Bell Keeper"
    );
}

fn assert_atomic_variant_copy(
    project: &mut EditorSession,
    library: &mut OpenMonsterLibrary,
    custom: &StableId,
) -> ProjectSnapshot {
    let copied = dispatch_monster_library(
        project,
        Some(&mut *library),
        "monster-library.copy-and-generate-variants",
        json!({
            "expectedRevision": 0,
            "expectedLibraryRevision": 2,
            "identity": custom,
            "targetNativeId": 42,
        }),
    )
    .expect("copy and generate variants");
    assert_eq!(copied["revision"], 1);
    assert_eq!(copied["changedEntitiesTotal"], 4);
    assert_eq!(project.snapshot().monster_sets.len(), 3);
    assert_eq!(
        project
            .snapshot()
            .monster_descriptions
            .iter()
            .find(|description| description.native_id == NativeRecordId(42))
            .unwrap()
            .text,
        "Guards a bell."
    );
    let before = project.snapshot().clone();
    assert!(
        dispatch_monster_library(
            project,
            Some(&mut *library),
            "monster-library.copy-to-scenario",
            json!({
                "expectedRevision": 1,
                "expectedLibraryRevision": 2,
                "identity": custom,
                "targetNativeId": 42,
            }),
        )
        .is_err()
    );
    assert_eq!(project.snapshot(), &before);
    assert_eq!(project.revision(), Revision(1));
    before
}

fn assert_stale_source_rejected(project: &mut EditorSession, library: &mut OpenMonsterLibrary) {
    let library_before = library.session.catalog().clone();
    let stale = dispatch_result_with_application_store(
        project,
        None,
        None,
        None,
        Some(&mut *library),
        "monster.copy-to-library",
        json!({
            "expectedRevision": 0,
            "expectedLibraryRevision": 2,
            "setId": 0,
            "nativeId": 42,
        }),
    )
    .expect_err("stale project source cannot be copied");
    assert!(stale.contains("project revision conflict"));
    assert_eq!(library.session.catalog(), &library_before);
}

fn assert_scenario_copy_back(
    project: &mut EditorSession,
    library: &mut OpenMonsterLibrary,
    before: &ProjectSnapshot,
) {
    let copied_back = dispatch_result_with_application_store(
        project,
        None,
        None,
        None,
        Some(&mut *library),
        "monster.copy-to-library",
        json!({
            "expectedRevision": 1,
            "expectedLibraryRevision": 2,
            "setId": 0,
            "nativeId": 42,
            "label": "Bell Keeper Scenario Copy",
        }),
    )
    .expect("copy scenario Monster back to the portable library");
    assert_eq!(copied_back["projectRevision"], 1);
    assert_eq!(copied_back["projection"]["revision"], 3);
    assert_eq!(copied_back["entry"]["ownership"], "custom");
    assert_eq!(copied_back["entry"]["label"], "Bell Keeper Scenario Copy");
    assert_eq!(copied_back["entry"]["description"], "Guards a bell.");
    assert_eq!(copied_back["entry"]["origin"]["kind"], "scenario-monster");
    assert_eq!(
        copied_back["entry"]["origin"]["project"],
        "monster-library-project"
    );
    assert_eq!(
        copied_back["entry"]["origin"]["sourceMonster"],
        "monster:0:42"
    );
    assert_eq!(project.revision(), Revision(1));
    assert_eq!(project.snapshot(), before);
    assert_eq!(library.session.catalog().custom_entries.len(), 2);
}

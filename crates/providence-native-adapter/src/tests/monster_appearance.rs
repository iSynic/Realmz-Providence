use crate::catalogs::OpenMonsterLibrary;
use crate::classic_compilation::compile_project_classic_slice;
use crate::dispatch_result_with_application_store;
use crate::dispatch_result_with_store;
use base64::Engine as _;
use base64::engine::general_purpose::STANDARD as BASE64;
use providence_core::codecs::AUTHORED_MONSTER_APPEARANCE_SOURCE_PREFIX;
use providence_core::model::AssetDescriptor;
use providence_core::model::ClassicResourceKey;
use providence_core::model::ProjectSnapshot;
use providence_core::model::StableId;
use providence_core::monster_library::MonsterLibraryCommand;
use providence_core::monster_library::decode_monster_scrapbook;
use providence_core::rebuilt::APPLICATION_MEDIA_CATALOG_FORMAT_VERSION;
use providence_core::rebuilt::ApplicationMediaAsset;
use providence_core::rebuilt::ApplicationMediaCatalog;
use providence_core::rebuilt::ApplicationMediaSource;
use providence_core::session::EditorSession;
use providence_core::session::ExpectedRevisionCommand;
use providence_core::session::Revision;
use providence_storage::MonsterLibraryStore;
use providence_storage::ProjectStore;
use providence_storage::ReferenceLibraryStore;
use serde_json::json;
use std::fs;
use std::path::Path;

const BASE_PNG: &[u8] = b"controlled cicn 392 png";
const FACING_PNG: &[u8] = b"controlled cicn 700 png";

#[test]
fn custom_monster_appearance_pair_import_is_atomic_mirrored_and_compile_safe() {
    let temporary = tempfile::tempdir().expect("temporary project");
    let snapshot = ProjectSnapshot::new_authored(StableId("custom-appearance".into()));
    let store = ProjectStore::create(temporary.path().join("project"), &snapshot)
        .expect("create project store");
    let mut session = EditorSession::new(snapshot);
    let mut base_rgba = vec![0; 32 * 32 * 4];
    base_rgba[0..4].copy_from_slice(&[248, 16, 8, 255]);

    import_mirrored_pair(&mut session, &store, &base_rgba);
    assert_mirrored_payloads(&session, &store);
    assert_pair_compilation(temporary.path(), &session, &store);
    store
        .checkpoint_session(
            &session,
            &json!({"method": "monster-appearance.import-pair"}),
        )
        .expect("checkpoint custom pair");
    let (_, reopened) =
        ProjectStore::open_session(store.root()).expect("reopen custom appearance pair");
    assert_eq!(reopened.revision(), Revision(1));
    assert_eq!(reopened.snapshot().assets, session.snapshot().assets);
    assert_missing_facing_rejected(&mut session, &store, &base_rgba);
    replace_custom_facing(&mut session, &store, &base_rgba);
}

fn import_mirrored_pair(session: &mut EditorSession, store: &ProjectStore, base_rgba: &[u8]) {
    let imported = dispatch_result_with_store(
        session,
        Some(store),
        "monster-appearance.import-pair",
        json!({
            "expectedRevision": 0,
            "iconId": 392,
            "label": "Ashen Gate Spear Giant",
            "width": 32,
            "height": 32,
            "facingMode": "mirrored",
            "baseRgbaBase64": BASE64.encode(base_rgba),
        }),
    )
    .expect("import mirrored appearance pair");
    assert_eq!(imported["projection"]["revision"], 1);
    assert_eq!(
        imported["projection"]["changedEntities"]
            .as_array()
            .unwrap()
            .len(),
        2
    );
    assert_eq!(imported["appearance"]["state"], "complete");
    assert_eq!(imported["facingMode"], "mirrored");
    assert_eq!(session.snapshot().assets.len(), 2);
    assert!(session.snapshot().assets.iter().all(|asset| {
        asset
            .source
            .starts_with(AUTHORED_MONSTER_APPEARANCE_SOURCE_PREFIX)
            && asset.width == Some(32)
            && asset.height == Some(32)
    }));
}

fn assert_mirrored_payloads(session: &EditorSession, store: &ProjectStore) {
    let base = &session.snapshot().assets[0];
    let facing = &session.snapshot().assets[1];
    let base_cicn = store
        .read_blob(base.classic_payload_blob.as_ref().unwrap())
        .expect("read base cicn");
    let facing_cicn = store
        .read_blob(facing.classic_payload_blob.as_ref().unwrap())
        .expect("read facing cicn");
    let base_decoded = providence_core::codecs::decode_cicn(&base_cicn).unwrap();
    let facing_decoded = providence_core::codecs::decode_cicn(&facing_cicn).unwrap();
    assert_eq!((base_decoded.width, base_decoded.height), (32, 32));
    assert_eq!(base_decoded.rgba[3], 255);
    assert_eq!(facing_decoded.rgba[3], 0);
    assert_eq!(facing_decoded.rgba[(31 * 4) + 3], 255);
}

fn assert_pair_compilation(temporary: &Path, session: &EditorSession, store: &ProjectStore) {
    let first = temporary.join("compiled-first");
    let second = temporary.join("compiled-second");
    let first_result = compile_project_classic_slice(session, store, json!({"directory": first}))
        .expect("compile custom pair");
    let second_result = compile_project_classic_slice(session, store, json!({"directory": second}))
        .expect("repeat custom pair compile");
    assert_eq!(
        first_result["manifestSha256"],
        second_result["manifestSha256"]
    );
    assert_eq!(
        fs::read(first.join("Scenario.rsrc")).unwrap(),
        fs::read(second.join("Scenario.rsrc")).unwrap()
    );
    let entries = providence_core::codecs::parse_resource_entries(
        &fs::read(first.join("Scenario.rsrc")).unwrap(),
    )
    .unwrap();
    assert_eq!(
        entries.iter().map(|entry| entry.id).collect::<Vec<_>>(),
        [392, 700]
    );
}

fn assert_missing_facing_rejected(
    session: &mut EditorSession,
    store: &ProjectStore,
    base_rgba: &[u8],
) {
    let missing_facing = dispatch_result_with_store(
        session,
        Some(store),
        "monster-appearance.import-pair",
        json!({
            "expectedRevision": 1,
            "iconId": 392,
            "label": "Incomplete Custom Pair",
            "width": 32,
            "height": 32,
            "facingMode": "custom",
            "baseRgbaBase64": BASE64.encode(base_rgba),
        }),
    )
    .expect_err("custom facing art is required");
    assert!(missing_facing.contains("facingRgbaBase64"));
    assert_eq!(session.revision(), Revision(1));
    assert_eq!(session.snapshot().assets.len(), 2);
}

fn replace_custom_facing(session: &mut EditorSession, store: &ProjectStore, base_rgba: &[u8]) {
    let mut custom_facing_rgba = vec![0; 32 * 32 * 4];
    custom_facing_rgba[(16 * 4)..(17 * 4)].copy_from_slice(&[8, 240, 32, 255]);
    let customized = dispatch_result_with_store(
        session,
        Some(store),
        "monster-appearance.import-pair",
        json!({
            "expectedRevision": 1,
            "iconId": 392,
            "label": "Ashen Gate Spear Giant Custom Facing",
            "width": 32,
            "height": 32,
            "facingMode": "custom",
            "baseRgbaBase64": BASE64.encode(base_rgba),
            "facingRgbaBase64": BASE64.encode(&custom_facing_rgba),
        }),
    )
    .expect("replace pair with separate custom facing art");
    assert_eq!(customized["projection"]["revision"], 2);
    assert_eq!(customized["facingMode"], "custom");
    let custom_facing = session
        .snapshot()
        .assets
        .iter()
        .find(|asset| asset.identity.0.ends_with(":facing"))
        .unwrap();
    let custom_facing_cicn = store
        .read_blob(custom_facing.classic_payload_blob.as_ref().unwrap())
        .unwrap();
    let custom_facing_decoded = providence_core::codecs::decode_cicn(&custom_facing_cicn).unwrap();
    assert_eq!(custom_facing_decoded.rgba[3], 0);
    assert_eq!(custom_facing_decoded.rgba[(16 * 4) + 3], 255);
}

#[test]
fn monster_appearance_preview_uses_exact_application_pair_and_bounded_payloads() {
    let temporary = tempfile::tempdir().expect("temporary appearance workflow");
    let (application_store, application) = application_appearance_fixture(temporary.path());
    let (mut library, entry_identity) = appearance_library_fixture(temporary.path());
    let project_snapshot = ProjectSnapshot::new_authored(StableId("appearance-project".into()));
    let project_store =
        ProjectStore::create(temporary.path().join("project"), &project_snapshot).unwrap();
    let mut project = EditorSession::new(project_snapshot);
    assert_default_pair_preview(
        &mut project,
        &project_store,
        &application,
        &application_store,
        &mut library,
        &entry_identity,
    );
    materialize_default_pair(
        &mut project,
        &project_store,
        &application,
        &application_store,
        &mut library,
    );
    compile_materialized_pair(
        temporary.path(),
        &mut project,
        &project_store,
        &application,
        &application_store,
        &mut library,
    );
    project_store
        .checkpoint_session(
            &project,
            &json!({"method": "monster-appearance.materialize-defaults"}),
        )
        .expect("checkpoint materialized pair");
    let (project_store, mut project) =
        ProjectStore::open_session(project_store.root()).expect("reopen materialized pair");
    assert_eq!(project.revision(), Revision(1));
    assert_eq!(project.snapshot().assets.len(), 2);
    restore_default_pair(
        &mut project,
        &project_store,
        &application,
        &application_store,
        &mut library,
    );
}

fn appearance_library_fixture(temporary: &Path) -> (OpenMonsterLibrary, StableId) {
    let library_root = temporary.join("monster-library");
    let (library_store, mut library_session) = MonsterLibraryStore::create(
        &library_root,
        StableId("monster-library:appearance-test".into()),
    )
    .unwrap();
    let mut scrapbook = vec![0; providence_core::monster_library::MONSTER_SCRAPBOOK_RECORD_BYTES];
    scrapbook[98..100].copy_from_slice(&392_i16.to_be_bytes());
    scrapbook[170..180].copy_from_slice(b"River Toad");
    let decoded = decode_monster_scrapbook(
        &scrapbook,
        "Monster Scrap Book",
        "controlled",
        "controlled/Monster Scrap Book",
    );
    assert_eq!(
        library_store.put_blob(&scrapbook).unwrap(),
        decoded.source.blob
    );
    library_session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: MonsterLibraryCommand::ImportBuiltIns {
                source: decoded.source,
                entries: decoded.entries,
            },
        })
        .unwrap();
    let entry_identity = library_session.catalog().built_ins[0].identity.clone();
    let library = OpenMonsterLibrary {
        store: library_store,
        session: library_session,
    };
    (library, entry_identity)
}

fn assert_default_pair_preview(
    project: &mut EditorSession,
    project_store: &ProjectStore,
    application: &ApplicationMediaCatalog,
    application_store: &ReferenceLibraryStore,
    library: &mut OpenMonsterLibrary,
    entry_identity: &StableId,
) {
    let listed = dispatch_result_with_application_store(
        project,
        Some(project_store),
        Some(application),
        Some(application_store),
        Some(library),
        "monster-appearance.list",
        json!({}),
    )
    .expect("list complete default pairs");
    assert_eq!(listed["total"], 1);
    assert_eq!(listed["items"][0]["iconId"], 392);
    assert_eq!(listed["items"][0]["complete"], true);

    let preview = dispatch_result_with_application_store(
        project,
        None,
        Some(application),
        Some(application_store),
        Some(library),
        "monster-library.preview",
        json!({"identity": entry_identity}),
    )
    .expect("preview Monster Library appearance");
    assert_eq!(preview["format"], "providence.monster-appearance.v1");
    assert_eq!(preview["state"], "complete");
    assert_eq!(preview["pairOffset"], 308);
    assert_eq!(preview["base"]["resourceId"], 392);
    assert_eq!(preview["facing"]["resourceId"], 700);
    assert_eq!(preview["base"]["sourceRole"], "classic-application");
    assert_eq!(preview["payloadComplete"], true);
    assert_eq!(
        BASE64
            .decode(preview["base"]["base64"].as_str().unwrap())
            .unwrap(),
        BASE_PNG
    );
    assert_eq!(
        BASE64
            .decode(preview["facing"]["base64"].as_str().unwrap())
            .unwrap(),
        FACING_PNG
    );
    assert!(preview.get("snapshot").is_none());
    assert!(preview.get("project").is_none());
}

fn materialize_default_pair(
    project: &mut EditorSession,
    project_store: &ProjectStore,
    application: &ApplicationMediaCatalog,
    application_store: &ReferenceLibraryStore,
    library: &mut OpenMonsterLibrary,
) {
    let materialized = dispatch_result_with_application_store(
        project,
        Some(project_store),
        Some(application),
        Some(application_store),
        Some(library),
        "monster-appearance.materialize-defaults",
        json!({"expectedRevision": 0, "iconId": 392}),
    )
    .expect("materialize the complete application pair");
    assert_eq!(materialized["projection"]["revision"], 1);
    assert_eq!(materialized["appearance"]["state"], "complete");
    assert_eq!(materialized["appearance"]["base"]["sourceRole"], "scenario");
    assert_eq!(project.snapshot().assets.len(), 2);
    for asset in &project.snapshot().assets {
        project_store
            .read_blob(&asset.blob)
            .expect("copied runtime payload");
        project_store
            .read_blob(asset.classic_payload_blob.as_ref().unwrap())
            .expect("copied Classic payload");
    }
}

fn compile_materialized_pair(
    temporary: &Path,
    project: &mut EditorSession,
    project_store: &ProjectStore,
    application: &ApplicationMediaCatalog,
    application_store: &ReferenceLibraryStore,
    library: &mut OpenMonsterLibrary,
) {
    let compiled_directory = temporary.join("compiled-appearance");
    let compiled = dispatch_result_with_application_store(
        project,
        Some(project_store),
        Some(application),
        Some(application_store),
        Some(library),
        "project.compile-classic-slice",
        json!({"directory": compiled_directory}),
    )
    .expect("compile the materialized pair");
    assert_eq!(compiled["files"].as_array().unwrap().len(), 1);
    let compiled_entries = providence_core::codecs::parse_resource_entries(
        &fs::read(compiled_directory.join("Scenario.rsrc")).unwrap(),
    )
    .unwrap();
    assert_eq!(
        compiled_entries
            .iter()
            .map(|entry| entry.id)
            .collect::<Vec<_>>(),
        [392, 700]
    );
}

fn restore_default_pair(
    project: &mut EditorSession,
    project_store: &ProjectStore,
    application: &ApplicationMediaCatalog,
    application_store: &ReferenceLibraryStore,
    library: &mut OpenMonsterLibrary,
) {
    let restored = dispatch_result_with_application_store(
        project,
        Some(project_store),
        Some(application),
        Some(application_store),
        Some(library),
        "monster-appearance.restore-defaults",
        json!({"expectedRevision": 1, "iconId": 392}),
    )
    .expect("restore application fallback atomically");
    assert_eq!(restored["projection"]["revision"], 2);
    assert_eq!(
        restored["appearance"]["base"]["sourceRole"],
        "classic-application"
    );
    assert!(project.snapshot().assets.is_empty());
    project_store
        .checkpoint_session(
            project,
            &json!({"method": "monster-appearance.restore-defaults"}),
        )
        .expect("checkpoint restored fallback");
    let (_, reopened) =
        ProjectStore::open_session(project_store.root()).expect("reopen restored fallback");
    assert_eq!(reopened.revision(), Revision(2));
    assert!(reopened.snapshot().assets.is_empty());
}

fn application_appearance_fixture(
    temporary: &Path,
) -> (ReferenceLibraryStore, ApplicationMediaCatalog) {
    let application_store = ReferenceLibraryStore::create(temporary.join("application")).unwrap();
    let source_bytes = b"controlled Family Jewels";
    let source_blob = application_store.put_blob(source_bytes).unwrap();
    let source_identity = StableId("classic-application:family-jewels".into());
    let application = ApplicationMediaCatalog {
        format_version: APPLICATION_MEDIA_CATALOG_FORMAT_VERSION,
        library_id: StableId("application:appearance-test".into()),
        sources: vec![ApplicationMediaSource {
            identity: source_identity.clone(),
            native_name: "The Family Jewels.rsrc".into(),
            priority: 0,
            blob: source_blob,
            byte_length: source_bytes.len() as u64,
        }],
        assets: vec![
            application_appearance_asset(
                &application_store,
                &source_identity,
                392,
                BASE_PNG,
                b"controlled cicn 392 payload",
            ),
            application_appearance_asset(
                &application_store,
                &source_identity,
                700,
                FACING_PNG,
                b"controlled cicn 700 payload",
            ),
        ],
        ambiguous_resources: Vec::new(),
        failures: Vec::new(),
    };
    (application_store, application)
}

fn application_appearance_asset(
    store: &ReferenceLibraryStore,
    source: &StableId,
    resource_id: i32,
    preview: &[u8],
    classic: &[u8],
) -> ApplicationMediaAsset {
    ApplicationMediaAsset {
        source: source.clone(),
        source_priority: 0,
        descriptor: AssetDescriptor {
            identity: StableId(format!(
                "classic-application:family-jewels:cicn:{resource_id}"
            )),
            label: format!("cicn {resource_id}"),
            kind: "icon".into(),
            mime_type: Some("image/png".into()),
            classic_resource: Some(ClassicResourceKey {
                resource_type: "cicn".into(),
                resource_id,
            }),
            scenario_music_slot: None,
            blob: store.put_blob(preview).unwrap(),
            byte_length: preview.len() as u64,
            classic_payload_blob: Some(store.put_blob(classic).unwrap()),
            classic_payload_byte_length: Some(classic.len() as u64),
            extension: Some("png".into()),
            width: Some(64),
            height: Some(32),
            duration_ms: None,
            sample_rate: None,
            channels: None,
            tile_width: None,
            tile_height: None,
            columns: None,
            rows: None,
            landlook: None,
            base_tile: None,
            source: "Classic application/The Family Jewels.rsrc".into(),
        },
    }
}

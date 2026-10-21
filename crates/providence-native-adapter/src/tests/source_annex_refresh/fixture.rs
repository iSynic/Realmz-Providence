use super::*;
use providence_core::rebuilt::{
    APPLICATION_MEDIA_CATALOG_FORMAT_VERSION, ApplicationMediaCatalog, RebuiltV3CompilerIdentity,
    RebuiltV3FileInput, compile_rebuilt_v3_manifest, project_rebuilt_v3_content,
    project_rebuilt_v3_world,
};
use providence_rebuilt_package::{inspect_rebuilt_v3_archive, write_rebuilt_v3_archive};

pub(super) fn complete_import(root: &Path) -> (ProjectStore, EditorSession, std::path::PathBuf) {
    let source = root.join("Inventory Fixture");
    fs::create_dir(&source).unwrap();
    for (path, _, bytes) in CLASSIC_SCENARIO_BASELINE_FILES {
        fs::write(source.join(path), vec![0; *bytes]).unwrap();
    }
    let mut monster = vec![0; MONSTER_RECORD_BYTES];
    monster[170..175].copy_from_slice(b"Guard");
    for (path, bytes) in [
        ("Data LD", vec![0; MAP_LEVEL_BYTES]),
        ("Data DD", vec![0; ACTION_POINT_LEVEL_BYTES]),
        ("Data RD", vec![0; RANDOM_LEVEL_RECORD_BYTES]),
        ("Data MD", monster),
        ("Data BD", vec![0; BATTLE_RECORD_BYTES]),
        ("Data ED2", vec![0; COMPLEX_ENCOUNTER_RECORD_BYTES]),
        ("Data TD2", vec![0; ROGUE_ENCOUNTER_RECORD_BYTES]),
        ("Data TD3", vec![0; TIMED_ENCOUNTER_RECORD_BYTES]),
        ("Data TD", vec![0; TREASURE_RECORD_BYTES]),
        ("Data SD", vec![0; SHOP_RECORD_BYTES]),
        (
            "Data NI",
            vec![0; ITEM_RECORD_BYTES * SCENARIO_ITEM_DEFINITIONS],
        ),
        ("Data DES", vec![0; 256]),
        ("Data MD2", vec![0; PLAYER_MAP_RECORD_BYTES]),
        ("Data OD", vec![0; OPTION_LABEL_RECORD_BYTES]),
        ("Data Spell", vec![0; SCENARIO_SPELL_BYTES]),
        ("Data Spell.rsrc", empty_resource_fork()),
        ("Scenario.rsrc", empty_resource_fork()),
        ("Inventory Fixture", vec![0; SCENARIO_STARTUP_BYTES]),
    ] {
        fs::write(source.join(path), bytes).unwrap();
    }
    let snapshot = ProjectSnapshot::new_authored(StableId("inventory-refresh".into()));
    let store = ProjectStore::create(root.join("project"), &snapshot).unwrap();
    let mut session = EditorSession::new(snapshot);
    request(
        &mut session,
        &store,
        "project.import-classic-scenario",
        json!({
            "directory":source, "applicationDataDirectory":Path::new(env!("CARGO_MANIFEST_DIR")).join("../../godot/bundled/realmz-reference"),
        }),
    );
    (store, session, source)
}

fn application_snapshot(imported: &ProjectSnapshot) -> ProjectSnapshot {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("fixture-application".into()));
    snapshot.campaign = Some(CampaignMetadata::neutral());
    snapshot.start_location = imported.start_location.clone();
    snapshot.scenario_application = Some(ScenarioApplicationContract::default());
    snapshot.world.maps = imported.world.maps.clone();
    snapshot.terrain_catalog = imported.terrain_catalog.clone();
    snapshot.landlook_catalogs = imported.landlook_catalogs.clone();
    snapshot.race_rules = imported.race_rules.clone();
    snapshot.caste_rules = imported.caste_rules.clone();
    snapshot.rule_names = imported.rule_names.clone();
    snapshot.item_rules = imported.item_rules.clone();
    snapshot.scenario_item_rules = imported.scenario_item_rules.clone();
    snapshot.standard_spells = imported.standard_spells.clone();
    snapshot
}

pub(super) fn application_package(root: &Path, imported: &ProjectSnapshot) -> Value {
    let snapshot = application_snapshot(imported);
    let content = project_rebuilt_v3_content(&snapshot).unwrap();
    let world = project_rebuilt_v3_world(&snapshot).unwrap();
    let documents = [
        ("content.json", json!(content)),
        ("world.json", json!(world)),
        (
            "scenario.json",
            json!(super::super::empty_runtime_scenario()),
        ),
        (
            "assets/index.json",
            json!({"kind":"realmz2.assets","schemaVersion":3,"assets":[]}),
        ),
    ];
    let documents = documents.map(|(path, value)| (path, serde_json::to_vec(&value).unwrap()));
    let files = documents
        .iter()
        .map(|(path, bytes)| RebuiltV3FileInput { path, bytes })
        .collect::<Vec<_>>();
    let manifest = compile_rebuilt_v3_manifest(
        &snapshot,
        &RebuiltV3CompilerIdentity {
            version: "0.1.0".into(),
            commit: "generated-fixture".into(),
            minimum_engine_version: "0.1.0".into(),
        },
        &[],
        &files,
    )
    .unwrap();
    let archive = write_rebuilt_v3_archive(Cursor::new(Vec::new()), &manifest, &files)
        .unwrap()
        .into_inner();
    let inspected = inspect_rebuilt_v3_archive(Cursor::new(&archive)).unwrap();
    let path = root.join("application.realmz2");
    fs::write(&path, archive).unwrap();
    let media = ApplicationMediaCatalog {
        format_version: APPLICATION_MEDIA_CATALOG_FORMAT_VERSION,
        library_id: snapshot.project_id.clone(),
        sources: vec![],
        assets: vec![],
        ambiguous_resources: vec![],
        failures: vec![],
    };
    let media_path = root.join("media.json");
    fs::write(&media_path, serde_json::to_vec(&media).unwrap()).unwrap();
    json!({"applicationPackage":path,"applicationCampaignId":snapshot.project_id,
        "applicationPackageHash":inspected.manifest.package_hash,"applicationMediaCatalogPath":media_path,
        "classicApplicationDataDirectory":root})
}

use crate::{catalogs::CatalogViews, stock_rules::StockRules, transport::serve_io_with_libraries};
use providence_core::{
    codecs::{decode_caste_rules, decode_race_rules},
    model::{
        ClassicRuleSelectionContextV1, ClassicRuleSelectionEvidence, ClassicSourceBlob,
        ProjectOrigin, ProjectSnapshot, StableId, classic_source_set_sha256,
    },
    session::EditorSession,
};
use providence_storage::ProjectStore;
use serde_json::{Value, json};
use std::io::Cursor;

#[path = "rule_presentation.rs"]
mod presentation;

fn fixture() -> (tempfile::TempDir, ProjectStore, ProjectSnapshot, StockRules) {
    let temp = tempfile::tempdir().unwrap();
    let mut snapshot = ProjectSnapshot::new_authored(StableId("retained-zero-rules".into()));
    let store = ProjectStore::create(temp.path(), &snapshot).unwrap();
    let annex = store.put_blob(b"controlled imported annex").unwrap();
    snapshot.origin = ProjectOrigin::Imported {
        compatibility_annex: annex,
    };
    let race = vec![0; 408 * 30];
    let caste = vec![0; 576 * 30];
    let race_blob = store.put_blob(&race).unwrap();
    let caste_blob = store.put_blob(&caste).unwrap();
    snapshot.race_rules = decode_race_rules(&race, Some(race_blob.clone())).rules;
    snapshot.caste_rules = decode_caste_rules(&caste, Some(caste_blob.clone())).rules;
    snapshot.classic_sources = vec![
        ClassicSourceBlob {
            native_path: "Data Race".into(),
            blob: race_blob,
            byte_length: race.len() as u64,
        },
        ClassicSourceBlob {
            native_path: "Data Caste".into(),
            blob: caste_blob,
            byte_length: caste.len() as u64,
        },
    ];
    let stock = StockRules::open(
        &std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../godot/bundled/realmz-reference"),
    )
    .unwrap();
    (temp, store, snapshot, stock)
}

fn request(
    snapshot: &ProjectSnapshot,
    store: &ProjectStore,
    stock: &StockRules,
    method: &str,
    params: Value,
) -> Value {
    let mut session = EditorSession::new(snapshot.clone());
    let before = session.snapshot().clone();
    let line = json!({"id":1,"method":method,"params":params}).to_string() + "\n";
    let mut output = Vec::new();
    serve_io_with_libraries(
        &mut session,
        Some(store),
        CatalogViews {
            stock_rules: Some(stock),
            ..Default::default()
        },
        None,
        None,
        Cursor::new(line),
        &mut output,
    )
    .unwrap();
    assert!(
        session.snapshot() == &before,
        "Browsing cannot mutate canonical rules"
    );
    serde_json::from_slice(&output).unwrap()
}

fn selection(snapshot: &mut ProjectSnapshot, menu: u16) {
    snapshot.classic_rule_selection = Some(ClassicRuleSelectionContextV1 {
        record_version: 1,
        project_id: snapshot.project_id.clone(),
        captured_source_set_sha256: classic_source_set_sha256(snapshot).unwrap(),
        native_menu_selection: menu,
        evidence_origin: ClassicRuleSelectionEvidence::OwnerConfigured,
    });
}

#[test]
fn zero_import_is_not_runtime_source_authority_or_permission_to_overwrite() {
    let (_temp, store, mut snapshot, stock) = fixture();
    let params = json!({"kind":"caste","classicId":1,"source":"selected"});
    let unresolved = request(
        &snapshot,
        &store,
        &stock,
        "rule.open-authoring",
        params.clone(),
    );
    assert_eq!(unresolved["ok"], true, "{unresolved}");
    assert_eq!(unresolved["result"]["ruleSource"]["configured"], false);
    assert!(
        unresolved["result"]["ruleSource"]["notice"]
            .as_str()
            .unwrap()
            .contains("reference only")
    );
    selection(&mut snapshot, 1);
    let effective = request(&snapshot, &store, &stock, "rule.open-authoring", params);
    assert_eq!(effective["result"]["ownership"], "stock");
    assert_eq!(
        effective["result"]["draft"]["edit"]["definition"]["attributeLimits"],
        json!([8, 25, 4, 19, 4, 20, 5, 25, 6, 25, 3, 25])
    );
    assert!(
        effective["result"]["draft"]["edit"]["definition"]["victoryThresholds"]
            .as_array()
            .unwrap()
            .iter()
            .any(|n| n.as_i64() != Some(0))
    );
    assert_eq!(effective["result"]["copySource"]["scope"], "stock");
    let raw = request(
        &snapshot,
        &store,
        &stock,
        "rule.open-authoring",
        json!({"kind":"caste","classicId":1,"source":"scenario"}),
    );
    assert_eq!(raw["result"]["ownership"], "scenario");
    assert_eq!(
        raw["result"]["draft"]["edit"]["definition"]["attributeLimits"],
        json!(vec![0; 12])
    );
    assert_eq!(
        store.read_blob(&snapshot.classic_sources[1].blob).unwrap(),
        vec![0; 576 * 30]
    );
    let copy = request(
        &snapshot,
        &store,
        &stock,
        "rule.allocation.review",
        json!({"kind":"caste","expectedRevision":0,"copySource":effective["result"]["copySource"]}),
    );
    assert_eq!(copy["ok"], false);
    assert!(copy["error"].as_str().unwrap().contains("occupied"));
}

#[test]
fn present_zero_tables_remain_selected_for_scenario_first_policy() {
    let (_temp, store, mut snapshot, stock) = fixture();
    selection(&mut snapshot, 20);
    let result = request(
        &snapshot,
        &store,
        &stock,
        "rule.open-authoring",
        json!({"kind":"caste","classicId":14,"source":"selected"}),
    );
    assert_eq!(result["ok"], true, "{result}");
    assert_eq!(result["result"]["ruleSource"]["table"], "scenario");
    assert_eq!(
        result["result"]["draft"]["edit"]["definition"]["defaultIcon"],
        0
    );
    assert_eq!(
        result["result"]["draft"]["edit"]["definition"]["attributeLimits"],
        json!(vec![0; 12])
    );
    let stock_row = request(
        &snapshot,
        &store,
        &stock,
        "rule.open-authoring",
        json!({"kind":"caste","classicId":14,"source":"application"}),
    );
    assert_eq!(
        stock_row["result"]["draft"]["edit"]["definition"]["attributeLimits"],
        json!([12, 23, 5, 21, 6, 21, 16, 25, 8, 23, 3, 25])
    );
}

#[test]
fn catalogs_and_documents_agree_on_source_and_stale_context_is_rejected() {
    let (_temp, store, mut snapshot, stock) = fixture();
    selection(&mut snapshot, 1);
    for kind in ["race", "caste"] {
        let catalog = request(
            &snapshot,
            &store,
            &stock,
            "rule.catalog",
            json!({"kind":kind,"source":"selected","scope":"stock"}),
        );
        assert_eq!(catalog["ok"], true, "{catalog}");
        assert_eq!(catalog["result"]["total"], 30);
        for row in catalog["result"]["items"].as_array().unwrap() {
            let open = request(
                &snapshot,
                &store,
                &stock,
                "rule.open-authoring",
                json!({"kind":kind,"classicId":row["classicId"],"source":"selected"}),
            );
            assert_eq!(open["result"]["ownership"], row["ownership"]);
            assert_eq!(
                open["result"]["draft"]["edit"]["definition"]["name"],
                row["name"]
            );
        }
    }
    snapshot
        .classic_rule_selection
        .as_mut()
        .unwrap()
        .captured_source_set_sha256 = "wrong".into();
    let stale = request(
        &snapshot,
        &store,
        &stock,
        "rule.catalog",
        json!({"kind":"caste","source":"selected"}),
    );
    assert_eq!(stale["ok"], false);
    assert!(stale["error"].as_str().unwrap().contains("stale"));
}

#[test]
fn selected_application_caste_eligibility_uses_active_scenario_races() {
    let (_temp, store, mut snapshot, stock) = fixture();
    snapshot
        .classic_sources
        .retain(|source| source.native_path != "Data Caste");
    snapshot.caste_rules.clear();
    selection(&mut snapshot, 20);
    let selected = request(
        &snapshot,
        &store,
        &stock,
        "rule.open-authoring",
        json!({"kind":"caste","classicId":1,"source":"selected"}),
    );
    assert_eq!(selected["ok"], true, "{selected}");
    assert_eq!(selected["result"]["ruleSource"]["table"], "application");
    assert_eq!(
        selected["result"]["draft"]["edit"]["definition"]["eligibleRaceIds"],
        json!([])
    );
    let reference = request(
        &snapshot,
        &store,
        &stock,
        "rule.open-authoring",
        json!({"kind":"caste","classicId":1,"source":"application"}),
    );
    assert!(
        reference["result"]["draft"]["edit"]["definition"]["eligibleRaceIds"]
            .as_array()
            .unwrap()
            .iter()
            .any(|id| id == "classic.race.1")
    );
    assert_eq!(selected["result"]["copySource"]["scope"], "stock");
    let mut race = vec![0; 408 * 30];
    race[208] = 1;
    let blob = store.put_blob(&race).unwrap();
    snapshot.race_rules = decode_race_rules(&race, Some(blob.clone())).rules;
    snapshot.classic_sources[0].blob = blob;
    selection(&mut snapshot, 20);
    let positive = request(
        &snapshot,
        &store,
        &stock,
        "rule.open-authoring",
        json!({"kind":"caste","classicId":1,"source":"selected"}),
    );
    assert_eq!(
        positive["result"]["draft"]["edit"]["definition"]["eligibleRaceIds"],
        json!(["classic.race.1"])
    );
    assert!(
        positive["result"]["references"]
            .as_array()
            .unwrap()
            .iter()
            .any(|reference| reference["targetId"] == "classic.race.1")
    );
}

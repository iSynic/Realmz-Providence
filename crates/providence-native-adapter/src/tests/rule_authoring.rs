use crate::{catalogs::CatalogViews, stock_rules::StockRules, transport::serve_io_with_libraries};
use providence_core::{
    codecs::read_caste_native_fields,
    model::{ProjectSnapshot, StableId},
    session::EditorSession,
};
use providence_storage::ProjectStore;
use serde_json::{Value, json};
use std::io::Cursor;

fn stock() -> StockRules {
    StockRules::open(
        &std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../godot/bundled/realmz-reference"),
    )
    .unwrap()
}
fn exchange(
    session: &mut EditorSession,
    store: &ProjectStore,
    stock: &StockRules,
    method: &str,
    params: Value,
) -> Value {
    let media = portrait_catalog();
    let line = json!({"id":1,"method":method,"params":params}).to_string() + "\n";
    let mut output = Vec::new();
    serve_io_with_libraries(
        session,
        Some(store),
        CatalogViews {
            stock_rules: Some(stock),
            application_media: Some(&media),
            ..Default::default()
        },
        None,
        None,
        Cursor::new(line),
        &mut output,
    )
    .unwrap();
    serde_json::from_slice(&output).unwrap()
}

fn portrait_catalog() -> providence_core::rebuilt::ApplicationMediaCatalog {
    use providence_core::rebuilt::{
        ApplicationMediaAsset, ApplicationMediaCatalog, ApplicationMediaSource,
    };
    let mut catalog = ApplicationMediaCatalog::empty(StableId("controlled-rule-portraits".into()));
    catalog.sources.push(ApplicationMediaSource {
        identity: StableId("stock".into()),
        native_name: "controlled".into(),
        priority: 0,
        blob: providence_core::model::BlobId("source".into()),
        byte_length: 1,
    });
    catalog.assets.extend((257..263).map(|id| ApplicationMediaAsset {
        source: StableId("stock".into()), source_priority: 0,
        descriptor: serde_json::from_value(json!({
            "identity":format!("exact:cicn:{id}"), "label":format!("Portrait {id}"),
            "kind":"portrait", "mimeType":"image/png", "classicResource":{"resourceType":"cicn","resourceId":id},
            "blob":"preview", "byteLength":4, "classicPayloadBlob":"native", "classicPayloadByteLength":5,
            "width":32, "height":40, "source":"controlled descriptor"
        })).unwrap(),
    }));
    catalog
}
fn request(
    session: &mut EditorSession,
    store: &ProjectStore,
    stock: &StockRules,
    method: &str,
    params: Value,
) -> Value {
    let response = exchange(session, store, stock, method, params);
    assert_eq!(response["ok"], true, "{response}");
    response["result"].clone()
}

#[test]
fn rule_authoring_real_commands_commit_native_fields_reopen_and_recover_without_replay() {
    let temp = tempfile::tempdir().unwrap();
    let stock = stock();
    assert_eq!(stock.race.len(), 28800);
    assert_eq!(stock.caste.len(), 17280);
    let snapshot = ProjectSnapshot::new_authored(StableId("rule-command-test".into()));
    let store = ProjectStore::create(temp.path(), &snapshot).unwrap();
    let mut session = EditorSession::new(snapshot);
    let catalog = request(
        &mut session,
        &store,
        &stock,
        "rule.catalog",
        json!({"kind":"caste","scope":"all"}),
    );
    assert_eq!(catalog["items"].as_array().unwrap().len(), 30);
    assert!(session.snapshot().caste_rules.is_empty());
    let preview = request(
        &mut session,
        &store,
        &stock,
        "rule.allocation.review",
        json!({"kind":"caste","expectedRevision":0,"destinationClassicId":21}),
    );
    assert_eq!(preview["occupiedDestinationsReplaced"], 0);
    let mut draft = preview["draft"].clone();
    draft["edit"]["definition"]["name"] = json!("Wayfinder");
    draft["edit"]["definition"]["description"] = json!("Preserved project note");
    draft["edit"]["nativeFields"]["maximumSpellsPerRound"] = json!(3);
    draft["edit"]["definition"]["eligibleRaceIds"] = json!(["classic.race.1"]);
    let prepared = request(
        &mut session,
        &store,
        &stock,
        "rule.draft.prepare",
        json!({"expectedRevision":0,"draft":draft}),
    );
    assert_eq!(prepared["valid"], true, "{prepared}");
    assert_eq!(session.revision().0, 0);
    let params = json!({"expectedRevision":0,"draft":draft,"operationId":"d".repeat(64)});
    let applied = request(
        &mut session,
        &store,
        &stock,
        "rule.draft.apply",
        params.clone(),
    );
    assert_eq!(
        applied["document"]["draft"]["edit"]["nativeFields"]["maximumSpellsPerRound"],
        3
    );
    assert_eq!(session.revision().0, 1);
    assert_eq!(applied["document"]["discoveryRecordPresent"], true);
    assert_eq!(applied["document"]["discoveryScope"], "scenario");
    assert_receipt(&mut session, &store, &stock, params, applied);
    assert_saved_history(temp.path(), &stock);
}

fn assert_receipt(
    session: &mut EditorSession,
    store: &ProjectStore,
    stock: &StockRules,
    params: Value,
    applied: Value,
) {
    let receipt = request(
        session,
        store,
        stock,
        "item.operation.status",
        json!({"operationId":"d".repeat(64),"domain":"project",
        "expectedIntent":{"method":"rule.draft.apply","params":params}}),
    );
    assert_eq!(receipt["outcome"], "committed");
    assert_eq!(receipt["response"]["result"], applied);
}

fn assert_saved_history(path: &std::path::Path, stock: &StockRules) {
    let (store, mut session) = ProjectStore::open_session(path).unwrap();
    let document = request(
        &mut session,
        &store,
        stock,
        "rule.open-authoring",
        json!({"kind":"caste","classicId":21}),
    );
    assert_eq!(document["draft"]["edit"]["definition"]["name"], "Wayfinder");
    assert_eq!(
        document["draft"]["edit"]["nativeFields"]["maximumSpellsPerRound"],
        3
    );
    assert!(
        session.snapshot().race_rules[0]
            .definition
            .eligible_caste_ids
            .iter()
            .any(|id| id.0 == "classic.caste.21")
    );
    let blob = session.snapshot().caste_rules[0]
        .source_blob
        .as_ref()
        .unwrap();
    assert_eq!(
        read_caste_native_fields(&store.read_blob(blob).unwrap(), 21)
            .unwrap()
            .maximum_spells_per_round,
        3
    );
    request(
        &mut session,
        &store,
        stock,
        "history.undo",
        json!({"expectedRevision":1}),
    );
    assert!(session.snapshot().caste_rules.is_empty());
    request(
        &mut session,
        &store,
        stock,
        "history.redo",
        json!({"expectedRevision":2}),
    );
    assert_eq!(
        session.snapshot().caste_rules[20].definition.name,
        "Wayfinder"
    );
    let stale = exchange(
        &mut session,
        &store,
        stock,
        "rule.draft.apply",
        json!({"expectedRevision":1,"draft":document["draft"],"operationId":"e".repeat(64)}),
    );
    assert_eq!(stale["ok"], false);
    assert_eq!(session.revision().0, 3);
}

#[test]
fn rule_authoring_allocation_stock_copy_and_clear_stage_without_mutating() {
    let temp = tempfile::tempdir().unwrap();
    let stock = stock();
    let snapshot = ProjectSnapshot::new_authored(StableId("rule-review-test".into()));
    let store = ProjectStore::create(temp.path(), &snapshot).unwrap();
    let mut session = EditorSession::new(snapshot);
    let source = request(
        &mut session,
        &store,
        &stock,
        "rule.open-authoring",
        json!({"kind":"race","classicId":1}),
    );
    assert_eq!(source["ownership"], "stock");
    let copy = request(
        &mut session,
        &store,
        &stock,
        "rule.allocation.review",
        json!({"kind":"race","expectedRevision":0,"copySource":source["copySource"]}),
    );
    assert_eq!(copy["draft"]["edit"]["definition"]["classicId"], 20);
    assert_eq!(copy["draft"]["edit"]["definition"]["baseMovement"], 12);
    assert_eq!(session.revision().0, 0);
    request(
        &mut session,
        &store,
        &stock,
        "rule.draft.apply",
        json!({"expectedRevision":0,"draft":copy["draft"],"operationId":"f".repeat(64)}),
    );
    let occupied = exchange(
        &mut session,
        &store,
        &stock,
        "rule.allocation.review",
        json!({"kind":"race","expectedRevision":1,"destinationClassicId":20}),
    );
    assert_eq!(occupied["ok"], false);
    let clear = request(
        &mut session,
        &store,
        &stock,
        "rule.clear.review",
        json!({"kind":"race","expectedRevision":1,"classicId":20}),
    );
    assert_eq!(clear["identityRetained"], true);
    assert_review_feedback(&mut session, &store, &stock, &source, &clear);
    assert_eq!(session.revision().0, 1);
    assert_eq!(
        clear["draft"]["edit"]["definition"]["id"],
        "classic.race.20"
    );
}

fn assert_review_feedback(
    session: &mut EditorSession,
    store: &ProjectStore,
    stock: &StockRules,
    source: &Value,
    clear: &Value,
) {
    let vacant = request(
        session,
        store,
        stock,
        "rule.open-authoring",
        json!({"kind":"race","classicId":30}),
    );
    assert!(vacant["copySource"].is_null());
    assert_eq!(vacant["discoveryRecordPresent"], true);
    assert_eq!(
        clear["original"]["definition"]["name"],
        source["draft"]["edit"]["definition"]["name"]
    );
    let page = request(
        session,
        store,
        stock,
        "rule.used-by",
        json!({"kind":"race","classicId":20,"expectedRevision":1,"offset":0}),
    );
    for row in page["items"].as_array().unwrap() {
        assert!(!row["sourceLabel"].as_str().unwrap().is_empty());
        assert!(!row["fieldLabel"].as_str().unwrap().is_empty());
        assert!(row.get("source").is_some() && row.get("targetId").is_some());
    }
}

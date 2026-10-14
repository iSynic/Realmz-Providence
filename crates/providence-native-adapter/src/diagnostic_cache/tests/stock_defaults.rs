use crate::{
    catalogs::CatalogViews, diagnostic_cache::Cache, stock_items::StockItems,
    stock_spells::StockSpells,
};
use providence_core::{
    codecs::*,
    model::*,
    session::{EditorSession, Revision},
};
use serde_json::json;

fn fixture() -> (ProjectSnapshot, StockItems, StockSpells) {
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../godot/bundled/realmz-reference");
    let items = StockItems::open(&root).unwrap();
    let spells = StockSpells::open(&root).unwrap();
    let mut snapshot = ProjectSnapshot::new_authored(StableId("fresh-stock-findings".into()));
    snapshot.item_rules = decode_standard_item_rules(
        &std::fs::read(root.join("Data ID")).unwrap(),
        &std::fs::read(root.join("Data ID.rsrc")).unwrap(),
        BlobId("controlled-items".into()),
        BlobId("controlled-item-names".into()),
    )
    .unwrap()
    .rules
    .into_iter()
    .filter(|row| row.definition.classic_id == 662)
    .collect();
    snapshot.standard_spells =
        decode_standard_spells(&std::fs::read(root.join("Data S")).unwrap(), None).spells;
    hydrate_standard_spell_names(
        &mut snapshot.standard_spells,
        &std::fs::read(root.join("Custom Names.rsrc")).unwrap(),
        BlobId("controlled-spell-names".into()),
    )
    .unwrap();
    snapshot
        .standard_spells
        .retain(|row| row.definition.classic_id == 4112);
    (snapshot, items, spells)
}

#[test]
fn stock_context_is_shared_by_sync_and_worker_views_and_edits_invalidate_details() {
    let (mut snapshot, items, spells) = fixture();
    let catalogs = CatalogViews {
        stock_items: Some(&items),
        stock_spells: Some(&spells),
        ..Default::default()
    };
    let session = EditorSession::new(snapshot.clone());
    let sync = crate::diagnostic_policy::list(&session, catalogs, &json!({})).unwrap();
    assert_eq!(sync["total"], 0);
    assert_eq!(sync["hiddenDetailCount"], 2);
    let mut cache = Cache::with_catalogs(catalogs);
    let initial = cache
        .evaluate(snapshot.clone(), Revision(0), None, &json!({}), None)
        .unwrap();
    assert_eq!(initial, sync);
    let all = cache
        .evaluate(
            snapshot.clone(),
            Revision(0),
            None,
            &json!({"showAll":true}),
            None,
        )
        .unwrap();
    assert_eq!(all["total"], 2);
    assert!(
        all["items"]
            .as_array()
            .unwrap()
            .iter()
            .all(|row| row["relevance"] == "preservation-detail")
    );
    snapshot.item_rules[0].definition.special[4] += 1;
    snapshot.standard_spells[0].definition.spell_class += 1;
    let edited = cache
        .evaluate(snapshot.clone(), Revision(1), None, &json!({}), None)
        .unwrap();
    assert_eq!(edited["total"], 2);
    let (mut replacement, _, _) = fixture();
    replacement.project_id = StableId("replacement".into());
    assert_eq!(
        cache
            .evaluate(replacement.clone(), Revision(0), None, &json!({}), None)
            .unwrap()["total"],
        0
    );
    replacement.origin = ProjectOrigin::Imported {
        compatibility_annex: BlobId("annex".into()),
    };
    assert_eq!(
        cache
            .evaluate(replacement, Revision(1), None, &json!({}), None)
            .unwrap()["total"],
        2
    );
}

#[test]
fn production_validation_job_captures_stock_catalogs_and_unknown_stock_stays_strict() {
    let (snapshot, items, spells) = fixture();
    let catalogs = CatalogViews {
        stock_items: Some(&items),
        stock_spells: Some(&spells),
        ..Default::default()
    };
    let session = EditorSession::new(snapshot.clone());
    let mut jobs = crate::validation_jobs::Jobs::with_catalogs(catalogs);
    let ticket = jobs
        .dispatch(&session, None, None, "validation.begin", &json!({}))
        .unwrap()
        .unwrap();
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(5);
    loop {
        let result = jobs
            .dispatch(
                &session,
                None,
                None,
                "validation.poll",
                &json!({"jobId":ticket["jobId"]}),
            )
            .unwrap()
            .unwrap();
        if result["status"] == "ready" {
            assert_eq!(result["page"]["total"], 0);
            assert_eq!(result["page"]["hiddenDetailCount"], 2);
            break;
        }
        assert!(std::time::Instant::now() < deadline, "{result}");
        std::thread::sleep(std::time::Duration::from_millis(1));
    }
    assert_eq!(
        crate::diagnostic_policy::list(&session, Default::default(), &json!({})).unwrap()["total"],
        2
    );
    let mut changed_items = StockItems::open(
        &std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../godot/bundled/realmz-reference"),
    )
    .unwrap();
    changed_items
        .definitions
        .iter_mut()
        .find(|row| row.classic_id == 662)
        .unwrap()
        .cost += 1;
    let changed = CatalogViews {
        stock_items: Some(&changed_items),
        ..catalogs
    };
    assert_eq!(
        crate::diagnostic_policy::list(&session, changed, &json!({})).unwrap()["total"],
        1
    );
}

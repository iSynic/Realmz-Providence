use crate::{CatalogViews, dispatch_result_with_catalogs, stock_items::StockItems};
use providence_core::{
    codecs::{ResourceEntry, write_resource_fork},
    model::{ProjectSnapshot, StableId},
    session::{EditorSession, Revision},
};
use providence_storage::ProjectStore;
use serde_json::{Value, json};

fn stock_fixture(root: &std::path::Path) -> StockItems {
    let mut binary = vec![0; 80_000];
    binary[100 + 28..100 + 30].copy_from_slice(&77i16.to_be_bytes());
    let entries = [0, 200, 400, 600]
        .into_iter()
        .flat_map(|base| {
            (0..3).map(move |offset| {
                let mut data = 200u16.to_be_bytes().to_vec();
                for row in 0..200 {
                    let name = if base == 0 && offset == 1 && row == 1 {
                        vec![b'C', b'a', b'f', 0x8e]
                    } else {
                        vec![]
                    };
                    data.push(name.len() as u8);
                    data.extend(name);
                }
                ResourceEntry {
                    resource_type: *b"STR#",
                    id: base + offset,
                    name: String::new(),
                    attributes: 0,
                    data,
                }
            })
        })
        .collect::<Vec<_>>();
    std::fs::write(root.join("Data ID"), binary).unwrap();
    std::fs::write(
        root.join("Data ID.rsrc"),
        write_resource_fork(&entries).unwrap(),
    )
    .unwrap();
    StockItems::open(root).unwrap()
}

fn request(
    session: &mut EditorSession,
    store: &ProjectStore,
    stock: &StockItems,
    method: &str,
    params: Value,
) -> Result<Value, String> {
    dispatch_result_with_catalogs(
        session,
        Some(store),
        CatalogViews {
            stock_items: Some(stock),
            ..Default::default()
        },
        None,
        method,
        params,
    )
}

#[test]
fn item_stock_browsing_is_complete_paged_searchable_and_does_not_import_project_content() {
    let temporary = tempfile::tempdir().unwrap();
    let stock = stock_fixture(temporary.path());
    let snapshot = ProjectSnapshot::new_authored(StableId("stock-browse".into()));
    let store = ProjectStore::create(temporary.path().join("project"), &snapshot).unwrap();
    let mut session = EditorSession::new(snapshot.clone());
    let page = request(
        &mut session,
        &store,
        &stock,
        "item.list",
        json!({"scope": "standard", "category": "weapon", "limit": 8}),
    )
    .unwrap();
    assert_eq!(page["total"], 199);
    assert_eq!(page["items"].as_array().unwrap().len(), 8);
    assert_eq!(page["items"][0]["name"], "Café");
    let page = request(
        &mut session,
        &store,
        &stock,
        "item.list",
        json!({"query": "café"}),
    )
    .unwrap();
    assert_eq!(page["total"], 1);
    let page = request(
        &mut session,
        &store,
        &stock,
        "item.list",
        json!({"offset": 798, "limit": 128}),
    )
    .unwrap();
    assert_eq!(page["total"], 799);
    assert_eq!(page["items"][0]["classicId"], 799);
    let opened = request(
        &mut session,
        &store,
        &stock,
        "item.open",
        json!({"identity": "classic.item.1"}),
    )
    .unwrap();
    assert_eq!(opened["editable"], false);
    assert_eq!(opened["item"]["cost"], 77);
    assert_eq!(session.snapshot(), &snapshot);
    assert_eq!(session.revision(), Revision(0));
    assert!(session.undo_history().is_empty());
}

#[test]
fn item_stock_copy_reviews_exact_source_and_creates_only_scenario_customization() {
    let temporary = tempfile::tempdir().unwrap();
    let stock = stock_fixture(temporary.path());
    let snapshot = ProjectSnapshot::new_authored(StableId("stock-copy".into()));
    let store = ProjectStore::create(temporary.path().join("project"), &snapshot).unwrap();
    let mut session = EditorSession::new(snapshot);
    let opened = request(
        &mut session,
        &store,
        &stock,
        "item.open",
        json!({"identity": "classic.item.1"}),
    )
    .unwrap();
    let allocation = request(
        &mut session,
        &store,
        &stock,
        "item.allocation.review",
        json!({"expectedRevision": 0, "copySource": opened["copySource"]}),
    )
    .unwrap();
    let mut draft = allocation["allocation"]["draft"].clone();
    assert_eq!(draft["definition"]["name"], "Café");
    assert_eq!(draft["definition"]["classicId"], 900);
    let mut stale = draft.clone();
    stale["copySource"]["catalogFingerprint"] = json!("changed-source");
    assert!(
        request(
            &mut session,
            &store,
            &stock,
            "item.draft.apply",
            json!({"expectedRevision": 0, "draft": stale})
        )
        .is_err()
    );
    assert_eq!(session.revision(), Revision(0));
    draft["definition"]["cost"] = json!(99);
    let saved = request(
        &mut session,
        &store,
        &stock,
        "item.draft.apply",
        json!({"expectedRevision": 0, "draft": draft}),
    )
    .unwrap();
    assert_eq!(saved["document"]["item"]["classicId"], 900);
    assert_eq!(session.snapshot().scenario_item_rules.len(), 1);
    assert!(session.snapshot().item_rules.is_empty());
    assert_eq!(stock.definitions[0].cost, 77);
    assert_stock_cannot_be_authored(&mut session, &store, &stock);
}

fn assert_stock_cannot_be_authored(
    session: &mut EditorSession,
    store: &ProjectStore,
    stock: &StockItems,
) {
    let mut edit =
        json!({"recordIndex": 0, "definition": stock.definitions[0], "allocation": null});
    edit["definition"]["cost"] = json!(999);
    assert!(
        request(
            session,
            store,
            stock,
            "item.draft.apply",
            json!({"expectedRevision": 1, "draft": edit})
        )
        .is_err()
    );
    assert_eq!(session.revision(), Revision(1));
}

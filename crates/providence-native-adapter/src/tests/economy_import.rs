#[test]
fn classic_treasure_import_open_repair_update_and_reopen_is_bounded() {
    let temporary = tempfile::tempdir().expect("temporary project");
    let source = temporary.path().join("source-treasure");
    fs::create_dir(&source).expect("create source directory");
    let mut data_td = vec![0u8; TREASURE_RECORD_BYTES];
    data_td[0..2].copy_from_slice(&7_i16.to_be_bytes());
    data_td[42..44].copy_from_slice(&25_i16.to_be_bytes());
    data_td.extend_from_slice(&[0xde]);
    fs::write(source.join("Data TD"), &data_td).expect("write controlled treasure source");

    let snapshot = ProjectSnapshot::new_authored(StableId("treasure-import".into()));
    let store = ProjectStore::create(temporary.path().join("project-treasure"), &snapshot)
        .expect("create project store");
    let mut session = EditorSession::new(snapshot);
    let import = import_classic_treasures(
        &mut session,
        Some(&store),
        json!({"expectedRevision": 0, "directory": source}),
    )
    .expect("import treasure catalog");
    assert_eq!(import["count"], 1);
    assert_eq!(import["trailingBytes"], 1);
    assert!(import.get("snapshot").is_none());
    store
        .checkpoint_session(
            &session,
            &json!({"method": "project.import-classic-treasures"}),
        )
        .expect("checkpoint import");

    assert_imported_treasure_document(&mut session);
    repair_and_edit_treasure(&mut session, &store);

    let (_store, reopened) = ProjectStore::open_session(store.root()).expect("reopen project");
    assert_eq!(reopened.revision(), Revision(3));
    assert_eq!(reopened.snapshot().treasures[0].item_ids[0], 8);
    assert_eq!(reopened.snapshot().treasures[0].gold, 50);
    let source_record = reopened
        .snapshot()
        .classic_sources
        .iter()
        .find(|source| source.native_path == "Data TD")
        .unwrap();
    assert_eq!(store.read_blob(&source_record.blob).unwrap(), data_td);
}

#[test]
fn classic_shop_import_open_repair_update_and_reopen_is_bounded() {
    let temporary = tempfile::tempdir().expect("temporary project");
    let source = temporary.path().join("source-shop");
    fs::create_dir(&source).expect("create source directory");
    let mut data_sd = vec![0u8; SHOP_RECORD_BYTES];
    data_sd[0..2].copy_from_slice(&7_i16.to_be_bytes());
    data_sd[2..4].copy_from_slice(&(-1_i16).to_be_bytes());
    data_sd[4..6].copy_from_slice(&99_i16.to_be_bytes());
    data_sd[2000] = 255;
    data_sd[3000..3002].copy_from_slice(&125_i16.to_be_bytes());
    data_sd.extend_from_slice(&[0xde]);
    fs::write(source.join("Data SD"), &data_sd).expect("write controlled shop source");

    let snapshot = ProjectSnapshot::new_authored(StableId("shop-import".into()));
    let store = ProjectStore::create(temporary.path().join("project-shop"), &snapshot)
        .expect("create project store");
    let mut session = EditorSession::new(snapshot);
    let import = import_classic_shops(
        &mut session,
        Some(&store),
        json!({"expectedRevision": 0, "directory": source}),
    )
    .expect("import shop catalog");
    assert_eq!(import["count"], 1);
    assert_eq!(import["trailingBytes"], 1);
    assert!(import.get("snapshot").is_none());
    store
        .checkpoint_session(&session, &json!({"method": "project.import-classic-shops"}))
        .expect("checkpoint import");

    assert_imported_shop_document(&mut session);
    repair_and_edit_shop(&mut session, &store);

    let (_store, reopened) = ProjectStore::open_session(store.root()).expect("reopen project");
    assert_eq!(reopened.revision(), Revision(3));
    assert_eq!(reopened.snapshot().shops[0].item_ids[0], 8);
    assert_eq!(reopened.snapshot().shops[0].quantities[0], 255);
    assert_eq!(reopened.snapshot().shops[0].inflation, 150);
    let source_record = reopened
        .snapshot()
        .classic_sources
        .iter()
        .find(|source| source.native_path == "Data SD")
        .unwrap();
    assert_eq!(store.read_blob(&source_record.blob).unwrap(), data_sd);
}

#[test]
fn shop_import_keeps_native_gaps_and_later_unreferenced_extensions() {
    let temporary = tempfile::tempdir().unwrap();
    let directory = temporary.path().join("source");
    fs::create_dir(&directory).unwrap();
    let mut bytes = vec![0; 3 * SHOP_RECORD_BYTES];
    bytes[..2].copy_from_slice(&7_i16.to_be_bytes());
    bytes[SHOP_RECORD_BYTES..SHOP_RECORD_BYTES + 2].copy_from_slice(&3000_i16.to_be_bytes());
    bytes[SHOP_RECORD_BYTES + 2..SHOP_RECORD_BYTES + 4].copy_from_slice(&3001_i16.to_be_bytes());
    bytes[2 * SHOP_RECORD_BYTES..2 * SHOP_RECORD_BYTES + 2].copy_from_slice(&9_i16.to_be_bytes());
    fs::write(directory.join("Data SD"), &bytes).unwrap();
    let snapshot = ProjectSnapshot::new_authored(StableId("shop-gaps".into()));
    let store = ProjectStore::create(temporary.path().join("project"), &snapshot).unwrap();
    let mut session = EditorSession::new(snapshot);
    let imported = import_classic_shops(
        &mut session,
        Some(&store),
        json!({"expectedRevision":0, "directory":directory}),
    )
    .unwrap();
    assert_eq!(imported["quarantinedCount"], 1);
    assert_eq!(
        session
            .snapshot()
            .shops
            .iter()
            .map(|shop| shop.native_id.0)
            .collect::<Vec<_>>(),
        [0, 2]
    );
    assert_eq!(
        providence_core::codecs::encode_shops(&session.snapshot().shops, Some(&bytes)).unwrap(),
        bytes
    );
}

#[test]
fn economy_create_clear_and_next_id_routes_are_bounded() {
    let snapshot = ProjectSnapshot::new_authored(StableId("economy-authoring".into()));
    let mut session = EditorSession::new(snapshot);

    let treasures = dispatch_result(&mut session, "treasure.list", json!({}))
        .expect("list empty Treasure catalog");
    assert_eq!(treasures["nextNativeId"], 0);
    let created = dispatch_result(
        &mut session,
        "treasure.create",
        json!({"expectedRevision": 0, "nativeId": 0}),
    )
    .expect("create Treasure");
    assert_eq!(created["changedEntities"], json!(["treasure:0"]));
    let listed = dispatch_result(&mut session, "treasure.list", json!({})).unwrap();
    assert_eq!(listed["nextNativeId"], 1);
    assert_eq!(listed["items"][0]["populatedItems"], 0);

    let shop = dispatch_result(
        &mut session,
        "shop.create",
        json!({"expectedRevision": 1, "nativeId": 0}),
    )
    .expect("create Shop");
    assert_eq!(shop["changedEntities"], json!(["shop:0"]));
    let shops = dispatch_result(&mut session, "shop.list", json!({})).unwrap();
    assert_eq!(shops["nextNativeId"], 1);
    assert_eq!(shops["items"][0]["activeItems"], 0);

    let cleared = dispatch_result(
        &mut session,
        "treasure.clear",
        json!({"expectedRevision": 2, "nativeId": 0}),
    )
    .expect("clear Treasure");
    assert_eq!(cleared["changedEntities"], json!(["treasure:0"]));
    let cleared_shop = dispatch_result(
        &mut session,
        "shop.clear",
        json!({"expectedRevision": 3, "nativeId": 0}),
    )
    .expect("clear Shop");
    assert_eq!(cleared_shop["changedEntities"], json!(["shop:0"]));
}
use crate::dispatch_result;
use crate::economy_import::import_classic_shops;
use crate::economy_import::import_classic_treasures;
use providence_core::codecs::SHOP_RECORD_BYTES;
use providence_core::codecs::TREASURE_RECORD_BYTES;
use providence_core::model::ProjectSnapshot;
use providence_core::model::StableId;
use providence_core::session::EditorSession;
use providence_core::session::Revision;
use providence_storage::ProjectStore;
use serde_json::json;
use std::fs;

fn assert_imported_treasure_document(session: &mut EditorSession) {
    let opened = dispatch_result(session, "treasure.open", json!({"nativeId": 0}))
        .expect("open bounded treasure document");
    let listed = dispatch_result(session, "treasure.list", json!({}))
        .expect("list bounded treasure summaries");
    assert_eq!(listed["items"][0]["identity"], "treasure:0");
    assert_eq!(listed["items"][0]["nativeId"], 0);
    assert_eq!(listed["total"], 1);
    assert_eq!(opened["treasure"]["identity"], "treasure:0");
    assert_eq!(opened["treasure"]["nativeId"], 0);
    assert_eq!(opened["treasure"]["gold"], 25);
    assert_eq!(opened["references"][0]["field"], "itemIds[0]");
    assert_eq!(opened["references"][0]["resolution"], "missing");
}

fn repair_and_edit_treasure(session: &mut EditorSession, store: &ProjectStore) {
    let repair = dispatch_result(
        session,
        "treasure-reference.retarget",
        json!({
            "expectedRevision": 1,
            "source": "treasure:0",
            "slot": 0,
            "targetId": 8
        }),
    )
    .expect("repair treasure item");
    assert_eq!(repair["changedEntities"], json!(["treasure:0"]));
    store
        .checkpoint_session(session, &json!({"method": "treasure-reference.retarget"}))
        .expect("checkpoint repair");
    let mut edited = session.snapshot().treasures[0].clone();
    edited.gold = 50;
    let update = dispatch_result(
        session,
        "treasure.update",
        json!({"expectedRevision": 2, "treasure": edited}),
    )
    .expect("update treasure reward");
    assert_eq!(update["changedEntities"], json!(["treasure:0"]));
    store
        .checkpoint_session(session, &json!({"method": "treasure.update"}))
        .expect("checkpoint update");
}

fn assert_imported_shop_document(session: &mut EditorSession) {
    let opened = dispatch_result(session, "shop.open", json!({"nativeId": 0}))
        .expect("open bounded shop document");
    assert_eq!(opened["shop"]["identity"], "shop:0");
    assert_eq!(opened["shop"]["nativeId"], 0);
    assert_eq!(opened["shop"]["inflation"], 125);
    assert_eq!(opened["shop"]["quantities"][0], 255);
    assert_eq!(opened["references"].as_array().unwrap().len(), 1);
    assert_eq!(opened["references"][0]["field"], "itemIds[0]");
    assert_eq!(opened["references"][0]["resolution"], "missing");
    let listed =
        dispatch_result(session, "shop.list", json!({})).expect("list bounded shop summaries");
    assert_eq!(listed["items"][0]["identity"], "shop:0");
    assert_eq!(listed["items"][0]["nativeId"], 0);
    assert_eq!(listed["total"], 1);
    assert_eq!(listed["items"][0]["activeItems"], 1);
}

fn repair_and_edit_shop(session: &mut EditorSession, store: &ProjectStore) {
    let repair = dispatch_result(
        session,
        "shop-reference.retarget",
        json!({
            "expectedRevision": 1,
            "source": "shop:0",
            "slot": 0,
            "targetId": 8
        }),
    )
    .expect("repair shop item");
    assert_eq!(repair["changedEntities"], json!(["shop:0"]));
    store
        .checkpoint_session(session, &json!({"method": "shop-reference.retarget"}))
        .expect("checkpoint repair");
    let mut edited = session.snapshot().shops[0].clone();
    edited.inflation = 150;
    let update = dispatch_result(
        session,
        "shop.update",
        json!({"expectedRevision": 2, "shop": edited}),
    )
    .expect("update shop inflation");
    assert_eq!(update["changedEntities"], json!(["shop:0"]));
    store
        .checkpoint_session(session, &json!({"method": "shop.update"}))
        .expect("checkpoint update");
}

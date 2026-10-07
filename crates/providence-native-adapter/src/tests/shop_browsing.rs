use crate::dispatch_result_with_store;
use providence_core::{
    codecs::{SHOP_RECORD_BYTES, decode_shops},
    model::{
        ClassicAction, ClassicSourceBlob, ExtraActionPoint, NativeRecordId, ProjectOrigin,
        ProjectSnapshot, StableId,
    },
    session::EditorSession,
};
use providence_storage::ProjectStore;
use serde_json::{Value, json};

fn fixture() -> (tempfile::TempDir, ProjectStore, EditorSession, Vec<u8>) {
    let temporary = tempfile::tempdir().unwrap();
    let mut snapshot = ProjectSnapshot::new_authored(StableId("shop-browsing".into()));
    let store = ProjectStore::create(temporary.path(), &snapshot).unwrap();
    let mut bytes = vec![0; SHOP_RECORD_BYTES * 262];
    bytes[130 * SHOP_RECORD_BYTES..130 * SHOP_RECORD_BYTES + 2]
        .copy_from_slice(&777_i16.to_be_bytes());
    for slot in [0, 1] {
        bytes[132 * SHOP_RECORD_BYTES + slot * 2..132 * SHOP_RECORD_BYTES + slot * 2 + 2]
            .copy_from_slice(&3000_i16.to_be_bytes());
    }
    let blob = store.put_blob(&bytes).unwrap();
    snapshot.origin = ProjectOrigin::Imported {
        compatibility_annex: blob.clone(),
    };
    snapshot.classic_sources.push(ClassicSourceBlob {
        native_path: "Data SD".into(),
        blob,
        byte_length: bytes.len() as u64,
    });
    snapshot.shops = decode_shops(&bytes).records;
    snapshot.extra_action_points.push(ExtraActionPoint {
        identity: StableId("xap:2".into()),
        native_id: NativeRecordId(2),
        classic_door_id: 0,
        post_action_level: 0,
        post_action_x: 0,
        post_action_y: 0,
        chance_percent: 100,
        actions: (0..8)
            .map(|slot| ClassicAction {
                slot,
                raw_opcode: if slot == 0 { 6 } else { 0 },
                target_native_id: if slot == 0 { 132 } else { 0 },
            })
            .collect(),
    });
    store.save_snapshot(&snapshot).unwrap();
    (temporary, store, EditorSession::new(snapshot), bytes)
}

fn read(session: &mut EditorSession, store: &ProjectStore, method: &str, params: Value) -> Value {
    dispatch_result_with_store(session, Some(store), method, params).unwrap()
}

#[test]
fn shop_browsing_filters_before_paging_without_hiding_valid_extensions() {
    let (_temporary, store, mut session, _) = fixture();
    let all = read(&mut session, &store, "shop.list", json!({"offset": 128}));
    assert_eq!(all["total"], 132);
    assert_eq!(all["items"][2]["nativeId"], 130);
    let filtered = read(
        &mut session,
        &store,
        "shop.list",
        json!({"problemsOnly": true, "limit": 1}),
    );
    assert_eq!(filtered["total"], 1);
    assert_eq!(filtered["allTotal"], 132);
    assert_eq!(filtered["items"][0]["nativeId"], 130);
    assert_eq!(filtered["truncated"], false);
}

#[test]
fn shop_browsing_exposes_bounded_read_only_source_reasons_and_exact_callers() {
    let (_temporary, store, mut session, bytes) = fixture();
    let before = session.snapshot().clone();
    let page = read(
        &mut session,
        &store,
        "shop.unverified.list",
        json!({"limit": 1}),
    );
    assert_eq!(page["total"], 130);
    assert_eq!(page["items"].as_array().unwrap().len(), 1);
    assert_eq!(page["items"][0]["nativeId"], 132);
    assert_eq!(page["items"][0]["linkOnly"], true);
    assert_eq!(page["items"][0]["callers"], 1);
    assert!(
        page["items"][0]["reason"]
            .as_str()
            .unwrap()
            .contains("1–999")
    );
    let links = read(
        &mut session,
        &store,
        "discovery.links",
        json!({"kind":"shop", "id":"132", "identity":"shop:132", "direction":"incoming", "expectedRevision":0, "projectId":"shop-browsing"}),
    );
    assert_eq!(links["items"][0]["source"], "xap:2");
    assert!(
        dispatch_result_with_store(
            &mut session,
            Some(&store),
            "shop.open",
            json!({"nativeId":132})
        )
        .is_err()
    );
    let next = read(
        &mut session,
        &store,
        "shop.unverified.list",
        json!({"offset": 128}),
    );
    assert_eq!(next["items"].as_array().unwrap().len(), 2);
    assert_eq!(next["items"][0]["nativeId"], 260);
    assert_eq!(session.snapshot(), &before);
    assert!(session.undo_history().is_empty());
    assert_eq!(
        store.read_blob(&before.classic_sources[0].blob).unwrap(),
        bytes
    );
}

#[test]
fn shop_browsing_retained_authored_conflicts_are_not_relabelled_as_quarantined() {
    let (_temporary, store, mut session, _) = fixture();
    let mut snapshot = session.snapshot().clone();
    let mut shop = snapshot.shops[0].clone();
    shop.identity = StableId("shop:132".into());
    shop.native_id = NativeRecordId(132);
    shop.item_ids[0] = 3000;
    shop.item_ids[1] = 3000;
    shop.authored = true;
    snapshot.shops.push(shop);
    session = EditorSession::new(snapshot);
    let page = read(&mut session, &store, "shop.unverified.list", json!({}));
    assert_eq!(page["total"], 129);
    assert_eq!(page["items"][0]["nativeId"], 133);
}

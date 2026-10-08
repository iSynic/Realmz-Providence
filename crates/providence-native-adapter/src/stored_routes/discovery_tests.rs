use super::discovery::dispatch;
use crate::catalogs::CatalogViews;
use providence_core::{
    model::{AssetDescriptor, BlobId, ClassicResourceKey, StableId},
    rebuilt::{ApplicationMediaAsset, ApplicationMediaCatalog, ApplicationMediaSource},
    session::EditorSession,
};
use serde_json::{Value, json};

mod flow;

fn asset(identity: &str, kind: &str, resource_type: &str, id: i32) -> AssetDescriptor {
    AssetDescriptor {
        identity: StableId(identity.into()),
        label: identity.into(),
        kind: kind.into(),
        mime_type: None,
        classic_resource: Some(ClassicResourceKey {
            resource_type: resource_type.into(),
            resource_id: id,
        }),
        scenario_music_slot: None,
        blob: BlobId(format!("sha256:{}", "0".repeat(64))),
        byte_length: 0,
        classic_payload_blob: None,
        classic_payload_byte_length: None,
        extension: None,
        width: None,
        height: None,
        duration_ms: None,
        sample_rate: None,
        channels: None,
        tile_width: None,
        tile_height: None,
        columns: None,
        rows: None,
        landlook: None,
        base_tile: None,
        source: "controlled discovery fixture".into(),
    }
}

fn read(
    session: &mut EditorSession,
    catalog: &ApplicationMediaCatalog,
    method: &str,
    mut params: Value,
) -> Value {
    params["projectId"] = json!(session.snapshot().project_id);
    params["expectedRevision"] = json!(session.revision());
    dispatch(
        session,
        None,
        CatalogViews {
            application_media: Some(catalog),
            ..Default::default()
        },
        None,
        method,
        params,
    )
    .unwrap()
}

fn fixture() -> (
    providence_core::model::ProjectSnapshot,
    ApplicationMediaCatalog,
) {
    use providence_core::model::{
        ClassicAction, ExtraActionPoint, NativeRecordId, ProjectSnapshot,
    };
    let mut snapshot = ProjectSnapshot::new_authored(StableId("discovery-media".into()));
    snapshot.extra_action_points.push(ExtraActionPoint {
        identity: StableId("extra-action-point:1".into()),
        native_id: NativeRecordId(1),
        classic_door_id: 1,
        post_action_level: 0,
        post_action_x: 0,
        post_action_y: 0,
        chance_percent: 100,
        actions: vec![ClassicAction {
            slot: 0,
            raw_opcode: 9,
            target_native_id: 36,
        }],
    });
    let mut catalog = ApplicationMediaCatalog::empty(StableId("test-library".into()));
    catalog.sources.push(ApplicationMediaSource {
        identity: StableId("stock".into()),
        native_name: "controlled".into(),
        priority: 0,
        blob: BlobId(format!("sha256:{}", "0".repeat(64))),
        byte_length: 0,
    });
    catalog.assets.push(ApplicationMediaAsset {
        source: StableId("stock".into()),
        source_priority: 0,
        descriptor: asset("stock-sound-36", "sound", "snd ", 36),
    });
    catalog.assets.push(ApplicationMediaAsset {
        source: StableId("stock".into()),
        source_priority: 0,
        descriptor: asset("stock-text-negative", "text-resource", "TEXT", -7),
    });
    (snapshot, catalog)
}

#[test]
fn discovery_media_scopes_resolve_exact_keys_without_stock_substitution() {
    let (mut snapshot, catalog) = fixture();
    let mut session = EditorSession::new(snapshot.clone());
    let stock = read(
        &mut session,
        &catalog,
        "discovery.search",
        json!({"scope":"stock", "kind":"sound", "query":"36"}),
    );
    assert_eq!(stock["total"], 1);
    let links = read(
        &mut session,
        &catalog,
        "discovery.links",
        json!({"direction":"incoming", "kind":"sound", "id":"36", "scope":"stock"}),
    );
    assert_eq!(links["items"][0]["targetIdentity"], "stock-sound-36");
    let preview = read(
        &mut session,
        &catalog,
        "discovery.preview",
        json!({"identity":"stock-sound-36", "scope":"stock"}),
    );
    assert_eq!(preview["usedBy"], 1);
    snapshot
        .assets
        .push(asset("scenario-sound-36", "sound", "snd ", 36));
    let mut overridden = EditorSession::new(snapshot.clone());
    assert_eq!(
        read(
            &mut overridden,
            &catalog,
            "discovery.trace",
            json!({"kind":"sound", "id":"36", "identity":"stock-sound-36", "scope":"stock"})
        )["trace"]["total"],
        0
    );
    assert_eq!(
        read(
            &mut overridden,
            &catalog,
            "discovery.preview",
            json!({"identity":"stock-sound-36", "scope":"stock"})
        )["usedBy"],
        0
    );
    assert_eq!(
        read(
            &mut overridden,
            &catalog,
            "discovery.preview",
            json!({"identity":"scenario-sound-36", "scope":"scenario"})
        )["usedBy"],
        1
    );
}

#[test]
fn discovery_ambiguous_scenario_and_stock_keys_never_borrow_another_owner() {
    let (mut snapshot, mut catalog) = fixture();
    let mut session = EditorSession::new(snapshot.clone());
    snapshot
        .assets
        .push(asset("scenario-sound-36", "sound", "snd ", 36));
    snapshot
        .assets
        .push(asset("duplicate-36", "sound", "snd ", 36));
    let mut ambiguous = EditorSession::new(snapshot);
    let links = read(
        &mut ambiguous,
        &catalog,
        "discovery.links",
        json!({"direction":"outgoing", "identity":"extra-action-point:1"}),
    );
    assert_eq!(links["items"][0]["resolution"], "ambiguous");
    assert!(links["items"][0]["targetIdentity"].is_null());
    catalog.assets.push(catalog.assets[0].clone());
    let links = read(
        &mut session,
        &catalog,
        "discovery.links",
        json!({"direction":"outgoing", "identity":"extra-action-point:1"}),
    );
    assert!(
        links["items"][0]["availabilityReason"]
            .as_str()
            .unwrap()
            .contains("ambiguous")
    );
}

#[test]
fn discovery_stock_text_search_keeps_signed_resource_identity() {
    let (snapshot, catalog) = fixture();
    let mut session = EditorSession::new(snapshot);
    assert_eq!(
        read(
            &mut session,
            &catalog,
            "discovery.search",
            json!({"scope":"stock", "kind":"text-resource", "query":"-7"})
        )["total"],
        1
    );
}

fn record_read(session: &mut EditorSession, catalog: &ApplicationMediaCatalog) -> Value {
    super::dispatch(
        session,
        None,
        CatalogViews {
            application_media: Some(catalog),
            ..Default::default()
        },
        None,
        "record.open",
        json!({"identity":"extra-action-point:1"}),
    )
    .unwrap()
}

#[test]
fn decoded_record_targets_use_exact_stock_identities_and_scenario_shadows() {
    let (mut snapshot, mut catalog) = fixture();
    snapshot.extra_action_points[0]
        .actions
        .push(providence_core::model::ClassicAction {
            slot: 1,
            raw_opcode: 27,
            target_native_id: -7,
        });
    catalog.assets.push(ApplicationMediaAsset {
        source: StableId("stock".into()),
        source_priority: 0,
        descriptor: asset("stock-picture-negative", "picture", "PICT", -7),
    });
    let mut session = EditorSession::new(snapshot.clone());
    let rows = record_read(&mut session, &catalog)["outgoingReferences"]
        .as_array()
        .unwrap()
        .clone();
    assert!(
        rows.iter()
            .any(|row| row["targetIdentity"] == "stock-sound-36")
    );
    assert!(rows.iter().any(|row| row["targetId"]=="-7" && row["targetIdentity"]=="stock-picture-negative"));
    snapshot
        .assets
        .push(asset("scenario-picture-negative", "picture", "PICT", -7));
    let mut shadowed = EditorSession::new(snapshot.clone());
    let shadowed = record_read(&mut shadowed, &catalog);
    assert!(
        shadowed["outgoingReferences"]
            .as_array()
            .unwrap()
            .iter()
            .any(|row| row["targetIdentity"] == "scenario-picture-negative")
    );
    catalog.assets.retain(|row| row.descriptor.kind != "sound");
    let mut missing = EditorSession::new(snapshot);
    let missing = record_read(&mut missing, &catalog);
    let sound = missing["outgoingReferences"]
        .as_array()
        .unwrap()
        .iter()
        .find(|row| row["targetKind"] == "sound")
        .unwrap();
    assert!(sound["targetIdentity"].is_null());
    assert!(
        sound["availabilityReason"]
            .as_str()
            .unwrap()
            .contains("unavailable")
    );
}

use crate::dispatch_result_with_application;
use providence_core::model::{AssetDescriptor, BlobId, ProjectSnapshot, StableId};
use providence_core::rebuilt::{
    ApplicationMediaAsset, ApplicationMediaCatalog, ApplicationMediaSource,
};
use providence_core::session::EditorSession;
use serde_json::json;

fn descriptor(identity: &str, kind: &str, id: i32) -> AssetDescriptor {
    serde_json::from_value(json!({
        "identity": identity,
        "label": identity,
        "kind": kind,
        "classicResource": {"resourceType": "snd ", "resourceId": id},
        "blob": "fixture",
        "byteLength": 1,
        "source": "controlled fixture"
    }))
    .unwrap()
}

fn catalog() -> ApplicationMediaCatalog {
    let source = StableId("classic-application:tacticals".into());
    ApplicationMediaCatalog {
        format_version: providence_core::rebuilt::APPLICATION_MEDIA_CATALOG_FORMAT_VERSION,
        library_id: StableId("stock".into()),
        sources: vec![ApplicationMediaSource {
            identity: source.clone(),
            native_name: "Tacticals.rsrc".into(),
            priority: 3,
            blob: BlobId("source".into()),
            byte_length: 1,
        }],
        assets: vec![ApplicationMediaAsset {
            source,
            source_priority: 3,
            descriptor: descriptor("stock-sound-147", "sound", 147),
        }],
        ambiguous_resources: Vec::new(),
        failures: Vec::new(),
    }
}

#[test]
fn configured_stock_sound_is_returned_by_picker_and_form_with_exact_identity() {
    let mut session = EditorSession::new(ProjectSnapshot::new_authored(StableId("project".into())));
    let catalog = catalog();
    let page = dispatch_result_with_application(
        &mut session,
        None,
        Some(&catalog),
        "action-target.list",
        json!({"query": {"kind": "sound", "limit": 40}}),
    )
    .expect("stock sound picker");
    assert_eq!(page["total"], 1);
    assert_eq!(page["items"][0]["identity"], "stock-sound-147");
    assert_eq!(page["items"][0]["status"], "application-resource");

    let form = dispatch_result_with_application(
        &mut session,
        None,
        Some(&catalog),
        "action-form.describe",
        json!({"query": {
            "actionIdentity": "realmz.action.9",
            "targetNativeId": -147,
            "values": {},
            "secondaryValues": {},
            "context": {}
        }}),
    )
    .expect("stock sound form");
    assert_eq!(form["fields"][0]["preview"]["identity"], "stock-sound-147");
    assert_eq!(
        form["fields"][0]["preview"]["status"],
        "application-resource"
    );
}

#[test]
fn malformed_exact_scenario_key_blocks_stock_sound_in_real_adapter_response() {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("project".into()));
    snapshot
        .assets
        .push(descriptor("wrong-role", "picture", 147));
    let mut session = EditorSession::new(snapshot);
    let catalog = catalog();
    let page = dispatch_result_with_application(
        &mut session,
        None,
        Some(&catalog),
        "action-target.list",
        json!({"query": {"kind": "sound", "limit": 40}}),
    )
    .expect("blocked stock sound picker");
    assert_eq!(page["total"], 0);
    let form = dispatch_result_with_application(
        &mut session,
        None,
        Some(&catalog),
        "action-form.describe",
        json!({"query": {
            "actionIdentity": "realmz.action.9",
            "targetNativeId": 147,
            "values": {},
            "secondaryValues": {},
            "context": {}
        }}),
    )
    .expect("blocked stock sound form");
    assert!(form["fields"][0]["preview"].is_null());
}

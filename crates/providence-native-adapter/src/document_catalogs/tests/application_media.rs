use super::*;
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
use providence_core::rebuilt::{
    ApplicationMediaAsset, ApplicationMediaCatalog, ApplicationMediaSource,
};
use providence_storage::ReferenceLibraryStore;
use tempfile::{TempDir, tempdir};

fn application_fixture() -> (TempDir, ReferenceLibraryStore, ApplicationMediaCatalog) {
    let temporary = tempdir().expect("reference store root");
    let store = ReferenceLibraryStore::create(temporary.path()).expect("reference store");
    let source_blob = store.put_blob(b"source").expect("source blob");
    let runtime_blob = store.put_blob(b"png").expect("runtime blob");
    let classic_blob = store.put_blob(b"pict").expect("classic blob");
    let source_id = StableId("classic-application:family-jewels".into());
    let mut descriptor = asset("classic-picture:300", "Landlook Zero", "picture", 300);
    descriptor.blob = runtime_blob;
    descriptor.byte_length = 3;
    descriptor.classic_payload_blob = Some(classic_blob);
    descriptor.classic_payload_byte_length = Some(4);
    descriptor.source = "Classic application/The Family Jewels.rsrc".into();
    let catalog = ApplicationMediaCatalog {
        format_version: providence_core::rebuilt::APPLICATION_MEDIA_CATALOG_FORMAT_VERSION,
        library_id: StableId("realmz-classic-application".into()),
        sources: vec![ApplicationMediaSource {
            identity: source_id.clone(),
            native_name: "The Family Jewels.rsrc".into(),
            priority: 0,
            blob: source_blob,
            byte_length: 6,
        }],
        assets: vec![ApplicationMediaAsset {
            source: source_id,
            source_priority: 0,
            descriptor,
        }],
        ambiguous_resources: Vec::new(),
        failures: Vec::new(),
    };
    (temporary, store, catalog)
}

#[test]
fn application_media_catalog_is_bounded_previewable_and_never_project_owned() {
    let (_temporary, store, catalog) = application_fixture();
    let listed =
        application_media_list(Some(&catalog), &json!({"query": "landlook", "limit": 500}))
            .expect("application media list");
    assert_eq!(listed["configured"], true);
    assert_eq!(listed["limit"], 128);
    assert_eq!(listed["total"], 1);
    assert_eq!(listed["items"][0]["classicResource"]["resourceId"], 300);
    assert!(listed.get("project").is_none());
    let selected = application_media_list(
        Some(&catalog),
        &json!({"identity": "classic-picture:300", "limit": 25}),
    )
    .expect("exact application media list");
    assert_eq!(selected["total"], 1);
    assert_eq!(selected["items"][0]["identity"], "classic-picture:300");

    let opened =
        application_media_open(Some(&catalog), &json!({"identity": "classic-picture:300"}))
            .expect("application media document");
    assert_eq!(opened["projectOwnership"], false);
    assert_eq!(opened["source"]["nativeName"], "The Family Jewels.rsrc");

    let previewed = application_media_preview(
        Some(&catalog),
        Some(&store),
        &json!({"identity": "classic-picture:300"}),
    )
    .expect("application media preview");
    assert_eq!(previewed["base64"], BASE64.encode(b"png"));
    assert_eq!(previewed["projectOwnership"], false);
}

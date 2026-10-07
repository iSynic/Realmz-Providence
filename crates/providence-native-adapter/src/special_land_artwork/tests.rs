use super::*;
use providence_core::{
    model::{ProjectSnapshot, StableId},
    session::EditorSession,
};

#[test]
fn exact_preview_checks_payload_revision_and_unavailable_recipes() {
    let temp = tempfile::tempdir().unwrap();
    let mut source = ProjectSnapshot::new_authored(StableId("special-preview".into()));
    let store = ProjectStore::create(temp.path(), &source).unwrap();
    let bytes = crate::map_artwork::tests::png(32, 32);
    let blob = store.put_blob(&bytes).unwrap();
    source.assets.push(serde_json::from_value(json!({"identity":"custom:-91","label":"Dome","kind":"special-land-tile",
        "mimeType":"image/png","width":32,"height":32,"classicResource":{"resourceType":"cicn","resourceId":-91},
        "blob":blob,"byteLength":bytes.len(),"source":"Scenario"})).unwrap());
    let mut session = EditorSession::new(source.clone());
    let result = preview(
        &session,
        Some(&store),
        CatalogViews::default(),
        &json!({"expectedRevision":0,"resourceId":-91}),
    )
    .unwrap();
    assert_eq!(result["identity"], "custom:-91");
    assert_eq!(
        BASE64.decode(result["base64"].as_str().unwrap()).unwrap(),
        bytes
    );
    assert_eq!(session.snapshot(), &source);
    assert_catalog_thumbnail(&session, &store, &bytes);
    let absent = uses(&session, &json!({"expectedRevision":0,"resourceId":-91})).unwrap();
    assert_eq!(absent["total"], 0);
    assert!(uses(&session, &json!({"expectedRevision":1,"resourceId":-91})).is_err());
    assert!(
        preview(
            &session,
            Some(&store),
            CatalogViews::default(),
            &json!({"expectedRevision":1,"resourceId":-91})
        )
        .is_err()
    );
    assert!(
        preview(
            &session,
            Some(&store),
            CatalogViews::default(),
            &json!({"expectedRevision":0,"resourceId":-3091})
        )
        .is_err()
    );
    crate::dispatch_result(
        &mut session,
        "map.create",
        json!({"expectedRevision":0,"levelType":"land"}),
    )
    .unwrap();
    let opened = crate::paint_resources::dispatch(&mut session,Some(&store),CatalogViews::default(),"paint-resources.open",
        &json!({"expectedRevision":1,"identity":"land:0","resourceIdentity":"preset:structure-dome-91-90"})).unwrap();
    assert!(!opened["availabilityReason"].is_null());
    assert!(crate::paint_resources::dispatch(&mut session,Some(&store),CatalogViews::default(),"map-stamp.preview",
        &json!({"expectedRevision":1,"identity":"land:0","resourceIdentity":"preset:structure-dome-91-90","origin":{"x":0,"y":0}})).is_err());
}

fn assert_catalog_thumbnail(session: &EditorSession, store: &ProjectStore, bytes: &[u8]) {
    let listed=crate::monster_reference_catalog::list(session,Some(store),CatalogViews::default(),&json!({
		"expectedRevision":0,"query":{"field":"specialLand","currentValue":0,"search":"-91","ownership":"all","showUnavailable":false,"offset":0,"seekCurrent":true,"limit":64}})).unwrap();
    assert_eq!(listed["page"]["items"][0]["value"], -91);
    assert_eq!(
        listed["specialThumbnails"][0]["response"]["result"]["identity"],
        "custom:-91"
    );
    assert_eq!(
        BASE64
            .decode(
                listed["specialThumbnails"][0]["response"]["result"]["base64"]
                    .as_str()
                    .unwrap()
            )
            .unwrap(),
        bytes
    );
}

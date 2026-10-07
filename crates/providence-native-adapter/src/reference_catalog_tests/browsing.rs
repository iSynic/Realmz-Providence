use super::fixtures::controlled_catalog;
use crate::reference_catalog::{
    MAX_SOURCE_EVIDENCE_BYTES, reference_catalog_list, reference_catalog_open,
};
use providence_core::model::StableId;
use providence_storage::ReferenceCatalogStore;
use serde_json::json;
use std::fs;

#[test]
fn reference_catalog_detail_reads_only_the_selected_retained_source() {
    let (temporary, catalog, native_size) = controlled_catalog();
    let (store, _) = ReferenceCatalogStore::open(temporary.path().join("catalog")).unwrap();
    for (kind, source_name) in [
        ("bag-item", "Bag of Holding.rsrc"),
        ("vault-icon", "Vault of Arcana.rsrc"),
    ] {
        let detail = reference_catalog_open(
            Some(&catalog),
            Some(&store),
            &json!({"identity": format!("divinity:{kind}:-164")}),
        )
        .unwrap();
        let evidence = &detail["sourceEvidence"];
        assert_eq!(evidence["state"], "ready");
        assert_eq!(evidence["offsetOrigin"], "resource-fork");
        let summary = &evidence["summary"];
        assert_eq!(summary["name"], source_name);
        assert_eq!(summary["resourceId"], -164);
        assert_eq!(summary["attributes"], 0);
        assert_eq!(summary["bytes"], native_size);
        assert_eq!(summary["offset"], 20);
        assert_eq!(summary["family"], "color-icon");
        assert_eq!(summary["iconBytes"], native_size);
        assert_eq!(summary["preview"].as_str().unwrap().split(' ').count(), 20);
        assert_eq!(summary["sha256"].as_str().unwrap().len(), 64);
        assert!(detail.to_string().len() < 4096);
        assert!(detail.get("base64").is_none());
        assert_eq!(detail["readOnly"], true);
        assert_eq!(detail["projectOwnership"], false);
    }
}

#[test]
fn reference_catalog_evidence_is_unavailable_or_rejected_instead_of_invented() {
    let (temporary, mut catalog, _) = controlled_catalog();
    let (store, _) = ReferenceCatalogStore::open(temporary.path().join("catalog")).unwrap();
    let params = json!({"identity": "divinity:bag-item:-164"});
    let unavailable = reference_catalog_open(Some(&catalog), None, &params).unwrap();
    assert_eq!(unavailable["sourceEvidence"]["state"], "unavailable");
    assert!(unavailable["sourceEvidence"].get("summary").is_none());
    catalog.assets[0]
        .descriptor
        .classic_resource
        .as_mut()
        .unwrap()
        .resource_id = 65_535;
    assert!(
        reference_catalog_open(Some(&catalog), Some(&store), &params)
            .unwrap_err()
            .contains("signed Classic range")
    );
    catalog.assets[0]
        .descriptor
        .classic_resource
        .as_mut()
        .unwrap()
        .resource_id = -164;
    catalog.assets[0].descriptor.classic_payload_byte_length = Some(1);
    assert!(
        reference_catalog_open(Some(&catalog), Some(&store), &params)
            .unwrap_err()
            .contains("payload identity")
    );
    catalog.sources[0].byte_length = MAX_SOURCE_EVIDENCE_BYTES + 1;
    let oversized = reference_catalog_open(Some(&catalog), Some(&store), &params).unwrap();
    assert_eq!(oversized["sourceEvidence"]["state"], "unavailable");
    assert!(oversized["sourceEvidence"].get("summary").is_none());
}

#[test]
fn reference_catalog_source_reads_enforce_actual_size_and_digest() {
    let (temporary, catalog, _) = controlled_catalog();
    let (store, _) = ReferenceCatalogStore::open(temporary.path().join("catalog")).unwrap();
    let source = &catalog.sources[0];
    assert!(
        store
            .read_blob_bounded(&source.blob, source.byte_length - 1)
            .unwrap_err()
            .to_string()
            .contains("exceeds")
    );
    assert_eq!(
        store
            .read_blob_bounded(&source.blob, source.byte_length)
            .unwrap()
            .len() as u64,
        source.byte_length
    );
    let path = store.root().join("blobs/sha256").join(&source.blob.0[7..]);
    fs::write(path, b"corrupted source").unwrap();
    assert!(
        reference_catalog_open(
            Some(&catalog),
            Some(&store),
            &json!({"identity": "divinity:bag-item:-164"})
        )
        .unwrap_err()
        .contains("digest")
    );
}

#[test]
fn reference_catalog_rows_distinguish_native_resource_size_from_preview_size() {
    let (_temporary, mut catalog, native_size) = controlled_catalog();
    let listed = reference_catalog_list(Some(&catalog), &json!({"kind": "bag-item"})).unwrap();
    let row = &listed["items"][0];
    assert_eq!(row["sourceName"], "Divinity Data/Bag of Holding.rsrc");
    assert_eq!(row["nativeByteLength"], native_size);
    assert_eq!(
        row["previewByteLength"],
        catalog.assets[0].descriptor.byte_length
    );
    assert_ne!(row["nativeByteLength"], row["previewByteLength"]);
    assert_eq!(row["resource"]["resourceId"], -164);
    assert_eq!(listed["readOnly"], true);
    assert_eq!(listed["projectOwnership"], false);
    assert!(row.get("base64").is_none());
    assert!(row.get("snapshot").is_none());
    catalog.assets[0].descriptor.classic_payload_byte_length = None;
    let listed = reference_catalog_list(Some(&catalog), &json!({"kind": "bag-item"})).unwrap();
    assert!(listed["items"][0]["nativeByteLength"].is_null());
}

#[test]
fn reference_catalog_search_matches_available_donor_source_and_resource_facts() {
    let (_temporary, mut catalog, native_size) = controlled_catalog();
    catalog.assets[0].descriptor.label = "Épée contrôlée".into();
    for query in [
        "  ÉPÉE  ".to_string(),
        "BAG OF HOLDING.RSRC".into(),
        "reference-source:bag-of-holding".into(),
        "CICN".into(),
        "-164".into(),
        native_size.to_string(),
    ] {
        let page =
            reference_catalog_list(Some(&catalog), &json!({"kind": "bag-item", "query": query}))
                .unwrap();
        assert_eq!(page["total"], 1, "query {query}");
        assert_eq!(page["items"][0]["kind"], "bag-item");
    }
    let page = reference_catalog_list(
        Some(&catalog),
        &json!({"kind": "vault-icon", "query": "Bag of Holding"}),
    )
    .unwrap();
    assert_eq!(page["total"], 0);
}

#[test]
fn reference_catalog_search_keeps_bounded_deterministic_pages() {
    let (_temporary, mut catalog, _) = controlled_catalog();
    let template = catalog.assets[0].clone();
    catalog.assets.clear();
    for id in (0..130).rev() {
        let mut asset = template.clone();
        asset.descriptor.identity = StableId(format!("controlled:bag:{id}"));
        asset
            .descriptor
            .classic_resource
            .as_mut()
            .unwrap()
            .resource_id = id;
        catalog.assets.push(asset);
    }
    let params = json!({"kind": "bag-item", "query": "Bag of Holding", "limit": 10000});
    let page = reference_catalog_list(Some(&catalog), &params).unwrap();
    assert_eq!(page["limit"], 128);
    assert_eq!(page["items"].as_array().unwrap().len(), 128);
    assert_eq!(page["total"], 130);
    assert_eq!(page["truncated"], true);
    assert_eq!(page["items"][0]["resource"]["resourceId"], 0);
    assert_eq!(
        page,
        reference_catalog_list(Some(&catalog), &params).unwrap()
    );
    let tail = reference_catalog_list(
        Some(&catalog),
        &json!({"kind": "bag-item", "query": "Bag of Holding", "offset": 128, "limit": 128}),
    )
    .unwrap();
    assert_eq!(tail["items"].as_array().unwrap().len(), 2);
    assert_eq!(tail["items"][0]["resource"]["resourceId"], 128);
    assert_eq!(tail["truncated"], false);
}

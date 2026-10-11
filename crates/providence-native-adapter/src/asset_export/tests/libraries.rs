use super::*;
use providence_core::{
    personal_library::{LibraryCommand, PersonalAsset, PersonalMedia},
    rebuilt::{ApplicationMediaAsset, ApplicationMediaCatalog, ApplicationMediaSource},
    reference_library::{ReferenceCatalog, ReferenceCatalogAsset},
};
use providence_storage::{PersonalLibraryStore, ReferenceCatalogStore, ReferenceLibraryStore};

#[test]
fn all_scopes_keep_exact_owner_and_supplied_library_includes_protected_collections() {
    let mut f = Fixture::new();
    let image = png();
    f.add("asset:same", "icon", "image/png", &image, None);
    let descriptor = f.session.snapshot().assets[0].clone();
    let (stock_store, stock, supplied_store, supplied) = supplied_catalogs(&f, &image, descriptor);
    let views = CatalogViews {
        application_media: Some(&stock),
        application_media_store: Some(&stock_store),
        reference_catalog: Some(&supplied),
        reference_catalog_store: Some(&supplied_store),
        ..Default::default()
    };
    let mut params = f.selection(vec!["icons"]);
    params["selection"]["scopes"] = json!(["scenario", "library", "stock"]);
    params["reviewHash"] = dispatch(
        &f.session,
        Some(&f.project),
        views,
        "asset-export.plan",
        &params,
    )
    .unwrap()["reviewHash"]
        .clone();
    params["directory"] = json!(f.temporary.path());
    let result = dispatch(
        &f.session,
        Some(&f.project),
        views,
        "asset-export.write",
        &params,
    )
    .unwrap();
    assert_eq!(result["assets"], 3);
    assert_eq!(result["files"], 3);
    let receipt = manifest(&result);
    for scope in ["Scenario/", "Library/", "Stock/"] {
        assert_eq!(
            receipt["files"]
                .as_array()
                .unwrap()
                .iter()
                .filter(|file| file["path"].as_str().unwrap().starts_with(scope))
                .count(),
            1
        );
    }
    assert_eq!(f.session.snapshot().assets.len(), 1);
}

#[test]
fn personal_prepared_asset_keeps_its_actual_import_original_and_checks_library_revision() {
    let mut f = Fixture::new();
    let image = png();
    f.add(
        "asset:primary",
        "icon",
        "image/png",
        &image,
        Some(b"controlled native payload"),
    );
    let library = PersonalLibraryStore::create(f.temporary.path().join("library")).unwrap();
    let input = b"exact import source distinct from prepared pixels";
    add_prepared_personal(&f, &library, &image, input, "application/octet-stream");
    let views = CatalogViews {
        personal_library: Some(&library),
        ..Default::default()
    };
    let mut params = f.selection(vec!["icons"]);
    params["selection"]["scopes"] = json!(["library"]);
    params["reviewHash"] = dispatch(
        &f.session,
        Some(&f.project),
        views,
        "asset-export.plan",
        &params,
    )
    .unwrap()["reviewHash"]
        .clone();
    params["directory"] = json!(f.temporary.path());
    let result = dispatch(
        &f.session,
        Some(&f.project),
        views,
        "asset-export.write",
        &params,
    )
    .unwrap();
    assert_eq!(result["files"], 2);
    assert_import_original(&result, input);
    library
        .apply(
            1,
            LibraryCommand::Rename {
                identity: StableId("personal:one".into()),
                name: "Changed".into(),
            },
        )
        .unwrap();
    assert!(
        dispatch(
            &f.session,
            Some(&f.project),
            views,
            "asset-export.write",
            &params
        )
        .is_err()
    );
}

fn supplied_catalogs(
    f: &Fixture,
    image: &[u8],
    descriptor: AssetDescriptor,
) -> (
    ReferenceLibraryStore,
    ApplicationMediaCatalog,
    ReferenceCatalogStore,
    ReferenceCatalog,
) {
    let stock_store = ReferenceLibraryStore::create(f.temporary.path().join("stock")).unwrap();
    let source_blob = stock_store.put_blob(image).unwrap();
    let mut stock_descriptor = descriptor.clone();
    stock_descriptor.classic_payload_blob = Some(source_blob.clone());
    stock_descriptor.classic_payload_byte_length = Some(image.len() as u64);
    let stock = ApplicationMediaCatalog {
        format_version: 1,
        library_id: StableId("stock-fixture".into()),
        sources: vec![ApplicationMediaSource {
            identity: StableId("stock-input".into()),
            native_name: "Controlled Stock fixture".into(),
            priority: 0,
            blob: source_blob,
            byte_length: image.len() as u64,
        }],
        assets: vec![ApplicationMediaAsset {
            source: StableId("stock-input".into()),
            source_priority: 0,
            descriptor: stock_descriptor,
        }],
        ambiguous_resources: vec![],
        failures: vec![],
    };
    stock_store.save_catalog(&stock).unwrap();
    let supplied_store =
        ReferenceCatalogStore::create(f.temporary.path().join("supplied")).unwrap();
    supplied_store.put_blob(image).unwrap();
    let supplied = ReferenceCatalog {
        format_version: 1,
        library_id: StableId("supplied-fixture".into()),
        sources: vec![],
        assets: vec![ReferenceCatalogAsset {
            source: StableId("vault-fixture".into()),
            descriptor,
        }],
    };
    (stock_store, stock, supplied_store, supplied)
}

fn add_prepared_personal(
    f: &Fixture,
    library: &PersonalLibraryStore,
    image: &[u8],
    input: &[u8],
    mime_type: &str,
) {
    let original = library.put_original(input).unwrap();
    library.put_original(image).unwrap();
    library.put_original(b"controlled native payload").unwrap();
    let personal = PersonalAsset {
        identity: StableId("personal:one".into()),
        name: "Personal icon".into(),
        collection: None,
        original,
        byte_length: input.len() as u64,
        mime_type: mime_type.into(),
        import_kind: Some("icon".into()),
        media: Some(PersonalMedia {
            primary: f.session.snapshot().assets[0].clone(),
            companion: None,
        }),
    };
    library
        .apply(0, LibraryCommand::Import(Box::new(personal)))
        .unwrap();
}

fn assert_import_original(result: &Value, input: &[u8]) {
    let receipt = manifest(result);
    let source = receipt["files"]
        .as_array()
        .unwrap()
        .iter()
        .find(|file| file["format"] == "originals")
        .unwrap();
    assert_eq!(
        fs::read(
            Path::new(result["directory"].as_str().unwrap()).join(source["path"].as_str().unwrap())
        )
        .unwrap(),
        input
    );
}

#[test]
fn personal_png_keeps_one_original_when_pixels_match_and_two_when_preparation_changes_them() {
    for changed_pixels in [false, true] {
        let mut fixture = Fixture::new();
        let image = png();
        fixture.add(
            "asset:primary",
            "icon",
            "image/png",
            &image,
            Some(b"controlled native payload"),
        );
        let library =
            PersonalLibraryStore::create(fixture.temporary.path().join("library")).unwrap();
        let input = png_with_metadata(if changed_pixels {
            [1, 2, 3, 255]
        } else {
            [10, 20, 30, 128]
        });
        assert_ne!(input, image);
        add_prepared_personal(&fixture, &library, &image, &input, "image/png");
        let result = write_library(&fixture, &library);
        assert_eq!(result["files"], if changed_pixels { 2 } else { 1 });
        assert_eq!(result["issueCount"], 0);
        assert_import_original(&result, &input);
        if !changed_pixels {
            let receipt = manifest(&result);
            assert_eq!(
                receipt["files"][0]["formats"],
                json!(["originals", "converted"])
            );
            assert!(
                receipt["files"][0]["path"]
                    .as_str()
                    .unwrap()
                    .ends_with(".png")
            );
        }
    }
}

fn png_with_metadata(rgba: [u8; 4]) -> Vec<u8> {
    let mut bytes = Vec::new();
    {
        let mut encoder = png::Encoder::new(&mut bytes, 1, 1);
        encoder.set_color(png::ColorType::Rgba);
        encoder.set_depth(png::BitDepth::Eight);
        encoder
            .add_text_chunk("Comment".into(), "preserve original metadata".into())
            .unwrap();
        let mut writer = encoder.write_header().unwrap();
        writer.write_image_data(&rgba).unwrap();
        writer.finish().unwrap();
    }
    bytes
}

fn write_library(fixture: &Fixture, library: &PersonalLibraryStore) -> Value {
    let views = CatalogViews {
        personal_library: Some(library),
        ..Default::default()
    };
    let mut params = fixture.selection(vec!["icons"]);
    params["selection"]["scopes"] = json!(["library"]);
    params["reviewHash"] = dispatch(
        &fixture.session,
        Some(&fixture.project),
        views,
        "asset-export.plan",
        &params,
    )
    .unwrap()["reviewHash"]
        .clone();
    params["directory"] = json!(fixture.temporary.path());
    dispatch(
        &fixture.session,
        Some(&fixture.project),
        views,
        "asset-export.write",
        &params,
    )
    .unwrap()
}

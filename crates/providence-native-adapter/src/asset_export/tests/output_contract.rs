use super::*;

#[test]
fn format_options_never_emit_preview_or_duplicate_original_files() {
    for native in [None, Some(b"exact CICN source".as_slice())] {
        for (originals, converted) in [(true, false), (false, true), (true, true)] {
            let mut fixture = Fixture::new();
            let image = png();
            fixture.add("asset:icon", "icon", "image/png", &image, native);
            let mut selection = fixture.selection(vec!["icons"]);
            selection["selection"]["originals"] = json!(originals);
            selection["selection"]["converted"] = json!(converted);
            let result = fixture.write(selection);
            let receipt = manifest(&result);
            let files = receipt["files"].as_array().unwrap();
            let count = usize::from(native.is_some() && originals && converted) + 1;
            assert_eq!(files.len(), count);
            assert_eq!(result["issueCount"], 0);
            for file in files {
                let path = file["path"].as_str().unwrap();
                assert!(!path.contains("native-resources") && !path.contains("source-originals"));
                let bytes =
                    fs::read(Path::new(result["directory"].as_str().unwrap()).join(path)).unwrap();
                let expected = if file["format"] == "originals" {
                    native.unwrap_or(&image)
                } else {
                    &image
                };
                assert_eq!(bytes, expected);
            }
            if native.is_none() && originals && converted {
                assert_eq!(files[0]["formats"], json!(["originals", "converted"]));
            }
        }
    }
}

#[test]
fn cicn_source_exports_as_one_exact_resource_and_one_complete_png() {
    let native = providence_core::codecs::encode_scenario_icon_cicn(
        &[60, 120, 180, 255].repeat(32 * 32),
        32,
        32,
    )
    .unwrap();
    let decoded = providence_core::codecs::decode_cicn(&native).unwrap();
    let png = providence_core::codecs::encode_runtime_rgba_png(
        &decoded.rgba,
        decoded.width,
        decoded.height,
    )
    .unwrap();
    let mut fixture = Fixture::new();
    fixture.add("asset:cicn", "icon", "image/png", &png, Some(&native));
    let result = fixture.write(fixture.selection(vec!["icons"]));
    assert_eq!(result["files"], 2);
    for file in manifest(&result)["files"].as_array().unwrap() {
        let path = file["path"].as_str().unwrap();
        let bytes = fs::read(Path::new(result["directory"].as_str().unwrap()).join(path)).unwrap();
        if file["format"] == "originals" {
            assert!(path.ends_with(".cicn"));
            assert_eq!(bytes, native);
        } else {
            assert!(path.ends_with(".png"));
            let image = crate::personal_image::decode(&bytes).unwrap();
            assert_eq!((image.width, image.height), (32, 32));
            assert_eq!(image.rgba, decoded.rgba);
        }
    }
}

#[test]
fn older_three_copy_review_cannot_authorize_the_new_output_contract() {
    let mut fixture = Fixture::new();
    fixture.add("asset:icon", "icon", "image/png", &png(), None);
    let mut params = fixture.selection(vec!["icons"]);
    let selection = selection(&params).unwrap();
    let inventory = catalog::Inventory::load(
        &fixture.session,
        Some(&fixture.project),
        CatalogViews::default(),
    )
    .unwrap();
    let entries = inventory.select(&selection).unwrap();
    let old_intent = json!({"selection":selection,"revision":inventory.revision,
        "libraryRevision":inventory.library_revision,"entries":entries});
    params["reviewHash"] = json!(format!(
        "{:x}",
        Sha256::digest(serde_json::to_vec(&old_intent).unwrap())
    ));
    params["directory"] = json!(fixture.temporary.path());
    assert!(
        fixture
            .request("asset-export.write", &params)
            .unwrap_err()
            .contains("Review")
    );
    assert_eq!(fs::read_dir(fixture.temporary.path()).unwrap().count(), 1);
}

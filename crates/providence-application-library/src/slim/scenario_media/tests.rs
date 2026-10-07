use super::fixtures::{asset, media};
use super::*;
use providence_core::{codecs::encode_runtime_rgba_png, model::StableId};

#[test]
fn duplicate_owned_descriptors_fail_before_missing_descriptor_identity_conflicts() {
    let mut duplicate = asset(1, "assets/media/one.png", "unchanged");
    duplicate.id = StableId("second-owner".into());
    let mut conflicting = asset(9, "assets/media/other.png", "unchanged");
    conflicting.id = StableId("scenario-cicn-2".into());
    let mut index = RebuiltV3AssetIndex {
        kind: "realmz2.assets".into(),
        schema_version: 3,
        assets: vec![
            asset(1, "assets/media/one.png", "unchanged"),
            duplicate,
            conflicting,
        ],
    };
    let mut files = BTreeMap::from([("assets/media/one.png".into(), vec![1, 2, 3, 4])]);
    let original_files = files.clone();
    let sources = [
        media(1, "One", 32, 32, vec![1, 2, 3, 4]),
        media(2, "Two", 32, 32, vec![5, 6, 7, 8]),
    ];
    assert_eq!(
        refresh(&mut index, &mut files, &sources, &BTreeSet::new(), None).unwrap_err(),
        "source package has multiple descriptors for scenario-owned cicn resource 1"
    );
    assert_eq!(files, original_files);
}

#[test]
fn visually_equivalent_png_payloads_match_across_compression() {
    let pixels = [255, 0, 0, 255, 0, 0, 255, 128];
    let source_png = encode_runtime_rgba_png(&pixels, 2, 1).unwrap();
    let mut prior_png = Vec::new();
    {
        let mut encoder = png::Encoder::new(&mut prior_png, 2, 1);
        encoder.set_color(png::ColorType::Rgba);
        encoder.set_depth(png::BitDepth::Eight);
        let mut writer = encoder.write_header().unwrap();
        writer.write_image_data(&pixels).unwrap();
    }
    let source = media(1, "cicn 1", 2, 1, source_png.clone());

    assert_ne!(prior_png, source_png);
    assert!(runtime_payloads_match(&prior_png, &source));
}

#[test]
fn scenario_owned_media_replaces_stock_payload_without_changing_runtime_identity() {
    let mut index = RebuiltV3AssetIndex {
        kind: "realmz2.assets".into(),
        schema_version: 3,
        assets: vec![asset(718, "assets/media/stock.png", "stock")],
    };
    index.assets[0].id = StableId("realmz-monster-icon-718".into());
    index.assets[0].label = "Realmz monster icon 718".into();
    index.assets[0].width = Some(64);
    index.assets[0].height = Some(64);
    let scenario = media(718, "Warhound Right", 64, 32, vec![1, 2, 3, 4]);
    let mut files = BTreeMap::from([("assets/media/stock.png".into(), vec![9, 9, 9])]);

    let (refreshed, added, preserved_unrefreshable) =
        refresh(&mut index, &mut files, &[scenario], &BTreeSet::new(), None).unwrap();

    let record = &index.assets[0];
    assert_eq!(refreshed, 1);
    assert_eq!(added, 0);
    assert_eq!(preserved_unrefreshable, 0);
    assert_eq!(record.id.0, "realmz-monster-icon-718");
    assert_eq!(record.kind, "monster-icon");
    assert_eq!(record.label, "Warhound Right");
    assert_eq!((record.width, record.height), (Some(64), Some(32)));
    assert_eq!(files[&record.path], [1, 2, 3, 4]);
}

#[test]
fn ambiguous_scenario_media_preserves_the_existing_package_payload() {
    let resource = ClassicResourceKey {
        resource_type: "cicn".into(),
        resource_id: 452,
    };
    let mut index = RebuiltV3AssetIndex {
        kind: "realmz2.assets".into(),
        schema_version: 3,
        assets: vec![asset(452, "assets/media/preserved.png", "preserved")],
    };
    let mut files = BTreeMap::from([("assets/media/preserved.png".into(), vec![7, 8, 9])]);

    let (refreshed, added, preserved_unrefreshable) = refresh(
        &mut index,
        &mut files,
        &[],
        &BTreeSet::from([resource]),
        None,
    )
    .unwrap();

    assert_eq!(refreshed, 0);
    assert_eq!(added, 0);
    assert_eq!(preserved_unrefreshable, 1);
    assert_eq!(index.assets[0].sha256, "preserved");
    assert_eq!(files["assets/media/preserved.png"], [7, 8, 9]);
}

#[test]
fn missing_scenario_cicn_gets_an_exact_runtime_descriptor() {
    let mut index = RebuiltV3AssetIndex {
        kind: "realmz2.assets".into(),
        schema_version: 3,
        assets: vec![],
    };
    let scenario = media(779, "Huntsman Right", 32, 32, vec![1, 2, 3, 4]);
    let mut files = BTreeMap::new();

    let (refreshed, added, preserved_unrefreshable) =
        refresh(&mut index, &mut files, &[scenario], &BTreeSet::new(), None).unwrap();

    assert_eq!((refreshed, added, preserved_unrefreshable), (1, 1, 0));
    let record = &index.assets[0];
    assert_eq!(record.id.0, "scenario-cicn-779");
    assert_eq!(resource_key(record).unwrap().resource_id, 779);
    assert_eq!(files[&record.path], [1, 2, 3, 4]);
}

use super::*;

#[test]
fn item_artwork_uses_agree_with_removal_in_list_and_detail() {
    let (mut snapshot, mut picture) = item_and_map_artwork();
    for ambiguous in [false, true] {
        if ambiguous {
            picture.identity = StableId("duplicate-picture".into());
            snapshot.assets.push(picture.clone());
        }
        let session = EditorSession::new(snapshot.clone());
        let list = project_asset_list(&session, &json!({"limit": 2})).unwrap();
        for row in list["items"].as_array().unwrap() {
            assert_eq!(row["usedBy"], 2);
            assert_eq!(row["removable"], false);
            let detail =
                project_asset_open(&session, &json!({"identity": row["identity"], "limit": 1}))
                    .unwrap();
            assert_eq!(detail["paging"]["usedByTotal"], 2);
            assert_eq!(detail["usedBy"][0]["field"], "iconId");
            assert_eq!(detail["removable"], false);
            assert_eq!(detail["useTargets"].as_array().unwrap().len(), 1);
            assert_eq!(
                detail["useTargets"][0]["label"],
                "Item 800 · Trailfinder Ring"
            );
            assert_eq!(detail["useTargets"][0]["sourceKind"], "item");
            let next = project_asset_open(&session, &json!({"identity": row["identity"], "offset": 1, "limit": 1, "expectedRevision": 0})).unwrap();
            assert_eq!(next["useTargets"][0]["source"], "land:0");
            assert_eq!(next["useTargets"][0]["label"], "Thornwatch Coast");
            assert_eq!(next["useTargets"][0]["sourceKind"], "map");
            assert_eq!(next["paging"]["usedByTruncated"], false);
            assert!(
                project_asset_open(
                    &session,
                    &json!({"identity": row["identity"], "expectedRevision": 1})
                )
                .is_err()
            );
            assert!(
                project_asset_open(
                    &session,
                    &json!({"identity": row["identity"], "expectedRevision": "0"})
                )
                .is_err()
            );
        }
    }
}

#[test]
fn style_pairing_resolves_exact_project_text_and_rejects_ambiguity() {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("text-pairing".into()));
    let mut style = asset("style:-202", "Style -202", "text-style-resource", -202);
    style.classic_resource.as_mut().unwrap().resource_type = "styl".into();
    snapshot.assets.push(style);
    let mut text = asset("text:-203", "Other text", "text-resource", -203);
    text.classic_resource.as_mut().unwrap().resource_type = "TEXT".into();
    snapshot.assets.push(text.clone());
    let open = |snapshot: ProjectSnapshot| {
        project_asset_open(
            &EditorSession::new(snapshot),
            &json!({"identity": "style:-202", "limit": 1}),
        )
        .unwrap()
    };
    assert_eq!(open(snapshot.clone())["pairedText"]["status"], "missing");
    text.identity = StableId("text:-202".into());
    text.classic_resource.as_mut().unwrap().resource_id = -202;
    snapshot.assets.push(text.clone());
    let ready = open(snapshot.clone());
    assert_eq!(ready["pairedText"]["status"], "ready");
    assert_eq!(ready["pairedText"]["identity"], "text:-202");
    let exact = project_asset_list(
        &EditorSession::new(snapshot.clone()),
        &json!({"identity": "text:-202", "limit": 1}),
    )
    .unwrap();
    assert_eq!(exact["total"], 1);
    assert_eq!(exact["items"][0]["identity"], "text:-202");
    text.identity = StableId("duplicate:-202".into());
    snapshot.assets.push(text);
    let ambiguous = open(snapshot);
    assert_eq!(ambiguous["pairedText"]["status"], "ambiguous");
    assert!(ambiguous["pairedText"]["identity"].is_null());
    assert!(ambiguous.get("snapshot").is_none());
}

#[test]
fn project_asset_catalog_is_filtered_paged_and_document_bounded() {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("asset-catalog".into()));
    snapshot.assets = vec![
        asset("picture:30001", "Storm Gate", "picture", 30_001),
        asset("picture:30002", "Quiet Harbor", "picture", 30_002),
    ];
    let session = EditorSession::new(snapshot);

    let listed = project_asset_list(
        &session,
        &json!({"kind": "picture", "query": "storm", "limit": 500}),
    )
    .expect("bounded asset catalog");
    assert_eq!(listed["total"], 1);
    assert_eq!(listed["limit"], 128);
    assert_eq!(listed["items"][0]["identity"], "picture:30001");
    assert_eq!(listed["items"][0]["previewCommand"], "picture.preview");
    assert!(listed.get("project").is_none());
    assert!(listed.get("snapshot").is_none());

    let opened = project_asset_open(&session, &json!({"identity": "picture:30001", "limit": 1}))
        .expect("single asset document");
    assert_eq!(opened["asset"]["label"], "Storm Gate");
    assert_eq!(opened["removable"], listed["items"][0]["removable"]);
    assert_eq!(opened["removalReason"], "");
    assert!(opened.get("project").is_none());
    assert!(opened.get("snapshot").is_none());
}

#[test]
fn new_asset_selection_seeks_one_bounded_page_without_filtering_neighbors() {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("asset-seek".into()));
    snapshot.assets = (1..=80)
        .map(|id| asset(&format!("text:{id}"), "Page", "text-resource", id))
        .collect();
    let session = EditorSession::new(snapshot);
    let result =
        project_asset_list(&session, &json!({"seekIdentity":"text:62", "limit":25})).unwrap();
    assert_eq!(result["total"], 80);
    assert_eq!(result["offset"], 50);
    assert_eq!(result["items"].as_array().unwrap().len(), 25);
    assert_eq!(result["items"][11]["identity"], "text:62");
    assert_eq!(result["truncated"], true);
    let filtered = project_asset_list(
        &session,
        &json!({"seekIdentity":"text:62", "kind":"icon", "limit":25}),
    )
    .unwrap();
    assert_eq!(filtered["total"], 0);
    assert_eq!(filtered["offset"], 0);
    assert!(result.get("snapshot").is_none());
}

fn item_and_map_artwork() -> (ProjectSnapshot, AssetDescriptor) {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("asset-uses".into()));
    snapshot.scenario_item_rules = providence_core::codecs::decode_scenario_item_rules(
        &vec![0; 20_000],
        None,
        BlobId("synthetic-items".into()),
        None,
    )
    .unwrap()
    .rules;
    snapshot.scenario_item_rules[0].definition.icon_id = -189;
    snapshot.scenario_item_rules[0].definition.name = "Trailfinder Ring".into();
    let mut tiles = vec![0; providence_core::model::CLASSIC_MAP_SIZE.pow(2)];
    tiles[0] = -189;
    snapshot.world.maps.push(providence_core::model::MapLevel {
        identity: StableId("land:0".into()),
        level_type: providence_core::model::LevelType::Land,
        native_index: 0,
        name: "Thornwatch Coast".into(),
        tiles,
        runtime: None,
    });
    let mut picture = asset("owned-picture", "Trail marker", "icon", -189);
    picture.classic_resource.as_mut().unwrap().resource_type = "cicn".into();
    snapshot.assets.push(picture.clone());
    (snapshot, picture)
}

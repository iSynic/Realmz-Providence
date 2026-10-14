use super::*;
use providence_core::model::{CLASSIC_MAP_SIZE, LevelType, MapLevel, ProjectSnapshot};
use providence_core::references::{ResolutionState, TargetKind};

fn special_fixture() -> (ProjectSnapshot, ApplicationMediaCatalog) {
    let (mut snapshot, mut catalog) = fixture();
    snapshot.project_id = StableId("discovery-special-land".into());
    let mut tiles = vec![0; CLASSIC_MAP_SIZE * CLASSIC_MAP_SIZE];
    tiles[0] = -96;
    tiles[1] = -1096;
    snapshot.world.maps.push(MapLevel {
        identity: StableId("land:0".into()),
        level_type: LevelType::Land,
        native_index: 0,
        name: "Special Land map".into(),
        tiles,
        runtime: None,
    });
    catalog.assets.push(ApplicationMediaAsset {
        source: StableId("stock".into()),
        source_priority: 0,
        descriptor: asset("stock-overlay-96", "special-land-tile", "cicn", -96),
    });
    (snapshot, catalog)
}

fn flow(session: &mut EditorSession, catalog: &ApplicationMediaCatalog) -> Value {
    let before = session.persisted_state();
    let result = read(
        session,
        catalog,
        "discovery.flow",
        json!({"root":{"identity":"land:0", "scope":"scenario"}}),
    );
    assert_eq!(session.persisted_state(), before);
    result["graph"].clone()
}

fn tile_nodes(graph: &Value) -> Vec<&Value> {
    graph["nodes"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|node| node["selection"]["identity"] != "land:0")
        .collect()
}

#[test]
fn special_land_flow_resolves_stock_and_signed_map_words_without_mutation() {
    let (snapshot, catalog) = special_fixture();
    let mut session = EditorSession::new(snapshot);
    let graph = flow(&mut session, &catalog);
    let nodes = tile_nodes(&graph);
    assert_eq!(nodes.len(), 1);
    assert_eq!(nodes[0]["selection"]["identity"], "stock-overlay-96");
    assert_eq!(nodes[0]["selection"]["scope"], "stock");
    assert_eq!(nodes[0]["resolution"], "resolved");
    assert_eq!(nodes[0]["navigable"], true);
    assert_eq!(graph["edges"].as_array().unwrap().len(), 2);
    assert!(graph["edges"].as_array().unwrap().iter().all(|edge| {
        edge["reference"]["targetId"] == "-96"
            && edge["reference"]["targetIdentity"] == "stock-overlay-96"
    }));
    // The application-aware discovery view does not rewrite scenario diagnostics.
    assert!(session.references().iter().all(|reference| {
        reference.target_kind != TargetKind::SpecialLandTile
            || reference.resolution == ResolutionState::Missing
    }));
    assert!(session.snapshot().assets.is_empty());
}

#[test]
fn special_land_links_trace_and_preview_use_the_same_exact_stock_owner() {
    let (snapshot, catalog) = special_fixture();
    let mut session = EditorSession::new(snapshot);
    for method in ["discovery.links", "discovery.trace"] {
        let result = read(
            &mut session,
            &catalog,
            method,
            json!({"direction":"incoming", "kind":"special-land-tile", "id":"-96", "scope":"stock"}),
        );
        let rows = if method == "discovery.trace" {
            result["trace"]["items"].as_array().unwrap()
        } else {
            result["items"].as_array().unwrap()
        };
        assert_eq!(rows.len(), 2);
        for row in rows {
            let link = row.get("link").unwrap_or(row);
            assert_eq!(link["targetIdentity"], "stock-overlay-96");
            assert_eq!(link["targetScope"], "stock");
            assert_eq!(link["availabilityReason"], "");
        }
    }
    let preview = read(
        &mut session,
        &catalog,
        "discovery.preview",
        json!({"identity":"stock-overlay-96", "scope":"stock"}),
    );
    assert_eq!(preview["usedBy"], 2);
    assert_eq!(preview["record"]["nativeId"], "-96");
}

#[test]
fn special_land_flow_uses_arbitrary_scenario_identity_before_stock() {
    let (mut snapshot, catalog) = special_fixture();
    snapshot
        .assets
        .push(asset("authored-overlay", "special-land-tile", "cicn", -96));
    let graph = flow(&mut EditorSession::new(snapshot), &catalog);
    let nodes = tile_nodes(&graph);
    assert_eq!(nodes.len(), 1);
    assert_eq!(nodes[0]["selection"]["identity"], "authored-overlay");
    assert_eq!(nodes[0]["selection"]["scope"], "scenario");
    assert_eq!(nodes[0]["navigable"], true);
    assert!(!graph.to_string().contains("stock-overlay-96"));
}

#[test]
fn special_land_flow_never_borrows_stock_for_invalid_scenario_ownership() {
    let (mut snapshot, catalog) = special_fixture();
    snapshot
        .assets
        .push(asset("wrong-role", "icon", "cicn", -96));
    let wrong_kind = flow(&mut EditorSession::new(snapshot.clone()), &catalog);
    assert!(
        tile_nodes(&wrong_kind)
            .iter()
            .all(|node| { node["resolution"] == "missing" && node["navigable"] == false })
    );
    assert!(!wrong_kind.to_string().contains("stock-overlay-96"));
    snapshot.assets[0].kind = "special-land-tile".into();
    snapshot
        .assets
        .push(asset("second-owner", "special-land-tile", "cicn", -96));
    let ambiguous = flow(&mut EditorSession::new(snapshot), &catalog);
    assert!(
        tile_nodes(&ambiguous)
            .iter()
            .all(|node| { node["resolution"] == "ambiguous" && node["navigable"] == false })
    );
    assert!(!ambiguous.to_string().contains("stock-overlay-96"));
}

#[test]
fn special_land_flow_requires_unique_correctly_typed_stock_media() {
    let (snapshot, mut catalog) = special_fixture();
    let overlay = catalog.assets.pop().unwrap();
    let missing = flow(&mut EditorSession::new(snapshot.clone()), &catalog);
    assert!(
        tile_nodes(&missing)
            .iter()
            .all(|node| { node["resolution"] == "missing" && node["navigable"] == false })
    );
    catalog.assets.extend([overlay.clone(), overlay.clone()]);
    let ambiguous = flow(&mut EditorSession::new(snapshot.clone()), &catalog);
    assert!(
        tile_nodes(&ambiguous)
            .iter()
            .all(|node| { node["resolution"] == "ambiguous" && node["navigable"] == false })
    );
    catalog.assets.pop();
    catalog.sources.push(ApplicationMediaSource {
        identity: StableId("higher-priority".into()),
        native_name: "controlled shadow".into(),
        priority: 1,
        blob: BlobId(format!("sha256:{}", "0".repeat(64))),
        byte_length: 0,
    });
    let mut wrong_kind = overlay;
    wrong_kind.source = StableId("higher-priority".into());
    wrong_kind.source_priority = 1;
    wrong_kind.descriptor.identity = StableId("wrong-stock-role".into());
    wrong_kind.descriptor.kind = "icon".into();
    catalog.assets.push(wrong_kind);
    let wrong_kind = flow(&mut EditorSession::new(snapshot), &catalog);
    assert!(tile_nodes(&wrong_kind).iter().all(|node| {
        node["navigable"] == false
            && node["availabilityReason"]
                .as_str()
                .unwrap()
                .contains("wrong content kind")
    }));
}

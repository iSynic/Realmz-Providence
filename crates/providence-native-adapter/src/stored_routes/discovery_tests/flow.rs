use super::*;

fn graph(
    snapshot: providence_core::model::ProjectSnapshot,
    catalog: &ApplicationMediaCatalog,
) -> Value {
    let mut session = EditorSession::new(snapshot);
    let before = session.persisted_state();
    let result = read(
        &mut session,
        catalog,
        "discovery.flow",
        json!({"root":{"identity":"extra-action-point:1"}}),
    );
    assert_eq!(before, session.persisted_state());
    result["graph"].clone()
}

#[test]
fn discovery_flow_uses_exact_stock_identity_then_scenario_override() {
    let (mut snapshot, catalog) = fixture();
    let stock = graph(snapshot.clone(), &catalog);
    assert!(
        stock["nodes"]
            .as_array()
            .unwrap()
            .iter()
            .any(|n| n["selection"]["identity"] == "stock-sound-36"
                && n["selection"]["scope"] == "stock")
    );
    snapshot
        .assets
        .push(asset("scenario-sound", "sound", "snd ", 36));
    let overridden = graph(snapshot.clone(), &catalog);
    assert!(
        overridden["nodes"]
            .as_array()
            .unwrap()
            .iter()
            .any(|n| n["selection"]["identity"] == "scenario-sound"
                && n["selection"]["scope"] == "scenario")
    );
    assert!(!overridden.to_string().contains("stock-sound-36"));
    snapshot
        .assets
        .push(asset("duplicate-sound", "sound", "snd ", 36));
    let ambiguous = graph(snapshot, &catalog);
    assert!(
        ambiguous["nodes"]
            .as_array()
            .unwrap()
            .iter()
            .any(|n| n["resolution"] == "ambiguous" && n["navigable"] == false)
    );
    assert!(!ambiguous.to_string().contains("stock-sound-36"));
    assert!(!ambiguous.to_string().contains("sha256:"));
}

#[test]
fn discovery_flow_missing_or_ambiguous_stock_media_cannot_be_opened() {
    let (snapshot, mut catalog) = fixture();
    let duplicate = catalog.assets[0].clone();
    catalog.assets.push(duplicate);
    let result = graph(snapshot.clone(), &catalog);
    assert!(
        result["nodes"]
            .as_array()
            .unwrap()
            .iter()
            .any(|n| n["resolution"] == "ambiguous" && n["navigable"] == false)
    );
    catalog.assets.clear();
    let result = graph(snapshot, &catalog);
    assert!(
        result["nodes"]
            .as_array()
            .unwrap()
            .iter()
            .any(|n| n["resolution"] == "missing" && n["navigable"] == false)
    );
}

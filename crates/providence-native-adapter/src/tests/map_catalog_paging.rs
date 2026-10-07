use crate::dispatch_result;
use providence_core::model::{LevelType, ProjectSnapshot, StableId};
use providence_core::session::EditorSession;
use serde_json::json;

#[test]
fn navigation_defers_diagnostics_without_claiming_zero_problems() {
    let mut seed = EditorSession::new(ProjectSnapshot::new_authored(StableId("map-read".into())));
    dispatch_result(
        &mut seed,
        "map.create",
        json!({"expectedRevision":0,"levelType":"land"}),
    )
    .unwrap();
    let snapshot = seed.snapshot().clone();
    let mut session = EditorSession::new(snapshot.clone());
    let page = dispatch_result(
        &mut session,
        "map.catalog",
        json!({"includeDiagnostics":false,"includeReferences":false}),
    )
    .unwrap();
    let opened = dispatch_result(
        &mut session,
        "map.open",
        json!({"identity":"land:0","includeDiagnostics":false,"includeReferences":false}),
    )
    .unwrap();
    assert!(session.cached_diagnostics().is_none());
    assert!(session.cached_references().is_none());
    assert_eq!(page["items"][0]["diagnosticsChecked"], false);
    assert_eq!(page["items"][0]["referencesChecked"], false);
    assert!(page["items"][0]["usedBy"].is_null());
    assert!(page["items"][0]["problems"].is_null());
    assert!(opened["diagnosticCount"].is_null());
    assert_eq!(
        opened["map"],
        serde_json::to_value(&snapshot.world.maps[0]).unwrap()
    );
    let checked = dispatch_result(&mut session, "map.catalog", json!({})).unwrap();
    let reused = dispatch_result(
        &mut session,
        "map.catalog",
        json!({"includeDiagnostics":false,"includeReferences":false}),
    )
    .unwrap();
    assert_eq!(reused, checked);
    let checked_open =
        dispatch_result(&mut session, "map.open", json!({"identity":"land:0"})).unwrap();
    let reused_open = dispatch_result(
        &mut session,
        "map.open",
        json!({"identity":"land:0","includeDiagnostics":false,"includeReferences":false}),
    )
    .unwrap();
    assert_eq!(reused_open, checked_open);
    check_rejected_projection_flags(&mut session);
    assert_eq!(session.snapshot(), &snapshot);
}

fn check_rejected_projection_flags(session: &mut EditorSession) {
    for (method, params) in [
        ("map.catalog", json!({"includeDiagnostics":"no"})),
        (
            "map.open",
            json!({"identity":"land:0", "includeReferences":"no"}),
        ),
    ] {
        assert!(dispatch_result(session, method, params).is_err());
    }
}

#[test]
fn map_catalog_pages_cover_large_native_indexes_without_cell_payloads() {
    let mut seed = EditorSession::new(ProjectSnapshot::new_authored(StableId(
        "large-map-catalog".into(),
    )));
    dispatch_result(
        &mut seed,
        "map.create",
        json!({"expectedRevision":0,"levelType":"land"}),
    )
    .unwrap();
    let mut snapshot = seed.snapshot().clone();
    let template = snapshot.world.maps[0].clone();
    snapshot.world.maps = (0..257)
        .map(|index| {
            let mut map = template.clone();
            map.identity = StableId(format!("land:{index}"));
            map.native_index = index;
            map.name = format!("Land level {index}");
            map.level_type = LevelType::Land;
            map
        })
        .collect();
    let mut session = EditorSession::new(snapshot.clone());
    let mut identities = Vec::new();
    for offset in [0, 128, 256] {
        let page = dispatch_result(
            &mut session,
            "map.catalog",
            json!({"offset":offset,"limit":128,"levelType":"all"}),
        )
        .unwrap();
        assert_eq!(page["total"], 257);
        assert_eq!(page["offset"], offset);
        assert_eq!(page["revision"], 0);
        let rows = page["items"].as_array().unwrap();
        assert!(rows.len() <= 128);
        assert!(rows.iter().all(|row| row.get("tiles").is_none()));
        identities.extend(
            rows.iter()
                .map(|row| row["identity"].as_str().unwrap().to_owned()),
        );
    }
    assert_eq!(
        identities,
        (0..257)
            .map(|index| format!("land:{index}"))
            .collect::<Vec<_>>()
    );
    assert_eq!(session.snapshot(), &snapshot);
}

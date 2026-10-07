use super::*;
use crate::dispatch_result;

#[test]
fn map_open_contains_context_exact_read_only_view_hints_without_project_transport() {
    let mut snapshot = demo_snapshot();
    snapshot.world.maps[0].runtime = Some(land_renderer_runtime(0, 156));
    snapshot.world.maps[0].tiles[..3].copy_from_slice(&[3003, 1169, 180]);
    let before = snapshot.clone();
    let mut session = EditorSession::new(snapshot);
    let result = dispatch_result(&mut session, "map.open", json!({"identity":"land:0"}))
        .expect("open the current map");
    let overlays = &result["viewOverlays"];
    assert_eq!(overlays["secretCells"], json!([{"x":0,"y":0}]));
    assert_eq!(overlays["hiddenPathCells"], json!([{"x":1,"y":0}]));
    assert_eq!(overlays["combatClearingCells"], json!([{"x":2,"y":0}]));
    assert!(overlays["playerMaps"].is_array());
    assert_eq!(session.revision(), Revision(0));
    assert_eq!(session.snapshot(), &before);
    for unbounded in ["snapshot", "world", "assets", "messages"] {
        assert!(result.get(unbounded).is_none());
    }
    assert!(dispatch_result(&mut session, "map.open", json!({"identity":"land:999"})).is_err());
}

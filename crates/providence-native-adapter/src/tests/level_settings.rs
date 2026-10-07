use crate::dispatch_result_with_store;
use providence_core::{
    model::{ProjectSnapshot, StableId},
    session::EditorSession,
};
use serde_json::json;

fn dispatch_result(
    session: &mut EditorSession,
    method: &str,
    params: serde_json::Value,
) -> Result<serde_json::Value, String> {
    dispatch_result_with_store(session, None, method, params)
}

fn fixture() -> EditorSession {
    let mut session = EditorSession::new(ProjectSnapshot::new_authored(StableId(
        "settings-adapter".into(),
    )));
    dispatch_result(
        &mut session,
        "map.create",
        json!({"expectedRevision":0,"levelType":"land"}),
    )
    .unwrap();
    session
}

#[test]
fn named_level_settings_use_bounded_preview_and_one_delta_and_preserve_missing_current_artwork() {
    let mut session = fixture();
    let before = session.snapshot().clone();
    let opened = dispatch_result(
        &mut session,
        "level-settings.open",
        json!({"identity":"land:0"}),
    )
    .unwrap();
    assert_eq!(opened["revision"], 1);
    assert_eq!(opened["landlooks"].as_array().unwrap().len(), 9);
    assert!(
        opened["landlooks"]
            .as_array()
            .unwrap()
            .iter()
            .all(|row| row["available"] == false && row["sharedBaseEditable"] == false)
    );
    let mut edit = opened["settings"].clone();
    edit["name"] = json!("North Bridge");
    edit["dark"] = json!(true);
    edit["usesLos"] = json!(true);
    let params = json!({"identity":"land:0","expectedRevision":1,"edit":edit});
    let preview = dispatch_result(&mut session, "level-settings.preview", params.clone()).unwrap();
    assert_eq!(
        preview["changes"],
        json!(["Level name", "Dark level", "Line of sight"])
    );
    assert_eq!(
        preview["affectedMaps"],
        json!([{"identity":"land:0","name":"North Bridge"}])
    );
    assert_eq!(session.snapshot(), &before);
    let applied = dispatch_result(&mut session, "level-settings.apply", params.clone()).unwrap();
    assert_eq!(applied["revision"], 2);
    assert_eq!(applied["settings"]["name"], "North Bridge");
    assert_eq!(applied["changedEntities"], json!(["land:0"]));
    assert!(applied.get("snapshot").is_none());
    let after = session.snapshot().clone();
    assert_eq!(after.world.maps[0].tiles, before.world.maps[0].tiles);
    assert_eq!(
        after.world.maps[0].runtime.as_ref().unwrap().source,
        before.world.maps[0].runtime.as_ref().unwrap().source
    );
    assert!(dispatch_result(&mut session, "level-settings.apply", params).is_err());
    dispatch_result(&mut session, "history.undo", json!({"expectedRevision":2})).unwrap();
    assert_eq!(session.snapshot(), &before);
    dispatch_result(&mut session, "history.redo", json!({"expectedRevision":3})).unwrap();
    assert_eq!(session.snapshot(), &after);
}

#[test]
fn unavailable_landlook_and_stock_shared_base_fail_before_any_named_field_is_written() {
    let mut session = fixture();
    let before = session.snapshot().clone();
    let mut edit = dispatch_result(
        &mut session,
        "level-settings.open",
        json!({"identity":"land:0"}),
    )
    .unwrap()["settings"]
        .clone();
    edit["name"] = json!("Do not partially write");
    edit["landlook"] = json!(9);
    let mut params = json!({"identity":"land:0","expectedRevision":1,"edit":edit});
    assert!(dispatch_result(&mut session, "level-settings.preview", params.clone()).is_err());
    assert!(dispatch_result(&mut session, "level-settings.apply", params.clone()).is_err());
    params["edit"]["landlook"] = json!(0);
    params["edit"]["sharedBaseTile"] = json!(20);
    assert!(dispatch_result(&mut session, "level-settings.apply", params.clone()).is_err());
    params["edit"]["sharedBaseTile"] = json!(null);
    params["edit"]["landlook"] = json!(0.0);
    assert!(dispatch_result(&mut session, "level-settings.apply", params).is_err());
    assert_eq!(session.snapshot(), &before);
    assert_eq!(session.revision().0, 1);
}

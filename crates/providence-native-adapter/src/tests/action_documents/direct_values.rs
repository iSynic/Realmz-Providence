use super::*;

#[test]
fn adapter_exposes_victory_points_as_a_nonnegative_scalar() {
    let mut session = EditorSession::new(demo_snapshot());
    let before = session.snapshot().clone();
    for value in [120, -7] {
        let description = dispatch_result(
            &mut session,
            "action-form.describe",
            json!({"query": {
                "actionIdentity": "realmz.action.11",
                "targetNativeId": value,
                "values": {},
                "context": {}
            }}),
        )
        .unwrap();
        let amount = &description["fields"][0];
        assert_eq!(amount["value"], value);
        assert_eq!(amount["minimum"], 0);
        assert_eq!(amount["maximum"], i16::MAX);
        assert_eq!(amount["units"], "victory points");
        assert!(amount["targetKind"].is_null());
        assert!(amount["preview"].is_null());
    }
    assert_eq!(session.snapshot(), &before);
}

#[test]
fn adapter_exposes_temple_inflation_as_the_documented_scalar_range() {
    let mut session = EditorSession::new(demo_snapshot());
    let before = session.snapshot().clone();
    for value in [200, -7] {
        let description = dispatch_result(
            &mut session,
            "action-form.describe",
            json!({"query": {
                "actionIdentity": "realmz.action.32",
                "targetNativeId": value,
                "values": {},
                "context": {}
            }}),
        )
        .unwrap();
        let inflation = &description["fields"][0];
        assert_eq!(inflation["value"], value);
        assert_eq!(inflation["minimum"], 0);
        assert_eq!(inflation["maximum"], 32_000);
        assert_eq!(inflation["units"], "percent of normal price");
        assert!(inflation["targetKind"].is_null());
        assert!(inflation["preview"].is_null());
    }
    assert_eq!(session.snapshot(), &before);
}

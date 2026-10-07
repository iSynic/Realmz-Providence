use super::*;

#[test]
fn random_rectangle_absolute_edges_use_map_bounds_but_offsets_remain_signed() {
    let mut session = EditorSession::new(demo_snapshot());
    let before = session.snapshot().clone();
    for (mode, expected) in [
        (0, (0, 89)),
        (1, (i16::MIN, i16::MAX)),
        (2, (i16::MIN, i16::MAX)),
    ] {
        let description = dispatch_result(
            &mut session,
            "action-form.describe",
            json!({"query": {
                "actionIdentity": "realmz.action.92",
                "targetNativeId": 92,
                "values": {"level": 0, "rect": 0, "isDungeon": 0,
                    "percentDelta": 0, "shapeMode": mode},
                "secondaryValues": {"shapeX1": -7, "shapeY1": 8,
                    "shapeX2": 9, "shapeY2": 100, "shapeFlags": 44},
                "context": {}
            }}),
        )
        .unwrap();
        let fields = description["fields"].as_array().unwrap();
        for key in ["shapeX1", "shapeY1", "shapeX2", "shapeY2"] {
            let field = fields.iter().find(|field| field["key"] == key).unwrap();
            assert_eq!(field["minimum"], expected.0, "{key}, mode {mode}");
            assert_eq!(field["maximum"], expected.1, "{key}, mode {mode}");
        }
        assert_eq!(
            fields
                .iter()
                .find(|field| field["key"] == "shapeX1")
                .unwrap()["value"],
            -7
        );
        assert_eq!(
            fields
                .iter()
                .find(|field| field["key"] == "shapeY2")
                .unwrap()["value"],
            100
        );
    }
    assert_eq!(session.snapshot(), &before);
}

#[test]
fn random_rectangle_primary_and_companion_units_are_not_conflated() {
    let mut session = EditorSession::new(demo_snapshot());
    let before = session.snapshot().clone();
    let description = dispatch_result(
        &mut session,
        "action-form.describe",
        json!({"query": {
            "actionIdentity": "realmz.action.92", "targetNativeId": 92,
            "values": {"level": 3, "rect": 4, "isDungeon": 0,
                "percentDelta": 125, "shapeMode": -1},
            "secondaryValues": {"shapeX1": 0, "shapeY1": 0,
                "shapeX2": 0, "shapeY2": 0, "shapeFlags": 0},
            "context": {}
        }}),
    )
    .unwrap();
    let fields = description["fields"].as_array().unwrap();
    let named = |key: &str| fields.iter().find(|field| field["key"] == key).unwrap();
    assert!(named("level")["units"].is_null());
    assert!(named("rect")["units"].is_null());
    assert_eq!(named("percentDelta")["units"], "chance points per 10,000");
    assert_eq!(named("shapeX1")["units"], "map cells");
    assert!(named("shapeFlags")["units"].is_null());
    assert_eq!(session.snapshot(), &before);
}

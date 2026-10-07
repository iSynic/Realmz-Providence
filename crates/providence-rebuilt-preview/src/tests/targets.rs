use super::*;
use crate::targets::target_identity;

#[test]
fn additive_targets_are_strict_and_preserve_signed_resource_identity() {
    let temporary = tempdir().unwrap();
    let package = temporary.path().join("scenario.realmz2");
    fs::write(&package, b"package bytes").unwrap();

    map_locations_preserve_coordinates(temporary.path(), &package);
    map_locations_require_matching_canonical_ids(temporary.path(), &package);
    scrolling_text_preserves_signed_identity(temporary.path(), &package);
}

fn map_locations_preserve_coordinates(directory: &Path, package: &Path) {
    let map_request_path = directory.join("map-request.json");
    let map_result_path = directory.join("map-result.json");
    let map_request = prepare_request(
        package,
        &map_request_path,
        &map_result_path,
        PreviewTarget::MapLocation {
            id: "dungeon:2".into(),
            map_id: "dungeon:2".into(),
            x: 17,
            y: 41,
        },
        23,
    )
    .unwrap();
    assert_eq!(read_request(&map_request_path).unwrap(), map_request);

    let unbounded_map_request_path = directory.join("unbounded-map-request.json");
    let unbounded_map_result_path = directory.join("unbounded-map-result.json");
    prepare_request(
        package,
        &unbounded_map_request_path,
        &unbounded_map_result_path,
        PreviewTarget::MapLocation {
            id: "land:0".into(),
            map_id: "land:0".into(),
            x: 120,
            y: 95,
        },
        23,
    )
    .expect("bridge leaves actual topology bounds to Rebuilt");
}

fn map_locations_require_matching_canonical_ids(directory: &Path, package: &Path) {
    let mismatch_request_path = directory.join("mismatch-request.json");
    let mismatch_result_path = directory.join("mismatch-result.json");
    assert!(
        prepare_request(
            package,
            &mismatch_request_path,
            &mismatch_result_path,
            PreviewTarget::MapLocation {
                id: "land:0".into(),
                map_id: "land:1".into(),
                x: 0,
                y: 0,
            },
            23,
        )
        .unwrap_err()
        .contains("equal canonical")
    );

    let noncanonical_request_path = directory.join("noncanonical-request.json");
    let noncanonical_result_path = directory.join("noncanonical-result.json");
    assert!(
        prepare_request(
            package,
            &noncanonical_request_path,
            &noncanonical_result_path,
            PreviewTarget::MapLocation {
                id: "land:00".into(),
                map_id: "land:00".into(),
                x: 0,
                y: 0,
            },
            23,
        )
        .unwrap_err()
        .contains("equal canonical")
    );
}

fn scrolling_text_preserves_signed_identity(directory: &Path, package: &Path) {
    let text_request_path = directory.join("text-request.json");
    let text_result_path = directory.join("text-result.json");
    let text_request = prepare_request(
        package,
        &text_request_path,
        &text_result_path,
        PreviewTarget::ScrollingText { id: -201 },
        23,
    )
    .unwrap();
    assert_eq!(read_request(&text_request_path).unwrap(), text_request);
    fs::write(&text_result_path, format!(r#"{{"kind":"realmz2.preview-result","formatVersion":1,"status":"ready","campaignId":"fixture","packageHash":"{}","targetKind":"scrolling-text","targetId":-201,"rngSeed":23,"revision":3,"pendingInteractionKind":"acknowledge"}}"#, "a".repeat(64))).unwrap();
    assert_eq!(
        read_result_for_request(&text_result_path, &text_request)
            .unwrap()
            .status(),
        "ready"
    );
}

#[test]
fn record_targets_are_exact_nonnegative_native_ids() {
    let temporary = tempdir().unwrap();
    let package = temporary.path().join("scenario.realmz2");
    fs::write(&package, b"package bytes").unwrap();
    battle_target_round_trips_with_strict_fields(temporary.path(), &package);
    ordinary_record_targets_require_unsigned_native_ids();
    thief_targets_require_native_encounter_context();
}

fn battle_target_round_trips_with_strict_fields(directory: &Path, package: &Path) {
    let request_path = directory.join("battle-request.json");
    let result_path = directory.join("battle-result.json");
    let request = prepare_request(
        package,
        &request_path,
        &result_path,
        PreviewTarget::Battle { id: 2 },
        31,
    )
    .unwrap();
    assert_eq!(read_request(&request_path).unwrap(), request);
    fs::write(&result_path, format!(r#"{{"kind":"realmz2.preview-result","formatVersion":1,"status":"ready","campaignId":"cob","packageHash":"{}","targetKind":"battle","targetId":2,"rngSeed":31,"revision":3,"pendingInteractionKind":"combat_action"}}"#, request.package_sha256)).unwrap();
    assert_eq!(
        read_result_for_request(&result_path, &request)
            .unwrap()
            .status(),
        "ready"
    );
    assert!(serde_json::from_str::<PreviewTarget>(r#"{"kind":"battle","id":-1}"#).is_err());
    assert!(serde_json::from_str::<PreviewTarget>(r#"{"kind":"battle","id":"2"}"#).is_err());
    assert!(
        serde_json::from_str::<PreviewTarget>(r#"{"kind":"battle","id":2,"extra":true}"#).is_err()
    );
}

fn ordinary_record_targets_require_unsigned_native_ids() {
    for kind in [
        "complex-encounter",
        "extra-action-point-program",
        "treasure",
        "shop",
    ] {
        let decoded: PreviewTarget =
            serde_json::from_str(&format!(r#"{{"kind":"{kind}","id":1}}"#)).unwrap();
        assert_eq!(target_identity(&decoded), (kind, Value::from(1_u32)));
        assert!(
            serde_json::from_str::<PreviewTarget>(&format!(r#"{{"kind":"{kind}","id":-1}}"#))
                .is_err()
        );
        assert!(
            serde_json::from_str::<PreviewTarget>(&format!(r#"{{"kind":"{kind}","id":"1"}}"#))
                .is_err()
        );
        assert!(
            serde_json::from_str::<PreviewTarget>(&format!(
                r#"{{"kind":"{kind}","id":1,"extra":true}}"#
            ))
            .is_err()
        );
    }
    let maximum: PreviewTarget =
        serde_json::from_str(r#"{"kind":"extra-action-point-program","id":4294967295}"#).unwrap();
    assert_eq!(
        target_identity(&maximum),
        ("extra-action-point-program", Value::from(u32::MAX))
    );
    assert!(
        serde_json::from_str::<PreviewTarget>(
            r#"{"kind":"extra-action-point-program","id":4294967296}"#
        )
        .is_err()
    );
}

fn thief_targets_require_native_encounter_context() {
    let thief: PreviewTarget =
        serde_json::from_str(r#"{"kind":"thief-encounter","id":1,"complexEncounterId":3}"#)
            .unwrap();
    assert_eq!(
        target_identity(&thief),
        ("thief-encounter", Value::from(1_u32))
    );
    for invalid in [
        r#"{"kind":"thief-encounter","id":-1,"complexEncounterId":3}"#,
        r#"{"kind":"thief-encounter","id":1,"complexEncounterId":-1}"#,
        r#"{"kind":"thief-encounter","id":"1","complexEncounterId":3}"#,
        r#"{"kind":"thief-encounter","id":1,"complexEncounterId":"3"}"#,
        r#"{"kind":"thief-encounter","id":1}"#,
        r#"{"kind":"thief-encounter","id":1,"complexEncounterId":3,"extra":true}"#,
    ] {
        assert!(serde_json::from_str::<PreviewTarget>(invalid).is_err());
    }
    assert!(serde_json::from_str::<PreviewTarget>(r#"{"kind":"unknown","id":2}"#).is_err());
}

use super::*;

#[test]
fn result_parser_accepts_only_the_two_v1_envelopes() {
    let temporary = tempdir().unwrap();
    let ready_path = temporary.path().join("ready.json");
    fs::write(&ready_path, format!(r#"{{"kind":"realmz2.preview-result","formatVersion":1,"status":"ready","campaignId":"aogm","packageHash":"{}","targetKind":"action-point","targetId":"ap:0","rngSeed":17,"revision":3,"pendingInteractionKind":"acknowledge"}}"#, "a".repeat(64))).unwrap();
    assert_eq!(read_result(&ready_path).unwrap().status(), "ready");
    let failed_path = temporary.path().join("failed.json");
    fs::write(&failed_path, r#"{"kind":"realmz2.preview-result","formatVersion":1,"status":"failed","errorCode":"preview_package_missing","errorMessage":"missing","targetKind":"simple-encounter","targetId":0}"#).unwrap();
    assert_eq!(read_result(&failed_path).unwrap().status(), "failed");
    fs::write(&failed_path, r#"{"kind":"realmz2.preview-result","formatVersion":1,"status":"failed","errorCode":"x","errorMessage":"x","targetKind":"simple-encounter","targetId":0,"extra":true}"#).unwrap();
    assert!(
        read_result(&failed_path)
            .unwrap_err()
            .contains("unexpected or missing")
    );
    fs::write(&failed_path, r#"{"kind":"realmz2.preview-result","formatVersion":1,"status":"failed","errorCode":"x","errorMessage":"x","targetKind":"scrolling-text","targetId":-201}"#).unwrap();
    assert_eq!(read_result(&failed_path).unwrap().status(), "failed");
}

#[test]
fn result_identity_is_bound_to_the_strict_request() {
    let temporary = tempdir().unwrap();
    let package = temporary.path().join("scenario.realmz2");
    fs::write(&package, b"package bytes").unwrap();
    let request_path = temporary.path().join("request.json");
    let result_path = temporary.path().join("result.json");
    let request = prepare_request(
        &package,
        &request_path,
        &result_path,
        PreviewTarget::SimpleEncounter { id: 7 },
        17,
    )
    .unwrap();
    assert_eq!(read_request(&request_path).unwrap(), request);
    fs::write(&result_path, format!(r#"{{"kind":"realmz2.preview-result","formatVersion":1,"status":"ready","campaignId":"fixture","packageHash":"{}","targetKind":"simple-encounter","targetId":7,"rngSeed":17,"revision":3,"pendingInteractionKind":"encounter_choice"}}"#, "a".repeat(64))).unwrap();
    assert_eq!(
        read_result_for_request(&result_path, &request)
            .unwrap()
            .status(),
        "ready"
    );
    fs::write(&result_path, format!(r#"{{"kind":"realmz2.preview-result","formatVersion":1,"status":"ready","campaignId":"fixture","packageHash":"{}","targetKind":"simple-encounter","targetId":8,"rngSeed":17,"revision":3,"pendingInteractionKind":"encounter_choice"}}"#, "a".repeat(64))).unwrap();
    assert!(
        read_result_for_request(&result_path, &request)
            .unwrap_err()
            .contains("does not match")
    );
}

#[test]
fn native_record_result_identity_uses_the_selected_id() {
    let temporary = tempdir().unwrap();
    let package = temporary.path().join("scenario.realmz2");
    fs::write(&package, b"package bytes").unwrap();

    for (name, target, kind, selected_id) in [
        (
            "complex",
            PreviewTarget::ComplexEncounter { id: 3 },
            "complex-encounter",
            3_u32,
        ),
        (
            "thief",
            PreviewTarget::ThiefEncounter {
                id: 1,
                complex_encounter_id: 3,
            },
            "thief-encounter",
            1_u32,
        ),
        (
            "extra-action-point-program",
            PreviewTarget::ExtraActionPointProgram { id: 80 },
            "extra-action-point-program",
            80_u32,
        ),
    ] {
        let request_path = temporary.path().join(format!("{name}-request.json"));
        let result_path = temporary.path().join(format!("{name}-result.json"));
        let request = prepare_request(&package, &request_path, &result_path, target, 17).unwrap();
        fs::write(&result_path, format!(r#"{{"kind":"realmz2.preview-result","formatVersion":1,"status":"ready","campaignId":"cob","packageHash":"{}","targetKind":"{kind}","targetId":{selected_id},"rngSeed":17,"revision":4,"pendingInteractionKind":"encounter_choice"}}"#, request.package_sha256)).unwrap();
        assert_eq!(
            read_result_for_request(&result_path, &request)
                .unwrap()
                .status(),
            "ready"
        );
        fs::write(&result_path, format!(r#"{{"kind":"realmz2.preview-result","formatVersion":1,"status":"ready","campaignId":"cob","packageHash":"{}","targetKind":"{kind}","targetId":{},"rngSeed":17,"revision":4,"pendingInteractionKind":"encounter_choice"}}"#, request.package_sha256, selected_id + 1)).unwrap();
        assert!(
            read_result_for_request(&result_path, &request)
                .unwrap_err()
                .contains("does not match")
        );
    }
}

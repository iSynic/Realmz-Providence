use super::*;
use crate::capabilities::{by_method, validate};

#[test]
fn repair_contracts_keep_family_and_context_fields_typed_and_closed() {
    let draft = json!({"project":"scenario","source":"extra-action-point:0","slot":0,"revision":0,
        "originalAction":{"slot":0,"rawOpcode":19,"targetNativeId":0},
        "contextFingerprint":"native-context","initialInput":{"firstMessage":"1","lastMessage":"3","retained":[0,0,0]},
        "input":{"firstMessage":"2","lastMessage":"3","retained":[0,0,0]},
        "scope":"only-this-action","modeChanged":false,"originalUseCount":2,"confirmedCallers":[]});
    let (schema, params) = arguments(
        "action-settings.commit-repair",
        json!({"operationId":"repair","draft":draft}),
    );
    assert!(validate(&schema, &params).is_ok());
    let mut mixed = params.clone();
    mixed["draft"]["input"]["mapKind"] = json!("land");
    assert!(validate(&schema, &mixed).is_err());
    let mut unowned = params.clone();
    unowned["draft"]["sourceBytes"] = json!([1, 2]);
    assert!(validate(&schema, &unowned).is_err());
    let mut overflow = params;
    overflow["draft"]["originalAction"]["targetNativeId"] = json!(32768);
    assert!(validate(&schema, &overflow).is_err());
}

#[test]
fn media_imports_accept_native_settings_without_exposing_descriptor_or_library_writes() {
    let (schema, params) = arguments(
        "media.import.prepare",
        json!({
            "kind":"combat-icon", "name":"Gatekeeper", "path":"/granted/icon.png",
            "resourceId":1, "settings":{"filter":"crisp", "dither":false}
        }),
    );
    assert!(validate(&schema, &params).is_ok());
    for (field, value) in [
        ("destination", json!("personal-library")),
        ("sourceBlob", json!("sha256:injected")),
        ("kind", json!("arbitrary-resource")),
        ("resourceId", json!(32768)),
        ("settings", json!({"preserveSource":false})),
        ("width", json!(2049)),
    ] {
        let mut rejected = params.clone();
        rejected[field] = value;
        assert!(validate(&schema, &rejected).is_err(), "{field}");
    }
    assert!(by_method("media.import.prepare").unwrap().stageable);
    assert!(by_method("media.remove.prepare").unwrap().stageable);
    assert!(!by_method("media.open").unwrap().stageable);
}

fn arguments(method: &str, extra: Value) -> (Value, Value) {
    let schema = by_method(method).unwrap().input_schema;
    let mut params =
        json!({"projectId":"scenario","sessionGeneration":"generation","expectedRevision":0});
    params
        .as_object_mut()
        .unwrap()
        .extend(extra.as_object().unwrap().clone());
    (schema, params)
}

#[test]
fn local_collection_writes_have_an_explicit_separate_scope_and_closed_changes() {
    let capability = by_method("paint-resources.apply").unwrap();
    assert!(capability.external_effect && !capability.stageable && !capability.mutation);
    assert_eq!(
        capability.authoring.history_scope,
        "local paint resources; outside project Undo/Redo"
    );
    let (schema, mut params) = arguments(
        "paint-resources.apply",
        json!({
            "resourceRevision":0,"operationId":"a".repeat(64),"change":{"operation":"delete","identity":"paint:local-0"}
        }),
    );
    assert!(validate(&schema, &params).is_ok());
    params["operationId"] = json!("short");
    assert!(validate(&schema, &params).is_err());
    params["operationId"] = json!("a".repeat(64));
    params["change"]["sourceBlob"] = json!("unowned");
    assert!(validate(&schema, &params).is_err());
}

#[test]
fn nested_script_forms_reject_unowned_fields_and_invalid_shared_confirmations() {
    let (schema, mut params) = arguments(
        "action-point.step.apply",
        json!({"operationId":"edit","edit":{
            "source":"ap:1","slot":0,"actionIdentity":"quest-branch","targetNativeId":1,
            "settings":{"values":{"quest":1},"scope":{"mode":"update-affected","confirmedCallers":[{"source":"ap:1","slot":0}]}}
        }}),
    );
    assert!(validate(&schema, &params).is_ok());
    params["edit"]["settings"]["scope"]["confirmedCallers"] = json!([]);
    assert!(validate(&schema, &params).is_err());
    params["edit"]["settings"]["scope"] = json!({"mode":"isolate"});
    params["edit"]["settings"]["values"]["quest"] = json!(32768);
    assert!(validate(&schema, &params).is_err());
    params["edit"]["settings"] = Value::Null;
    assert!(validate(&schema, &params).is_ok());
    params["edit"]["sourceBytes"] = json!([0, 1]);
    assert!(validate(&schema, &params).is_err());
}

#[test]
fn coordinates_flow_directions_and_activation_filters_are_bounded() {
    let (schema, mut params) = arguments(
        "map.region",
        json!({"identity":"land:0","x":0,"y":0,"width":32,"height":32}),
    );
    assert!(validate(&schema, &params).is_ok());
    params["width"] = json!(33);
    assert!(validate(&schema, &params).is_err());
    let (schema, mut params) = arguments(
        "action-point.list",
        json!({"mapIdentity":"land:0","activationFilters":{"chance":"nonpositive"}}),
    );
    assert!(validate(&schema, &params).is_ok());
    params["activationFilters"]["currentlyReachable"] = json!(true);
    assert!(validate(&schema, &params).is_err());
    let (schema, mut params) = arguments(
        "discovery.links",
        json!({"direction":"outgoing","identity":"message:0"}),
    );
    assert!(validate(&schema, &params).is_ok());
    params["direction"] = json!("incoming");
    assert!(validate(&schema, &params).is_err());
}

#[test]
fn native_record_numbers_are_distinct_from_stable_identities() {
    for (method, good, bad) in [
        (
            "message.open",
            json!({"nativeId":0}),
            json!({"identity":"message:0"}),
        ),
        (
            "item.open",
            json!({"identity":"classic.item.800"}),
            json!({"recordIndex":0}),
        ),
        (
            "spell.open",
            json!({"recordIndex":0}),
            json!({"nativeId":5101}),
        ),
    ] {
        let (schema, params) = arguments(method, good);
        assert!(validate(&schema, &params).is_ok(), "{method}");
        let (_, params) = arguments(method, bad);
        assert!(validate(&schema, &params).is_err(), "{method}");
    }
}

#[test]
fn player_map_forms_preserve_ten_slots_and_reject_source_metadata() {
    let (schema, mut params) = arguments(
        "player-map.apply-draft",
        json!({
            "operationId":"chart","playerMap":{
                "identity":"player-map:0","nativeId":0,
                "markers":vec![json!({"iconId":0,"x":0,"y":0});10],
                "startX":0,"startY":0,"level":0,"pictureId":0,"iconSize":0,
                "show":0,"isDungeon":false,
                "pictureRect":{"top":0,"left":0,"bottom":0,"right":0},
                "note":"Café"
            },"names":{"availableName":"Chart","unavailableName":"Unknown"}
        }),
    );
    assert!(validate(&schema, &params).is_ok());
    params["playerMap"]["markers"].as_array_mut().unwrap().pop();
    assert!(validate(&schema, &params).is_err());
    params["playerMap"]["markers"]
        .as_array_mut()
        .unwrap()
        .push(json!({"iconId":0,"x":0,"y":0}));
    params["playerMap"]["sourceBlob"] = json!("unowned");
    assert!(validate(&schema, &params).is_err());
}

#[test]
fn authoring_settings_cannot_replace_provenance_or_unrelated_map_regions() {
    for removed in [
        "map-runtime.set",
        "campaign.set",
        "scenario-application.set",
    ] {
        assert!(by_method(removed).is_none(), "{removed}");
    }
    let (schema, mut params) = arguments(
        "level-settings.apply",
        json!({
            "operationId":"settings","identity":"land:0",
            "edit":{"name":"North Bridge","dark":true,"usesLos":false,"landlook":0,"sharedBaseTile":null}
        }),
    );
    assert!(validate(&schema, &params).is_ok());
    for field in ["source", "sourceBlob", "randomRectangles", "tilesetId"] {
        params["edit"][field] = json!("unowned");
        assert!(validate(&schema, &params).is_err(), "{field}");
        params["edit"].as_object_mut().unwrap().remove(field);
    }
    params["edit"]["sharedBaseTile"] = json!(201);
    assert!(validate(&schema, &params).is_err());

    let (schema, mut params) = arguments(
        "scenario-contact.update",
        json!({
        "operationId":"contact","contact":{"title":"Café","version":"","date":"","author":"",
            "email":"","web":"","fee":"","description":"Preserve the spaces  "}
        }),
    );
    assert!(validate(&schema, &params).is_ok());
    params["contact"]["contactProvenance"] = json!("source-backed");
    assert!(validate(&schema, &params).is_err());
}

#[test]
fn explicit_finalization_options_are_typed_and_closed() {
    let (schema, params) = arguments(
        "export.begin",
        json!({"operationId":"finalize", "format":"rebuilt","path":"/output/scenario.realmz2",
        "packageFinalization":{"applicationPackage":"/input/app.realmz2","applicationCampaignId":"library",
            "applicationPackageHash":"a".repeat(64),"classicApplicationDataDirectory":"/input"}}),
    );
    assert!(validate(&schema, &params).is_ok());
    let mut bad = params.clone();
    bad["packageFinalization"]["applicationPackageHash"] = json!("wrong");
    assert!(validate(&schema, &bad).is_err());
    let mut bad = params;
    bad["packageFinalization"]["shell"] = json!("unreviewed");
    assert!(validate(&schema, &bad).is_err());
}

#[test]
fn artifact_replacement_is_exact_and_only_the_job_route_can_request_it() {
    let fields = json!({"operationId":"replace", "format":"classic", "path":"/output/scenario",
        "replacement":{"expectedSha256":"a".repeat(64)}});
    let (schema, mut params) = arguments("export.begin", fields);
    assert!(validate(&schema, &params).is_ok());
    params["replacement"]["force"] = json!(true);
    assert!(validate(&schema, &params).is_err());
    params["replacement"] = json!({"expectedSha256":"A".repeat(64)});
    assert!(validate(&schema, &params).is_err());
    let (schema, params) = arguments(
        "project.compile-rebuilt-package",
        json!({"operationId":"replace", "path":"/output/scenario.realmz2", "minimumEngineVersion":"0.1.0", "replacement":{"expectedSha256":"a".repeat(64)}}),
    );
    assert!(validate(&schema, &params).is_err());
}

#[test]
fn unknown_string_pattern_fails_closed_instead_of_ignoring_a_contract() {
    assert!(
        validate(
            &json!({"type":"string","pattern":"future-pattern"}),
            &json!("anything")
        )
        .is_err()
    );
}

#[test]
fn terrain_mapping_contract_exposes_owned_edits_and_no_accepted_fingerprint_patch() {
    let (schema, mut params) = arguments(
        "terrain-mapping.accept",
        json!({"operationId":"mapping","identity":"land:0","atlasBlob":"sha256:atlas",
        "edit":{"expectedMappingRevision":0,"layoutIdentity":"classic-plains","layoutRevision":1,
            "reviewedFamilies":["water"],"excludedTiles":[5],"tileLabels":{"5":{"name":"Lagoon","material":null}},"categoryLabels":{}}}),
    );
    assert!(validate(&schema, &params).is_ok());
    params["edit"]["acceptedTileFingerprints"] = json!(["invented"]);
    assert!(validate(&schema, &params).is_err());
    params["edit"]
        .as_object_mut()
        .unwrap()
        .remove("acceptedTileFingerprints");
    params["edit"]["excludedTiles"] = json!([201]);
    assert!(validate(&schema, &params).is_err());
}

#[test]
fn reference_media_contract_keeps_native_resource_and_record_boundaries() {
    let (schema, mut params) = arguments(
        "player-map.resources.list",
        json!({"query":{"field":"marker","currentValue":257,"limit":1}}),
    );
    assert!(validate(&schema, &params).is_ok());
    params["query"]["limit"] = json!(129);
    assert!(validate(&schema, &params).is_err());
    let (schema, params) = arguments(
        "scenario-item.use-stock-artwork",
        json!({"operationId":"artwork","identity":"stock-icon","recordIndex":200}),
    );
    assert!(validate(&schema, &params).is_err());
}

#[test]
fn terrain_generation_inputs_are_closed_bounded_and_reviewed_before_apply() {
    let intent = json!({"tilesetId":"classic.landlook.0","atlasBlob":"sha256:fixture","mappingRevision":0,
        "family":"water","density":"balanced","seed":47,"mask":[{"x":5,"y":5}],"locks":[],"connections":[]});
    let (schema, params) = arguments(
        "terrain-generation.preview",
        json!({"identity":"land:0","intent":intent}),
    );
    assert!(validate(&schema, &params).is_ok());
    let mut invalid = params.clone();
    invalid["intent"]["mask"][0]["x"] = json!(90);
    assert!(validate(&schema, &invalid).is_err());
    invalid = params.clone();
    invalid["intent"]["family"] = json!("inferred-custom-art");
    assert!(validate(&schema, &invalid).is_err());
    let (apply_schema, mut apply) = arguments(
        "terrain-generation.apply",
        json!({"operationId":"generation-apply","identity":"land:0","intent":intent,"reviewHash":"a".repeat(64)}),
    );
    assert!(validate(&apply_schema, &apply).is_ok());
    apply.as_object_mut().unwrap().remove("reviewHash");
    assert!(validate(&apply_schema, &apply).is_err());
    assert!(by_method("terrain-generation.apply").unwrap().stageable);
}

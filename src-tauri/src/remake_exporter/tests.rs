use super::*;
use crate::importer::create_project;
use crate::project::{
    Action, ActionCategory, Confidence, LevelType, ManagedAsset, ManagedAssetLibraryScope,
    MapCoordinate, ProjectOrigin, Provenance, RemakeExtensionRequirement, RemakeSemanticAction,
    ResourceAsset, ScenarioSupportFile, ScenarioTarget, SourceFile, SourceFileRole, TriggerRecord,
};
use crate::resource_fork::{
    encode_cicn_resource, encode_pict_resource, encode_snd_resource, write_resource_fork,
    PcmAudioPayload, ResourceForkEntry, RgbaImagePayload,
};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::fs;
use std::path::Path;
use tempfile::tempdir;

#[test]
fn exports_a_portable_deterministic_bundle_with_managed_payloads() {
    let workspace = tempdir().unwrap();
    let project_dir = workspace.path().join("starter.providence");
    let mut project = create_project("Starter".to_string(), &project_dir).unwrap();
    project.rule_names.source_file = project_dir
        .join("Data Files")
        .join("Custom Names.rsrc")
        .to_string_lossy()
        .to_string();
    let pict = test_pict([24, 80, 160, 255]);
    project.assets.push(managed_asset(
        "picture",
        ManagedAssetLibraryScope::Scenario,
        &pict,
    ));
    project.assets.push(managed_asset(
        "library",
        ManagedAssetLibraryScope::CustomLibrary,
        b"not-bundled",
    ));
    project.asset_catalog.pictures.push(ResourceAsset {
        id: "resource:PICT:306".to_string(),
        resource_type: "PICT".to_string(),
        resource_id: 306,
        name: Some("Proof picture".to_string()),
        source: project_dir
            .join("Scenario.rsrc")
            .to_string_lossy()
            .to_string(),
        preview_path: Some(
            project_dir
                .join("preview.png")
                .to_string_lossy()
                .to_string(),
        ),
    });

    let first = workspace.path().join("first");
    let second = workspace.path().join("second");
    let first_report = export_remake_campaign(&project, &project_dir, &first).unwrap();
    let second_report = export_remake_campaign(&project, &project_dir, &second).unwrap();

    assert_eq!(first_report.written_files, second_report.written_files);
    assert_eq!(first_report.counts.managed_assets, 1);
    assert_eq!(first_report.counts.packaged_asset_payloads, 2);
    for relative_path in &first_report.written_files {
        assert_eq!(
            fs::read(first.join(relative_path)).unwrap(),
            fs::read(second.join(relative_path)).unwrap(),
            "{relative_path} was not deterministic"
        );
    }

    let documents = read_json_documents(&first);
    for (path, value) in &documents {
        assert_no_forbidden_project_state(value, path);
    }
    let manifest = &documents["campaign.json"];
    assert_eq!(manifest["format"], REMAKE_CLASSIC_FORMAT);
    assert_eq!(manifest["formatVersion"], REMAKE_CLASSIC_FORMAT_VERSION);
    assert_eq!(manifest["producer"]["projectOrigin"], "authored");
    assert_eq!(manifest["files"]["runtime"], "runtime.json");
    let runtime = &documents["runtime.json"];
    assert_eq!(runtime["schemaVersion"], REMAKE_DOCUMENT_SCHEMA_VERSION);
    assert_eq!(runtime["recommendedGameplayProfile"], "core.classic");
    assert_eq!(runtime["targetSupport"]["realmzRemake"], true);
    assert_eq!(runtime["targetSupport"]["nativeRealmz"], true);
    assert!(runtime["targetSupport"]["remakeOnlyReasons"]
        .as_array()
        .unwrap()
        .is_empty());
    let assets = &documents["classic/assets.json"];
    assert_eq!(assets["managedAssets"].as_array().unwrap().len(), 1);
    let managed = &assets["managedAssets"][0];
    assert_eq!(managed["payloadEncoding"], "classic-resource-data");
    assert_eq!(managed["payloadBytes"], pict.len());
    assert_eq!(managed["payloadSha256"], hex::encode(Sha256::digest(&pict)));
    let payload_path = managed["payloadPath"].as_str().unwrap();
    assert_eq!(fs::read(first.join(payload_path)).unwrap(), pict);
    assert_eq!(
        assets["catalog"]["pictures"][0]["payloadPath"],
        managed["payloadPath"]
    );
    assert_eq!(
        assets["catalog"]["pictures"][0]["runtimeMedia"],
        managed["runtimeMedia"]
    );
    let runtime_media = &managed["runtimeMedia"];
    assert_eq!(runtime_media["mediaType"], "image/png");
    let runtime_path = runtime_media["path"].as_str().unwrap();
    assert!(runtime_path.starts_with("media/pictures/pict-306-"));
    assert!(runtime_path.ends_with(".png"));
    let png = fs::read(first.join(runtime_path)).unwrap();
    assert!(png.starts_with(b"\x89PNG\r\n\x1a\n"));
    assert_eq!(runtime_media["bytes"], png.len());
    assert_eq!(runtime_media["sha256"], hex::encode(Sha256::digest(&png)));
    assert_eq!(
        documents["classic/rules.json"]["ruleNames"]["sourceFile"],
        "Data Files/Custom Names.rsrc"
    );
}

#[test]
fn packages_every_imported_scenario_picture_from_the_preserved_resource_fork() {
    let workspace = tempdir().unwrap();
    let project_dir = workspace.path().join("trial-by-fire.providence");
    let mut project = create_project("Trial by Fire".to_string(), &project_dir).unwrap();
    project.source.origin = Some(ProjectOrigin::Imported);
    project.source.immutable = true;
    project.source.source_path = "Z:\\missing\\Trial by Fire".to_string();
    project.source.raw_sources_dir = "raw-sources".to_string();

    let picture_32128 = test_pict([114, 128, 199, 255]);
    let picture_32129 = test_pict([20, 90, 40, 255]);
    let resource_fork = write_resource_fork(&[
        ResourceForkEntry {
            resource_type: "PICT".to_string(),
            id: 32128,
            name: "Title".to_string(),
            attributes: 0,
            data: picture_32128.clone(),
        },
        ResourceForkEntry {
            resource_type: "PICT".to_string(),
            id: 32129,
            name: "Unreferenced scene".to_string(),
            attributes: 0,
            data: picture_32129.clone(),
        },
    ])
    .unwrap();
    let raw_sources_dir = project_dir.join("raw-sources");
    fs::create_dir_all(&raw_sources_dir).unwrap();
    fs::write(raw_sources_dir.join("Scenario.rsrc"), &resource_fork).unwrap();
    project.source.files.push(SourceFile {
        name: "Scenario.rsrc".to_string(),
        relative_path: "Scenario.rsrc".to_string(),
        bytes: resource_fork.len() as u64,
        sha256: hex::encode(Sha256::digest(&resource_fork)),
        role: SourceFileRole::ResourceFork,
        editable: false,
    });
    for (resource_id, name) in [(32128, "Title"), (32129, "Unreferenced scene")] {
        project.asset_catalog.pictures.push(ResourceAsset {
            id: format!("scenario-pict-{resource_id}"),
            resource_type: "PICT".to_string(),
            resource_id,
            name: Some(name.to_string()),
            source: "Scenario resource fork: Scenario.rsrc".to_string(),
            preview_path: None,
        });
    }
    project.asset_catalog.pictures.push(ResourceAsset {
        id: "picture:realmz:302".to_string(),
        resource_type: "PICT".to_string(),
        resource_id: 302,
        name: Some("Dungeon Top Down".to_string()),
        source: "Realmz reference resources".to_string(),
        preview_path: None,
    });

    let first = workspace.path().join("first");
    let second = workspace.path().join("second");
    let first_report = export_remake_campaign(&project, &project_dir, &first).unwrap();
    let second_report = export_remake_campaign(&project, &project_dir, &second).unwrap();

    assert_eq!(first_report.written_files, second_report.written_files);
    assert_eq!(first_report.counts.managed_assets, 0);
    assert_eq!(first_report.counts.packaged_asset_payloads, 4);
    let documents = read_json_documents(&first);
    let pictures = documents["classic/assets.json"]["catalog"]["pictures"]
        .as_array()
        .unwrap();
    assert_eq!(pictures.len(), 3);
    let reference = pictures
        .iter()
        .find(|picture| picture["resourceId"] == 302)
        .unwrap();
    assert!(reference.get("payloadPath").is_none());
    assert!(reference.get("runtimeMedia").is_none());
    for (picture, expected_bytes) in pictures
        .iter()
        .filter(|picture| picture.get("payloadPath").is_some())
        .zip([picture_32128, picture_32129])
    {
        let resource_id = picture["resourceId"].as_i64().unwrap();
        let payload_path = picture["payloadPath"].as_str().unwrap();
        assert!(payload_path.starts_with(&format!("assets/managed/pict-{resource_id}-")));
        assert!(payload_path.ends_with(".pict"));
        assert_eq!(fs::read(first.join(payload_path)).unwrap(), expected_bytes);

        let runtime_media = &picture["runtimeMedia"];
        assert_eq!(runtime_media["mediaType"], "image/png");
        let runtime_path = runtime_media["path"].as_str().unwrap();
        assert!(runtime_path.starts_with(&format!("media/pictures/pict-{resource_id}-")));
        assert!(runtime_path.ends_with(".png"));
        let png = fs::read(first.join(runtime_path)).unwrap();
        assert!(png.starts_with(b"\x89PNG\r\n\x1a\n"));
        assert_eq!(runtime_media["bytes"], png.len());
        assert_eq!(runtime_media["sha256"], hex::encode(Sha256::digest(&png)));
        assert_eq!(
            fs::read(first.join(runtime_path)).unwrap(),
            fs::read(second.join(runtime_path)).unwrap()
        );
    }
}

#[test]
fn rejects_scenario_pictures_that_cannot_produce_runtime_media() {
    let workspace = tempdir().unwrap();
    let project_dir = workspace.path().join("unsupported-picture.providence");
    let mut project = create_project("Unsupported picture".to_string(), &project_dir).unwrap();
    project.assets.push(managed_asset(
        "picture",
        ManagedAssetLibraryScope::Scenario,
        b"not-a-pict-resource",
    ));

    let error = export_remake_campaign(
        &project,
        &project_dir,
        workspace.path().join("unsupported-picture-out"),
    )
    .unwrap_err();
    assert!(error
        .to_string()
        .contains("cannot be decoded for Realmz Remake runtime media"));
}

#[test]
fn exports_decoded_sound_runtime_media_for_remake() {
    let workspace = tempdir().unwrap();
    let project_dir = workspace.path().join("sound.providence");
    let mut project = create_project("Sound".to_string(), &project_dir).unwrap();
    let snd = encode_snd_resource(&PcmAudioPayload {
        sample_rate: 11_025,
        channels: 1,
        duration_ms: Some(23),
        pcm8_base64: STANDARD.encode([0_u8, 64, 128, 192, 255]),
    })
    .unwrap();
    project.assets.push(managed_sound_asset(&snd));
    project.asset_catalog.sounds.push(ResourceAsset {
        id: "resource:snd:321".to_string(),
        resource_type: "snd ".to_string(),
        resource_id: 321,
        name: Some("Movement sound".to_string()),
        source: "Managed scenario sound".to_string(),
        preview_path: Some("data:audio/wav;base64,editor-only".to_string()),
    });

    let first = workspace.path().join("first");
    let second = workspace.path().join("second");
    let first_report = export_remake_campaign(&project, &project_dir, &first).unwrap();
    let second_report = export_remake_campaign(&project, &project_dir, &second).unwrap();

    assert_eq!(first_report.written_files, second_report.written_files);
    assert_eq!(first_report.counts.managed_assets, 1);
    assert_eq!(first_report.counts.packaged_asset_payloads, 2);
    let first_documents = read_json_documents(&first);
    let assets = &first_documents["classic/assets.json"];
    let managed = &assets["managedAssets"][0];
    let sound = &assets["catalog"]["sounds"][0];
    assert_eq!(managed["runtimeMedia"], sound["runtimeMedia"]);
    let runtime_media = &sound["runtimeMedia"];
    assert_eq!(runtime_media["mediaType"], "audio/wav");
    let runtime_path = runtime_media["path"].as_str().unwrap();
    assert!(runtime_path.starts_with("media/sounds/snd-321-"));
    assert!(runtime_path.ends_with(".wav"));
    let wav = fs::read(first.join(runtime_path)).unwrap();
    assert!(wav.starts_with(b"RIFF"));
    assert_eq!(runtime_media["bytes"], wav.len());
    assert_eq!(runtime_media["sha256"], hex::encode(Sha256::digest(&wav)));
    assert!(!serde_json::to_string(assets)
        .unwrap()
        .contains("editor-only"));
    assert_eq!(
        fs::read(first.join(runtime_path)).unwrap(),
        fs::read(second.join(runtime_path)).unwrap()
    );
}

#[test]
fn omits_canonical_music_with_an_explicit_bundle_limitation() {
    let workspace = tempdir().unwrap();
    let project_dir = workspace.path().join("music.providence");
    let mut project = create_project("Music".to_string(), &project_dir).unwrap();
    project.assets.push(managed_music_asset());

    let output = workspace.path().join("bundle");
    let report = export_remake_campaign(&project, &project_dir, &output).unwrap();
    assert_eq!(report.counts.managed_assets, 0);
    assert_eq!(report.counts.packaged_asset_payloads, 0);
    let warning = report
        .limitations
        .iter()
        .find(|value| value.contains("scenario music asset"))
        .unwrap();
    assert!(warning.contains("omitted"));
    assert!(warning.contains("scenario format v2"));
    assert!(!output.join("assets/managed").exists());
    let campaign: Value =
        serde_json::from_slice(&fs::read(output.join("campaign.json")).unwrap()).unwrap();
    assert!(campaign["limitations"]
        .as_array()
        .unwrap()
        .iter()
        .any(|value| value
            .as_str()
            .unwrap_or("")
            .contains("scenario music asset")));
}

#[test]
fn rejects_managed_sounds_that_cannot_produce_runtime_audio() {
    let workspace = tempdir().unwrap();
    let project_dir = workspace.path().join("unsupported-sound.providence");
    let mut project = create_project("Unsupported sound".to_string(), &project_dir).unwrap();
    project
        .assets
        .push(managed_sound_asset(b"not-a-snd-resource"));

    let error = export_remake_campaign(
        &project,
        &project_dir,
        workspace.path().join("unsupported-sound-out"),
    )
    .unwrap_err();
    assert!(error
        .to_string()
        .contains("cannot be decoded for Realmz Remake runtime media"));
}

#[test]
fn resolves_project_relative_payloads_but_rejects_annex_paths() {
    let workspace = tempdir().unwrap();
    let project_dir = workspace.path().join("relative.providence");
    let mut project = create_project("Relative".to_string(), &project_dir).unwrap();
    let payload_dir = project_dir.join("assets");
    fs::create_dir_all(&payload_dir).unwrap();
    let pict = test_pict([90, 60, 30, 255]);
    fs::write(payload_dir.join("picture.pict"), &pict).unwrap();
    let mut relative = managed_asset("relative", ManagedAssetLibraryScope::Scenario, &pict);
    relative.resource_path = "assets/picture.pict".to_string();
    project.assets.push(relative);
    export_remake_campaign(
        &project,
        &project_dir,
        workspace.path().join("relative-out"),
    )
    .unwrap();

    project.assets[0].resource_path = "raw-sources/Scenario.rsrc".to_string();
    let error = export_remake_campaign(&project, &project_dir, workspace.path().join("annex-out"))
        .unwrap_err();
    assert!(
        error.to_string().contains("compatibility annex")
            || error.to_string().contains("project-relative")
    );
}

#[test]
fn imported_projects_without_catalog_pictures_do_not_require_the_compatibility_annex() {
    let workspace = tempdir().unwrap();
    let project_dir = workspace.path().join("imported.providence");
    let mut project = create_project("Imported".to_string(), &project_dir).unwrap();
    project.source.origin = Some(ProjectOrigin::Imported);
    project.source.immutable = true;
    project.source.source_path = "Z:\\missing\\Imported Scenario".to_string();
    project.source.raw_sources_dir = "Z:\\missing\\raw-sources".to_string();
    project.scenario.support_file = Some(ScenarioSupportFile {
        source_file: "Scenario".to_string(),
        divinity_string_editor_slot: Some(2),
        divinity_string_sound_id: Some(143),
        authored: false,
        provenance: None,
    });

    let output = workspace.path().join("imported-out");
    export_remake_campaign(&project, &project_dir, &output).unwrap();
    let documents = read_json_documents(&output);

    assert_eq!(
        documents["campaign.json"]["producer"]["projectOrigin"],
        "imported"
    );
    for (path, value) in &documents {
        assert_no_forbidden_project_state(value, path);
    }
}

#[test]
fn exports_authoritative_ed3_callability_from_canonical_records() {
    let workspace = tempdir().unwrap();
    let project_dir = workspace.path().join("reachability.providence");
    let mut project = create_project("Reachability".to_string(), &project_dir).unwrap();
    project.source.origin = Some(ProjectOrigin::Imported);
    project.source.immutable = true;
    project.source.raw_sources_dir = "missing-compatibility-annex".to_string();
    let mut gosub_action = action(0, 39, 2);
    gosub_action.raw_code = -39;
    gosub_action.gosub = true;
    project.triggers = vec![
        trigger_record("Data DD", 0, vec![gosub_action]),
        trigger_record("Data ED3", 2, vec![action(0, 1, 100)]),
        trigger_record("Data ED3", 3, vec![action(0, 256, 0)]),
    ];
    assert!(project.semantic_schema.decoding.ed3_reachability.is_empty());

    let output = workspace.path().join("reachability-out");
    export_remake_campaign(&project, &project_dir, &output).unwrap();
    let documents = read_json_documents(&output);
    let triggers = documents["classic/scripts.json"]["triggers"]
        .as_array()
        .unwrap();
    let map_trigger = triggers
        .iter()
        .find(|trigger| trigger["source"] == "Data DD")
        .unwrap();
    let called_extra_action = triggers
        .iter()
        .find(|trigger| trigger["recordIndex"] == 2 && trigger["source"] == "Data ED3")
        .unwrap();
    let unreferenced_extra_action = triggers
        .iter()
        .find(|trigger| trigger["recordIndex"] == 3 && trigger["source"] == "Data ED3")
        .unwrap();

    assert!(map_trigger.get("callable").is_none());
    assert_eq!(map_trigger["actions"][0]["kind"], "classic");
    assert_eq!(map_trigger["actions"][0]["rawCode"], -39);
    assert_eq!(map_trigger["actions"][0]["code"], 39);
    assert_eq!(map_trigger["actions"][0]["gosub"], true);
    assert_eq!(called_extra_action["callable"], true);
    assert_eq!(unreferenced_extra_action["callable"], false);
    assert_eq!(unreferenced_extra_action["actions"][0]["rawCode"], 256);

    let reachability = documents["classic/evidence.json"]["semanticDecoding"]["ed3Reachability"]
        .as_array()
        .unwrap();
    assert!(reachability
        .iter()
        .any(|row| row["recordIndex"] == 2 && row["reachable"] == true));
    assert!(reachability
        .iter()
        .any(|row| row["recordIndex"] == 3 && row["reachable"] == false));
}

#[test]
fn exports_namespaced_semantic_actions_and_blocks_native_realmz_export() {
    let workspace = tempdir().unwrap();
    let project_dir = workspace.path().join("semantic.providence");
    let mut project = create_project("Semantic".to_string(), &project_dir).unwrap();
    let trigger = trigger_record("Data DD", 0, vec![action(0, 42, 17)]);
    let trigger_id = trigger.id.clone();
    project.triggers = vec![trigger];
    project
        .remake_runtime
        .required_extensions
        .push(RemakeExtensionRequirement {
            id: "scenario.runtime-fixture".to_string(),
            api_version: 1,
            configuration: json!({"marker": "providence"}),
        });
    project
        .remake_runtime
        .semantic_actions
        .push(RemakeSemanticAction {
            target_kind: "trigger".to_string(),
            record_id: trigger_id,
            slot: 0,
            operation: "scenario.runtime-fixture.mark".to_string(),
            parameters: json!({"marker": "providence"}),
        });

    let output = workspace.path().join("semantic-out");
    export_remake_campaign(&project, &project_dir, &output).unwrap();
    let documents = read_json_documents(&output);
    let action = &documents["classic/scripts.json"]["triggers"][0]["actions"][0];
    assert_eq!(action["kind"], "semantic");
    assert_eq!(action["operation"], "scenario.runtime-fixture.mark");
    assert_eq!(action["parameters"]["marker"], "providence");
    let runtime = &documents["runtime.json"];
    assert_eq!(
        runtime["requiredExtensions"][0]["id"],
        "scenario.runtime-fixture"
    );
    assert_eq!(runtime["requiredExtensions"][0]["apiVersion"], 1);
    assert_eq!(runtime["targetSupport"]["nativeRealmz"], false);
    assert_eq!(
        runtime["targetSupport"]["remakeOnlyReasons"][0],
        "semantic-actions"
    );

    let native_error = crate::exporter::export_project(
        &project_dir,
        &project,
        workspace.path().join("native-out"),
        ScenarioTarget::WindowsRealmzFolder,
    )
    .unwrap_err();
    let message = native_error.to_string();
    assert!(message.contains("Native Realmz export is unavailable"));
    assert!(message.contains("semantic-actions"));
    assert!(message.contains("Realmz Remake scenario"));

    project.remake_runtime.semantic_actions[0].operation =
        "scenario.missing.operation".to_string();
    let invalid_error = export_remake_campaign(
        &project,
        &project_dir,
        workspace.path().join("invalid-semantic-out"),
    )
    .unwrap_err();
    assert!(invalid_error
        .to_string()
        .contains("uses unavailable semantic operation"));
}

#[test]
fn preserves_negative_special_land_tile_ids_outside_the_v1_icon_catalog() {
    let workspace = tempdir().unwrap();
    let project_dir = workspace.path().join("special-tile.providence");
    let mut project = create_project("Special tile".to_string(), &project_dir).unwrap();
    let payload = encode_cicn_resource(&RgbaImagePayload {
        width: 32,
        height: 32,
        rgba_base64: STANDARD.encode(vec![255_u8; 32 * 32 * 4]),
    })
    .unwrap();
    project.assets.push(
        serde_json::from_value(json!({
            "id": "asset:special-land-tile:-100",
            "label": "Special land tile -100",
            "kind": "special-land-tile",
            "resourceType": "cicn",
            "resourceId": -100,
            "fileName": "special-land-tile--100.cicn",
            "originalPath": "",
            "previewPath": "",
            "resourcePath": format!(
                "data:application/octet-stream;base64,{}",
                STANDARD.encode(&payload)
            ),
            "mimeType": "application/octet-stream",
            "bytes": payload.len(),
            "sha256": hex::encode(Sha256::digest(payload)),
            "width": 32,
            "height": 32,
            "durationMs": null,
            "sampleRate": null,
            "channels": null,
            "exportState": "ready",
            "libraryScope": "scenario",
            "provenance": "canonical test data",
            "linkedEntity": "special-land-tile:-100",
            "conversion": null
        }))
        .unwrap(),
    );

    let output = workspace.path().join("special-tile-out");
    export_remake_campaign(&project, &project_dir, &output).unwrap();
    let assets: Value =
        serde_json::from_slice(&fs::read(output.join("classic/assets.json")).unwrap()).unwrap();

    assert!(assets["catalog"]["icons"].as_array().unwrap().is_empty());
    let special = &assets["catalog"]["specialLandTiles"][0];
    assert_eq!(special["resourceId"], -100);
    assert!(special["payloadPath"]
        .as_str()
        .is_some_and(|path| path.starts_with("assets/managed/")));
    assert_eq!(special["runtimeMedia"]["mediaType"], "image/png");
    assert!(output
        .join(special["runtimeMedia"]["path"].as_str().unwrap())
        .is_file());
}

#[test]
fn packages_referenced_shared_special_land_tiles_for_remake() {
    let workspace = tempdir().unwrap();
    let project_dir = workspace.path().join("shared-special-tile.providence");
    let mut project = create_project("Shared special tile".to_string(), &project_dir).unwrap();
    project.maps[0].tiles[0] = -1099;

    let output = workspace.path().join("shared-special-tile-out");
    let report = export_remake_campaign(&project, &project_dir, &output).unwrap();
    let assets: Value =
        serde_json::from_slice(&fs::read(output.join("classic/assets.json")).unwrap()).unwrap();

    assert_eq!(report.counts.managed_assets, 0);
    assert_eq!(report.counts.packaged_asset_payloads, 2);
    let special = &assets["catalog"]["specialLandTiles"][0];
    assert_eq!(special["resourceId"], -99);
    assert_eq!(special["source"], "Realmz reference resources");
    assert_eq!(special["payloadEncoding"], "classic-resource-data");
    assert_eq!(special["runtimeMedia"]["mediaType"], "image/png");
    for path in [
        special["payloadPath"].as_str().unwrap(),
        special["runtimeMedia"]["path"].as_str().unwrap(),
    ] {
        assert!(output.join(path).is_file(), "missing packaged {path}");
    }
}

#[test]
fn packages_scenario_monster_icon_overrides_under_their_target_ids() {
    let workspace = tempdir().unwrap();
    let project_dir = workspace.path().join("monster-icons.providence");
    let mut project = create_project("Monster icons".to_string(), &project_dir).unwrap();
    let base = encode_cicn_resource(&RgbaImagePayload {
        width: 64,
        height: 64,
        rgba_base64: STANDARD.encode(vec![224_u8; 64 * 64 * 4]),
    })
    .unwrap();
    let paired = encode_cicn_resource(&RgbaImagePayload {
        width: 64,
        height: 64,
        rgba_base64: STANDARD.encode(vec![96_u8; 64 * 64 * 4]),
    })
    .unwrap();
    project.monster_icon_overrides.push(
        serde_json::from_value(json!({
            "targetBaseIconId": 409,
            "sourceBaseIconId": 12001,
            "sourceLabel": "Harpy",
            "sourceKind": "scenario-resource",
            "sourceBaseResourceBase64": STANDARD.encode(&base),
            "sourcePairedResourceBase64": STANDARD.encode(&paired),
            "imported": true
        }))
        .unwrap(),
    );

    let output = workspace.path().join("monster-icons-out");
    let report = export_remake_campaign(&project, &project_dir, &output).unwrap();
    let assets: Value =
        serde_json::from_slice(&fs::read(output.join("classic/assets.json")).unwrap()).unwrap();
    let icons = assets["catalog"]["icons"].as_array().unwrap();
    let base_icon = icons.iter().find(|icon| icon["resourceId"] == 409).unwrap();
    let paired_icon = icons.iter().find(|icon| icon["resourceId"] == 717).unwrap();

    assert_eq!(report.counts.packaged_asset_payloads, 4);
    assert_eq!(base_icon["source"], "Scenario monster icon override");
    assert_eq!(paired_icon["source"], "Scenario monster icon override");
    assert_eq!(base_icon["runtimeMedia"]["mediaType"], "image/png");
    assert_eq!(paired_icon["runtimeMedia"]["mediaType"], "image/png");
    for icon in [base_icon, paired_icon] {
        for path in [
            icon["payloadPath"].as_str().unwrap(),
            icon["runtimeMedia"]["path"].as_str().unwrap(),
        ] {
            assert!(output.join(path).is_file(), "missing packaged {path}");
        }
    }
    assert_eq!(assets["monsterIconOverrides"][0]["targetBaseIconId"], 409);
    assert!(assets["monsterIconOverrides"][0]
        .get("sourceBaseResourceBase64")
        .is_none());
    assert!(assets["monsterIconOverrides"][0]
        .get("sourcePairedResourceBase64")
        .is_none());
}

#[test]
fn updates_scenario_monster_icons_in_an_existing_remake_bundle() {
    let workspace = tempdir().unwrap();
    let project_dir = workspace.path().join("existing-monster-icons.providence");
    let mut project = create_project("Existing monster icons".to_string(), &project_dir).unwrap();
    let output = workspace.path().join("existing-monster-icons-out");
    export_remake_campaign(&project, &project_dir, &output).unwrap();
    for relative_path in ["campaign.json", "classic/assets.json"] {
        let path = output.join(relative_path);
        let value: Value = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
        let mut compact = serde_json::to_vec(&value).unwrap();
        compact.push(b'\n');
        fs::write(path, compact).unwrap();
    }
    let base = encode_cicn_resource(&RgbaImagePayload {
        width: 64,
        height: 64,
        rgba_base64: STANDARD.encode(vec![224_u8; 64 * 64 * 4]),
    })
    .unwrap();
    project.monster_icon_overrides.push(
        serde_json::from_value(json!({
            "targetBaseIconId": 409,
            "sourceBaseIconId": 409,
            "sourceLabel": "Harpy",
            "sourceKind": "scenario-resource",
            "sourceBaseResourceBase64": STANDARD.encode(&base),
            "sourcePairedResourceBase64": STANDARD.encode(&base),
            "imported": true
        }))
        .unwrap(),
    );

    let report = update_remake_campaign_icons(&project, &output).unwrap();
    assert_eq!(report.written_files.len(), 4);
    assert_eq!(report.packaged_asset_payloads, 4);
    let documents = read_json_documents(&output);
    let icons = documents["classic/assets.json"]["catalog"]["icons"]
        .as_array()
        .unwrap();
    assert!(icons
        .iter()
        .any(|icon| icon["resourceId"] == 409 && icon["runtimeMedia"]["mediaType"] == "image/png"));
    assert!(icons
        .iter()
        .any(|icon| icon["resourceId"] == 717 && icon["runtimeMedia"]["mediaType"] == "image/png"));
    assert_eq!(
        documents["campaign.json"]["counts"]["packagedAssetPayloads"],
        4
    );
    for relative_path in ["campaign.json", "classic/assets.json"] {
        assert_eq!(
            fs::read_to_string(output.join(relative_path))
                .unwrap()
                .lines()
                .count(),
            1,
            "{relative_path} should preserve its compact JSON style"
        );
    }
}

#[test]
fn refuses_to_overwrite_a_non_empty_directory() {
    let workspace = tempdir().unwrap();
    let project_dir = workspace.path().join("starter.providence");
    let project = create_project("Starter".to_string(), &project_dir).unwrap();
    let output_dir = workspace.path().join("occupied");
    fs::create_dir_all(&output_dir).unwrap();
    fs::write(output_dir.join("keep.txt"), b"keep").unwrap();

    let error = export_remake_campaign(&project, &project_dir, &output_dir).unwrap_err();
    assert!(error.to_string().contains("Refusing to overwrite"));
    assert_eq!(fs::read(output_dir.join("keep.txt")).unwrap(), b"keep");
}

#[test]
fn resource_type_file_tokens_cannot_create_paths() {
    assert_eq!(super::assets::resource_type_file_token("PICT"), "pict");
    assert_eq!(
        super::assets::resource_type_file_token("../x"),
        "type-2e2e2f78"
    );
}

fn trigger_record(source: &str, record_index: usize, actions: Vec<Action>) -> TriggerRecord {
    let is_extra_action = source == "Data ED3";
    TriggerRecord {
        id: if is_extra_action {
            format!("Data ED3:macro:{record_index}")
        } else {
            format!("Data DD:0:{record_index}")
        },
        source: source.to_string(),
        level_type: (!is_extra_action).then_some(LevelType::Land),
        level_index: (!is_extra_action).then_some(0),
        record_index,
        active: true,
        doorid: record_index as i32,
        landid: 0,
        target_x: 1,
        target_y: 1,
        percent: 100,
        coordinate: (!is_extra_action).then_some(MapCoordinate { x: 1, y: 1 }),
        actions,
        provenance: Provenance {
            source_file: source.to_string(),
            record_index,
            byte_offset: record_index * 40,
            byte_length: 40,
            confidence: Confidence::SourceBacked,
        },
    }
}

fn action(slot: usize, code: i16, id: i16) -> Action {
    Action {
        slot,
        raw_code: code,
        code,
        id,
        label: format!("Opcode {code}"),
        category: ActionCategory::Branch,
        gosub: false,
    }
}

fn managed_asset(id: &str, scope: ManagedAssetLibraryScope, bytes: &[u8]) -> ManagedAsset {
    let sha256 = hex::encode(Sha256::digest(bytes));
    serde_json::from_value(json!({
        "id": format!("asset:{id}"),
        "label": format!("Managed {id}"),
        "kind": "picture",
        "resourceType": "PICT",
        "resourceId": if id == "library" { 307 } else { 306 },
        "fileName": format!("{id}.pict"),
        "originalPath": "",
        "previewPath": "",
        "resourcePath": format!("data:application/octet-stream;base64,{}", STANDARD.encode(bytes)),
        "mimeType": "image/x-pict",
        "bytes": bytes.len(),
        "sha256": sha256,
        "width": 32,
        "height": 32,
        "durationMs": null,
        "sampleRate": null,
        "channels": null,
        "exportState": "ready",
        "libraryScope": scope,
        "provenance": "canonical test data",
        "linkedEntity": format!("resource:PICT:{}", if id == "library" { 307 } else { 306 }),
        "conversion": null
    }))
    .unwrap()
}

fn test_pict(color: [u8; 4]) -> Vec<u8> {
    let mut rgba = Vec::with_capacity(32 * 32 * 4);
    for _ in 0..32 * 32 {
        rgba.extend_from_slice(&color);
    }
    encode_pict_resource(&RgbaImagePayload {
        width: 32,
        height: 32,
        rgba_base64: STANDARD.encode(rgba),
    })
    .unwrap()
}

fn managed_sound_asset(bytes: &[u8]) -> ManagedAsset {
    let sha256 = hex::encode(Sha256::digest(bytes));
    serde_json::from_value(json!({
        "id": "asset:sound:321:test",
        "label": "Managed sound",
        "kind": "sound",
        "resourceType": "snd ",
        "resourceId": 321,
        "fileName": "sound-321.snd",
        "originalPath": "",
        "previewPath": "data:audio/wav;base64,editor-only",
        "resourcePath": format!("data:audio/x-mac-snd;base64,{}", STANDARD.encode(bytes)),
        "mimeType": "audio/x-mac-snd",
        "bytes": bytes.len(),
        "sha256": sha256,
        "width": null,
        "height": null,
        "durationMs": 23,
        "sampleRate": 11025,
        "channels": 1,
        "exportState": "ready",
        "libraryScope": "scenario",
        "provenance": "canonical test data",
        "linkedEntity": "resource:snd:321",
        "conversion": null
    }))
    .unwrap()
}

fn managed_music_asset() -> ManagedAsset {
    serde_json::from_value(json!({
        "id": "asset:music:1",
        "label": "Managed music",
        "kind": "music",
        "resourceType": "MOD ",
        "resourceId": 1,
        "scenarioMusicSlot": 1,
        "fileName": "Custom 1 Music",
        "originalPath": "data:audio/x-mod;base64,",
        "previewPath": "data:audio/x-mod;base64,",
        "resourcePath": "data:audio/x-mod;base64,",
        "mimeType": "audio/x-mod",
        "bytes": 0,
        "sha256": "fixture",
        "width": null,
        "height": null,
        "durationMs": null,
        "sampleRate": null,
        "channels": null,
        "exportState": "ready",
        "libraryScope": "scenario",
        "provenance": "canonical test data",
        "linkedEntity": "scenario-music:1",
        "conversion": null
    }))
    .unwrap()
}

fn read_json_documents(root: &Path) -> BTreeMap<String, Value> {
    [
        "campaign.json",
        "runtime.json",
        "classic/scenario.json",
        "classic/maps.json",
        "classic/scripts.json",
        "classic/encounters.json",
        "classic/content.json",
        "classic/rules.json",
        "classic/assets.json",
        "classic/evidence.json",
    ]
    .into_iter()
    .map(|relative_path| {
        (
            relative_path.to_string(),
            serde_json::from_slice(&fs::read(root.join(relative_path)).unwrap()).unwrap(),
        )
    })
    .collect()
}

fn assert_no_forbidden_project_state(value: &Value, context: &str) {
    match value {
        Value::Object(object) => {
            for forbidden in [
                "rawBytes",
                "resourcePath",
                "previewPath",
                "originalPath",
                "projectPath",
                "rawSourcesDir",
                "editorMetadata",
            ] {
                assert!(
                    !object.contains_key(forbidden),
                    "{context} contains {forbidden}"
                );
            }
            for child in object.values() {
                assert_no_forbidden_project_state(child, context);
            }
        }
        Value::Array(values) => {
            for child in values {
                assert_no_forbidden_project_state(child, context);
            }
        }
        Value::String(text) => assert!(!text.to_ascii_lowercase().contains("data:")),
        _ => {}
    }
}

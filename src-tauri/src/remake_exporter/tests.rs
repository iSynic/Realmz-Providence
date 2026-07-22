use super::*;
use crate::importer::create_project;
use crate::project::{
    Action, ActionCategory, Confidence, LevelType, ManagedAsset, ManagedAssetLibraryScope,
    MapCoordinate, ProjectOrigin, Provenance, ResourceAsset, ScenarioSupportFile, TriggerRecord,
};
use crate::resource_fork::{
    encode_cicn_resource, encode_snd_resource, PcmAudioPayload, RgbaImagePayload,
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
    project.assets.push(managed_asset(
        "picture",
        ManagedAssetLibraryScope::Scenario,
        b"canonical-pict",
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
    assert_eq!(first_report.counts.packaged_asset_payloads, 1);
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
    let assets = &documents["classic/assets.json"];
    assert_eq!(assets["managedAssets"].as_array().unwrap().len(), 1);
    let managed = &assets["managedAssets"][0];
    assert_eq!(managed["payloadEncoding"], "classic-resource-data");
    assert_eq!(managed["payloadBytes"], b"canonical-pict".len());
    assert_eq!(
        managed["payloadSha256"],
        hex::encode(Sha256::digest(b"canonical-pict"))
    );
    let payload_path = managed["payloadPath"].as_str().unwrap();
    assert_eq!(
        fs::read(first.join(payload_path)).unwrap(),
        b"canonical-pict"
    );
    assert_eq!(
        assets["catalog"]["pictures"][0]["payloadPath"],
        managed["payloadPath"]
    );
    assert_eq!(
        documents["classic/rules.json"]["ruleNames"]["sourceFile"],
        "Data Files/Custom Names.rsrc"
    );
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
    assert!(warning.contains("Classic bundle v1"));
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
    fs::write(payload_dir.join("picture.pict"), b"relative-pict").unwrap();
    let mut relative = managed_asset(
        "relative",
        ManagedAssetLibraryScope::Scenario,
        b"relative-pict",
    );
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
fn imported_projects_export_without_consulting_the_compatibility_annex() {
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
    project.triggers = vec![
        trigger_record("Data DD", 0, vec![action(0, 39, 2)]),
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

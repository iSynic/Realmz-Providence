use super::*;
use crate::importer::create_project;
use crate::project::{
    ManagedAsset, ManagedAssetLibraryScope, ProjectOrigin, ResourceAsset, ScenarioSupportFile,
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
        raw_bytes: vec![0xaa; 600],
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
fn preserves_negative_special_land_tile_ids_outside_the_v1_icon_catalog() {
    let workspace = tempdir().unwrap();
    let project_dir = workspace.path().join("special-tile.providence");
    let mut project = create_project("Special tile".to_string(), &project_dir).unwrap();
    let payload = b"canonical-cicn";
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
                STANDARD.encode(payload)
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

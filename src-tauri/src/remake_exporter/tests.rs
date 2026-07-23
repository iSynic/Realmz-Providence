use super::*;
use crate::importer::create_project;
use crate::project::{
    Action, ActionCategory, Confidence, LevelType, ManagedAsset, ManagedAssetLibraryScope,
    MapCoordinate, ProjectOrigin, Provenance, ResourceAsset, ScenarioIconResource,
    ScenarioIconResourceSource, ScenarioSupportFile, SourceFile, SourceFileRole, TriggerRecord,
};
use crate::realmz::{
    parse_caste_overrides, parse_race_overrides, CASTE_BYTES, CASTE_OVERRIDE_RECORDS, RACE_BYTES,
    RACE_OVERRIDE_RECORDS,
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
    let command_output = workspace.path().join("command");
    let first_report = export_remake_campaign(&project, &project_dir, &first).unwrap();
    let second_report = export_remake_campaign(&project, &project_dir, &second).unwrap();
    let command_report = crate::commands::export_remake_campaign(
        project_dir.to_string_lossy().to_string(),
        project.clone(),
        command_output.to_string_lossy().to_string(),
    )
    .unwrap();

    assert_eq!(first_report.written_files, second_report.written_files);
    assert_eq!(first_report.written_files, command_report.written_files);
    assert_eq!(first_report.counts, command_report.counts);
    assert_eq!(first_report.counts.managed_assets, 1);
    assert_eq!(first_report.counts.packaged_asset_payloads, 2);
    let serialized_report = serde_json::to_value(&first_report).unwrap();
    assert_eq!(
        serialized_report["outputDir"],
        first.to_string_lossy().as_ref()
    );
    assert_eq!(serialized_report["counts"]["managedAssets"], 1);
    assert_eq!(serialized_report["counts"]["packagedAssetPayloads"], 2);
    assert!(serialized_report["writtenFiles"].is_array());
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
fn exports_quicktime_gif_pict_as_immutable_classic_bytes_and_runtime_png() {
    let workspace = tempdir().unwrap();
    let project_dir = workspace.path().join("quicktime-picture.providence");
    let mut project = create_project("QuickTime picture".to_string(), &project_dir).unwrap();
    let pict = conformance_pict_fixture("v2-quicktime-gif");
    project.assets.push(managed_asset(
        "picture",
        ManagedAssetLibraryScope::Scenario,
        &pict,
    ));
    project.asset_catalog.pictures.push(ResourceAsset {
        id: "resource:PICT:306".to_string(),
        resource_type: "PICT".to_string(),
        resource_id: 306,
        name: Some("QuickTime GIF picture".to_string()),
        source: "Managed scenario picture".to_string(),
        preview_path: None,
    });

    let output = workspace.path().join("bundle");
    export_remake_campaign(&project, &project_dir, &output).unwrap();

    let assets = read_json_documents(&output)
        .remove("classic/assets.json")
        .unwrap();
    let picture = &assets["catalog"]["pictures"][0];
    let payload_path = picture["payloadPath"].as_str().unwrap();
    assert!(payload_path.starts_with("assets/managed/pict-306-"));
    assert_eq!(fs::read(output.join(payload_path)).unwrap(), pict);
    assert_eq!(picture["payloadSha256"], hex::encode(Sha256::digest(&pict)));

    let runtime_media = &picture["runtimeMedia"];
    assert_eq!(runtime_media["mediaType"], "image/png");
    let runtime_path = runtime_media["path"].as_str().unwrap();
    assert!(runtime_path.starts_with("media/pictures/pict-306-"));
    let png = fs::read(output.join(runtime_path)).unwrap();
    assert!(png.starts_with(b"\x89PNG\r\n\x1a\n"));
    assert_eq!(runtime_media["bytes"], png.len());
    assert_eq!(runtime_media["sha256"], hex::encode(Sha256::digest(&png)));
    let rgba = image::load_from_memory_with_format(&png, image::ImageFormat::Png)
        .unwrap()
        .into_rgba8();
    assert_eq!(rgba.dimensions(), (2, 2));
    assert_eq!(
        rgba.into_raw(),
        [255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255]
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
fn packages_referenced_scenario_item_icons_as_classic_bytes_and_runtime_png() {
    let workspace = tempdir().unwrap();
    let project_dir = workspace.path().join("dead-of-night.providence");
    let mut project = create_project("Dead of Night".to_string(), &project_dir).unwrap();
    let cicn = encode_cicn_resource(&RgbaImagePayload {
        width: 2,
        height: 2,
        rgba_base64: STANDARD.encode([
            0_u8, 128, 0, 255, 0, 255, 0, 255, 32, 32, 32, 255, 0, 0, 0, 0,
        ]),
    })
    .unwrap();
    let mut item = crate::realmz::parse_scenario_items(&vec![0; crate::realmz::ITEM_BYTES])
        .into_iter()
        .next()
        .unwrap();
    item.item_id = 982;
    item.icon_id = 30061;
    project.scenario_items.push(item);
    project.scenario_icon_resources.push(ScenarioIconResource {
        resource_id: 30061,
        label: "Robe with Green Shine".to_string(),
        source_kind: ScenarioIconResourceSource::ScenarioResource,
        resource_base64: STANDARD.encode(&cicn),
        preview_path: Some("assets/icons/icon_30061.png".to_string()),
        imported: true,
    });
    project.asset_catalog.icons.push(ResourceAsset {
        id: "scenario-cicn-30061".to_string(),
        resource_type: "cicn".to_string(),
        resource_id: 30061,
        name: Some("Robe with Green Shine".to_string()),
        source: "Scenario resource fork: Scenario.rsrc".to_string(),
        preview_path: Some("assets/icons/icon_30061.png".to_string()),
    });

    let output = workspace.path().join("bundle");
    let report = export_remake_campaign(&project, &project_dir, &output).unwrap();
    let documents = read_json_documents(&output);
    let icon = &documents["classic/assets.json"]["catalog"]["icons"][0];

    assert_eq!(report.counts.managed_assets, 0);
    assert_eq!(report.counts.packaged_asset_payloads, 2);
    assert_eq!(icon["resourceId"], 30061);
    assert_eq!(icon["name"], "Robe with Green Shine");
    let payload_path = icon["payloadPath"].as_str().unwrap();
    assert!(payload_path.starts_with("assets/managed/cicn-30061-"));
    assert!(payload_path.ends_with(".cicn"));
    assert_eq!(fs::read(output.join(payload_path)).unwrap(), cicn);
    let runtime_media = &icon["runtimeMedia"];
    assert_eq!(runtime_media["mediaType"], "image/png");
    let runtime_path = runtime_media["path"].as_str().unwrap();
    assert!(runtime_path.starts_with("media/images/cicn-30061-"));
    assert!(runtime_path.ends_with(".png"));
    assert!(fs::read(output.join(runtime_path))
        .unwrap()
        .starts_with(b"\x89PNG\r\n\x1a\n"));
    assert!(documents["classic/assets.json"]["scenarioIconResources"][0]
        .get("resourceBase64")
        .is_none());
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
fn exports_authored_rule_rows_as_exact_scenario_local_changes() {
    let workspace = tempdir().unwrap();
    let project_dir = workspace.path().join("authored-rules.providence");
    let mut project = create_project("Authored rules".to_string(), &project_dir).unwrap();
    let race_baseline = crate::rule_compiler::rule_compiler_baseline_bytes(
        "Data Race",
        RACE_BYTES,
        RACE_OVERRIDE_RECORDS,
    )
    .unwrap();
    let caste_baseline = crate::rule_compiler::rule_compiler_baseline_bytes(
        "Data Caste",
        CASTE_BYTES,
        CASTE_OVERRIDE_RECORDS,
    )
    .unwrap();
    let mut race = parse_race_overrides(&race_baseline)[19].clone();
    race.authored = true;
    race.base_move += 1;
    let mut caste = parse_caste_overrides(&caste_baseline)[20].clone();
    caste.authored = true;
    caste.start_money += 1;
    project.race_overrides = vec![race];
    project.caste_overrides = vec![caste];

    let output = workspace.path().join("authored-rules-out");
    export_remake_campaign(&project, &project_dir, &output).unwrap();
    let rules = read_json_documents(&output)["classic/rules.json"].clone();

    assert_eq!(rules["tableSelection"]["races"]["source"], "scenario-local");
    assert_eq!(
        rules["tableSelection"]["races"]["changedRecordIds"],
        json!([19])
    );
    assert_eq!(
        rules["tableSelection"]["castes"]["source"],
        "scenario-local"
    );
    assert_eq!(
        rules["tableSelection"]["castes"]["changedRecordIds"],
        json!([20])
    );
}

#[test]
fn imported_builtin_metadata_selects_shared_rule_tables() {
    let workspace = tempdir().unwrap();
    let project_dir = workspace.path().join("builtin-rules.providence");
    let mut project = create_project("Built-in rules".to_string(), &project_dir).unwrap();
    mark_imported(&mut project);
    let mut race_bytes = crate::rule_compiler::rule_compiler_baseline_bytes(
        "Data Race",
        RACE_BYTES,
        RACE_OVERRIDE_RECORDS,
    )
    .unwrap();
    race_bytes[19 * RACE_BYTES + 196] ^= 1;
    project.race_overrides = parse_race_overrides(&race_bytes);
    preserve_source_file(&mut project, &project_dir, "Data Race", &race_bytes);
    let resource_fork = write_resource_fork(&[ResourceForkEntry {
        resource_type: "RLMZ".to_string(),
        id: 128,
        name: "Built-in scenario index".to_string(),
        attributes: 0,
        data: vec![0; 8],
    }])
    .unwrap();
    preserve_resource_fork(&mut project, &project_dir, &resource_fork);

    let output = workspace.path().join("builtin-rules-out");
    export_remake_campaign(&project, &project_dir, &output).unwrap();
    let rules = read_json_documents(&output)["classic/rules.json"].clone();

    assert_eq!(rules["tableSelection"]["races"]["source"], "shared");
    assert!(rules["tableSelection"]["races"]
        .get("changedRecordIds")
        .is_none());
    assert_eq!(rules["tableSelection"]["castes"]["source"], "shared");
}

#[test]
fn imported_third_party_tables_report_only_changed_records() {
    let workspace = tempdir().unwrap();
    let project_dir = workspace.path().join("third-party-rules.providence");
    let mut project = create_project("Third-party rules".to_string(), &project_dir).unwrap();
    mark_imported(&mut project);
    let mut race_bytes = crate::rule_compiler::rule_compiler_baseline_bytes(
        "Data Race",
        RACE_BYTES,
        RACE_OVERRIDE_RECORDS,
    )
    .unwrap();
    race_bytes[3 * RACE_BYTES + 196] ^= 1;
    let caste_bytes = crate::rule_compiler::rule_compiler_baseline_bytes(
        "Data Caste",
        CASTE_BYTES,
        CASTE_OVERRIDE_RECORDS,
    )
    .unwrap();
    project.race_overrides = parse_race_overrides(&race_bytes);
    project.caste_overrides = parse_caste_overrides(&caste_bytes);
    preserve_source_file(&mut project, &project_dir, "Data Race", &race_bytes);
    preserve_source_file(&mut project, &project_dir, "Data Caste", &caste_bytes);
    preserve_resource_fork(
        &mut project,
        &project_dir,
        &write_resource_fork(&[]).unwrap(),
    );

    let output = workspace.path().join("third-party-rules-out");
    export_remake_campaign(&project, &project_dir, &output).unwrap();
    let rules = read_json_documents(&output)["classic/rules.json"].clone();

    assert_eq!(rules["tableSelection"]["races"]["source"], "scenario-local");
    assert_eq!(
        rules["tableSelection"]["races"]["changedRecordIds"],
        json!([3])
    );
    assert_eq!(
        rules["tableSelection"]["castes"]["source"],
        "scenario-local"
    );
    assert_eq!(
        rules["tableSelection"]["castes"]["changedRecordIds"],
        json!([])
    );
}

#[test]
fn imported_tables_without_preserved_selection_evidence_remain_unresolved() {
    let workspace = tempdir().unwrap();
    let project_dir = workspace.path().join("unresolved-rules.providence");
    let mut project = create_project("Unresolved rules".to_string(), &project_dir).unwrap();
    mark_imported(&mut project);
    let race_bytes = crate::rule_compiler::rule_compiler_baseline_bytes(
        "Data Race",
        RACE_BYTES,
        RACE_OVERRIDE_RECORDS,
    )
    .unwrap();
    project.race_overrides = parse_race_overrides(&race_bytes);
    preserve_source_file(&mut project, &project_dir, "Data Race", &race_bytes);

    let output = workspace.path().join("unresolved-rules-out");
    export_remake_campaign(&project, &project_dir, &output).unwrap();
    let rules = read_json_documents(&output)["classic/rules.json"].clone();

    assert_eq!(rules["tableSelection"]["races"]["source"], "unresolved");
    assert!(rules["tableSelection"]["races"]
        .get("changedRecordIds")
        .is_none());
    assert_eq!(rules["tableSelection"]["castes"]["source"], "shared");
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

fn conformance_pict_fixture(id: &str) -> Vec<u8> {
    let manifest: Value = serde_json::from_str(include_str!(
        "../../../fixtures/pict-conformance/manifest.json"
    ))
    .unwrap();
    let encoded = manifest["fixtures"]
        .as_array()
        .unwrap()
        .iter()
        .find(|fixture| fixture["id"] == id)
        .and_then(|fixture| fixture["bytesBase64"].as_str())
        .unwrap_or_else(|| panic!("missing shared PICT fixture {id}"));
    STANDARD.decode(encoded).unwrap()
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

fn mark_imported(project: &mut crate::project::ProvidenceProject) {
    project.source.origin = Some(ProjectOrigin::Imported);
    project.source.immutable = true;
    project.source.raw_sources_dir = "raw-sources".to_string();
}

fn preserve_source_file(
    project: &mut crate::project::ProvidenceProject,
    project_dir: &Path,
    name: &str,
    bytes: &[u8],
) {
    let raw_sources = project_dir.join("raw-sources");
    fs::create_dir_all(&raw_sources).unwrap();
    fs::write(raw_sources.join(name), bytes).unwrap();
    project.source.files.push(SourceFile {
        name: name.to_string(),
        relative_path: name.to_string(),
        bytes: bytes.len() as u64,
        sha256: hex::encode(Sha256::digest(bytes)),
        role: SourceFileRole::SupportedBinary,
        editable: true,
    });
}

fn preserve_resource_fork(
    project: &mut crate::project::ProvidenceProject,
    project_dir: &Path,
    bytes: &[u8],
) {
    let raw_sources = project_dir.join("raw-sources");
    fs::create_dir_all(&raw_sources).unwrap();
    fs::write(raw_sources.join("Scenario.rsrc"), bytes).unwrap();
    project.source.files.push(SourceFile {
        name: "Scenario.rsrc".to_string(),
        relative_path: "Scenario.rsrc".to_string(),
        bytes: bytes.len() as u64,
        sha256: hex::encode(Sha256::digest(bytes)),
        role: SourceFileRole::ResourceFork,
        editable: false,
    });
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

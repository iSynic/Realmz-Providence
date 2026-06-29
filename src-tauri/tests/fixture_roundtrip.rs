use realmz_providence_lib::exporter::export_project;
use realmz_providence_lib::importer::{create_project, import_scenario, open_project, sha256_hex, RAW_SOURCES_DIR};
use realmz_providence_lib::project::{
    AssetImportTarget, DitherMode, ImageFitMode, ImageMatte, ImageScaleMode, ManagedAsset,
    ManagedAssetConversion, ManagedAssetExportState, ManagedAssetKind, PaletteMode,
    ProvidenceProject, ScenarioTarget, SourceFileRole, TileAttributeFlag, TileAttributeSourceKind,
    PROJECT_SCHEMA_VERSION, SEMANTIC_SCHEMA_VERSION,
};
use realmz_providence_lib::realmz::{
    i16_be, parse_scenario_buffers, update_custom_land_tile_attributes, update_custom_land_tile_combat_build,
    update_custom_landlook_base, update_custom_landlook_range_slot, CustomLandTileAttributePatch,
    SUPPORTED_WRITE_FILES, TRACKED_FILES,
};
use realmz_providence_lib::resource_fork::{
    decode_string_list_resource, encode_pict_resource, parse_resource_fork_entries, ResourceForkEntry, RgbaImagePayload,
};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::Path;
use tempfile::tempdir;

fn fixture_path(name: &str) -> Option<std::path::PathBuf> {
    let path = Path::new("F:/Realmz/base/Realmz/Scenarios").join(name);
    path.is_dir().then_some(path)
}

fn out_fixture_path(name: &str) -> Option<std::path::PathBuf> {
    let path = Path::new("F:/Realmz/out_win_clang/Scenarios").join(name);
    path.is_dir().then_some(path)
}

fn custom_names_fixture_path() -> Option<std::path::PathBuf> {
    let path = Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap_or_else(|| Path::new("."))
        .join("public")
        .join("bundled-libraries")
        .join("realmz-reference")
        .join("Custom Names.rsrc");
    path.is_file().then_some(path)
}

fn desktop_fixture_path(name: &str) -> Option<std::path::PathBuf> {
    let path = Path::new("C:/Users/Eric/Desktop").join(name);
    path.is_dir().then_some(path)
}

const HARDENED_FIXTURES: &[&str] = &[
    "City of Bywater",
    "Prelude to Pestilence",
    "War in the Sword Lands",
    "Mithril Vault",
    "Wrath of the Mind Lords",
    "Tutorial",
];

#[test]
fn imports_core_fixture_scenarios() {
    for name in HARDENED_FIXTURES {
        let Some(source) = fixture_path(name) else {
            eprintln!("Skipping missing fixture scenario: {name}");
            continue;
        };
        let temp = tempdir().unwrap();
        let project_dir = temp.path().join(name.replace(' ', "_"));
        let project = import_scenario(&source, &project_dir).unwrap();
        assert_eq!(project.schema_version, PROJECT_SCHEMA_VERSION);
        assert!(!project.maps.is_empty(), "{name} should import maps");
        assert_semantic_schema(name, &source, &project);
        assert!(project_dir.join("project.json").is_file());
        assert!(project_dir.join(RAW_SOURCES_DIR).is_dir());
        assert!(project.source.immutable);
        assert_generated_corpus_expectations(name, &source, &project);
        assert_fixture_contracts(name, &project);
        let atlased_tilesets: Vec<_> = project
            .asset_catalog
            .tilesets
            .iter()
            .filter_map(|tileset| tileset.image_path.as_ref())
            .collect();
        assert!(
            !atlased_tilesets.is_empty(),
            "{name} should import at least one tile atlas"
        );
        for image_path in atlased_tilesets {
            assert!(
                project_dir.join(image_path).is_file(),
                "{image_path} should exist in the project package"
            );
        }
    }
}

#[test]
fn imports_kalypso_custom_landlook_atlas() {
    let Some(source) = out_fixture_path("Kalypso's Island") else {
        eprintln!("Skipping Kalypso custom landlook fixture; out_win_clang scenario is absent.");
        return;
    };
    let temp = tempdir().unwrap();
    let project_dir = temp.path().join("kalypsos_island");
    let project = import_scenario(&source, &project_dir).unwrap();
    let tileset = project
        .asset_catalog
        .tilesets
        .iter()
        .find(|tileset| tileset.id == "landlook-6")
        .expect("Kalypso Land level 0 should reference custom landlook 6");
    assert_eq!(tileset.pict_id, Some(306));
    assert_eq!(tileset.base_tile, Some(156));
    assert!(tileset.available, "custom landlook 6 atlas should import");
    let image_path = tileset
        .image_path
        .as_ref()
        .expect("custom landlook 6 should have a project atlas image");
    assert!(
        project_dir.join(image_path).is_file(),
        "{image_path} should exist in the project package"
    );
}

#[test]
fn custom_landlook_files_export_preserved_until_writer_gate_opens() {
    let Some(source) = out_fixture_path("Kalypso's Island") else {
        eprintln!("Skipping custom landlook preservation fixture; Kalypso's Island is absent.");
        return;
    };
    let (_temp, project, export_dir, report) =
        export_fixture_with_target(&source, ScenarioTarget::ProvidencePortableFolder);
    assert_eq!(report.target, ScenarioTarget::ProvidencePortableFolder);
    let custom_landlook_files: Vec<_> = project
        .source
        .files
        .iter()
        .filter(|file| {
            file.name.starts_with("Data Custom ")
                || (file.name.starts_with("Custom ") && !is_custom_music_name(&file.name))
        })
        .collect();
    assert!(
        !custom_landlook_files.is_empty(),
        "Kalypso should provide custom landlook/mapstats fixture files"
    );
    for file in custom_landlook_files {
        let source_file = source.join(&file.relative_path);
        let exported_file = export_dir.join(&file.relative_path);
        assert!(
            exported_file.is_file(),
            "custom landlook file {} should export as preserve-only payload",
            file.relative_path
        );
        assert_eq!(
            fs::read(&source_file).unwrap(),
            fs::read(&exported_file).unwrap(),
            "custom landlook file {} should remain byte-identical until writer gate opens",
            file.relative_path
        );
    }
}

#[test]
fn custom_landlook_metadata_writer_mutates_only_owned_fields() {
    let Some(source) = out_fixture_path("Kalypso's Island") else {
        eprintln!("Skipping custom landlook writer fixture; Kalypso's Island is absent.");
        return;
    };
    let temp = tempdir().unwrap();
    let project_dir = temp.path().join("project");
    let export_dir = temp.path().join("exported");
    import_scenario(&source, &project_dir).unwrap();
    let mut project = open_project(&project_dir).unwrap();
    let original = fs::read(source.join("Data Custom 1 BD")).unwrap();
    let index = project
        .custom_landlooks
        .iter()
        .position(|landlook| landlook.source_file == "Data Custom 1 BD")
        .expect("Kalypso should import Data Custom 1 BD as structured custom landlook metadata");
    let updated = update_custom_land_tile_attributes(
        &project.custom_landlooks[index],
        5,
        CustomLandTileAttributePatch {
            sound: Some(321),
            ..CustomLandTileAttributePatch::default()
        },
    );
    let updated = update_custom_land_tile_combat_build(&updated, 5, 1, 2, 188);
    let updated = update_custom_landlook_base(&updated, Some(156), Some(2));
    let updated = update_custom_landlook_range_slot(&updated, 0, Some(70), Some(80));
    project.custom_landlooks[index] = updated;

    let report = export_project(
        &project_dir,
        &project,
        &export_dir,
        ScenarioTarget::ProvidencePortableFolder,
    )
    .unwrap();
    assert!(
        report
            .written_files
            .iter()
            .any(|file| file == "Data Custom 1 BD"),
        "authored custom landlook metadata should be emitted as an owned write"
    );
    let exported = fs::read(export_dir.join("Data Custom 1 BD")).unwrap();
    assert_eq!(original.len(), exported.len());
    let changed: Vec<_> = original
        .iter()
        .zip(exported.iter())
        .enumerate()
        .filter_map(|(offset, (before, after))| (before != after).then_some(offset))
        .collect();
    for offset in changed {
        assert!(
            matches!(
                offset,
                200..=201 | 230..=231 | 8042..=8043 | 8044..=8047
            ),
            "unexpected custom landlook byte mutation at {offset}"
        );
    }
}

#[test]
fn evidence_lab_string_sound_support_file_exports() {
    let source = Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .join("fixtures/divinity-write-fixtures/strings-sound-field-string2-143/after");
    assert!(
        source.is_dir(),
        "Evidence Lab synthetic fixture should be present"
    );
    let temp = tempdir().unwrap();
    let project_dir = temp.path().join("project");
    let original_data_sd2 = fs::read(source.join("Data SD2")).unwrap();
    import_scenario(&source, &project_dir).unwrap();
    let mut project = open_project(&project_dir).unwrap();
    let support_file = project
        .scenario
        .support_file
        .as_mut()
        .expect("Evidence Lab fixture should import a Scenario support file");

    assert_eq!(support_file.divinity_string_editor_slot, Some(2));
    assert_eq!(support_file.divinity_string_sound_id, Some(143));

    support_file.authored = true;
    support_file.divinity_string_editor_slot = Some(3);
    support_file.divinity_string_sound_id = Some(145);
    let support_file_name = support_file.source_file.clone();
    let export_dir = temp.path().join("exported");
    export_project(
        &project_dir,
        &project,
        &export_dir,
        ScenarioTarget::ProvidencePortableFolder,
    )
    .unwrap();

    let output = fs::read(export_dir.join(&support_file_name)).unwrap();
    assert_eq!(output[23], 3);
    assert_eq!(i16_be(&output, 38), 145);
    assert_eq!(
        fs::read(export_dir.join("Data SD2")).unwrap(),
        original_data_sd2,
        "changing the selected string sound should not rewrite Data SD2 string text bytes"
    );

    let support_file = project
        .scenario
        .support_file
        .as_mut()
        .expect("Evidence Lab fixture should keep a Scenario support file");
    support_file.divinity_string_sound_id = Some(-145);
    let export_dir = temp.path().join("exported-negative");
    export_project(
        &project_dir,
        &project,
        &export_dir,
        ScenarioTarget::ProvidencePortableFolder,
    )
    .unwrap();

    let output = fs::read(export_dir.join(&support_file_name)).unwrap();
    assert_eq!(output[23], 3);
    assert_eq!(i16_be(&output, 38), -145);
    assert_eq!(
        fs::read(export_dir.join("Data SD2")).unwrap(),
        original_data_sd2,
        "changing string sound sign should not rewrite Data SD2 string text bytes"
    );
}

#[test]
fn data_solids_export_mutates_only_selected_special_tile_solidity() {
    let Some(source) = fixture_path("Tutorial") else {
        eprintln!("Skipping Data Solids export fixture; Tutorial is absent.");
        return;
    };
    let temp = tempdir().unwrap();
    let project_dir = temp.path().join("project");
    let export_dir = temp.path().join("exported");
    let mut project = import_scenario(&source, &project_dir).unwrap();
    let original = fs::read(source.join("Data Solids")).unwrap();
    let tile = 190usize;
    let next_value = if original[tile] == 0 { 1 } else { 0 };
    let profile = project
        .tile_attributes
        .iter_mut()
        .find(|profile| {
            matches!(profile.source_kind, TileAttributeSourceKind::DataSolids)
                && profile.tile == tile as i16
        })
        .expect("Tutorial should import Data Solids row 190");
    profile.raw_byte = Some(next_value);
    profile.solid_type = Some(next_value as i16);
    profile.flags = if next_value == 0 {
        vec![TileAttributeFlag::Walkable]
    } else {
        vec![TileAttributeFlag::Solid]
    };

    export_project(
        &project_dir,
        &project,
        &export_dir,
        ScenarioTarget::ProvidencePortableFolder,
    )
    .unwrap();

    let exported = fs::read(export_dir.join("Data Solids")).unwrap();
    assert_eq!(exported.len(), original.len());
    assert_eq!(
        changed_offsets(&original, &exported),
        vec![tile],
        "Data Solids authoring should mutate only the selected special tile row"
    );
    assert_eq!(exported[tile], next_value);
}

#[test]
fn custom_landlook_atlas_export_preserves_resource_payloads_without_edits() {
    let Some(source) = out_fixture_path("Kalypso's Island") else {
        eprintln!("Skipping custom landlook atlas preservation fixture; Kalypso's Island is absent.");
        return;
    };
    let (_temp, project, export_dir, _report) =
        export_fixture_with_target(&source, ScenarioTarget::ProvidencePortableFolder);
    let source_resource = resource_path_with_entry(&project, &source, "PICT", 306)
        .expect("Kalypso should import a scenario resource fork with PICT 306");
    let exported_resource = resource_path_with_entry(&project, &export_dir, "PICT", 306)
        .expect("Kalypso export should preserve a scenario resource fork with PICT 306");
    let source_entry = resource_entry(&source_resource, "PICT", 306)
        .expect("Kalypso source should contain PICT 306 for custom landlook 6");
    let exported_entry = resource_entry(&exported_resource, "PICT", 306)
        .expect("Kalypso export should contain PICT 306 for custom landlook 6");
    assert_eq!(source_entry.data, exported_entry.data, "no-edit export should preserve PICT 306 payload");
    assert_eq!(source_entry.name, exported_entry.name, "no-edit export should preserve PICT 306 name");
    assert_eq!(source_entry.attributes, exported_entry.attributes, "no-edit export should preserve PICT 306 attributes");
}

#[test]
fn custom_landlook_atlas_replacement_changes_only_target_pict_resource() {
    let Some(source) = out_fixture_path("Kalypso's Island") else {
        eprintln!("Skipping custom landlook atlas replacement fixture; Kalypso's Island is absent.");
        return;
    };
    let temp = tempdir().unwrap();
    let project_dir = temp.path().join("project");
    let export_dir = temp.path().join("exported");
    import_scenario(&source, &project_dir).unwrap();
    let mut project = open_project(&project_dir).unwrap();
    let source_resource = resource_path_with_entry(&project, &source, "PICT", 306)
        .expect("Kalypso should import a scenario resource fork with PICT 306");
    let original_entries = parse_resource_fork_entries(&fs::read(&source_resource).unwrap());
    assert!(
        original_entries.iter().any(|entry| entry.resource_type == "PICT" && entry.id == 306),
        "Kalypso should provide the original PICT 306 atlas"
    );

    let asset_dir = project_dir.join("assets").join("media").join("custom_landlook_6_atlas");
    fs::create_dir_all(&asset_dir).unwrap();
    let replacement_resource = replacement_landlook_pict_resource();
    fs::write(asset_dir.join("resource_PICT_306.bin"), &replacement_resource).unwrap();
    fs::write(asset_dir.join("original.png"), [0x89, b'P', b'N', b'G']).unwrap();
    fs::write(asset_dir.join("preview.png"), [0x89, b'P', b'N', b'G']).unwrap();
    project.assets.push(ManagedAsset {
        id: "asset:custom-landlook-6-atlas".to_string(),
        label: "Custom Landlook 6 Atlas".to_string(),
        kind: ManagedAssetKind::Picture,
        resource_type: "PICT".to_string(),
        resource_id: 306,
        file_name: "original.png".to_string(),
        original_path: "assets/media/custom_landlook_6_atlas/original.png".to_string(),
        preview_path: "assets/media/custom_landlook_6_atlas/preview.png".to_string(),
        resource_path: "assets/media/custom_landlook_6_atlas/resource_PICT_306.bin".to_string(),
        mime_type: "image/png".to_string(),
        bytes: 4,
        sha256: "fixture".to_string(),
        width: Some(640),
        height: Some(320),
        duration_ms: None,
        sample_rate: None,
        channels: None,
        export_state: ManagedAssetExportState::Ready,
        provenance: "fixture custom landlook atlas replacement".to_string(),
        linked_entity: Some("landlook:6".to_string()),
        conversion: Some(ManagedAssetConversion {
            target: AssetImportTarget::CustomLandlookAtlas,
            fit_mode: Some(ImageFitMode::Stretch),
            scale_mode: Some(ImageScaleMode::Crisp),
            matte: Some(ImageMatte::White),
            palette_mode: Some(PaletteMode::Adaptive256),
            dither_mode: Some(DitherMode::None),
            source_width: Some(640),
            source_height: Some(320),
            source_duration_ms: None,
            source_sample_rate: None,
            source_channels: None,
            final_width: Some(640),
            final_height: Some(320),
            warnings: Vec::new(),
        }),
    });

    let report = export_project(
        &project_dir,
        &project,
        &export_dir,
        ScenarioTarget::ProvidencePortableFolder,
    )
    .unwrap();
    assert!(
        report.written_resources.iter().any(|entry| entry.contains("PICT 306")),
        "custom landlook atlas replacement should be reported as a written resource"
    );
    let exported_resource = resource_path_with_entry(&project, &export_dir, "PICT", 306)
        .expect("export should write a scenario resource fork with PICT 306");
    let exported_entries = parse_resource_fork_entries(&fs::read(&exported_resource).unwrap());
    for original in &original_entries {
        let exported = exported_entries
            .iter()
            .find(|entry| entry.resource_type == original.resource_type && entry.id == original.id)
            .unwrap_or_else(|| panic!("export should preserve resource {} {}", original.resource_type, original.id));
        if original.resource_type == "PICT" && original.id == 306 {
            assert_eq!(exported.data, replacement_resource, "PICT 306 should be replaced by managed atlas bytes");
        } else {
            assert_eq!(exported.data, original.data, "resource {} {} payload should be unchanged", original.resource_type, original.id);
            assert_eq!(exported.name, original.name, "resource {} {} name should be unchanged", original.resource_type, original.id);
            assert_eq!(exported.attributes, original.attributes, "resource {} {} attributes should be unchanged", original.resource_type, original.id);
        }
    }

    let reimport_dir = temp.path().join("reimported");
    let reimported = import_scenario(&export_dir, &reimport_dir).unwrap();
    let tileset = reimported
        .asset_catalog
        .tilesets
        .iter()
        .find(|tileset| tileset.id == "landlook-6")
        .expect("reimported custom landlook 6 tileset should exist");
    assert!(tileset.available, "replaced custom landlook atlas should be previewable after reimport");
    assert_eq!(tileset.pict_id, Some(306));
}

#[test]
fn rules_spell_export_mutates_only_owned_record_byte_and_preserves_tail() {
    let Some(source) = out_fixture_path("Begining of the End") else {
        eprintln!("Skipping rules spell fixture; Begining of the End is absent.");
        return;
    };
    let temp = tempdir().unwrap();
    let project_dir = temp.path().join("project");
    let export_dir = temp.path().join("exported");
    import_scenario(&source, &project_dir).unwrap();
    let mut project = open_project(&project_dir).unwrap();
    assert!(
        !project.spell_overrides.is_empty(),
        "fixture should import custom spell records"
    );
    let original = fs::read(source.join("Data Spell")).unwrap();
    let old_cost = project.spell_overrides[0].cost;
    project.spell_overrides[0].cost = old_cost.wrapping_add(1);
    export_project(
        &project_dir,
        &project,
        &export_dir,
        ScenarioTarget::ProvidencePortableFolder,
    )
    .unwrap();
    let exported = fs::read(export_dir.join("Data Spell")).unwrap();
    assert_eq!(exported.len(), original.len(), "Data Spell tail should remain present");
    assert_eq!(
        changed_offsets(&original, &exported),
        vec![10],
        "only the first custom spell cost byte should change"
    );
}

#[test]
fn rules_custom_spell_name_export_updates_only_spell_str_resource() {
    let Some(source) = fixture_path("Tutorial") else {
        eprintln!("Skipping custom spell name fixture; Tutorial is absent.");
        return;
    };
    let source_resource = source.join("Data Spell.rsrc");
    if !source_resource.is_file() {
        eprintln!("Skipping custom spell name fixture; Tutorial has no Data Spell.rsrc.");
        return;
    }
    let temp = tempdir().unwrap();
    let project_dir = temp.path().join("project");
    let export_dir = temp.path().join("exported");
    import_scenario(&source, &project_dir).unwrap();
    let mut project = open_project(&project_dir).unwrap();
    assert!(
        !project.spell_overrides.is_empty(),
        "fixture should import custom spell records"
    );
    let original_data_spell = fs::read(source.join("Data Spell")).unwrap();
    let original_resource_bytes = fs::read(&source_resource).unwrap();
    let original_resources = resource_entries_by_key(&original_resource_bytes);

    project.spell_overrides[0].display_name = "Providence Probe".to_string();
    export_project(
        &project_dir,
        &project,
        &export_dir,
        ScenarioTarget::ProvidencePortableFolder,
    )
    .unwrap();
    assert_eq!(
        fs::read(export_dir.join("Data Spell")).unwrap(),
        original_data_spell,
        "renaming a custom spell should not mutate Data Spell record bytes"
    );

    let exported_resource_bytes = fs::read(export_dir.join("Data Spell.rsrc")).unwrap();
    let exported_resources = resource_entries_by_key(&exported_resource_bytes);
    assert_eq!(original_resources.keys().collect::<Vec<_>>(), exported_resources.keys().collect::<Vec<_>>());
    for (key, original) in &original_resources {
        if key == &("STR#".to_string(), 5000) {
            continue;
        }
        assert_eq!(
            Some(original),
            exported_resources.get(key),
            "resource {key:?} should be preserved when one custom spell name changes"
        );
    }
    let updated = exported_resources
        .get(&("STR#".to_string(), 5000))
        .expect("exported Data Spell.rsrc should keep STR# 5000");
    let names = decode_string_list_resource(&updated.data);
    assert_eq!(names.first().map(String::as_str), Some("Providence Probe"));

    let reimport_dir = temp.path().join("reimported");
    let reimported = import_scenario(&export_dir, &reimport_dir).unwrap();
    assert_eq!(
        reimported.spell_overrides.first().map(|record| record.display_name.as_str()),
        Some("Providence Probe")
    );
}

#[test]
fn rules_custom_race_caste_name_export_updates_only_custom_names_str_resources() {
    let Some(custom_names) = custom_names_fixture_path() else {
        eprintln!("Skipping custom race/caste name fixture; bundled Custom Names.rsrc is absent.");
        return;
    };
    let temp = tempdir().unwrap();
    let source = temp.path().join("Scenario With Rule Names");
    fs::create_dir_all(source.join("Data Files")).unwrap();
    fs::write(source.join("Data Race"), vec![0u8; realmz_providence_lib::realmz::RACE_BYTES * 70]).unwrap();
    fs::write(source.join("Data Caste"), vec![0u8; realmz_providence_lib::realmz::CASTE_BYTES * 30]).unwrap();
    fs::copy(&custom_names, source.join("Data Files").join("Custom Names.rsrc")).unwrap();

    let project_dir = temp.path().join("project");
    let export_dir = temp.path().join("exported");
    import_scenario(&source, &project_dir).unwrap();
    let mut project = open_project(&project_dir).unwrap();
    let original_race = fs::read(source.join("Data Race")).unwrap();
    let original_caste = fs::read(source.join("Data Caste")).unwrap();
    let original_resource_bytes = fs::read(&custom_names).unwrap();
    let original_resources = resource_entries_by_key(&original_resource_bytes);

    project.rule_names.race_names[19] = "Providence Race".to_string();
    project.rule_names.caste_names[20] = "Providence Caste".to_string();
    project.rule_names.authored = true;
    export_project(
        &project_dir,
        &project,
        &export_dir,
        ScenarioTarget::ProvidencePortableFolder,
    )
    .unwrap();

    assert_eq!(
        fs::read(export_dir.join("Data Race")).unwrap(),
        original_race,
        "renaming a custom race should not mutate Data Race bytes"
    );
    assert_eq!(
        fs::read(export_dir.join("Data Caste")).unwrap(),
        original_caste,
        "renaming a custom caste should not mutate Data Caste bytes"
    );
    let exported_resource_bytes = fs::read(export_dir.join("Data Files").join("Custom Names.rsrc")).unwrap();
    let exported_resources = resource_entries_by_key(&exported_resource_bytes);
    assert_eq!(original_resources.keys().collect::<Vec<_>>(), exported_resources.keys().collect::<Vec<_>>());
    for (key, original) in &original_resources {
        if key == &("STR#".to_string(), 129) || key == &("STR#".to_string(), 131) {
            continue;
        }
        assert_eq!(
            Some(original),
            exported_resources.get(key),
            "resource {key:?} should be preserved when custom race/caste names change"
        );
    }
    let race_names = decode_string_list_resource(
        &exported_resources
            .get(&("STR#".to_string(), 129))
            .expect("Custom Names.rsrc should keep STR# 129")
            .data,
    );
    let caste_names = decode_string_list_resource(
        &exported_resources
            .get(&("STR#".to_string(), 131))
            .expect("Custom Names.rsrc should keep STR# 131")
            .data,
    );
    assert_eq!(race_names.get(19).map(String::as_str), Some("Providence Race"));
    assert_eq!(caste_names.get(20).map(String::as_str), Some("Providence Caste"));

    let reimport_dir = temp.path().join("reimported");
    let reimported = import_scenario(&export_dir, &reimport_dir).unwrap();
    assert_eq!(reimported.rule_names.race_names.get(19).map(String::as_str), Some("Providence Race"));
    assert_eq!(reimported.rule_names.caste_names.get(20).map(String::as_str), Some("Providence Caste"));
}

#[test]
fn rules_custom_race_caste_name_export_synthesizes_custom_names_resource() {
    let temp = tempdir().unwrap();
    let project_dir = temp.path().join("Blank Rule Names.providence");
    let export_dir = temp.path().join("exported");
    let mut project = create_project("Blank Rule Names".to_string(), &project_dir).unwrap();
    let mut buffers = BTreeMap::new();
    buffers.insert("Data Race".to_string(), vec![0u8; realmz_providence_lib::realmz::RACE_BYTES * 70]);
    buffers.insert("Data Caste".to_string(), vec![0u8; realmz_providence_lib::realmz::CASTE_BYTES * 30]);
    let parsed = parse_scenario_buffers(&buffers);
    project.race_overrides.push(
        parsed
            .race_overrides
            .into_iter()
            .find(|record| record.id == 19)
            .expect("zero race table should include record 19"),
    );
    project.caste_overrides.push(
        parsed
            .caste_overrides
            .into_iter()
            .find(|record| record.id == 20)
            .expect("zero caste table should include record 20"),
    );
    project.rule_names.race_names[19] = "New Providence Race".to_string();
    project.rule_names.caste_names[20] = "New Providence Caste".to_string();
    project.rule_names.authored = true;

    export_project(
        &project_dir,
        &project,
        &export_dir,
        ScenarioTarget::ProvidencePortableFolder,
    )
    .unwrap();

    assert!(export_dir.join("Data Race").is_file());
    assert!(export_dir.join("Data Caste").is_file());
    let exported_resource_bytes = fs::read(export_dir.join("Data Files").join("Custom Names.rsrc")).unwrap();
    let exported_resources = resource_entries_by_key(&exported_resource_bytes);
    let race_names = decode_string_list_resource(
        &exported_resources
            .get(&("STR#".to_string(), 129))
            .expect("synthesized Custom Names.rsrc should contain STR# 129")
            .data,
    );
    let caste_names = decode_string_list_resource(
        &exported_resources
            .get(&("STR#".to_string(), 131))
            .expect("synthesized Custom Names.rsrc should contain STR# 131")
            .data,
    );
    assert_eq!(race_names.get(19).map(String::as_str), Some("New Providence Race"));
    assert_eq!(caste_names.get(20).map(String::as_str), Some("New Providence Caste"));
}

#[test]
fn rules_race_export_mutates_only_owned_record_fields() {
    let Some(source) = out_fixture_path("Araman's Ring") else {
        eprintln!("Skipping rules race fixture; Araman's Ring is absent.");
        return;
    };
    let temp = tempdir().unwrap();
    let project_dir = temp.path().join("project");
    let export_dir = temp.path().join("exported");
    import_scenario(&source, &project_dir).unwrap();
    let mut project = open_project(&project_dir).unwrap();
    assert!(
        !project.race_overrides.is_empty(),
        "fixture should import race override records"
    );
    let original = fs::read(source.join("Data Race")).unwrap();
    project.race_overrides[0].base_move = project.race_overrides[0].base_move.wrapping_add(1);
    if project.race_overrides[0].can_caste.len() > 1 {
        project.race_overrides[0].can_caste[1] ^= 1;
    }
    if let Some(mask) = project.race_overrides[0].item_types.first_mut() {
        *mask ^= 1;
    }
    export_project(
        &project_dir,
        &project,
        &export_dir,
        ScenarioTarget::ProvidencePortableFolder,
    )
    .unwrap();
    let exported = fs::read(export_dir.join("Data Race")).unwrap();
    assert_eq!(exported.len(), original.len());
    let changed = changed_offsets(&original, &exported);
    assert!(!changed.is_empty(), "fixture mutation should change race bytes");
    assert!(
        changed.iter().all(|offset| matches!(*offset, 196..=197 | 209 | 336..=339)),
        "unexpected race byte mutation(s): {changed:?}"
    );
}

#[test]
fn rules_caste_export_mutates_only_owned_record_fields() {
    let Some(source) = out_fixture_path("Araman's Ring") else {
        eprintln!("Skipping rules caste fixture; Araman's Ring is absent.");
        return;
    };
    let temp = tempdir().unwrap();
    let project_dir = temp.path().join("project");
    let export_dir = temp.path().join("exported");
    import_scenario(&source, &project_dir).unwrap();
    let mut project = open_project(&project_dir).unwrap();
    assert!(
        !project.caste_overrides.is_empty(),
        "fixture should import caste override records"
    );
    let original = fs::read(source.join("Data Caste")).unwrap();
    project.caste_overrides[0].victory[0] = project.caste_overrides[0].victory[0].wrapping_add(1);
    project.caste_overrides[0].start_items[0] = project.caste_overrides[0].start_items[0].wrapping_add(1);
    project.caste_overrides[0].attacks[0] ^= 1;
    if let Some(mask) = project.caste_overrides[0].item_types.first_mut() {
        *mask ^= 1;
    }
    export_project(
        &project_dir,
        &project,
        &export_dir,
        ScenarioTarget::ProvidencePortableFolder,
    )
    .unwrap();
    let exported = fs::read(export_dir.join("Data Caste")).unwrap();
    assert_eq!(exported.len(), original.len());
    let changed = changed_offsets(&original, &exported);
    assert!(!changed.is_empty(), "fixture mutation should change caste bytes");
    assert!(
        changed
            .iter()
            .all(|offset| matches!(*offset, 264..=267 | 386..=387 | 426 | 436..=439)),
        "unexpected caste byte mutation(s): {changed:?}"
    );
}

#[test]
fn imports_destroy_scenario_local_map_icons() {
    let Some(source) = fixture_path("Destroy the Necronomicon") else {
        eprintln!("Skipping Destroy the Necronomicon fixture; base scenario is absent.");
        return;
    };
    let temp = tempdir().unwrap();
    let project_dir = temp.path().join("destroy_the_necronomicon");
    let project = import_scenario(&source, &project_dir).unwrap();
    for icon_id in [-102, -23, -22] {
        let relative_path = format!("assets/icons/icon_{icon_id}.png");
        assert!(
            project_dir.join(&relative_path).is_file(),
            "{relative_path} should be decoded from the scenario resource fork"
        );
        assert!(
            project.asset_catalog.icons.iter().any(|asset| {
                asset.resource_type == "cicn"
                    && asset.resource_id == icon_id as i32
                    && asset.preview_path.as_deref() == Some(relative_path.as_str())
            }),
            "cicn {icon_id} should be cataloged as a project-local map icon"
        );
    }
    let missing_icon_diagnostics: Vec<_> = project
        .diagnostics
        .iter()
        .filter(|diagnostic| diagnostic.code == "missing-map-icon-overlay")
        .map(|diagnostic| diagnostic.message.as_str())
        .collect();
    assert!(
        missing_icon_diagnostics.is_empty(),
        "scenario-local map icons should satisfy negative map icon references: {missing_icon_diagnostics:?}"
    );
    fs::remove_file(project_dir.join("assets/icons/icon_-102.png")).unwrap();
    let reopened = open_project(&project_dir).unwrap();
    assert!(
        project_dir.join("assets/icons/icon_-102.png").is_file(),
        "opening an existing project should restore scenario-local map icon previews from raw sources"
    );
    assert!(
        reopened.asset_catalog.icons.iter().any(|asset| {
            asset.resource_type == "cicn"
                && asset.resource_id == -102
                && asset.preview_path.as_deref() == Some("assets/icons/icon_-102.png")
        }),
        "reopened project should retain the scenario-local pyramid icon preview path"
    );
}

#[test]
fn imports_war_scenario_local_monster_icons() {
    let Some(source) = fixture_path("War in the Sword Lands") else {
        eprintln!("Skipping War in the Sword Lands fixture; base scenario is absent.");
        return;
    };
    let temp = tempdir().unwrap();
    let project_dir = temp.path().join("war_in_the_sword_lands");
    let project = import_scenario(&source, &project_dir).unwrap();
    let expected_icon_ids = [2314, 2316, 2322, 2334, 2350, 2361, 2373];
    for icon_id in expected_icon_ids {
        let relative_path = format!("assets/icons/icon_{icon_id}.png");
        assert!(
            project_dir.join(&relative_path).is_file(),
            "{relative_path} should be decoded from the scenario resource fork"
        );
        assert!(
            project.asset_catalog.icons.iter().any(|asset| {
                asset.resource_type == "cicn"
                    && asset.resource_id == icon_id as i32
                    && asset.preview_path.as_deref() == Some(relative_path.as_str())
            }),
            "cicn {icon_id} should be cataloged as a project-local monster icon"
        );
    }
    for monster_name in [
        "Carrion Slug",
        "Dragon Lizard",
        "Sshrisk",
        "Dune Spider",
        "Giant Troll",
        "Giant Rat",
        "Silt Spider",
    ] {
        let monster = project
            .monsters
            .iter()
            .find(|monster| monster.display_name == monster_name)
            .unwrap_or_else(|| panic!("{monster_name} should be present in the War monster list"));
        let relative_path = format!("assets/icons/icon_{}.png", monster.icon_id);
        assert!(
            project_dir.join(&relative_path).is_file(),
            "{monster_name} should have a decoded project-local monster preview at {relative_path}"
        );
    }
    let missing_icon_diagnostics: Vec<_> = project
        .diagnostics
        .iter()
        .filter(|diagnostic| diagnostic.code == "missing-monster-icon-preview")
        .map(|diagnostic| diagnostic.message.as_str())
        .collect();
    assert!(
        missing_icon_diagnostics.is_empty(),
        "scenario-local monster icons should satisfy War monster icon references: {missing_icon_diagnostics:?}"
    );
    fs::remove_file(project_dir.join("assets/icons/icon_2373.png")).unwrap();
    let reopened = open_project(&project_dir).unwrap();
    assert!(
        project_dir.join("assets/icons/icon_2373.png").is_file(),
        "opening an existing project should restore scenario-local monster icon previews from raw sources"
    );
    assert!(
        reopened.asset_catalog.icons.iter().any(|asset| {
            asset.resource_type == "cicn"
                && asset.resource_id == 2373
                && asset.preview_path.as_deref() == Some("assets/icons/icon_2373.png")
        }),
        "reopened project should retain the scenario-local Giant Troll icon preview path"
    );
}

#[test]
fn generated_corpus_summary_contract_is_readable() {
    let Some(summary) = generated_corpus_summary() else {
        eprintln!("Skipping generated corpus expectations; Scenario Utility summary is absent.");
        return;
    };
    assert_json_usize(
        "generated corpus discovered count",
        &summary,
        &["total", "discovered"],
        44,
    );
    assert_json_usize(
        "generated corpus analyzed count",
        &summary,
        &["total", "analyzed"],
        44,
    );
    assert_json_usize(
        "generated corpus failure count",
        &summary,
        &["total", "failures"],
        0,
    );
    for file in [
        "Scenario",
        "Global",
        "Data LD",
        "Data DL",
        "Data DD",
        "Data DDD",
        "Data RD",
        "Data RDD",
        "Data ED",
        "Data ED2",
        "Data ED3",
        "Data EDCD",
        "Data MD",
        "Data BD",
        "Data SD",
        "Data SD2",
        "Data MD2",
        "Data TD",
        "Data TD2",
        "Data TD3",
        "Data Solids",
    ] {
        assert_aggregate_key_count(
            "aggregate.filePresence",
            &summary,
            &["aggregate", "filePresence"],
            file,
            44,
        );
    }
    for resource_type in [
        "PICT", "cicn", "STR#", "snd ", "TEXT", "styl", "RLMZ", "vers",
    ] {
        assert!(
            aggregate_key_count(&summary, &["aggregate", "resourceTypes"], resource_type)
                .unwrap_or(0)
                > 0,
            "generated corpus should include {resource_type} resources"
        );
    }
    for opcode in [
        "1:text",
        "39:extend door codes",
        "7:action data / X-AP patch",
        "12:new land icon",
        "2:battle",
        "46:branch on quest flag",
        "13:enable / disable door",
    ] {
        assert!(
            aggregate_key_count(&summary, &["aggregate", "opcodeUsage"], opcode).unwrap_or(0) > 0,
            "generated corpus should include opcode usage for {opcode}"
        );
    }
}

#[test]
#[ignore = "Prints local fixture corpus numbers for refreshing corpus expectations."]
fn print_fixture_corpus_summary() {
    for name in HARDENED_FIXTURES {
        let Some(source) = fixture_path(name) else {
            continue;
        };
        let temp = tempdir().unwrap();
        let project = import_scenario(&source, temp.path().join(name.replace(' ', "_"))).unwrap();
        eprintln!(
            "{name}: maps={} land={} dungeon={} triggers={} map_triggers={} random_rects={} edcd={} actions={} records={} entities={} links={} diagnostics={} validation_errors={} validation_warnings={}",
            project.maps.len(),
            project.maps.iter().filter(|map| map.level_type.as_str() == "land").count(),
            project.maps.iter().filter(|map| map.level_type.as_str() == "dungeon").count(),
            project.triggers.len(),
            project.triggers.iter().filter(|trigger| trigger.source != "Data ED3" && trigger.active).count(),
            project.random_levels.iter().map(|level| level.rects.len()).sum::<usize>(),
            project.extracodes.len(),
            project.triggers.iter().map(|trigger| trigger.actions.len()).sum::<usize>(),
            project.semantic_schema.records.len(),
            project.semantic_schema.entities.len(),
            project.semantic_schema.links.len(),
            project.semantic_schema.diagnostics.len(),
            project.validation.errors.len(),
            project.validation.warnings.len(),
        );
    }
}

fn assert_generated_corpus_expectations(name: &str, source: &Path, project: &ProvidenceProject) {
    let Some(expected) = generated_fixture_summary(name) else {
        eprintln!("Skipping generated corpus comparison for {name}; expectation not found.");
        return;
    };
    if let Some(mismatch) = generated_fixture_file_mismatch(source, &expected) {
        eprintln!(
            "Skipping generated corpus comparison for {name}; local fixture no longer matches generated corpus: {mismatch}."
        );
        return;
    }
    let counts = expected.get("counts").unwrap_or(&Value::Null);
    assert_expected_count(name, "levels", project.maps.len(), counts);
    assert_expected_count(
        name,
        "landLevels",
        project
            .maps
            .iter()
            .filter(|map| map.level_type.as_str() == "land")
            .count(),
        counts,
    );
    assert_expected_count(
        name,
        "dungeonLevels",
        project
            .maps
            .iter()
            .filter(|map| map.level_type.as_str() == "dungeon")
            .count(),
        counts,
    );
    assert_expected_count(name, "doorRecords", project.triggers.len(), counts);
    assert_expected_count(
        name,
        "randomRects",
        project
            .random_levels
            .iter()
            .map(|level| level.rects.len())
            .sum(),
        counts,
    );
    assert_expected_count(name, "extracodes", project.extracodes.len(), counts);
    assert_expected_record_count(
        name,
        "simpleEncounters",
        "simpleEncounters",
        project.records.counts.get("Data ED").copied().unwrap_or(0),
        &expected,
    );
    assert_expected_record_count(
        name,
        "complexEncounters",
        "complexEncounters",
        project.records.counts.get("Data ED2").copied().unwrap_or(0),
        &expected,
    );
    assert_generated_file_inventory(name, project, &expected);
    assert_generated_resource_inventory(name, project, &expected);
    assert_generated_schema_floor(name, project, &expected);
    assert_generated_diagnostics(name, project, &expected);
}

fn assert_fixture_contracts(name: &str, project: &ProvidenceProject) {
    let schema = &project.semantic_schema;
    assert!(
        project.validation.errors.is_empty(),
        "{name} should import without validation errors: {:?}",
        project.validation.errors
    );
    assert_entity_count_eq(
        name,
        project,
        "render-profile",
        project.maps.len(),
        "one render profile per map",
    );
    assert!(
        schema
            .links
            .iter()
            .filter(|link| link.kind == "has_render_profile")
            .count()
            >= project.maps.len(),
        "{name} should link every map to a render profile"
    );
    assert!(
        schema
            .entities
            .iter()
            .filter(|entity| entity.entity_type == "runtime-cache")
            .count()
            >= 8,
        "{name} should expose authored/runtime cache relationships"
    );
    assert_entity_count_eq(
        name,
        project,
        "random-region",
        project
            .random_levels
            .iter()
            .map(|level| level.rects.len())
            .sum(),
        "one semantic random region per decoded random rectangle",
    );

    match name {
        "City of Bywater" => {
            assert_link_kind(name, project, "shows_message");
            assert_link_kind(name, project, "starts_battle");
            assert_link_kind(name, project, "uses_map_record");
            assert_link_kind(name, project, "describes_map");
            assert_link_kind(name, project, "names_map_level");
            assert!(
                project
                    .maps
                    .iter()
                    .any(|map| !map.name.starts_with("Land Level")
                        && !map.name.starts_with("Dungeon Level")),
                "City of Bywater should promote at least one resource-backed map name"
            );
        }
        "Prelude to Pestilence" => {
            assert!(
                project
                    .maps
                    .iter()
                    .any(|map| map.level_type.as_str() == "dungeon"),
                "Prelude should include dungeon maps"
            );
            assert!(
                schema
                    .links
                    .iter()
                    .any(|link| { link.kind == "renders_with" && link.to == "resource:PICT:302" }),
                "Prelude dungeon render profiles should point to shared PICT 302 provenance"
            );
            assert_resource_type_at_least(name, project, "cicn", 37);
            assert_resource_type_at_least(name, project, "snd ", 2);
        }
        "War in the Sword Lands" => {
            assert_resource_type_at_least(name, project, "cicn", 486);
            assert_resource_type_at_least(name, project, "PICT", 14);
            assert!(
                project.semantic_schema.summary.link_count >= 75_000,
                "War should remain the large semantic link stress fixture"
            );
            assert_alignment_issue(name, project);
        }
        "Mithril Vault" => {
            assert_resource_type_at_least(name, project, "cicn", 270);
            assert_resource_type_at_least(name, project, "snd ", 29);
            assert!(
                schema.links.iter().any(|link| link.kind == "styled_by")
                    || schema.links.iter().any(|link| link.kind == "styles_text"),
                "Mithril should preserve TEXT/styl resource relationships"
            );
            assert_alignment_issue(name, project);
        }
        "Wrath of the Mind Lords" => {
            assert_resource_type_at_least(name, project, "cicn", 498);
            if has_source_file(project, "Data MENU") {
                assert!(
                    schema
                        .entities
                        .iter()
                        .any(|entity| entity.entity_type == "menu-cache"),
                    "Wrath should expose Data MENU as a semantic menu-cache entity when the file exists"
                );
            }
            assert!(
                schema
                    .entities
                    .iter()
                    .any(|entity| entity.id == "runtime-cache:menu"),
                "Wrath should model Data MENU as generated menu cache evidence"
            );
            assert!(
                project.semantic_schema.summary.link_count >= 47_000,
                "Wrath should remain a large-script semantic link fixture"
            );
            assert_alignment_issue(name, project);
        }
        "Tutorial" => {
            assert_resource_type_at_least(name, project, "TEXT", 7);
            assert_resource_type_at_least(name, project, "STR#", 5);
            assert_alignment_issue(name, project);
            assert!(
                schema
                    .links
                    .iter()
                    .any(|link| link.kind == "uses_parameter_row"),
                "Tutorial should exercise EDCD parameter row links"
            );
        }
        _ => {}
    }
}

fn assert_generated_file_inventory(name: &str, project: &ProvidenceProject, expected: &Value) {
    let Some(files) = expected.get("files").and_then(Value::as_object) else {
        return;
    };
    let actual_files: BTreeMap<&str, _> = project
        .source
        .files
        .iter()
        .map(|file| (file.name.as_str(), file))
        .collect();
    for (file_name, expected_file) in files {
        if expected_file.get("exists").and_then(Value::as_bool) == Some(false) {
            assert!(
                !actual_files.contains_key(file_name.as_str()),
                "{name} should not import absent generated corpus file {file_name}"
            );
            continue;
        }
        let actual = actual_files
            .get(file_name.as_str())
            .unwrap_or_else(|| panic!("{name} should import generated corpus file {file_name}"));
        let Some(expected_bytes) = expected_file.get("bytes").and_then(Value::as_u64) else {
            continue;
        };
        assert_eq!(
            actual.bytes, expected_bytes,
            "{name} {file_name} byte count should match generated corpus"
        );
        if let Some(prefix) = expected_file.get("sha256").and_then(Value::as_str) {
            assert!(
                actual.sha256.starts_with(prefix),
                "{name} {file_name} sha256 should start with generated corpus prefix {prefix}"
            );
        }
    }
}

fn assert_generated_resource_inventory(name: &str, project: &ProvidenceProject, expected: &Value) {
    let actual = scenario_supplied_resource_counts(project);
    let Some(resource_types) = expected.get("resourceTypes").and_then(Value::as_array) else {
        return;
    };
    for resource in resource_types {
        let resource_type = resource.get("key").and_then(Value::as_str).unwrap_or("");
        let expected_count = resource.get("count").and_then(Value::as_u64).unwrap_or(0) as usize;
        let actual_count = actual.get(resource_type).copied().unwrap_or(0);
        assert!(
            actual_count >= expected_count,
            "{name} should preserve at least generated resource count for {resource_type:?}: {actual_count} < {expected_count}"
        );
    }
}

fn assert_generated_schema_floor(name: &str, project: &ProvidenceProject, expected: &Value) {
    let Some(summary) = expected.get("schemaSummary") else {
        return;
    };
    for (label, actual, key) in [
        (
            "sources",
            project.semantic_schema.sources.len(),
            "sourceCount",
        ),
        (
            "records",
            project.semantic_schema.records.len(),
            "recordCount",
        ),
        (
            "entities",
            project.semantic_schema.entities.len(),
            "entityCount",
        ),
        ("links", project.semantic_schema.links.len(), "linkCount"),
    ] {
        let expected_min = summary.get(key).and_then(Value::as_u64).unwrap_or(0) as usize;
        assert!(
            actual >= expected_min,
            "{name} should preserve at least generated corpus {label} coverage: {actual} < {expected_min}"
        );
    }
}

fn assert_generated_diagnostics(name: &str, project: &ProvidenceProject, expected: &Value) {
    let unknown_count = expected
        .get("unknownOpcodes")
        .and_then(Value::as_array)
        .map(Vec::len)
        .unwrap_or(0);
    if unknown_count > 0 {
        assert!(
            project
                .semantic_schema
                .diagnostics
                .iter()
                .any(|diagnostic| diagnostic.diagnostic_type == "dispatcher-noop"),
            "{name} should keep generated-corpus dispatcher no-op opcodes visible as diagnostics"
        );
    }
    let missing_edcd_count = expected
        .get("missingExtracodes")
        .and_then(Value::as_array)
        .map(Vec::len)
        .unwrap_or(0);
    if missing_edcd_count > 0 {
        assert!(
            project
                .semantic_schema
                .diagnostics
                .iter()
                .any(|diagnostic| diagnostic.diagnostic_type == "missing-edcd-row"),
            "{name} should keep generated-corpus missing EDCD rows visible as diagnostics"
        );
    }
    let alignment_count = expected
        .get("alignmentIssues")
        .and_then(Value::as_array)
        .map(Vec::len)
        .unwrap_or(0);
    if alignment_count > 0 {
        assert_alignment_issue(name, project);
    }
}

fn generated_corpus_summary() -> Option<Value> {
    let path =
        Path::new("F:/Realmz Scenario Utility/docs/scenario-format/generated/corpus-summary.json");
    let text = fs::read_to_string(path).ok()?;
    serde_json::from_str(&text).ok()
}

fn generated_fixture_summary(name: &str) -> Option<Value> {
    let summary = generated_corpus_summary()?;
    summary
        .get("scenarios")?
        .as_array()?
        .iter()
        .find(|scenario| {
            scenario.get("name").and_then(Value::as_str) == Some(name)
                && scenario.get("root").and_then(Value::as_str)
                    == Some("F:\\Realmz\\base\\Realmz\\Scenarios")
        })
        .cloned()
        .or_else(|| {
            summary
                .get("scenarios")?
                .as_array()?
                .iter()
                .find(|scenario| scenario.get("name").and_then(Value::as_str) == Some(name))
                .cloned()
        })
}

fn assert_expected_count(name: &str, field: &str, actual: usize, counts: &Value) {
    let expected = counts
        .get(field)
        .and_then(Value::as_u64)
        .unwrap_or_else(|| {
            panic!("generated corpus fixture for {name} should include count {field}")
        }) as usize;
    assert_eq!(
        actual, expected,
        "{name} {field} should match generated corpus"
    );
}

fn assert_expected_record_count(
    name: &str,
    count_field: &str,
    alignment_name: &str,
    actual: usize,
    expected: &Value,
) {
    let corpus_count = expected
        .get("counts")
        .and_then(|counts| counts.get(count_field))
        .and_then(Value::as_u64)
        .unwrap_or_else(|| {
            panic!("generated corpus fixture for {name} should include count {count_field}")
        }) as usize;
    let expected_full_records = expected
        .get("alignmentIssues")
        .and_then(Value::as_array)
        .and_then(|issues| {
            issues
                .iter()
                .find(|issue| issue.get("name").and_then(Value::as_str) == Some(alignment_name))
        })
        .and_then(|issue| issue.get("fullRecords"))
        .and_then(Value::as_u64)
        .map(|value| value as usize)
        .unwrap_or(corpus_count);
    assert_eq!(
        actual, expected_full_records,
        "{name} {count_field} should match generated full-record corpus count"
    );
}

fn assert_json_usize(label: &str, value: &Value, path: &[&str], expected: usize) {
    let actual = json_path(value, path)
        .and_then(Value::as_u64)
        .unwrap_or_else(|| panic!("{label} should be present in generated corpus"))
        as usize;
    assert_eq!(actual, expected, "{label} should match");
}

fn aggregate_key_count(value: &Value, path: &[&str], key: &str) -> Option<usize> {
    json_path(value, path)?
        .as_array()?
        .iter()
        .find(|entry| entry.get("key").and_then(Value::as_str) == Some(key))?
        .get("count")?
        .as_u64()
        .map(|count| count as usize)
}

fn assert_aggregate_key_count(label: &str, value: &Value, path: &[&str], key: &str, count: usize) {
    assert_eq!(
        aggregate_key_count(value, path, key),
        Some(count),
        "{label} should include {key}={count}"
    );
}

fn json_path<'a>(value: &'a Value, path: &[&str]) -> Option<&'a Value> {
    let mut current = value;
    for key in path {
        current = current.get(*key)?;
    }
    Some(current)
}

fn scenario_supplied_resource_counts(project: &ProvidenceProject) -> BTreeMap<String, usize> {
    let mut counts = BTreeMap::new();
    for entity in project
        .semantic_schema
        .entities
        .iter()
        .filter(|entity| entity.entity_type == "resource")
    {
        if entity
            .summary
            .get("sha256")
            .and_then(Value::as_str)
            .is_none()
        {
            continue;
        }
        if let Some(resource_type) = entity.summary.get("type").and_then(Value::as_str) {
            *counts.entry(resource_type.to_string()).or_default() += 1;
        }
    }
    counts
}

fn assert_resource_type_at_least(
    name: &str,
    project: &ProvidenceProject,
    resource_type: &str,
    minimum: usize,
) {
    let counts = scenario_supplied_resource_counts(project);
    let actual = counts.get(resource_type).copied().unwrap_or(0);
    assert!(
        actual >= minimum,
        "{name} should expose at least {minimum} scenario-supplied {resource_type:?} resources; got {actual}"
    );
}

fn assert_entity_count_eq(
    name: &str,
    project: &ProvidenceProject,
    entity_type: &str,
    expected: usize,
    reason: &str,
) {
    let actual = project
        .semantic_schema
        .entities
        .iter()
        .filter(|entity| entity.entity_type == entity_type)
        .count();
    assert_eq!(
        actual, expected,
        "{name} should expose {entity_type} count for {reason}"
    );
}

fn assert_link_kind(name: &str, project: &ProvidenceProject, kind: &str) {
    assert!(
        project
            .semantic_schema
            .links
            .iter()
            .any(|link| link.kind == kind),
        "{name} should emit {kind} semantic links"
    );
}

fn assert_alignment_issue(name: &str, project: &ProvidenceProject) {
    assert!(
        project
            .records
            .alignments
            .iter()
            .any(|alignment| alignment.trailing_bytes > 0),
        "{name} should preserve generated corpus trailing/partial record alignment evidence"
    );
}

fn has_source_file(project: &ProvidenceProject, name: &str) -> bool {
    project.source.files.iter().any(|file| file.name == name)
}

fn assert_semantic_schema(name: &str, source: &Path, project: &ProvidenceProject) {
    let schema = &project.semantic_schema;
    assert_eq!(
        schema.schema_version,
        SEMANTIC_SCHEMA_VERSION,
        "{name} from {} should use semantic schema version {SEMANTIC_SCHEMA_VERSION}",
        source.display()
    );
    assert!(
        !schema.sources.is_empty(),
        "{name} should inventory sources"
    );
    assert!(
        !schema.records.is_empty(),
        "{name} should inventory records"
    );
    assert!(
        !schema.entities.is_empty(),
        "{name} should inventory entities"
    );
    assert!(
        !schema.links.is_empty(),
        "{name} should build semantic links"
    );

    if !project.extracodes.is_empty()
        && project
            .triggers
            .iter()
            .flat_map(|trigger| trigger.actions.iter())
            .any(|action| matches!(action.code, 7 | 39))
    {
        assert!(
            schema
                .links
                .iter()
                .any(|link| link.to.starts_with("record:Data EDCD:")
                    && link.kind == "uses_parameter_row"),
            "{name} should link trigger actions to EDCD rows"
        );
    }

    if project.records.counts.get("Data ED").copied().unwrap_or(0) > 0 {
        assert!(
            schema
                .entities
                .iter()
                .any(|entity| entity.entity_type == "simple encounter"),
            "{name} should expose Data ED encounters"
        );
    }
    if project.records.counts.get("Data ED2").copied().unwrap_or(0) > 0 {
        assert!(
            schema
                .entities
                .iter()
                .any(|entity| entity.entity_type == "complex encounter"),
            "{name} should expose Data ED2 encounters"
        );
    }
    if project.records.counts.get("Data BD").copied().unwrap_or(0) > 0 {
        assert!(
            schema.links.iter().any(|link| matches!(
                link.kind.as_str(),
                "uses_monster"
                    | "shows_message_before"
                    | "shows_message_after"
                    | "calls_battle_macro"
            )),
            "{name} should link battle records to related entities when fields are present"
        );
    }
    if project.records.counts.get("Data MD2").copied().unwrap_or(0) > 0 {
        assert!(
            schema.links.iter().any(|link| link.kind == "describes_map"),
            "{name} should link map records to map entities when references resolve"
        );
    }
    if source.join("Scenario.rsrc").is_file() {
        let resource_types: BTreeSet<String> = schema
            .entities
            .iter()
            .filter(|entity| entity.entity_type == "resource type")
            .filter_map(|entity| {
                entity
                    .summary
                    .get("type")
                    .and_then(Value::as_str)
                    .map(str::to_string)
            })
            .collect();
        for expected in ["PICT", "cicn", "STR#"] {
            assert!(
                resource_types.contains(expected),
                "{name} should inventory {expected} resources"
            );
        }
        let has_map_names_resource = schema.entities.iter().any(|entity| {
            entity.entity_type == "resource"
                && entity.summary.get("type").and_then(Value::as_str) == Some("STR#")
                && entity.summary.get("name").and_then(Value::as_str) == Some("Map Names")
        });
        if has_map_names_resource {
            assert!(
                schema
                    .links
                    .iter()
                    .any(|link| link.kind == "names_map_level"),
                "{name} should link STR# map names to map entities"
            );
            assert!(
                project
                    .maps
                    .iter()
                    .any(|map| !map.name.ends_with(&format!("level {}", map.index))),
                "{name} should promote resource-backed map names into imported map labels"
            );
        }
    }
    assert!(
        schema
            .entities
            .iter()
            .any(|entity| entity.entity_type == "runtime-cache"),
        "{name} should model generated runtime caches"
    );
    assert!(
        schema
            .entities
            .iter()
            .any(|entity| entity.entity_type == "render-profile"),
        "{name} should expose render profile entities"
    );
    assert!(
        schema
            .entities
            .iter()
            .any(|entity| entity.entity_type == "action-slot"),
        "{name} should expose action slot entities"
    );
    assert_opcode_edcd_semantics(name, project);
    assert!(
        schema
            .links
            .iter()
            .any(|link| link.kind == "copied_to_cache"),
        "{name} should link source containers to runtime caches"
    );
    assert_supporting_record_depth(name, project);
    assert_resource_depth(name, project);
}

fn assert_supporting_record_depth(name: &str, project: &ProvidenceProject) {
    let schema = &project.semantic_schema;
    assert!(
        schema
            .entities
            .iter()
            .any(|entity| entity.entity_type == "scenario"),
        "{name} should expose a scenario metadata entity"
    );
    assert!(
        schema
            .links
            .iter()
            .any(|link| link.kind == "has_source" && link.from.starts_with("scenario:")),
        "{name} should link the scenario entity to its source file"
    );
    if project.records.counts.get("Data TD").copied().unwrap_or(0) > 0 {
        let treasures: Vec<_> = schema
            .entities
            .iter()
            .filter(|entity| entity.entity_type == "treasure")
            .collect();
        assert!(
            treasures
                .iter()
                .any(|entity| entity.summary.get("items").is_some()
                    && entity.summary.get("gold").is_some()),
            "{name} should decode treasure item/reward fields"
        );
        if treasures.iter().any(|entity| {
            entity
                .summary
                .get("itemCount")
                .and_then(Value::as_u64)
                .unwrap_or(0)
                > 0
        }) {
            assert!(
                schema.links.iter().any(|link| link.kind == "gives_item"),
                "{name} should link treasure rewards to item references"
            );
        }
    }
    if project.records.counts.get("Data TD2").copied().unwrap_or(0) > 0 {
        assert!(
            schema.entities.iter().any(|entity| {
                entity.entity_type == "thief-encounter"
                    && entity.summary.get("successText").is_some()
                    && entity.summary.get("promptSounds").is_some()
            }),
            "{name} should decode thief encounter text/sound/code arrays"
        );
    }
    if project.records.counts.get("Data TD3").copied().unwrap_or(0) > 0 {
        assert!(
            schema.entities.iter().any(|entity| {
                entity.entity_type == "timed-encounter"
                    && entity.summary.get("day").is_some()
                    && entity.summary.get("locationKind").is_some()
            }),
            "{name} should decode timed encounter schedule and gate fields"
        );
    }
    if project.records.counts.get("Data CI").copied().unwrap_or(0) > 0 {
        assert!(
            schema.entities.iter().any(|entity| {
                entity.entity_type == "contact-info"
                    && entity.summary.get("scenarioName").is_some()
                    && entity.summary.get("description").is_some()
            }),
            "{name} should decode Data CI contact metadata fields"
        );
        assert!(
            schema
                .links
                .iter()
                .any(|link| link.kind == "has_contact_info"),
            "{name} should link scenario metadata to Data CI"
        );
    }
    if project
        .records
        .counts
        .get("Data MENU")
        .copied()
        .unwrap_or(0)
        > 0
    {
        assert!(
            schema.entities.iter().any(|entity| {
                entity.entity_type == "menu-cache"
                    && entity.summary.get("menuEntries").is_some()
                    && entity
                        .summary
                        .get("generatedCache")
                        .and_then(Value::as_bool)
                        == Some(true)
            }),
            "{name} should decode Data MENU as a generated monster menu cache"
        );
        assert!(
            schema
                .entities
                .iter()
                .any(|entity| entity.id == "runtime-cache:menu"),
            "{name} should model Data MENU as runtime/effective cache evidence"
        );
    }
    if project
        .records
        .counts
        .get("Data Solids")
        .copied()
        .unwrap_or(0)
        > 0
    {
        assert!(
            schema.entities.iter().any(|entity| {
                entity.entity_type == "solidity-table"
                    && entity.summary.get("tableKind").and_then(Value::as_str)
                        == Some("special negative tile solidity")
            }),
            "{name} should decode Data Solids as special negative tile solidity evidence"
        );
    }
}

fn assert_resource_depth(name: &str, project: &ProvidenceProject) {
    let schema = &project.semantic_schema;
    for (resource_type, family) in [
        ("snd ", "sound"),
        ("TEXT", "text"),
        ("styl", "text-style"),
        ("RLMZ", "realmz-metadata"),
    ] {
        let resources: Vec<_> = schema
            .entities
            .iter()
            .filter(|entity| {
                entity.entity_type == "resource"
                    && entity.summary.get("type").and_then(Value::as_str) == Some(resource_type)
            })
            .collect();
        if resources.is_empty() {
            continue;
        }
        assert!(
            resources.iter().any(|entity| {
                entity.summary.get("family").and_then(Value::as_str) == Some(family)
            }),
            "{name} should classify {resource_type} resources as {family}"
        );
    }
    let has_text = schema.entities.iter().any(|entity| {
        entity.entity_type == "resource"
            && entity.summary.get("type").and_then(Value::as_str) == Some("TEXT")
    });
    let has_styl = schema.entities.iter().any(|entity| {
        entity.entity_type == "resource"
            && entity.summary.get("type").and_then(Value::as_str) == Some("styl")
    });
    if has_text && has_styl {
        assert!(
            schema.links.iter().any(|link| link.kind == "styled_by")
                || schema.links.iter().any(|link| link.kind == "styles_text"),
            "{name} should link paired TEXT/styl resources when ids match"
        );
    }
    if schema
        .links
        .iter()
        .any(|link| link.to.starts_with("resource:") && link.kind == "uses_resource")
    {
        assert!(
            schema.entities.iter().any(|entity| {
                entity.entity_type == "resource"
                    && entity
                        .summary
                        .get("sourcePrecedence")
                        .and_then(Value::as_str)
                        .is_some()
            }) || schema.entities.iter().any(|entity| {
                entity.entity_type == "resource"
                    && entity
                        .summary
                        .get("sha256")
                        .and_then(Value::as_str)
                        .is_some()
            }),
            "{name} should distinguish scenario resource bytes from shared fallback references"
        );
    }
}

fn assert_opcode_edcd_semantics(name: &str, project: &ProvidenceProject) {
    let schema = &project.semantic_schema;
    let action_slots: Vec<_> = schema
        .entities
        .iter()
        .filter(|entity| entity.entity_type == "action-slot")
        .collect();
    let edcd_slots: Vec<_> = action_slots
        .iter()
        .copied()
        .filter(|entity| entity.summary.get("edcdUsage").is_some())
        .collect();
    let consuming_actions = project
        .triggers
        .iter()
        .flat_map(|trigger| trigger.actions.iter())
        .filter(|action| consumes_edcd(action.code))
        .count();
    if consuming_actions > 0 {
        assert!(
            !edcd_slots.is_empty(),
            "{name} should summarize EDCD-consuming action slots"
        );
    }
    for entity in edcd_slots {
        let usage = entity.summary.get("edcdUsage").unwrap();
        let row_id = usage.get("rowId").and_then(Value::as_u64).unwrap();
        assert!(
            schema.links.iter().any(|link| {
                link.from == entity.id
                    && link.kind == "uses_parameter_row"
                    && link.to == format!("record:Data EDCD:{row_id}")
            }),
            "{name} action slot {} should link to its EDCD row",
            entity.id
        );
        if let Some(fields) = usage.get("fields").and_then(Value::as_array) {
            if !fields.is_empty() {
                assert_eq!(
                    fields.len(),
                    5,
                    "{name} action slot {} should expose five named EDCD fields",
                    entity.id
                );
                assert!(
                    fields.iter().all(|field| field.get("name").is_some()),
                    "{name} action slot {} should name EDCD fields",
                    entity.id
                );
            }
        }
    }

    let action_codes: BTreeSet<i16> = project
        .triggers
        .iter()
        .flat_map(|trigger| trigger.actions.iter().map(|action| action.code))
        .collect();
    assert_link_when_code_present(
        name,
        project,
        &action_codes,
        &[1, 19, 62, 71, 74, 122],
        "shows_message",
    );
    assert_link_when_code_present(
        name,
        project,
        &action_codes,
        &[2, 48, 56, 107],
        "starts_battle",
    );
    assert_link_when_code_present(name, project, &action_codes, &[4, 5], "starts_encounter");
    assert_link_when_code_present(name, project, &action_codes, &[6, 73], "opens_shop");
    assert_link_when_code_present(
        name,
        project,
        &action_codes,
        &[8, 31, 39, 126],
        "calls_macro",
    );
    assert_link_when_code_present(name, project, &action_codes, &[10], "gives_treasure");
    assert_link_when_code_present(name, project, &action_codes, &[27], "uses_resource");
    assert_link_when_code_present(name, project, &action_codes, &[29, 97], "uses_map_record");
    assert_link_when_code_present(name, project, &action_codes, &[46, 77, 78], "reads_flag");
    assert_link_when_code_present(name, project, &action_codes, &[47, 76], "writes_flag");
    assert_link_when_code_present(
        name,
        project,
        &action_codes,
        &[7, 12, 13, 23, -23, 57, 92, 120],
        "mutates_cache",
    );
    assert_link_when_code_present(name, project, &action_codes, &[12], "mutates_tile");
    assert_link_when_code_present(name, project, &action_codes, &[13], "mutates_trigger");
    assert_link_when_code_present(
        name,
        project,
        &action_codes,
        &[23, -23, 92],
        "mutates_random_region",
    );
    assert_link_when_code_present(
        name,
        project,
        &action_codes,
        &[54],
        "mutates_time_encounter",
    );
    assert_link_when_code_present(
        name,
        project,
        &action_codes,
        &[120, 123, 124, 125, 127],
        "uses_monster",
    );

    if action_codes.iter().any(|code| !is_documented_opcode(*code)) {
        assert!(
            schema
                .diagnostics
                .iter()
                .any(|diagnostic| diagnostic.diagnostic_type == "dispatcher-noop"),
            "{name} should surface dispatcher no-op opcodes as diagnostics"
        );
    }
}

fn assert_link_when_code_present(
    name: &str,
    project: &ProvidenceProject,
    action_codes: &BTreeSet<i16>,
    codes: &[i16],
    link_kind: &str,
) {
    if codes.iter().any(|code| action_codes.contains(code)) {
        assert!(
            project
                .semantic_schema
                .links
                .iter()
                .any(|link| link.kind == link_kind),
            "{name} should emit {link_kind} links when codes {codes:?} are present"
        );
    }
}

fn consumes_edcd(code: i16) -> bool {
    matches!(
        code,
        -23 | 2
            | 3
            | 7
            | 12
            | 13
            | 15
            | 16
            | 17
            | 18
            | 20
            | 21
            | 22
            | 23
            | 30
            | 31
            | 33
            | 37
            | 38
            | 39
            | 41
            | 42
            | 43
            | 45
            | 46
            | 48
            | 50
            | 52
            | 53
            | 54
            | 56
            | 57
            | 58
            | 59
            | 60
            | 61
            | 63
            | 65
            | 67
            | 68
            | 69
            | 70
            | 72
            | 73
            | 74
            | 75
            | 76
            | 77
            | 78
            | 81
            | 85
            | 86
            | 87
            | 90
            | 92
            | 103
            | 108
            | 120
            | 121
            | 122
            | 123
            | 124
            | 125
            | 126
    )
}

fn is_documented_opcode(code: i16) -> bool {
    matches!(
        code,
        -23 | -14 | 0 | 1..=78 | 81..=108 | 111 | 112 | 119..=127
    )
}

#[test]
fn exports_supported_files_and_preserves_passthrough_snapshot() {
    let Some(source) = fixture_path("Tutorial") else {
        eprintln!("Skipping missing Tutorial fixture");
        return;
    };
    let temp = tempdir().unwrap();
    let project_dir = temp.path().join("project");
    let export_dir = temp.path().join("exported");
    import_scenario(&source, &project_dir).unwrap();
    let project = open_project(&project_dir).unwrap();
    let report = export_project(
        &project_dir,
        &project,
        &export_dir,
        realmz_providence_lib::project::ScenarioTarget::ProvidencePortableFolder,
    )
    .unwrap();

    for name in SUPPORTED_WRITE_FILES {
        if source.join(name).is_file() {
            assert!(
                report.written_files.contains(&name.to_string()),
                "{name} should be written"
            );
            assert!(
                export_dir.join(name).is_file(),
                "{name} should exist in export"
            );
            assert_eq!(
                fs::read(source.join(name)).unwrap(),
                fs::read(export_dir.join(name)).unwrap(),
                "{name} should round-trip byte-identically without edits"
            );
        }
    }
    assert!(
        export_dir.join("Scenario").is_file(),
        "Scenario should pass through"
    );
}

#[test]
fn target_exports_match_package_contracts() {
    let Some(mac_source) = fixture_path("Tutorial") else {
        eprintln!("Skipping target export contract test; Tutorial fixture is absent.");
        return;
    };
    assert_target_export_contract(
        "Tutorial Mac target",
        &mac_source,
        ScenarioTarget::MacClassicFolder,
    );

    if let Some(windows_source) = out_fixture_path("Araman's Ring") {
        assert_target_export_contract(
            "Araman's Ring Windows target",
            &windows_source,
            ScenarioTarget::WindowsRealmzFolder,
        );
    } else {
        eprintln!("Skipping Windows target export contract; Araman's Ring fixture is absent.");
    }

    if let Some(portable_source) = fixture_path("War in the Sword Lands") {
        let (_temp, project, export_dir, report) = export_fixture_with_target(
            &portable_source,
            ScenarioTarget::ProvidencePortableFolder,
        );
        assert_eq!(report.target, ScenarioTarget::ProvidencePortableFolder);
        assert_package_contract("War in the Sword Lands portable target", &project, &export_dir);
        assert!(
            project.source.files.iter().any(|file| is_custom_music_name(&file.name)),
            "War in the Sword Lands should include custom music fixture files"
        );
        for file in project.source.files.iter().filter(|file| is_custom_music_name(&file.name)) {
            assert!(
                export_dir.join(&file.relative_path).is_file(),
                "portable export should preserve custom music file {}",
                file.relative_path
            );
        }
        assert!(
            !report.target_compatibility.notes.is_empty(),
            "portable export should report preservation notes for custom media/package baggage"
        );
    } else {
        eprintln!("Skipping portable custom music contract; War in the Sword Lands fixture is absent.");
    }
}

#[test]
fn target_export_excludes_ignored_os_metadata() {
    let Some(source) = fixture_path("Tutorial") else {
        eprintln!("Skipping ignored metadata export test; Tutorial fixture is absent.");
        return;
    };
    let temp = tempdir().unwrap();
    let copied_source = temp.path().join("Tutorial");
    fs::create_dir_all(&copied_source).unwrap();
    for entry in fs::read_dir(&source).unwrap() {
        let entry = entry.unwrap();
        if entry.file_type().unwrap().is_file() {
            fs::copy(entry.path(), copied_source.join(entry.file_name())).unwrap();
        }
    }
    fs::write(copied_source.join(".DS_Store"), b"finder metadata").unwrap();

    let (_export_temp, project, export_dir, report) =
        export_fixture_with_target(&copied_source, ScenarioTarget::ProvidencePortableFolder);
    assert!(
        !project.source.files.iter().any(|file| file.name == ".DS_Store"),
        "importer should ignore .DS_Store as non-scenario metadata"
    );
    assert!(
        !export_dir.join(".DS_Store").exists(),
        "export should not write ignored OS metadata"
    );
    assert!(
        !report.pass_through_files.iter().any(|file| file == ".DS_Store"),
        "ignored OS metadata should not appear as pass-through"
    );
}

fn generated_fixture_file_mismatch(source: &Path, expected: &Value) -> Option<String> {
    let files = expected.get("files")?.as_object()?;
    for (file_name, metadata) in files {
        let expected_bytes = metadata.get("bytes").and_then(Value::as_u64)?;
        let expected_sha = metadata.get("sha256").and_then(Value::as_str)?;
        let path = source.join(file_name);
        let bytes = match fs::read(&path) {
            Ok(bytes) => bytes,
            Err(_) => return Some(format!("{file_name} is missing")),
        };
        if bytes.len() as u64 != expected_bytes {
            return Some(format!(
                "{file_name} is {} bytes, corpus has {expected_bytes}",
                bytes.len()
            ));
        }
        let actual_sha = sha256_hex(&bytes);
        if !actual_sha.starts_with(expected_sha) {
            return Some(format!(
                "{file_name} sha256 starts with {}, corpus has {expected_sha}",
                &actual_sha[..expected_sha.len().min(actual_sha.len())]
            ));
        }
    }
    None
}

#[test]
fn windows_export_promotes_macosx_scenario_resource_fork() {
    let Some(source) = desktop_fixture_path("City of Bywater") else {
        eprintln!("Skipping Mac ZIP resource fork promotion test; Desktop City of Bywater fixture is absent.");
        return;
    };
    if !source.join("__MACOSX").join("._Scenario").is_file() {
        eprintln!("Skipping Mac ZIP resource fork promotion test; __MACOSX/._Scenario is absent.");
        return;
    }
    let (_temp, project, export_dir, _report) =
        export_fixture_with_target(&source, ScenarioTarget::WindowsRealmzFolder);

    assert!(
        project.source.files.iter().any(|file| {
            file.name == "Scenario.rsrc" && matches!(file.role, SourceFileRole::ResourceFork)
        }),
        "import should promote __MACOSX/._Scenario into Scenario.rsrc"
    );
    let exported_resource_path = export_dir.join("Scenario.rsrc");
    assert!(
        exported_resource_path.is_file(),
        "Windows export should include promoted Scenario.rsrc"
    );
    let exported_resources = parse_resource_fork_entries(&fs::read(&exported_resource_path).unwrap());
    assert!(
        exported_resources
            .iter()
            .any(|entry| entry.resource_type == "STR#" && entry.name == "Map Names"),
        "exported Scenario.rsrc should preserve STR# Map Names"
    );
    let primary_names = exported_resources
        .iter()
        .find(|entry| entry.resource_type == "STR#" && entry.id == -102)
        .map(|entry| decode_string_list_resource(&entry.data))
        .unwrap_or_default();
    assert_eq!(primary_names.len(), project.map_records.len());
    assert!(
        primary_names.iter().any(|name| !name.trim().is_empty()),
        "generated map-name resources should populate the Maps/Notes menu"
    );
}

#[test]
fn exports_hardened_fixtures_byte_identically_without_edits() {
    let supported: BTreeSet<&str> = SUPPORTED_WRITE_FILES.iter().copied().collect();
    let tracked: BTreeSet<&str> = TRACKED_FILES.iter().copied().collect();
    for name in HARDENED_FIXTURES {
        let Some(source) = fixture_path(name) else {
            eprintln!("Skipping missing fixture scenario: {name}");
            continue;
        };
        let temp = tempdir().unwrap();
        let project_dir = temp.path().join(name.replace(' ', "_"));
        let export_dir = temp.path().join("exported");
        import_scenario(&source, &project_dir).unwrap();
        let project = open_project(&project_dir).unwrap();
        let report = export_project(
            &project_dir,
            &project,
            &export_dir,
            realmz_providence_lib::project::ScenarioTarget::ProvidencePortableFolder,
        )
        .unwrap();

        for file_name in supported.iter().chain(tracked.difference(&supported)) {
            let source_file = source.join(file_name);
            if !source_file.is_file() {
                continue;
            }
            let exported_file = export_dir.join(file_name);
            assert!(
                exported_file.is_file(),
                "{name} should export imported file {file_name}"
            );
            assert_eq!(
                fs::read(&source_file).unwrap(),
                fs::read(&exported_file).unwrap(),
                "{name} {file_name} should export byte-identically without edits"
            );
        }

        for source_file in &project.source.files {
            let file_name = source_file.name.as_str();
            if supported.contains(file_name) || tracked.contains(file_name) {
                continue;
            }
            let source_path = source.join(&source_file.relative_path);
            if !source_path.is_file() {
                continue;
            }
            let exported_path = export_dir.join(&source_file.relative_path);
            assert!(
                exported_path.is_file(),
                "{name} should pass through non-tracked source file {}",
                source_file.relative_path
            );
            assert_eq!(
                fs::read(&source_path).unwrap(),
                fs::read(&exported_path).unwrap(),
                "{name} {} should pass through byte-identically",
                source_file.relative_path
            );
        }

        assert!(
            !report.written_files.is_empty() || !report.pass_through_files.is_empty(),
            "{name} should report written or pass-through files"
        );
    }
}

fn export_fixture_with_target(
    source: &Path,
    target: ScenarioTarget,
) -> (
    tempfile::TempDir,
    ProvidenceProject,
    std::path::PathBuf,
    realmz_providence_lib::exporter::ExportReport,
) {
    let temp = tempdir().unwrap();
    let project_dir = temp.path().join("project");
    let export_dir = temp.path().join("exported");
    import_scenario(source, &project_dir).unwrap();
    let project = open_project(&project_dir).unwrap();
    let report = export_project(&project_dir, &project, &export_dir, target).unwrap();
    (temp, project, export_dir, report)
}

fn assert_target_export_contract(label: &str, source: &Path, target: ScenarioTarget) {
    let (_temp, project, export_dir, report) = export_fixture_with_target(source, target);
    assert_eq!(report.target, target, "{label} should report selected target");
    assert_package_contract(label, &project, &export_dir);
    assert!(
        report.target_compatibility_issues.iter().all(|issue| {
            target == ScenarioTarget::ProvidencePortableFolder
                || issue.target == target
                || issue.target == ScenarioTarget::ProvidencePortableFolder
        }),
        "{label} should report only target-specific or portable compatibility issues"
    );
    assert_eq!(
        report.target_compatibility_issues.len(),
        report.target_compatibility.blockers.len()
            + report.target_compatibility.warnings.len()
            + report.target_compatibility.notes.len(),
        "{label} should bucket every target compatibility issue"
    );
    if project.source.files.iter().any(|file| file.name.starts_with("._")) {
        match target {
            ScenarioTarget::MacClassicFolder => assert!(
                report
                    .target_compatibility
                    .notes
                    .iter()
                    .any(|issue| issue.code == "appledouble-sidecars-preserved"),
                "{label} should note preserved AppleDouble sidecars for Mac target"
            ),
            ScenarioTarget::WindowsRealmzFolder => assert!(
                report
                    .target_compatibility
                    .warnings
                    .iter()
                    .any(|issue| issue.code == "appledouble-sidecars-in-windows-target"),
                "{label} should warn about AppleDouble sidecars for Windows target"
            ),
            ScenarioTarget::ProvidencePortableFolder => {}
        }
    }
}

fn assert_package_contract(label: &str, project: &ProvidenceProject, export_dir: &Path) {
    assert!(
        project.scenario.shell.is_some(),
        "{label} should have parsed scenario shell data"
    );
    for file in project
        .source
        .files
        .iter()
        .filter(|file| matches!(file.role, SourceFileRole::SupportedBinary | SourceFileRole::ResourceFork | SourceFileRole::PassThrough | SourceFileRole::Unknown))
    {
        assert!(
            export_dir.join(&file.relative_path).is_file(),
            "{label} should export or preserve {}",
            file.relative_path
        );
    }
    for name in [".DS_Store", "Thumbs.db", "desktop.ini"] {
        assert!(
            !export_dir.join(name).exists(),
            "{label} should exclude ignored metadata {name}"
        );
    }
}

fn resource_path_with_entry(
    project: &ProvidenceProject,
    root: &Path,
    resource_type: &str,
    id: i16,
) -> Option<std::path::PathBuf> {
    project
        .source
        .files
        .iter()
        .filter(|file| matches!(file.role, SourceFileRole::ResourceFork))
        .map(|file| root.join(&file.relative_path))
        .find(|path| resource_entry(path, resource_type, id).is_some())
}

fn resource_entry(path: &Path, resource_type: &str, id: i16) -> Option<ResourceForkEntry> {
    parse_resource_fork_entries(&fs::read(path).ok()?)
        .into_iter()
        .find(|entry| entry.resource_type == resource_type && entry.id == id)
}

fn resource_entries_by_key(bytes: &[u8]) -> BTreeMap<(String, i16), ResourceForkEntry> {
    parse_resource_fork_entries(bytes)
        .into_iter()
        .map(|entry| ((entry.resource_type.clone(), entry.id), entry))
        .collect()
}

fn changed_offsets(before: &[u8], after: &[u8]) -> Vec<usize> {
    before
        .iter()
        .zip(after.iter())
        .enumerate()
        .filter_map(|(offset, (left, right))| (left != right).then_some(offset))
        .collect()
}

fn replacement_landlook_pict_resource() -> Vec<u8> {
    let width = 640usize;
    let height = 320usize;
    let mut rgba = vec![0u8; width * height * 4];
    for y in 0..height {
        for x in 0..width {
            let offset = (y * width + x) * 4;
            let tile_x = x / 32;
            let tile_y = y / 32;
            rgba[offset] = ((tile_x * 11) % 255) as u8;
            rgba[offset + 1] = ((tile_y * 23) % 255) as u8;
            rgba[offset + 2] = (((tile_x + tile_y) * 17) % 255) as u8;
            rgba[offset + 3] = 255;
        }
    }
    encode_pict_resource(&RgbaImagePayload {
        width: width as u32,
        height: height as u32,
        rgba_base64: STANDARD.encode(rgba),
    })
    .unwrap()
}

fn is_custom_music_name(name: &str) -> bool {
    if !name.starts_with("Custom ") {
        return false;
    }
    let suffix = name.trim_start_matches("Custom ");
    suffix
        .chars()
        .next()
        .is_some_and(|first| first.is_ascii_digit())
        && (suffix.len() == 1 || suffix.ends_with(" Music"))
}

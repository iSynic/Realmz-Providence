use realmz_providence_lib::exporter::export_project;
use realmz_providence_lib::importer::{import_scenario, open_project, RAW_SOURCES_DIR};
use realmz_providence_lib::project::{
    ProvidenceProject, PROJECT_SCHEMA_VERSION, SEMANTIC_SCHEMA_VERSION,
};
use realmz_providence_lib::realmz::{SUPPORTED_WRITE_FILES, TRACKED_FILES};
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
        assert_generated_corpus_expectations(name, &project);
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
    assert!(
        !project
            .diagnostics
            .iter()
            .any(|diagnostic| diagnostic.code == "missing-map-icon-overlay"),
        "scenario-local map icons should satisfy negative map icon references"
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

fn assert_generated_corpus_expectations(name: &str, project: &ProvidenceProject) {
    let Some(expected) = generated_fixture_summary(name) else {
        eprintln!("Skipping generated corpus comparison for {name}; expectation not found.");
        return;
    };
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
    assert_eq!(schema.schema_version, SEMANTIC_SCHEMA_VERSION);
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
    let report = export_project(&project_dir, &project, &export_dir).unwrap();

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
        let report = export_project(&project_dir, &project, &export_dir).unwrap();

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

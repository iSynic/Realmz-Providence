use crate::project::*;
use crate::realmz::SUPPORTED_WRITE_FILES;
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};

pub fn validate_project(project: &ProvidenceProject) -> ValidationReport {
    let mut errors = Vec::new();
    let mut warnings = Vec::new();
    let mut exportable_files = Vec::new();
    let mut pass_through_files = Vec::new();
    let supported: BTreeSet<&str> = SUPPORTED_WRITE_FILES.iter().copied().collect();

    if project.maps.is_empty() {
        errors.push(
            "Project has no maps. At least one land or dungeon map is required for V1 export."
                .to_string(),
        );
    }
    for map in &project.maps {
        if map.width != MAP_SIZE || map.height != MAP_SIZE {
            errors.push(format!(
                "{} is {} x {}; Realmz maps must be 90 x 90.",
                map.id, map.width, map.height
            ));
        }
        if map.tiles.len() != MAP_SIZE * MAP_SIZE {
            errors.push(format!(
                "{} has {} tiles; Realmz maps require 8100 tiles.",
                map.id,
                map.tiles.len()
            ));
        }
    }
    for trigger in &project.triggers {
        if trigger.actions.len() > 8 {
            errors.push(format!("{} has more than 8 actions.", trigger.id));
        }
        if let Some(coord) = &trigger.coordinate {
            if coord.x >= MAP_SIZE || coord.y >= MAP_SIZE {
                errors.push(format!("{} has an out-of-bounds coordinate.", trigger.id));
            }
        }
    }
    for level in &project.random_levels {
        if level.raw_values.len() != crate::realmz::RANDLEVEL_BYTES / 2 {
            errors.push(format!(
                "{} has invalid raw random-level storage.",
                level.id
            ));
        }
        for rect in &level.rects {
            if rect.rect_index >= 20 {
                errors.push(format!(
                    "{} has random rect {} outside 0..19.",
                    level.id, rect.rect_index
                ));
            }
        }
    }
    for message in &project.messages {
        if message.text.len() > 255 {
            errors.push(format!(
                "Message {} is {} byte(s); Data SD2 supports at most 255 ASCII bytes.",
                message.id,
                message.text.len()
            ));
        }
    }
    for battle in &project.battles {
        if battle.grid.len() != 13 * 13 {
            errors.push(format!(
                "Battle {} has {} grid cells; Data BD requires 169.",
                battle.id,
                battle.grid.len()
            ));
        }
    }
    for treasure in &project.treasures {
        if treasure.item_ids.len() > 20 {
            errors.push(format!(
                "Treasure {} has {} item slots; Data TD supports 20.",
                treasure.id,
                treasure.item_ids.len()
            ));
        }
    }
    for shop in &project.shops {
        if shop.item_ids.len() > 1000 || shop.quantities.len() > 1000 {
            errors.push(format!(
                "Shop {} exceeds Data SD capacity of 1000 item and quantity slots.",
                shop.id
            ));
        }
    }
    for encounter in &project.simple_encounters {
        if encounter.actions.iter().any(|action| action.slot >= 32) {
            errors.push(format!("Simple encounter {} has an action outside 0..31.", encounter.id));
        }
        if encounter.texts.iter().any(|text| text.len() > 80) {
            errors.push(format!("Simple encounter {} has text longer than 80 bytes.", encounter.id));
        }
    }
    for encounter in &project.complex_encounters {
        if encounter.actions.iter().any(|action| action.slot >= 32) {
            errors.push(format!("Complex encounter {} has an action outside 0..31.", encounter.id));
        }
        if encounter.texts.iter().any(|text| text.len() > 40) {
            errors.push(format!("Complex encounter {} has text longer than 40 bytes.", encounter.id));
        }
    }
    for asset in &project.assets {
        if matches!(asset.export_state, ManagedAssetExportState::Blocked) {
            errors.push(format!(
                "{} is blocked from export: converted Realmz resource data is not available.",
                asset.label
            ));
        }
        if !matches!(asset.resource_type.as_str(), "PICT" | "cicn" | "snd ") {
            errors.push(format!(
                "{} targets unsupported resource type {}.",
                asset.label, asset.resource_type
            ));
        }
        if matches!(asset.kind, ManagedAssetKind::SpecialLandTile) {
            if asset.resource_type != "cicn" {
                errors.push(format!(
                    "{} is a Special Land Tile but targets {}; special land tiles must export as cicn resources.",
                    asset.label, asset.resource_type
                ));
            }
            if asset.resource_id >= 0 {
                errors.push(format!(
                    "{} uses resource id {}; Special Land Tiles should use negative cicn ids such as -100.",
                    asset.label, asset.resource_id
                ));
            }
            if asset.width.is_none() || asset.height.is_none() {
                warnings.push(format!(
                    "{} has no original image dimensions recorded; its 32 x 32 cicn conversion should be rechecked before export.",
                    asset.label
                ));
            }
        }
        if asset.resource_id == 0 {
            warnings.push(format!(
                "{} uses resource id 0; Realmz resources normally use explicit nonzero ids.",
                asset.label
            ));
        }
    }
    validate_semantic_schema(project, &mut errors, &mut warnings);

    let has_scenario_file = project
        .source
        .files
        .iter()
        .any(|file| file.name == "Scenario");
    if !has_scenario_file {
        warnings.push(
            "No Scenario file was imported; exported folders may not appear in Realmz menus."
                .to_string(),
        );
    }
    for file in &project.source.files {
        if supported.contains(file.name.as_str()) {
            exportable_files.push(file.name.clone());
        } else {
            pass_through_files.push(file.name.clone());
        }
    }
    exportable_files.sort();
    exportable_files.dedup();
    pass_through_files.sort();
    pass_through_files.dedup();
    if !pass_through_files.is_empty() {
        warnings.push(format!(
            "{} source file(s) are not V1 writer-supported and will be copied through unchanged: {}{}",
            pass_through_files.len(),
            pass_through_files
                .iter()
                .take(12)
                .cloned()
                .collect::<Vec<_>>()
                .join(", "),
            if pass_through_files.len() > 12 {
                ", ..."
            } else {
                "."
            }
        ));
    }
    if !project.assets.is_empty() {
        warnings.push(format!(
            "{} managed media asset(s) will be written into the exported Scenario resource fork.",
            project.assets.len()
        ));
    }

    ValidationReport {
        ok: errors.is_empty(),
        errors,
        warnings,
        exportable_files,
        pass_through_files,
    }
}

fn validate_semantic_schema(
    project: &ProvidenceProject,
    errors: &mut Vec<String>,
    warnings: &mut Vec<String>,
) {
    let schema = &project.semantic_schema;
    if schema.schema_version != SEMANTIC_SCHEMA_VERSION {
        warnings.push(format!(
            "Semantic schema version {} is stale; expected {}.",
            schema.schema_version, SEMANTIC_SCHEMA_VERSION
        ));
    }
    if schema.sources.is_empty() {
        warnings.push("Semantic schema has no source inventory.".to_string());
    }
    if schema.records.is_empty() {
        warnings.push("Semantic schema has no record inventory.".to_string());
    }
    if schema.entities.is_empty() {
        warnings.push("Semantic schema has no entity inventory.".to_string());
    }

    let known_ids: BTreeSet<&str> = schema
        .entities
        .iter()
        .map(|entity| entity.id.as_str())
        .chain(schema.records.iter().map(|record| record.id.as_str()))
        .chain(schema.sources.iter().map(|source| source.id.as_str()))
        .collect();
    let links_by_target = links_by_target(&schema.links);
    let mut unresolved_link_warnings = 0usize;
    for link in &schema.links {
        if !known_ids.contains(link.from.as_str()) {
            if unresolved_link_warnings < 60 {
                warnings.push(format!(
                    "Semantic link {} starts at unresolved id {}.",
                    link.id, link.from
                ));
            }
            unresolved_link_warnings += 1;
        }
        if !known_ids.contains(link.to.as_str()) {
            if unresolved_link_warnings < 60 {
                warnings.push(format!(
                    "Semantic link {} points to unresolved id {}.",
                    link.id, link.to
                ));
            }
            unresolved_link_warnings += 1;
        }
    }
    if unresolved_link_warnings > 60 {
        warnings.push(format!(
            "Semantic validation found {} additional unresolved link endpoints.",
            unresolved_link_warnings - 60
        ));
    }
    validate_missing_sources(schema, warnings);

    for diagnostic in &schema.diagnostics {
        let message = format!(
            "Semantic {}: {}",
            diagnostic.diagnostic_type, diagnostic.message
        );
        match diagnostic.severity {
            DiagnosticSeverity::Error => errors.push(message),
            DiagnosticSeverity::Warning => warnings.push(message),
            DiagnosticSeverity::Info => {}
        }
    }
    let malformed_resources = schema
        .diagnostics
        .iter()
        .filter(|diagnostic| {
            diagnostic.diagnostic_type.contains("resource")
                && diagnostic.severity != DiagnosticSeverity::Info
        })
        .count();
    if malformed_resources > 0 {
        warnings.push(format!(
            "Resource fork inspection produced {} resource-specific diagnostic(s); review the Resources and Linter panels before export.",
            malformed_resources
        ));
    }

    let has_resource_inventory = schema
        .entities
        .iter()
        .any(|entity| entity.entity_type == "resource type" || entity.entity_type == "resource");
    let has_resource_snapshot = project
        .source
        .files
        .iter()
        .any(|file| matches!(file.role, SourceFileRole::ResourceFork));
    if has_resource_snapshot && !has_resource_inventory {
        warnings.push(
            "Resource fork files were imported, but no readable resource inventory was produced."
                .to_string(),
        );
    }
    validate_resource_references(schema, &known_ids, &links_by_target, warnings);
    for tileset in &project.asset_catalog.tilesets {
        if !tileset.available || tileset.image_path.is_none() {
            warnings.push(format!(
                "Tile atlas {} is unavailable; map rendering will use fallback colors.",
                tileset.id
            ));
        }
    }
    for source in &project.source.files {
        if is_generated_cache_name(&source.name) {
            warnings.push(format!(
                "{} looks like a generated runtime cache; Providence will treat it as pass-through evidence, not authored scenario data.",
                source.name
            ));
        }
    }
    validate_runtime_cache_entities(schema, errors, warnings);
    let mut inspect_only_supported = 0usize;
    for record in &schema.records {
        if record.edit_state != SemanticEditState::Editable && is_semantic_edited(&record.summary) {
            errors.push(format!(
                "{} is marked edited, but its semantic edit state is {} and cannot be destructively exported.",
                record.id,
                edit_state_label(record.edit_state)
            ));
        } else if record.edit_state != SemanticEditState::Editable
            && source_is_exportable(&record.source, project)
            && record.edit_state == SemanticEditState::InspectOnly
        {
            inspect_only_supported += 1;
        }
    }
    if inspect_only_supported > 0 {
        warnings.push(format!(
            "{} record(s) in writer-supported files remain inspect-only until their record families are fixture-backed for destructive export.",
            inspect_only_supported
        ));
    }
    for entity in &schema.entities {
        if entity.edit_state != SemanticEditState::Editable && is_semantic_edited(&entity.summary) {
            errors.push(format!(
                "{} is marked edited, but its semantic edit state is {} and cannot be destructively exported.",
                entity.id,
                edit_state_label(entity.edit_state)
            ));
        }
    }
}

fn source_is_exportable(source_id: &str, project: &ProvidenceProject) -> bool {
    let Some(name) = source_id.strip_prefix("source:file:") else {
        return false;
    };
    project
        .source
        .files
        .iter()
        .find(|file| file.name == name)
        .map(|file| file.editable)
        .unwrap_or(false)
}

fn validate_missing_sources(schema: &SemanticSchema, warnings: &mut Vec<String>) {
    for source in &schema.sources {
        if source.exists {
            continue;
        }
        if matches!(
            source.origin,
            SemanticSourceOrigin::RuntimeCache | SemanticSourceOrigin::SharedReference
        ) {
            continue;
        }
        warnings.push(format!(
            "Semantic source {} is referenced but missing from the raw source snapshot.",
            source.name
        ));
    }
}

fn validate_resource_references(
    schema: &SemanticSchema,
    known_ids: &BTreeSet<&str>,
    links_by_target: &BTreeMap<String, Vec<&SemanticLink>>,
    warnings: &mut Vec<String>,
) {
    let mut missing_link_count = 0usize;
    for link in &schema.links {
        if link.to.starts_with("resource:") && !known_ids.contains(link.to.as_str()) {
            if missing_link_count < 30 {
                warnings.push(format!(
                    "{} references missing resource endpoint {}.",
                    link.from, link.to
                ));
            }
            missing_link_count += 1;
        }
    }
    if missing_link_count > 30 {
        warnings.push(format!(
            "{} additional missing resource endpoints were found.",
            missing_link_count - 30
        ));
    }

    let mut fallback_count = 0usize;
    let mut hard_missing_count = 0usize;
    for entity in schema
        .entities
        .iter()
        .filter(|entity| entity.entity_type == "resource")
    {
        let reference_only = bool_summary(&entity.summary, "referenceOnly");
        let shared_fallback = bool_summary(&entity.summary, "sharedFallback");
        let scenario_supplied = entity
            .summary
            .get("scenarioSupplied")
            .and_then(Value::as_bool);
        if !reference_only && scenario_supplied != Some(false) {
            continue;
        }
        let consumers = links_by_target
            .get(&entity.id)
            .map(|links| {
                links
                    .iter()
                    .filter(|link| link.kind != "member_of_resource_type")
                    .count()
            })
            .unwrap_or(0);
        if shared_fallback {
            fallback_count += 1;
            if fallback_count <= 24 {
                warnings.push(format!(
                    "{} is not scenario-supplied; {} semantic reference(s) will rely on shared Realmz resource fallback when available.",
                    entity.id, consumers
                ));
            }
        } else {
            hard_missing_count += 1;
            if hard_missing_count <= 24 {
                warnings.push(format!(
                    "{} is referenced by {} semantic link(s), but no scenario resource or shared fallback is confirmed.",
                    entity.id, consumers
                ));
            }
        }
    }
    if fallback_count > 24 {
        warnings.push(format!(
            "{} additional resource reference(s) rely on shared fallback provenance.",
            fallback_count - 24
        ));
    }
    if hard_missing_count > 24 {
        warnings.push(format!(
            "{} additional resource reference(s) have no confirmed fallback.",
            hard_missing_count - 24
        ));
    }
}

fn validate_runtime_cache_entities(
    schema: &SemanticSchema,
    errors: &mut Vec<String>,
    warnings: &mut Vec<String>,
) {
    let caches: Vec<_> = schema
        .entities
        .iter()
        .filter(|entity| entity.entity_type == "runtime-cache")
        .collect();
    if !caches.is_empty() {
        warnings.push(format!(
            "{} generated runtime cache model(s) are present for relationship tracing only; export will not author CL/CD/CE/CE2/CS/CT/CTD3 cache files.",
            caches.len()
        ));
    }
    for cache in caches {
        if is_semantic_edited(&cache.summary) {
            errors.push(format!(
                "{} is a generated runtime cache and cannot be edited or exported as authored scenario data.",
                cache.id
            ));
        }
    }
}

fn links_by_target(links: &[SemanticLink]) -> BTreeMap<String, Vec<&SemanticLink>> {
    let mut by_target: BTreeMap<String, Vec<&SemanticLink>> = BTreeMap::new();
    for link in links {
        by_target.entry(link.to.clone()).or_default().push(link);
    }
    by_target
}

fn is_generated_cache_name(name: &str) -> bool {
    matches!(name, "CL" | "CD" | "CE" | "CE2" | "CS" | "CT" | "CTD3")
}

fn is_semantic_edited(summary: &BTreeMap<String, Value>) -> bool {
    summary.get("edited").and_then(Value::as_bool) == Some(true)
}

fn bool_summary(summary: &BTreeMap<String, Value>, key: &str) -> bool {
    summary.get(key).and_then(Value::as_bool).unwrap_or(false)
}

fn edit_state_label(state: SemanticEditState) -> &'static str {
    match state {
        SemanticEditState::Editable => "editable",
        SemanticEditState::InspectOnly => "inspect-only",
        SemanticEditState::Blocked => "blocked",
    }
}

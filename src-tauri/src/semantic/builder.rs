use super::common::*;
use super::{ed3, map_names, metadata, records, resources, runtime, triggers};
use crate::project::*;
use crate::realmz::{ParsedScenario, FIELD_BYTES, RANDLEVEL_BYTES};
use serde_json::json;
use std::collections::{BTreeMap, BTreeSet};

pub fn build_canonical_project_semantic_schema(project: &ProvidenceProject) -> SemanticSchema {
    let parsed = ParsedScenario {
        maps: project.maps.clone(),
        land_layout: project.land_layout.clone(),
        map_records: project.map_records.clone(),
        tile_attributes: project.tile_attributes.clone(),
        custom_landlooks: project.custom_landlooks.clone(),
        triggers: project.triggers.clone(),
        random_levels: project.random_levels.clone(),
        extracodes: project.extracodes.clone(),
        messages: project.messages.clone(),
        option_labels: project.option_labels.clone(),
        battles: project.battles.clone(),
        monsters: project.monsters.clone(),
        monster_sets: project.monster_sets.clone(),
        monster_descriptions: project.monster_descriptions.clone(),
        scenario_items: project.scenario_items.clone(),
        treasures: project.treasures.clone(),
        shops: project.shops.clone(),
        simple_encounters: project.simple_encounters.clone(),
        complex_encounters: project.complex_encounters.clone(),
        thief_encounters: project.thief_encounters.clone(),
        timed_encounters: project.timed_encounters.clone(),
        spell_overrides: project.spell_overrides.clone(),
        race_overrides: project.race_overrides.clone(),
        caste_overrides: project.caste_overrides.clone(),
        records: project.records.clone(),
        diagnostics: project.diagnostics.clone(),
        asset_catalog: project.asset_catalog.clone(),
    };
    build_semantic_schema(
        &project.scenario,
        &BTreeMap::new(),
        &project.source.files,
        &parsed,
        &project.assets,
        true,
    )
}

pub fn build_semantic_schema(
    scenario: &ScenarioMeta,
    buffers: &BTreeMap<String, Vec<u8>>,
    source_files: &[SourceFile],
    parsed: &ParsedScenario,
    managed_assets: &[ManagedAsset],
    canonical_records: bool,
) -> SemanticSchema {
    let mut schema = SemanticSchema {
        schema_version: SEMANTIC_SCHEMA_VERSION,
        evidence: source_anchors(),
        ..SemanticSchema::default()
    };
    add_sources(&mut schema, buffers, source_files);
    metadata::add_scenario_entity(&mut schema, scenario, canonical_records);
    add_maps(&mut schema, &parsed.maps);
    add_random_levels(&mut schema, &parsed.random_levels);
    triggers::add_triggers(&mut schema, &parsed.triggers, &parsed.extracodes, buffers);
    add_extracodes(&mut schema, &parsed.extracodes);
    let map_names = map_names::resource_map_names(buffers);
    if canonical_records {
        records::add_canonical_record_collections(&mut schema, scenario, parsed);
    } else {
        records::add_encounters(&mut schema, buffers);
        records::add_fixed_collections(&mut schema, buffers, &parsed.maps, &map_names);
    }
    records::add_encounter_macro_links(
        &mut schema,
        &parsed.simple_encounters,
        &parsed.complex_encounters,
    );
    resources::add_resources(&mut schema, buffers);
    resources::add_managed_resources(&mut schema, managed_assets);
    map_names::add_map_name_links(&mut schema, buffers);
    metadata::add_scenario_metadata_links(&mut schema, scenario);
    add_tile_assets(&mut schema, &parsed.asset_catalog);
    add_render_profiles(&mut schema, &parsed.maps, &parsed.asset_catalog);
    add_runtime_cache_model(&mut schema);
    let runtime_reachability = runtime::classify_runtime_reachability(scenario, parsed);
    ed3::classify_ed3_reachability_with_runtime(
        &mut schema,
        &parsed.triggers,
        &runtime_reachability,
    );
    add_quest_flag_entities(&mut schema);
    add_referenced_resource_placeholders(&mut schema);
    add_reverse_links_and_summary(&mut schema);
    schema
}

fn add_sources(
    schema: &mut SemanticSchema,
    buffers: &BTreeMap<String, Vec<u8>>,
    source_files: &[SourceFile],
) {
    let mut seen = BTreeSet::new();
    for file in source_files {
        schema.sources.push(SemanticSource {
            id: source_id(&file.name),
            source_type: if is_resource_file(&file.name) {
                "resource fork".to_string()
            } else {
                "file".to_string()
            },
            origin: if is_resource_file(&file.name) {
                SemanticSourceOrigin::ResourceFork
            } else {
                SemanticSourceOrigin::AuthoredSource
            },
            name: file.name.clone(),
            path: Some(file.relative_path.clone()),
            exists: true,
            bytes: file.bytes,
            sha256: Some(file.sha256.clone()),
            layout: layout_for(&file.name),
            confidence: Confidence::SourceBacked,
        });
        seen.insert(file.name.clone());
    }
    for (name, bytes) in buffers {
        if seen.contains(name) {
            continue;
        }
        schema.sources.push(SemanticSource {
            id: source_id(name),
            source_type: if is_resource_file(name) {
                "resource fork".to_string()
            } else {
                "file".to_string()
            },
            origin: if is_resource_file(name) {
                SemanticSourceOrigin::ResourceFork
            } else {
                SemanticSourceOrigin::AuthoredSource
            },
            name: name.clone(),
            path: None,
            exists: true,
            bytes: bytes.len() as u64,
            sha256: None,
            layout: layout_for(name),
            confidence: Confidence::SourceBacked,
        });
    }
}

fn add_maps(schema: &mut SemanticSchema, maps: &[MapEntity]) {
    for map in maps {
        let record_id = format!("record:{}:{}", map.source, map.index);
        schema.records.push(SemanticRecord {
            id: record_id.clone(),
            source: source_id(&map.source),
            record_type: format!("{} field grid", map.level_type.as_str()),
            label: map.name.clone(),
            edit_state: SemanticEditState::Editable,
            byte_range: Some(byte_range(map.index * FIELD_BYTES, FIELD_BYTES)),
            confidence: Confidence::Confirmed,
            summary: summary([
                ("levelType", json!(map.level_type.as_str())),
                ("levelIndex", json!(map.index)),
                ("width", json!(map.width)),
                ("height", json!(map.height)),
                ("tiles", json!(map.tiles.len())),
                ("render", json!(map.render)),
            ]),
        });
        schema.entities.push(SemanticEntity {
            id: map_entity_id(map.level_type, map.index),
            entity_type: "map".to_string(),
            label: map.name.clone(),
            edit_state: SemanticEditState::Editable,
            confidence: Confidence::Confirmed,
            source: map.source.clone(),
            record_ref: Some(record_id),
            byte_range: Some(byte_range(map.index * FIELD_BYTES, FIELD_BYTES)),
            editable: true,
            summary: summary([
                ("levelType", json!(map.level_type.as_str())),
                ("levelIndex", json!(map.index)),
                ("width", json!(map.width)),
                ("height", json!(map.height)),
                ("tilesetId", json!(map.render.tileset_id)),
                ("landlook", json!(map.render.landlook)),
                ("mode", json!(map.render.mode)),
            ]),
        });
    }
}

fn add_random_levels(schema: &mut SemanticSchema, levels: &[RandomLevel]) {
    for level in levels {
        let source = level.level_type.random_file();
        let record_id = format!("record:{}:{}", source, level.level_index);
        schema.records.push(SemanticRecord {
            id: record_id.clone(),
            source: source_id(source),
            record_type: format!("{} random metadata", level.level_type.as_str()),
            label: level.id.clone(),
            edit_state: SemanticEditState::InspectOnly,
            byte_range: Some(byte_range(
                level.level_index * RANDLEVEL_BYTES,
                RANDLEVEL_BYTES,
            )),
            confidence: Confidence::SourceBacked,
            summary: summary([
                ("landlook", json!(level.landlook)),
                ("isDark", json!(level.is_dark)),
                ("useLos", json!(level.use_los)),
                ("rectCount", json!(level.rects.len())),
            ]),
        });
        push_link(
            schema,
            &record_id,
            &map_entity_id(level.level_type, level.level_index),
            "configures_map",
            Confidence::SourceBacked,
            vec![record_id.clone()],
            BTreeMap::new(),
        );
        for rect in &level.rects {
            let entity_id = format!(
                "random:{}:{}:{}",
                level.level_type.as_str(),
                level.level_index,
                rect.rect_index
            );
            schema.entities.push(SemanticEntity {
                id: entity_id.clone(),
                entity_type: "random-region".to_string(),
                label: format!(
                    "Random rect {} @ {},{}-{},{}",
                    rect.rect_index, rect.left, rect.top, rect.right, rect.bottom
                ),
                edit_state: SemanticEditState::InspectOnly,
                confidence: Confidence::SourceBacked,
                source: source.to_string(),
                record_ref: Some(record_id.clone()),
                byte_range: Some(byte_range(level.level_index * RANDLEVEL_BYTES, RANDLEVEL_BYTES)),
                editable: true,
                summary: summary([
                    ("levelType", json!(level.level_type.as_str())),
                    ("levelIndex", json!(level.level_index)),
                    ("rectIndex", json!(rect.rect_index)),
                    (
                        "rect",
                        json!({"top": rect.top, "left": rect.left, "bottom": rect.bottom, "right": rect.right}),
                    ),
                    ("percent", json!(rect.percent)),
                    ("battleRange", json!(rect.battle_range)),
                    ("randomDoors", json!(rect.random_doors)),
                    ("randomDoorPercent", json!(rect.random_door_percent)),
                    ("sound", json!(rect.sound)),
                    ("text", json!(rect.text)),
                ]),
            });
            push_link(
                schema,
                &entity_id,
                &map_entity_id(level.level_type, level.level_index),
                "contains_region",
                Confidence::SourceBacked,
                vec![record_id.clone()],
                BTreeMap::new(),
            );
            add_random_region_links(schema, level, rect, &entity_id, &record_id);
        }
    }
}

fn add_extracodes(schema: &mut SemanticSchema, extracodes: &[ExtraCodeRow]) {
    for row in extracodes {
        let id = format!("record:Data EDCD:{}", row.id);
        let row_summary = summary([("values", json!(row.values))]);
        schema.records.push(SemanticRecord {
            id: id.clone(),
            source: source_id("Data EDCD"),
            record_type: "extra-code row".to_string(),
            label: format!("Parameter Row {}", row.id),
            edit_state: SemanticEditState::InspectOnly,
            byte_range: Some(byte_range(
                row.provenance.byte_offset,
                row.provenance.byte_length,
            )),
            confidence: Confidence::SourceBacked,
            summary: row_summary.clone(),
        });
        schema.entities.push(SemanticEntity {
            id,
            entity_type: "edcd-row".to_string(),
            label: format!("Parameter Row {}", row.id),
            edit_state: SemanticEditState::InspectOnly,
            confidence: Confidence::SourceBacked,
            source: "Data EDCD".to_string(),
            record_ref: None,
            byte_range: Some(byte_range(
                row.provenance.byte_offset,
                row.provenance.byte_length,
            )),
            editable: true,
            summary: row_summary,
        });
    }
}

fn add_tile_assets(schema: &mut SemanticSchema, catalog: &AssetCatalog) {
    for tileset in &catalog.tilesets {
        schema.entities.push(SemanticEntity {
            id: format!("asset:tile-atlas:{}", tileset.id),
            entity_type: "tile atlas".to_string(),
            label: tileset.name.clone(),
            edit_state: if tileset.available {
                SemanticEditState::InspectOnly
            } else {
                SemanticEditState::Blocked
            },
            confidence: if tileset.available {
                Confidence::FixtureBacked
            } else {
                Confidence::Unknown
            },
            source: tileset.source.clone(),
            record_ref: None,
            byte_range: None,
            editable: false,
            summary: summary([
                ("landlook", json!(tileset.landlook)),
                ("imagePath", json!(tileset.image_path)),
                ("pictId", json!(tileset.pict_id)),
                ("tileWidth", json!(tileset.tile_width)),
                ("tileHeight", json!(tileset.tile_height)),
                ("columns", json!(tileset.columns)),
                ("rows", json!(tileset.rows)),
                ("baseTile", json!(tileset.base_tile)),
                ("custom", json!(tileset.custom)),
                ("available", json!(tileset.available)),
                ("mapSize", json!(MAP_SIZE)),
            ]),
        });
    }
}

fn add_render_profiles(schema: &mut SemanticSchema, maps: &[MapEntity], catalog: &AssetCatalog) {
    let known_assets: BTreeSet<String> = catalog
        .tilesets
        .iter()
        .map(|tileset| format!("asset:tile-atlas:{}", tileset.id))
        .collect();
    for map in maps {
        let map_id = map_entity_id(map.level_type, map.index);
        let id = format!("render-profile:{}", map_id.replace(':', "-"));
        schema.entities.push(SemanticEntity {
            id: id.clone(),
            entity_type: "render-profile".to_string(),
            label: format!("Render profile: {}", map.name),
            edit_state: SemanticEditState::InspectOnly,
            confidence: Confidence::SourceBacked,
            source: map.source.clone(),
            record_ref: Some(format!("record:{}:{}", map.source, map.index)),
            byte_range: None,
            editable: false,
            summary: summary([
                ("mapId", json!(map_id)),
                ("mode", json!(map.render.mode)),
                ("tilesetId", json!(map.render.tileset_id)),
                ("landlook", json!(map.render.landlook)),
            ]),
        });
        push_link(
            schema,
            &map_id,
            &id,
            "has_render_profile",
            Confidence::SourceBacked,
            vec![format!("record:{}:{}", map.source, map.index)],
            BTreeMap::new(),
        );
        let asset_id = format!("asset:tile-atlas:{}", map.render.tileset_id);
        if known_assets.contains(&asset_id) {
            push_link(
                schema,
                &id,
                &asset_id,
                "renders_with",
                Confidence::FixtureBacked,
                vec!["anchor:source-anchors".to_string()],
                summary([("mapId", json!(map_id))]),
            );
        } else {
            add_asset_fallback(
                schema,
                &id,
                &map_id,
                &map.render.tileset_id,
                "missing tile atlas asset",
            );
        }
        if matches!(map.render.mode, RenderMode::DungeonTopDown) {
            push_link(
                schema,
                &id,
                "resource:PICT:302",
                "renders_with",
                Confidence::SourceBacked,
                vec!["anchor:source-anchors".to_string()],
                summary([(
                    "fallback",
                    json!("shared Realmz PICT 302 dungeon tiny sprites"),
                )]),
            );
        }
    }
}

fn add_asset_fallback(
    schema: &mut SemanticSchema,
    from: &str,
    map_id: &str,
    tileset_id: &str,
    reason: &str,
) {
    let id = format!("asset-fallback:{}", tileset_id.replace(':', "-"));
    if !schema.entities.iter().any(|entity| entity.id == id) {
        schema.entities.push(SemanticEntity {
            id: id.clone(),
            entity_type: "asset-fallback".to_string(),
            label: format!("Fallback for {tileset_id}"),
            edit_state: SemanticEditState::Blocked,
            confidence: Confidence::Unknown,
            source: "render asset lookup".to_string(),
            record_ref: None,
            byte_range: None,
            editable: false,
            summary: summary([
                ("tilesetId", json!(tileset_id)),
                ("reason", json!(reason)),
                ("mapId", json!(map_id)),
            ]),
        });
    }
    push_link(
        schema,
        from,
        &id,
        "renders_with",
        Confidence::Unknown,
        vec!["anchor:assets-and-runtime-caches".to_string()],
        summary([("reason", json!(reason))]),
    );
}

fn add_random_region_links(
    schema: &mut SemanticSchema,
    level: &RandomLevel,
    rect: &RandomRect,
    entity_id: &str,
    record_id: &str,
) {
    if rect.battle_range.iter().any(|value| *value > 0) {
        for battle in rect.battle_range {
            if battle > 0 {
                push_link(
                    schema,
                    entity_id,
                    &format!("battle:{battle}"),
                    "spawns_battle",
                    Confidence::SourceBacked,
                    vec![record_id.to_string()],
                    summary([("battleRange", json!(rect.battle_range))]),
                );
            }
        }
    }
    for (slot, door) in rect.random_doors.iter().enumerate() {
        if *door > 0 {
            push_link(
                schema,
                entity_id,
                &format!("macro:{door}"),
                "calls_macro",
                Confidence::Inferred,
                vec![record_id.to_string()],
                summary([
                    ("slot", json!(slot)),
                    ("percent", json!(rect.random_door_percent[slot])),
                    ("cache", json!(cache_for(level.level_type))),
                ]),
            );
            push_link(
                schema,
                entity_id,
                &format!("runtime-cache:{}", cache_for(level.level_type)),
                "mutates_cache",
                Confidence::SourceBacked,
                vec!["anchor:runtime-consumer-matrix".to_string()],
                summary([(
                    "reason",
                    json!("positive random-door percent can be zeroed after firing"),
                )]),
            );
        }
    }
    if rect.text > 0 {
        push_link(
            schema,
            entity_id,
            &format!("message:{}", rect.text),
            "shows_message",
            Confidence::SourceBacked,
            vec![record_id.to_string()],
            summary([("randomRect", json!(rect.rect_index))]),
        );
    }
    if rect.sound > 0 {
        push_link(
            schema,
            entity_id,
            &format!("resource:snd :{}", rect.sound),
            "uses_resource",
            Confidence::Inferred,
            vec![record_id.to_string()],
            summary([("resourceType", json!("snd "))]),
        );
    }
}

fn add_runtime_cache_model(schema: &mut SemanticSchema) {
    let caches: [(&str, &[&str]); 8] = [
        ("CL", &["Data DD", "Data LD", "Data RD"]),
        ("CD", &["Data DDD", "Data DL", "Data RDD"]),
        ("CE", &["Data ED"]),
        ("CE2", &["Data ED2"]),
        ("CS", &["Data SD"]),
        ("CT", &["Data TD2"]),
        ("CTD3", &["Data TD3"]),
        ("menu", &["Data MENU", "Data MD"]),
    ];
    for (cache, sources) in caches {
        schema.sources.push(SemanticSource {
            id: runtime_cache_source_id(cache),
            source_type: "runtime cache".to_string(),
            origin: SemanticSourceOrigin::RuntimeCache,
            name: cache.to_string(),
            path: None,
            exists: false,
            bytes: 0,
            sha256: None,
            layout: None,
            confidence: Confidence::Confirmed,
        });
        schema.entities.push(SemanticEntity {
            id: format!("runtime-cache:{cache}"),
            entity_type: "runtime-cache".to_string(),
            label: format!("Runtime cache {cache}"),
            edit_state: SemanticEditState::Blocked,
            confidence: Confidence::Confirmed,
            source: cache.to_string(),
            record_ref: None,
            byte_range: None,
            editable: false,
            summary: summary([
                ("cache", json!(cache)),
                ("authoredSources", json!(sources)),
                ("generated", json!(true)),
            ]),
        });
        for source in sources {
            push_link(
                schema,
                &source_id(source),
                &format!("runtime-cache:{cache}"),
                "copied_to_cache",
                Confidence::Confirmed,
                vec!["anchor:runtime-consumer-matrix".to_string()],
                BTreeMap::new(),
            );
        }
    }
}

fn add_quest_flag_entities(schema: &mut SemanticSchema) {
    let existing: BTreeSet<String> = schema
        .entities
        .iter()
        .map(|entity| entity.id.clone())
        .collect();
    let mut flags = BTreeSet::new();
    for link in &schema.links {
        if link.to.starts_with("quest-flag:") && !existing.contains(&link.to) {
            flags.insert(link.to.clone());
        }
    }
    for id in flags {
        let flag = id.trim_start_matches("quest-flag:").to_string();
        schema.entities.push(SemanticEntity {
            id,
            entity_type: "quest flag".to_string(),
            label: format!("Quest flag {flag}"),
            edit_state: SemanticEditState::InspectOnly,
            confidence: Confidence::Inferred,
            source: "Data DD/Data DDD/Data ED3".to_string(),
            record_ref: None,
            byte_range: None,
            editable: false,
            summary: summary([("flag", json!(flag))]),
        });
    }
}

fn add_referenced_resource_placeholders(schema: &mut SemanticSchema) {
    let known: BTreeSet<String> = schema
        .entities
        .iter()
        .map(|entity| entity.id.clone())
        .collect();
    let known_types: BTreeSet<String> = schema
        .entities
        .iter()
        .filter(|entity| entity.entity_type == "resource type")
        .map(|entity| entity.id.clone())
        .collect();
    let resources: BTreeSet<String> = schema
        .links
        .iter()
        .filter_map(|link| {
            if link.to.starts_with("resource:") && !known.contains(&link.to) {
                Some(link.to.clone())
            } else {
                None
            }
        })
        .collect();
    if resources.is_empty() {
        return;
    }
    if !schema
        .sources
        .iter()
        .any(|source| source.id == shared_source_id("Realmz resources"))
    {
        schema.sources.push(SemanticSource {
            id: shared_source_id("Realmz resources"),
            source_type: "shared reference".to_string(),
            origin: SemanticSourceOrigin::SharedReference,
            name: "Realmz shared resources".to_string(),
            path: Some("bundled://realmz-reference".to_string()),
            exists: true,
            bytes: 0,
            sha256: None,
            layout: None,
            confidence: Confidence::FixtureBacked,
        });
    }
    let mut added_types = BTreeSet::new();
    for id in resources {
        let parts: Vec<_> = id.split(':').collect();
        let resource_type = parts.get(1).copied().unwrap_or("");
        let type_id = format!("resource-type:{resource_type}");
        if !known_types.contains(&type_id) && added_types.insert(type_id.clone()) {
            schema.entities.push(SemanticEntity {
                id: type_id.clone(),
                entity_type: "resource type".to_string(),
                label: format!("Resource type {resource_type}"),
                edit_state: SemanticEditState::InspectOnly,
                confidence: Confidence::Inferred,
                source: "Realmz shared resources".to_string(),
                record_ref: None,
                byte_range: None,
                editable: false,
                summary: summary([
                    ("type", json!(resource_type)),
                    ("referenceOnly", json!(true)),
                    ("family", json!(resource_family(resource_type))),
                    (
                        "sourcePrecedence",
                        json!("scenario, shared Realmz, generated fallback"),
                    ),
                ]),
            });
        }
        schema.entities.push(SemanticEntity {
            id: id.clone(),
            entity_type: "resource".to_string(),
            label: id.replace("resource:", "Resource "),
            edit_state: SemanticEditState::InspectOnly,
            confidence: Confidence::Inferred,
            source: "Realmz shared resources".to_string(),
            record_ref: None,
            byte_range: None,
            editable: false,
            summary: summary([
                ("referenceOnly", json!(true)),
                ("type", json!(resource_type)),
                ("resourceType", json!(resource_type)),
                ("resourceId", json!(parts.get(2).copied().unwrap_or(""))),
                ("family", json!(resource_family(resource_type))),
                ("scenarioSupplied", json!(false)),
                (
                    "sharedFallback",
                    json!(shared_resource_can_fallback(resource_type)),
                ),
                ("fallbackSource", json!("bundled Realmz shared resources")),
                (
                    "sourcePrecedence",
                    json!("scenario resource, shared Realmz resource, generated fallback"),
                ),
            ]),
        });
        push_link(
            schema,
            &id,
            &type_id,
            "member_of_resource_type",
            Confidence::Inferred,
            vec!["anchor:resource-fork-taxonomy".to_string()],
            BTreeMap::new(),
        );
    }
}

fn shared_resource_can_fallback(resource_type: &str) -> bool {
    matches!(
        resource_type,
        "PICT" | "cicn" | "STR#" | "snd " | "TEXT" | "styl" | "vers"
    )
}

fn resource_family(resource_type: &str) -> &'static str {
    match resource_type {
        "PICT" => "picture",
        "cicn" => "color-icon",
        "STR#" => "string-list",
        "snd " => "sound",
        "TEXT" => "text",
        "styl" => "text-style",
        "RLMZ" => "realmz-metadata",
        "vers" => "version",
        _ => "unknown-resource-family",
    }
}

fn cache_for(level_type: LevelType) -> &'static str {
    match level_type {
        LevelType::Land => "CL",
        LevelType::Dungeon => "CD",
    }
}

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
    let message_ids = project
        .messages
        .iter()
        .filter_map(|record| i16::try_from(record.id).ok())
        .collect::<BTreeSet<_>>();
    let battle_ids = project
        .battles
        .iter()
        .filter_map(|record| i16::try_from(record.id).ok())
        .collect::<BTreeSet<_>>();
    let treasure_ids = project
        .treasures
        .iter()
        .filter_map(|record| i16::try_from(record.id).ok())
        .collect::<BTreeSet<_>>();
    let shop_ids = project
        .shops
        .iter()
        .filter_map(|record| i16::try_from(record.id).ok())
        .collect::<BTreeSet<_>>();
    let simple_encounter_ids = project
        .simple_encounters
        .iter()
        .filter_map(|record| i16::try_from(record.id).ok())
        .collect::<BTreeSet<_>>();
    let complex_encounter_ids = project
        .complex_encounters
        .iter()
        .filter_map(|record| i16::try_from(record.id).ok())
        .collect::<BTreeSet<_>>();
    let macro_ids = project
        .triggers
        .iter()
        .filter(|trigger| trigger.source == "Data ED3")
        .filter_map(|trigger| i16::try_from(trigger.record_index).ok())
        .collect::<BTreeSet<_>>();
    let edcd_ids = project
        .extracodes
        .iter()
        .filter_map(|row| i16::try_from(row.id).ok())
        .collect::<BTreeSet<_>>();
    let refs = TargetReferenceSets {
        messages: &message_ids,
        battles: &battle_ids,
        treasures: &treasure_ids,
        shops: &shop_ids,
        simple_encounters: &simple_encounter_ids,
        complex_encounters: &complex_encounter_ids,
        macros: &macro_ids,
        edcd_rows: &edcd_ids,
    };
    let trigger_slots = project
        .triggers
        .iter()
        .filter_map(|trigger| {
            Some((
                trigger.level_type?,
                trigger.level_index?,
                trigger.record_index,
            ))
        })
        .collect::<BTreeSet<_>>();

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
        validate_trigger_actions(trigger, &refs, &mut errors, &mut warnings);
        if let Some(coord) = &trigger.coordinate {
            if coord.x >= MAP_SIZE || coord.y >= MAP_SIZE {
                errors.push(format!("{} has an out-of-bounds coordinate.", trigger.id));
            }
        }
        if trigger.level_type.is_some()
            && ((trigger.target_x as usize) >= MAP_SIZE || (trigger.target_y as usize) >= MAP_SIZE)
        {
            errors.push(format!("{} has an out-of-bounds target coordinate.", trigger.id));
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
            if rect.left < 0
                || rect.top < 0
                || rect.right >= MAP_SIZE as i16
                || rect.bottom >= MAP_SIZE as i16
            {
                warnings.push(format!(
                    "{} random rect {} is outside the 90x90 map.",
                    level.id, rect.rect_index
                ));
            }
            if rect.left > rect.right || rect.top > rect.bottom {
                warnings.push(format!(
                    "{} random rect {} has invalid bounds.",
                    level.id, rect.rect_index
                ));
            }
            if !(0..=10000).contains(&rect.percent) {
                warnings.push(format!(
                    "{} random rect {} has percent {} outside 0..10000.",
                    level.id, rect.rect_index, rect.percent
                ));
            }
            for (slot, percent) in rect.random_door_percent.iter().enumerate() {
                if !(0..=10000).contains(percent) {
                    warnings.push(format!(
                        "{} random rect {} extra door {} has percent {} outside 0..10000.",
                        level.id, rect.rect_index, slot, percent
                    ));
                }
            }
            for (slot, door) in rect.random_doors.iter().enumerate() {
                if *door > 0
                    && !trigger_slots.contains(&(
                        level.level_type,
                        level.level_index,
                        *door as usize,
                    ))
                {
                    warnings.push(format!(
                        "{} random rect {} extra door {} points at missing Action Point record {}.",
                        level.id, rect.rect_index, slot, door
                    ));
                }
            }
        }
    }
    for message in &project.messages {
        let message_bytes = classic_text_len(&message.text);
        if message_bytes > 255 {
            errors.push(format!(
                "Message {} is {} byte(s); Data SD2 supports at most 255 ASCII bytes.",
                message.id, message_bytes
            ));
        }
        if !message.text.is_ascii() {
            warnings.push(format!(
                "Message {} contains non-ASCII text; Classic text records are byte-oriented and may not render it as intended.",
                message.id
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
        validate_optional_reference(
            "Battle",
            battle.id,
            "before message",
            battle.message_before,
            &message_ids,
            "message",
            &mut warnings,
        );
        validate_optional_reference(
            "Battle",
            battle.id,
            "after message",
            battle.message_after,
            &message_ids,
            "message",
            &mut warnings,
        );
        validate_battle_macro_reference(battle.id, battle.battle_macro, &macro_ids, &mut warnings);
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
        if encounter.authored {
            validate_encounter_actions(
                "Simple encounter",
                encounter.id,
                &encounter.actions,
                &refs,
                &mut errors,
                &mut warnings,
            );
            if encounter.choice_results.len() > 4 {
                errors.push(format!(
                    "Simple encounter {} has {} choice result rows; Data ED supports 4.",
                    encounter.id,
                    encounter.choice_results.len()
                ));
            }
            validate_optional_reference(
                "Simple encounter",
                encounter.id,
                "prompt message",
                encounter.prompt,
                &message_ids,
                "message",
                &mut warnings,
            );
            if encounter
                .texts
                .iter()
                .any(|text| classic_text_len(text) > 79)
            {
                errors.push(format!(
                    "Simple encounter {} has text longer than 79 bytes.",
                    encounter.id
                ));
            }
            if encounter.texts.iter().any(|text| !text.is_ascii()) {
                warnings.push(format!(
                    "Simple encounter {} contains non-ASCII text; Classic encounter text is byte-oriented.",
                    encounter.id
                ));
            }
        } else if encounter.raw_bytes.len() != crate::realmz::SIMPLE_ENCOUNTER_BYTES {
            warnings.push(format!(
                "Simple encounter {} has incomplete preserved source bytes and should be re-imported before editing.",
                encounter.id
            ));
        }
    }
    for encounter in &project.complex_encounters {
        if encounter.authored {
            validate_encounter_actions(
                "Complex encounter",
                encounter.id,
                &encounter.actions,
                &refs,
                &mut errors,
                &mut warnings,
            );
            if encounter.choice_results.len() > 4 {
                errors.push(format!(
                    "Complex encounter {} has {} choice result rows; Data ED2 supports 4.",
                    encounter.id,
                    encounter.choice_results.len()
                ));
            }
            if encounter.word_results.len() > 4 {
                errors.push(format!(
                    "Complex encounter {} has {} word result rows; Data ED2 supports 4.",
                    encounter.id,
                    encounter.word_results.len()
                ));
            }
            validate_optional_reference(
                "Complex encounter",
                encounter.id,
                "prompt message",
                encounter.prompt,
                &message_ids,
                "message",
                &mut warnings,
            );
            if encounter
                .texts
                .iter()
                .any(|text| classic_text_len(text) > 39)
            {
                errors.push(format!(
                    "Complex encounter {} has text longer than 39 bytes.",
                    encounter.id
                ));
            }
            if encounter.texts.iter().any(|text| !text.is_ascii()) {
                warnings.push(format!(
                    "Complex encounter {} contains non-ASCII text; Classic encounter text is byte-oriented.",
                    encounter.id
                ));
            }
        } else if encounter.raw_bytes.len() != crate::realmz::COMPLEX_ENCOUNTER_BYTES {
            warnings.push(format!(
                "Complex encounter {} has incomplete preserved source bytes and should be re-imported before editing.",
                encounter.id
            ));
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

struct TargetReferenceSets<'a> {
    messages: &'a BTreeSet<i16>,
    battles: &'a BTreeSet<i16>,
    treasures: &'a BTreeSet<i16>,
    shops: &'a BTreeSet<i16>,
    simple_encounters: &'a BTreeSet<i16>,
    complex_encounters: &'a BTreeSet<i16>,
    macros: &'a BTreeSet<i16>,
    edcd_rows: &'a BTreeSet<i16>,
}

fn validate_trigger_actions(
    trigger: &TriggerRecord,
    refs: &TargetReferenceSets,
    errors: &mut Vec<String>,
    warnings: &mut Vec<String>,
) {
    let mut occupied = BTreeSet::new();
    for action in &trigger.actions {
        if !occupied.insert(action.slot) {
            errors.push(format!(
                "{} has multiple actions in slot {}.",
                trigger.id, action.slot
            ));
        }
        if action.slot >= 8 {
            errors.push(format!(
                "{} has action slot {} outside 0..7.",
                trigger.id, action.slot
            ));
        }
        validate_action_target(
            &trigger.id,
            action.slot,
            action.raw_code,
            action.id,
            refs,
            warnings,
        );
    }
}

fn validate_encounter_actions(
    label: &str,
    record_id: usize,
    actions: &[EncounterActionRow],
    refs: &TargetReferenceSets,
    errors: &mut Vec<String>,
    warnings: &mut Vec<String>,
) {
    let mut occupied = BTreeSet::new();
    for action in actions {
        if !occupied.insert(action.slot) {
            errors.push(format!(
                "{} {} has multiple action rows in slot {}.",
                label, record_id, action.slot
            ));
        }
        if action.slot >= 32 {
            errors.push(format!(
                "{} {} has action slot {} outside 0..31.",
                label, record_id, action.slot
            ));
        }
        if action.raw_code < i8::MIN as i16 || action.raw_code > i8::MAX as i16 {
            errors.push(format!(
                "{} {} action slot {} has CODE {} outside signed-byte range.",
                label, record_id, action.slot, action.raw_code
            ));
        }
        validate_action_target(
            &format!("{label} {record_id}"),
            action.slot,
            action.raw_code,
            action.id,
            refs,
            warnings,
        );
    }
}

fn validate_action_target(
    label: &str,
    slot: usize,
    raw_code: i16,
    id: i16,
    refs: &TargetReferenceSets,
    warnings: &mut Vec<String>,
) {
    if id <= 0 {
        return;
    }
    let code = normalize_action_code(raw_code);
    if action_code_consumes_edcd(code) {
        if !refs.edcd_rows.contains(&id) {
            warnings.push(format!(
                "{} action slot {} references Data EDCD row {}, but Providence cannot prove that row exists.",
                label, slot, id
            ));
        }
        return;
    }
    let target = match code {
        1 | 19 | 62 | 71 => Some(("message", refs.messages)),
        2 | 48 | 56 | 107 => Some(("battle", refs.battles)),
        4 | 35 | 104 => Some(("simple encounter", refs.simple_encounters)),
        5 | 44 => Some(("complex encounter", refs.complex_encounters)),
        6 | 49 | 51 => Some(("shop", refs.shops)),
        8 | 40 | 55 | 64 => Some(("Data ED3 macro", refs.macros)),
        10 => Some(("treasure", refs.treasures)),
        _ => None,
    };
    let Some((target_label, ids)) = target else {
        return;
    };
    if !ids.contains(&id) {
        warnings.push(format!(
            "{} action slot {} references {} {}, but Providence cannot prove that target exists.",
            label, slot, target_label, id
        ));
    }
}

fn action_code_consumes_edcd(code: i16) -> bool {
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
            | 107
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

fn classic_text_len(text: &str) -> usize {
    text.chars().count()
}

fn normalize_action_code(code: i16) -> i16 {
    if code < 0 && code != -14 && code != -23 {
        -code
    } else {
        code
    }
}

fn validate_optional_reference(
    label: &str,
    record_id: usize,
    field: &str,
    id: i16,
    known_ids: &BTreeSet<i16>,
    target_label: &str,
    warnings: &mut Vec<String>,
) {
    if id <= 0 {
        return;
    }
    if !known_ids.contains(&id) {
        warnings.push(format!(
            "{} {} {} references {} {}, but Providence cannot prove that target exists.",
            label, record_id, field, target_label, id
        ));
    }
}

fn validate_battle_macro_reference(
    battle_id: usize,
    id: i16,
    macro_ids: &BTreeSet<i16>,
    warnings: &mut Vec<String>,
) {
    if id == 0 {
        return;
    }
    let target_id = id.checked_abs().unwrap_or(id);
    if !macro_ids.contains(&target_id) {
        warnings.push(format!(
            "Battle {} battle macro references Data ED3 macro {}, but Providence cannot prove that target exists.",
            battle_id, target_id
        ));
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

    let mut known_ids: BTreeSet<String> = schema
        .entities
        .iter()
        .map(|entity| entity.id.clone())
        .chain(schema.records.iter().map(|record| record.id.clone()))
        .chain(schema.sources.iter().map(|source| source.id.clone()))
        .collect();
    known_ids.extend(live_semantic_ids(project));
    let links_by_target = links_by_target(&schema.links);
    let mut unresolved_link_warnings = 0usize;
    let mut unresolved_link_examples = Vec::new();
    for link in &schema.links {
        if !known_ids.contains(&link.from) {
            if unresolved_link_examples.len() < 6 {
                unresolved_link_examples.push(format!("{} starts at {}", link.id, link.from));
            }
            unresolved_link_warnings += 1;
        }
        if !known_ids.contains(&link.to) {
            if unresolved_link_examples.len() < 6 {
                unresolved_link_examples.push(format!("{} points to {}", link.id, link.to));
            }
            unresolved_link_warnings += 1;
        }
    }
    if unresolved_link_warnings > 0 {
        warnings.push(format!(
            "Semantic graph has {} unresolved imported link endpoint(s); detailed record-level diagnostics remain in the Linter/Semantic panels (examples: {}).",
            unresolved_link_warnings,
            unresolved_link_examples.join(", ")
        ));
    }
    validate_missing_sources(schema, warnings);

    for diagnostic in &schema.diagnostics {
        if semantic_diagnostic_resolved_by_live_project(diagnostic, &known_ids) {
            continue;
        }
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

fn live_semantic_ids(project: &ProvidenceProject) -> BTreeSet<String> {
    let mut ids = BTreeSet::new();
    ids.extend(
        project
            .messages
            .iter()
            .map(|record| format!("message:{}", record.id)),
    );
    ids.extend(
        project
            .battles
            .iter()
            .map(|record| format!("battle:{}", record.id)),
    );
    ids.extend(
        project
            .treasures
            .iter()
            .map(|record| format!("treasure:{}", record.id)),
    );
    ids.extend(
        project
            .shops
            .iter()
            .map(|record| format!("shop:{}", record.id)),
    );
    ids.extend(
        project
            .simple_encounters
            .iter()
            .map(|record| format!("encounter:simple:{}", record.id)),
    );
    ids.extend(
        project
            .complex_encounters
            .iter()
            .map(|record| format!("encounter:complex:{}", record.id)),
    );
    ids.extend(
        project
            .triggers
            .iter()
            .filter(|trigger| trigger.source == "Data ED3")
            .map(|trigger| format!("macro:{}", trigger.record_index)),
    );
    ids
}

fn semantic_diagnostic_resolved_by_live_project(
    diagnostic: &SemanticDiagnostic,
    known_ids: &BTreeSet<String>,
) -> bool {
    if diagnostic.diagnostic_type != "unresolved-reference" {
        return false;
    }
    diagnostic
        .data
        .get("target")
        .and_then(Value::as_str)
        .map(|target| known_ids.contains(target))
        .unwrap_or(false)
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

#[cfg(test)]
mod tests {
    use super::*;

    fn provenance() -> Provenance {
        Provenance {
            source_file: "Data DD".to_string(),
            record_index: 0,
            byte_offset: 0,
            byte_length: 28,
            confidence: Confidence::Confirmed,
        }
    }

    fn trigger_with_actions(actions: Vec<Action>) -> TriggerRecord {
        TriggerRecord {
            id: "Data DD:0:0".to_string(),
            source: "Data DD".to_string(),
            level_type: Some(LevelType::Land),
            level_index: Some(0),
            record_index: 0,
            active: true,
            doorid: 101,
            landid: 0,
            target_x: 1,
            target_y: 1,
            percent: 100,
            coordinate: Some(MapCoordinate { x: 1, y: 1 }),
            actions,
            provenance: provenance(),
        }
    }

    fn action(slot: usize, raw_code: i16, id: i16) -> Action {
        Action {
            slot,
            raw_code,
            code: normalize_action_code(raw_code),
            id,
            label: "test".to_string(),
            category: ActionCategory::Unknown,
            gosub: false,
        }
    }

    #[test]
    fn validates_trigger_action_target_references() {
        let messages = BTreeSet::from([1]);
        let empty = BTreeSet::new();
        let refs = TargetReferenceSets {
            messages: &messages,
            battles: &empty,
            treasures: &empty,
            shops: &empty,
            simple_encounters: &empty,
            complex_encounters: &empty,
            macros: &empty,
            edcd_rows: &empty,
        };
        let trigger = trigger_with_actions(vec![
            action(0, 1, 1),
            action(1, 1, 2),
            action(2, 1, -1),
            action(1, 10, 3),
            action(8, 6, 4),
        ]);
        let mut errors = Vec::new();
        let mut warnings = Vec::new();

        validate_trigger_actions(&trigger, &refs, &mut errors, &mut warnings);

        assert!(errors
            .iter()
            .any(|message| message.contains("multiple actions in slot 1")));
        assert!(errors
            .iter()
            .any(|message| message.contains("slot 8 outside 0..7")));
        assert!(warnings
            .iter()
            .any(|message| message.contains("references message 2")));
        assert!(warnings
            .iter()
            .any(|message| message.contains("references treasure 3")));
        assert!(warnings
            .iter()
            .any(|message| message.contains("references shop 4")));
        assert!(!warnings
            .iter()
            .any(|message| message.contains("references message 1")));
        assert!(!warnings
            .iter()
            .any(|message| message.contains("references message -1")));
    }

    #[test]
    fn validates_edcd_backed_actions_as_parameter_rows() {
        let empty = BTreeSet::new();
        let edcd_rows = BTreeSet::from([2]);
        let refs = TargetReferenceSets {
            messages: &empty,
            battles: &empty,
            treasures: &empty,
            shops: &empty,
            simple_encounters: &empty,
            complex_encounters: &empty,
            macros: &empty,
            edcd_rows: &edcd_rows,
        };
        let trigger = trigger_with_actions(vec![action(0, 2, 2), action(1, 48, 3)]);
        let mut errors = Vec::new();
        let mut warnings = Vec::new();

        validate_trigger_actions(&trigger, &refs, &mut errors, &mut warnings);

        assert!(!warnings
            .iter()
            .any(|message| message.contains("references battle 2")));
        assert!(warnings.iter().any(|message| {
            message.contains("references Data EDCD row 3") && message.contains("slot 1")
        }));
    }

    #[test]
    fn validates_battle_macro_references_with_negative_roots() {
        let macros = BTreeSet::from([2]);
        let mut warnings = Vec::new();

        validate_battle_macro_reference(10, -2, &macros, &mut warnings);
        validate_battle_macro_reference(11, 2, &macros, &mut warnings);
        validate_battle_macro_reference(12, -3, &macros, &mut warnings);

        assert!(!warnings.iter().any(|message| message.contains("Battle 10")));
        assert!(!warnings.iter().any(|message| message.contains("Battle 11")));
        assert!(warnings.iter().any(|message| {
            message.contains("Battle 12") && message.contains("Data ED3 macro 3")
        }));
    }

    #[test]
    fn suppresses_stale_semantic_unresolved_reference_when_live_target_exists() {
        let diagnostic = SemanticDiagnostic {
            id: "diagnostic:unresolved:0".to_string(),
            diagnostic_type: "unresolved-reference".to_string(),
            severity: DiagnosticSeverity::Warning,
            confidence: Confidence::SourceBacked,
            source: Some("Data DD".to_string()),
            message: "Data DD:0:5 action slot 1 references missing message 40".to_string(),
            data: BTreeMap::from([("target".to_string(), serde_json::json!("message:40"))]),
        };
        let known_ids = BTreeSet::from(["message:40".to_string()]);

        assert!(semantic_diagnostic_resolved_by_live_project(
            &diagnostic,
            &known_ids
        ));
    }

    #[test]
    fn summarizes_shared_resource_fallbacks() {
        let schema = SemanticSchema {
            entities: vec![
                resource_entity("resource:cicn:384", true),
                resource_entity("resource:cicn:385", true),
                resource_entity("resource:PICT:302", true),
            ],
            links: vec![
                resource_link("link:resource:0", "trigger:0", "resource:cicn:384"),
                resource_link("link:resource:1", "trigger:1", "resource:cicn:384"),
                resource_link("link:resource:2", "trigger:2", "resource:cicn:385"),
                resource_link("link:resource:3", "trigger:3", "resource:PICT:302"),
            ],
            ..SemanticSchema::default()
        };
        let known_ids = schema
            .entities
            .iter()
            .map(|entity| entity.id.clone())
            .collect::<BTreeSet<_>>();
        let links_by_target = links_by_target(&schema.links);
        let mut warnings = Vec::new();

        validate_resource_references(&schema, &known_ids, &links_by_target, &mut warnings);

        assert_eq!(warnings.len(), 1);
        assert!(warnings[0].contains("3 referenced shared Realmz resource(s)"));
        assert!(warnings[0].contains("4 semantic reference(s)"));
        assert!(warnings[0].contains("resource:cicn:384"));
    }

    #[test]
    fn summarizes_unresolved_semantic_link_endpoints() {
        let project = ProvidenceProject {
            semantic_schema: SemanticSchema {
                links: vec![
                    SemanticLink {
                        id: "link:missing:0".to_string(),
                        from: "action-slot:0".to_string(),
                        to: "macro:30001".to_string(),
                        kind: "calls_macro".to_string(),
                        confidence: Confidence::SourceBacked,
                        evidence: Vec::new(),
                        metadata: BTreeMap::new(),
                    },
                    SemanticLink {
                        id: "link:missing:1".to_string(),
                        from: "source:file:Data MENU".to_string(),
                        to: "message:1".to_string(),
                        kind: "contains".to_string(),
                        confidence: Confidence::SourceBacked,
                        evidence: Vec::new(),
                        metadata: BTreeMap::new(),
                    },
                ],
                ..SemanticSchema::default()
            },
            ..empty_project()
        };
        let mut errors = Vec::new();
        let mut warnings = Vec::new();

        validate_semantic_schema(&project, &mut errors, &mut warnings);

        let summaries = warnings
            .iter()
            .filter(|warning| warning.contains("Semantic graph has"))
            .collect::<Vec<_>>();
        assert_eq!(summaries.len(), 1);
        assert!(summaries[0].contains("4 unresolved imported link endpoint"));
        assert!(summaries[0].contains("link:missing:0"));
        assert!(!warnings
            .iter()
            .any(|warning| warning.starts_with("Semantic link link:missing")));
    }

    #[test]
    fn classic_text_len_matches_export_fallback_width() {
        assert_eq!(classic_text_len("abc"), 3);
        assert_eq!(classic_text_len("é"), 1);
        assert_eq!(classic_text_len("Realmzé"), 7);
    }

    #[test]
    fn validates_random_rect_authoring_bounds_and_percent() {
        let mut project = empty_project();
        project.maps.push(MapEntity {
            id: "land:0".to_string(),
            level_type: LevelType::Land,
            source: "Data LD".to_string(),
            index: 0,
            name: "Land 0".to_string(),
            width: MAP_SIZE,
            height: MAP_SIZE,
            tiles: vec![0; MAP_SIZE * MAP_SIZE],
            render: MapRender {
                tileset_id: "landlook-2".to_string(),
                landlook: Some(2),
                mode: RenderMode::OutdoorLandlook,
            },
            provenance: test_provenance("Data LD", 0, 0, crate::realmz::FIELD_BYTES),
        });
        project.random_levels.push(RandomLevel {
            id: "land:0:randlevel".to_string(),
            source: "Data RD".to_string(),
            level_type: LevelType::Land,
            level_index: 0,
            landlook: 2,
            is_dark: false,
            use_los: false,
            rects: vec![RandomRect {
                rect_index: 0,
                top: 4,
                left: 6,
                bottom: 2,
                right: 90,
                percent: 10001,
                battle_range: [0, 0],
                random_doors: [99, 0, 0],
                random_door_percent: [10001, 0, 0],
                only: false,
                option: 0,
                sound: 0,
                text: 0,
            }],
            raw_values: vec![0; crate::realmz::RANDLEVEL_BYTES / 2],
            provenance: test_provenance("Data RD", 0, 0, crate::realmz::RANDLEVEL_BYTES),
        });

        let report = validate_project(&project);

        assert!(report.warnings.iter().any(|warning| warning.contains("outside the 90x90 map")));
        assert!(report.warnings.iter().any(|warning| warning.contains("invalid bounds")));
        assert!(report.warnings.iter().any(|warning| warning.contains("outside 0..10000")));
        assert!(report.warnings.iter().any(|warning| warning.contains("points at missing Action Point")));
    }

    fn resource_entity(id: &str, shared_fallback: bool) -> SemanticEntity {
        SemanticEntity {
            id: id.to_string(),
            entity_type: "resource".to_string(),
            label: id.to_string(),
            edit_state: SemanticEditState::InspectOnly,
            confidence: Confidence::Inferred,
            source: "resource-fallback".to_string(),
            record_ref: None,
            byte_range: None,
            editable: false,
            summary: BTreeMap::from([
                ("referenceOnly".to_string(), serde_json::json!(true)),
                (
                    "sharedFallback".to_string(),
                    serde_json::json!(shared_fallback),
                ),
                ("scenarioSupplied".to_string(), serde_json::json!(false)),
            ]),
        }
    }

    fn resource_link(id: &str, from: &str, to: &str) -> SemanticLink {
        SemanticLink {
            id: id.to_string(),
            from: from.to_string(),
            to: to.to_string(),
            kind: "uses_resource".to_string(),
            confidence: Confidence::SourceBacked,
            evidence: Vec::new(),
            metadata: BTreeMap::new(),
        }
    }

    fn empty_project() -> ProvidenceProject {
        ProvidenceProject {
            schema_version: PROJECT_SCHEMA_VERSION,
            app_version: "test".to_string(),
            scenario: ScenarioMeta {
                id: "test".to_string(),
                name: "test".to_string(),
                project_path: String::new(),
                imported_at: String::new(),
            },
            source: SourceSnapshot {
                source_path: String::new(),
                raw_sources_dir: String::new(),
                files: Vec::new(),
                immutable: false,
            },
            maps: Vec::new(),
            triggers: Vec::new(),
            random_levels: Vec::new(),
            extracodes: Vec::new(),
            messages: Vec::new(),
            battles: Vec::new(),
            treasures: Vec::new(),
            shops: Vec::new(),
            simple_encounters: Vec::new(),
            complex_encounters: Vec::new(),
            quest_labels: Vec::new(),
            assets: Vec::new(),
            asset_catalog: AssetCatalog::default(),
            editor_metadata: EditorMetadata::default(),
            records: RecordCatalog::default(),
            diagnostics: Vec::new(),
            semantic_schema: SemanticSchema::default(),
            validation: ValidationReport::default(),
        }
    }

    fn test_provenance(source_file: &str, record_index: usize, byte_offset: usize, byte_length: usize) -> Provenance {
        Provenance {
            source_file: source_file.to_string(),
            record_index,
            byte_offset,
            byte_length,
            confidence: Confidence::SourceBacked,
        }
    }
}

fn validate_resource_references(
    schema: &SemanticSchema,
    known_ids: &BTreeSet<String>,
    links_by_target: &BTreeMap<String, Vec<&SemanticLink>>,
    warnings: &mut Vec<String>,
) {
    let mut missing_link_count = 0usize;
    for link in &schema.links {
        if link.to.starts_with("resource:") && !known_ids.contains(&link.to) {
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

    let mut fallback_resources: Vec<(String, usize)> = Vec::new();
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
            fallback_resources.push((entity.id.clone(), consumers));
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
    if !fallback_resources.is_empty() {
        let fallback_reference_count: usize = fallback_resources
            .iter()
            .map(|(_, consumers)| *consumers)
            .sum();
        let examples = fallback_resources
            .iter()
            .take(5)
            .map(|(id, consumers)| format!("{id} ({consumers})"))
            .collect::<Vec<_>>()
            .join(", ");
        warnings.push(format!(
            "{} referenced shared Realmz resource(s) are not scenario-supplied and will rely on fallback provenance when available ({} semantic reference(s); examples: {}).",
            fallback_resources.len(),
            fallback_reference_count,
            examples
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

use super::common::*;
use super::map_names::{map_record_name, ResourceMapName};
use crate::project::*;
use crate::realmz::{COMPLEX_ENCOUNTER_BYTES, SIMPLE_ENCOUNTER_BYTES};
use serde_json::{json, Value};
use std::collections::{BTreeMap, BTreeSet};

pub(super) fn add_encounters(schema: &mut SemanticSchema, buffers: &BTreeMap<String, Vec<u8>>) {
    if let Some(buffer) = buffers.get("Data ED") {
        for encounter in parse_simple_encounters(buffer) {
            add_encounter_entity(
                schema,
                "Data ED",
                "simple encounter",
                &format!("encounter:simple:{}", encounter.id),
                encounter.id,
                SIMPLE_ENCOUNTER_BYTES,
                encounter.summary,
            );
        }
        add_partial_diagnostic(
            schema,
            "Data ED",
            buffer,
            SIMPLE_ENCOUNTER_BYTES,
            super::common::SIMPLE_STRUCT_BYTES,
        );
    }
    if let Some(buffer) = buffers.get("Data ED2") {
        for encounter in parse_complex_encounters(buffer) {
            add_encounter_entity(
                schema,
                "Data ED2",
                "complex encounter",
                &format!("encounter:complex:{}", encounter.id),
                encounter.id,
                COMPLEX_ENCOUNTER_BYTES,
                encounter.summary,
            );
        }
        add_partial_diagnostic(
            schema,
            "Data ED2",
            buffer,
            COMPLEX_ENCOUNTER_BYTES,
            super::common::COMPLEX_STRUCT_BYTES,
        );
    }
}

pub(super) fn add_fixed_collections(
    schema: &mut SemanticSchema,
    buffers: &BTreeMap<String, Vec<u8>>,
    maps: &[MapEntity],
    map_names: &BTreeMap<usize, ResourceMapName>,
) {
    parse_fixed_collection(
        schema,
        buffers,
        "Data BD",
        346,
        "battle",
        "battle",
        parse_battle,
    );
    parse_fixed_collection(
        schema,
        buffers,
        "Data MD",
        210,
        "monster",
        "monster",
        parse_monster,
    );
    parse_fixed_collection(schema, buffers, "Data SD", 3002, "shop", "shop", parse_shop);
    parse_fixed_collection(
        schema,
        buffers,
        "Data SD2",
        256,
        "message",
        "message",
        parse_message,
    );
    parse_map_record_collection(schema, buffers, map_names);
    parse_fixed_collection(
        schema,
        buffers,
        "Data TD",
        48,
        "treasure",
        "treasure",
        parse_treasure,
    );
    parse_fixed_collection(
        schema,
        buffers,
        "Data TD2",
        118,
        "thief-encounter",
        "thief",
        parse_thief,
    );
    parse_fixed_collection(
        schema,
        buffers,
        "Data TD3",
        40,
        "timed-encounter",
        "time",
        parse_timed_encounter,
    );
    parse_fixed_collection(
        schema,
        buffers,
        "Data CI",
        4608,
        "contact-info",
        "contact",
        parse_contact,
    );
    parse_fixed_collection(
        schema,
        buffers,
        "Data Solids",
        1024,
        "solidity-table",
        "solids",
        parse_solids,
    );
    parse_fixed_collection(
        schema,
        buffers,
        "Data MENU",
        502,
        "menu-cache",
        "menu",
        parse_menu_cache,
    );
    add_battle_links(schema);
    add_monster_links(schema);
    add_map_record_links(schema, maps);
    add_complex_encounter_support_links(schema);
    add_treasure_links(schema);
    add_thief_links(schema);
    add_timed_encounter_links(schema);
    add_menu_cache_links(schema);
    add_item_reference_entities(schema);
    add_spell_reference_entities(schema);
}

#[derive(Debug)]
struct EncounterSummary {
    id: usize,
    summary: BTreeMap<String, Value>,
}

fn add_encounter_entity(
    schema: &mut SemanticSchema,
    source: &str,
    entity_type: &str,
    entity_id: &str,
    id: usize,
    record_bytes: usize,
    record_summary: BTreeMap<String, Value>,
) {
    let record_id = format!("record:{source}:{id}");
    schema.records.push(SemanticRecord {
        id: record_id.clone(),
        source: source_id(source),
        record_type: entity_type.to_string(),
        label: format!("{} {}", title(entity_type), id),
        edit_state: SemanticEditState::InspectOnly,
        byte_range: Some(byte_range(id * record_bytes, record_bytes)),
        confidence: Confidence::SourceBacked,
        summary: record_summary.clone(),
    });
    schema.entities.push(SemanticEntity {
        id: entity_id.to_string(),
        entity_type: entity_type.to_string(),
        label: format!("{} {}", title(entity_type), id),
        edit_state: SemanticEditState::InspectOnly,
        confidence: Confidence::SourceBacked,
        source: source.to_string(),
        record_ref: Some(record_id),
        byte_range: Some(byte_range(id * record_bytes, record_bytes)),
        editable: false,
        summary: record_summary,
    });
}

fn parse_simple_encounters(buffer: &[u8]) -> Vec<EncounterSummary> {
    let full = buffer.len() / SIMPLE_ENCOUNTER_BYTES;
    let trailing = buffer.len() % SIMPLE_ENCOUNTER_BYTES;
    let count = full + usize::from(trailing >= super::common::SIMPLE_STRUCT_BYTES);
    (0..count)
        .filter_map(|id| {
            let start = id * SIMPLE_ENCOUNTER_BYTES;
            if start + super::common::SIMPLE_STRUCT_BYTES > buffer.len() {
                return None;
            }
            let end = (start + SIMPLE_ENCOUNTER_BYTES).min(buffer.len());
            let mut record = vec![0u8; SIMPLE_ENCOUNTER_BYTES];
            record[..end - start].copy_from_slice(&buffer[start..end]);
            let text: Vec<String> = (0..4)
                .map(|slot| decode_classic_text(&record[106 + slot * 80..106 + slot * 80 + 80]))
                .filter(|value| !value.is_empty())
                .collect();
            Some(EncounterSummary {
                id,
                summary: summary([
                    ("kind", json!("simple")),
                    ("id", json!(id)),
                    ("prompt", json!(i16_be(&record, 104))),
                    ("canBackOut", json!(record[100] != 0)),
                    ("maxTimes", json!(record[101] as i8)),
                    ("casteSuccess", json!(record[102] as i8)),
                    (
                        "nonzeroActions",
                        json!(record[0..32].iter().filter(|value| **value != 0).count()),
                    ),
                    ("text", json!(text)),
                ]),
            })
        })
        .collect()
}

fn parse_complex_encounters(buffer: &[u8]) -> Vec<EncounterSummary> {
    let full = buffer.len() / COMPLEX_ENCOUNTER_BYTES;
    let trailing = buffer.len() % COMPLEX_ENCOUNTER_BYTES;
    let count = full + usize::from(trailing >= super::common::COMPLEX_STRUCT_BYTES);
    (0..count)
        .filter_map(|id| {
            let start = id * COMPLEX_ENCOUNTER_BYTES;
            if start + super::common::COMPLEX_STRUCT_BYTES > buffer.len() {
                return None;
            }
            let end = (start + COMPLEX_ENCOUNTER_BYTES).min(buffer.len());
            let mut record = vec![0u8; COMPLEX_ENCOUNTER_BYTES];
            record[..end - start].copy_from_slice(&buffer[start..end]);
            let text: Vec<String> = (0..9)
                .map(|slot| decode_classic_text(&record[160 + slot * 40..160 + slot * 40 + 40]))
                .filter(|value| !value.is_empty())
                .collect();
            Some(EncounterSummary {
                id,
                summary: summary([
                    ("kind", json!("complex")),
                    ("id", json!(id)),
                    ("prompt", json!(i16_be(&record, 158))),
                    ("canBackOut", json!(record[151] != 0)),
                    ("thief", json!(record[152] != 0)),
                    ("maxTimes", json!(record[153] as i8)),
                    ("casteSuccess", json!(record[154] as i8)),
                    ("thiefSuccess", json!(record[155] as i8)),
                    ("thiefFail", json!(record[156] as i8)),
                    (
                        "nonzeroActions",
                        json!(record[0..32].iter().filter(|value| **value != 0).count()),
                    ),
                    ("text", json!(text)),
                ]),
            })
        })
        .collect()
}

fn parse_fixed_collection(
    schema: &mut SemanticSchema,
    buffers: &BTreeMap<String, Vec<u8>>,
    source: &str,
    record_bytes: usize,
    entity_type: &str,
    prefix: &str,
    parser: fn(&[u8], usize) -> BTreeMap<String, Value>,
) {
    let Some(buffer) = buffers.get(source) else {
        return;
    };
    let count = buffer.len() / record_bytes;
    for index in 0..count {
        let start = index * record_bytes;
        let record_summary = parser(&buffer[start..start + record_bytes], index);
        let label = record_summary
            .get("name")
            .and_then(Value::as_str)
            .filter(|value| !value.is_empty())
            .map(str::to_string)
            .or_else(|| {
                record_summary
                    .get("preview")
                    .and_then(Value::as_str)
                    .map(str::to_string)
            })
            .unwrap_or_else(|| format!("{} {}", title(entity_type), index));
        let record_id = format!("record:{source}:{index}");
        schema.records.push(SemanticRecord {
            id: record_id.clone(),
            source: source_id(source),
            record_type: entity_type.to_string(),
            label: label.clone(),
            edit_state: SemanticEditState::InspectOnly,
            byte_range: Some(byte_range(start, record_bytes)),
            confidence: Confidence::SourceBacked,
            summary: record_summary.clone(),
        });
        schema.entities.push(SemanticEntity {
            id: format!("{prefix}:{index}"),
            entity_type: entity_type.to_string(),
            label,
            edit_state: SemanticEditState::InspectOnly,
            confidence: Confidence::SourceBacked,
            source: source.to_string(),
            record_ref: Some(record_id),
            byte_range: Some(byte_range(start, record_bytes)),
            editable: false,
            summary: record_summary,
        });
    }
    if buffer.len() % record_bytes != 0 {
        add_trailing_diagnostic(schema, source, buffer.len(), record_bytes);
    }
}

fn parse_map_record_collection(
    schema: &mut SemanticSchema,
    buffers: &BTreeMap<String, Vec<u8>>,
    map_names: &BTreeMap<usize, ResourceMapName>,
) {
    let source = "Data MD2";
    let record_bytes = 340;
    let Some(buffer) = buffers.get(source) else {
        return;
    };
    let count = buffer.len() / record_bytes;
    for index in 0..count {
        let start = index * record_bytes;
        let record_summary =
            parse_map_record(&buffer[start..start + record_bytes], index, map_names);
        let label = record_summary
            .get("name")
            .and_then(Value::as_str)
            .filter(|value| !value.is_empty())
            .map(str::to_string)
            .unwrap_or_else(|| format!("Map record {index}"));
        let record_id = format!("record:{source}:{index}");
        schema.records.push(SemanticRecord {
            id: record_id.clone(),
            source: source_id(source),
            record_type: "map record".to_string(),
            label: label.clone(),
            edit_state: SemanticEditState::InspectOnly,
            byte_range: Some(byte_range(start, record_bytes)),
            confidence: Confidence::SourceBacked,
            summary: record_summary.clone(),
        });
        schema.entities.push(SemanticEntity {
            id: format!("map-record:{index}"),
            entity_type: "map record".to_string(),
            label,
            edit_state: SemanticEditState::InspectOnly,
            confidence: Confidence::SourceBacked,
            source: source.to_string(),
            record_ref: Some(record_id),
            byte_range: Some(byte_range(start, record_bytes)),
            editable: false,
            summary: record_summary,
        });
    }
    if buffer.len() % record_bytes != 0 {
        add_trailing_diagnostic(schema, source, buffer.len(), record_bytes);
    }
}

fn add_monster_links(schema: &mut SemanticSchema) {
    let monsters: Vec<_> = schema
        .entities
        .iter()
        .filter(|entity| entity.entity_type == "monster")
        .cloned()
        .collect();
    for monster in monsters {
        if let Some(icon_id) = monster.summary.get("iconId").and_then(Value::as_i64) {
            if icon_id != 0 {
                push_link(
                    schema,
                    &monster.id,
                    &format!("resource:cicn:{icon_id}"),
                    "uses_resource",
                    Confidence::SourceBacked,
                    vec![monster
                        .record_ref
                        .clone()
                        .unwrap_or_else(|| monster.id.clone())],
                    summary([("field", json!("iconid"))]),
                );
            }
        }
        if let Some(macro_id) = monster.summary.get("todoOnDeath").and_then(Value::as_i64) {
            if macro_id > 0 {
                push_link(
                    schema,
                    &monster.id,
                    &format!("macro:{macro_id}"),
                    "calls_macro",
                    Confidence::SourceBacked,
                    vec!["anchor:source-anchors".to_string()],
                    summary([("reason", json!("monster death macro"))]),
                );
            }
        }
    }
}

fn add_battle_links(schema: &mut SemanticSchema) {
    let battle_entities: Vec<_> = schema
        .entities
        .iter()
        .filter(|entity| entity.entity_type == "battle")
        .cloned()
        .collect();
    let known: BTreeSet<String> = schema
        .entities
        .iter()
        .map(|entity| entity.id.clone())
        .collect();
    for battle in battle_entities {
        if let Some(monsters) = battle.summary.get("monsters").and_then(Value::as_array) {
            for monster in monsters {
                if let Some(id) = monster.as_i64() {
                    push_link_if_known(
                        schema,
                        &known,
                        &battle.id,
                        &format!("monster:{id}"),
                        "uses_monster",
                    );
                }
            }
        }
        for (field, kind) in [
            ("messageBefore", "shows_message_before"),
            ("messageAfter", "shows_message_after"),
            ("battleMacro", "calls_battle_macro"),
        ] {
            if let Some(id) = battle.summary.get(field).and_then(Value::as_i64) {
                if id != 0 {
                    let target = if field == "battleMacro" {
                        format!("macro:{id}")
                    } else {
                        format!("message:{id}")
                    };
                    push_link_if_known(schema, &known, &battle.id, &target, kind);
                }
            }
        }
    }
}

fn add_map_record_links(schema: &mut SemanticSchema, maps: &[MapEntity]) {
    let known_maps: BTreeSet<String> = maps
        .iter()
        .map(|map| map_entity_id(map.level_type, map.index))
        .collect();
    let map_records: Vec<_> = schema
        .entities
        .iter()
        .filter(|entity| entity.entity_type == "map record")
        .cloned()
        .collect();
    for record in map_records {
        let level = record.summary.get("level").and_then(Value::as_i64);
        let is_dungeon = record.summary.get("isDungeon").and_then(Value::as_bool);
        let (Some(level), Some(is_dungeon)) = (level, is_dungeon) else {
            continue;
        };
        let level_type = if is_dungeon {
            LevelType::Dungeon
        } else {
            LevelType::Land
        };
        let target = map_entity_id(level_type, level as usize);
        if known_maps.contains(&target) {
            push_link(
                schema,
                &record.id,
                &target,
                "describes_map",
                Confidence::SourceBacked,
                vec![record
                    .record_ref
                    .clone()
                    .unwrap_or_else(|| record.id.clone())],
                BTreeMap::new(),
            );
        }
    }
}

fn add_complex_encounter_support_links(schema: &mut SemanticSchema) {
    let encounters: Vec<_> = schema
        .entities
        .iter()
        .filter(|entity| entity.entity_type == "complex encounter")
        .cloned()
        .collect();
    for encounter in encounters {
        if encounter.summary.get("thief").and_then(Value::as_bool) != Some(true) {
            continue;
        }
        for field in ["thiefSuccess", "thiefFail"] {
            if let Some(id) = encounter.summary.get(field).and_then(Value::as_i64) {
                if id > 0 {
                    push_link(
                        schema,
                        &encounter.id,
                        &format!("thief:{id}"),
                        "uses_thief_encounter",
                        Confidence::SourceBacked,
                        vec![encounter
                            .record_ref
                            .clone()
                            .unwrap_or_else(|| encounter.id.clone())],
                        summary([("field", json!(field))]),
                    );
                }
            }
        }
    }
}

fn add_treasure_links(schema: &mut SemanticSchema) {
    let treasures: Vec<_> = schema
        .entities
        .iter()
        .filter(|entity| entity.entity_type == "treasure")
        .cloned()
        .collect();
    for treasure in treasures {
        if let Some(items) = treasure.summary.get("items").and_then(Value::as_array) {
            for item in items {
                let Some(item_id) = item.get("id").and_then(Value::as_i64) else {
                    continue;
                };
                let slot = item.get("slot").and_then(Value::as_i64).unwrap_or_default();
                push_link(
                    schema,
                    &treasure.id,
                    &format!("item:{item_id}"),
                    "gives_item",
                    Confidence::SourceBacked,
                    vec![treasure
                        .record_ref
                        .clone()
                        .unwrap_or_else(|| treasure.id.clone())],
                    summary([("slot", json!(slot))]),
                );
            }
        }
    }
}

fn add_thief_links(schema: &mut SemanticSchema) {
    let thieves: Vec<_> = schema
        .entities
        .iter()
        .filter(|entity| entity.entity_type == "thief-encounter")
        .cloned()
        .collect();
    for thief in thieves {
        for array_name in ["successText", "failureText", "prompts"] {
            if let Some(values) = thief.summary.get(array_name).and_then(Value::as_array) {
                for (slot, value) in values.iter().enumerate() {
                    if let Some(message_id) = value.as_i64() {
                        if message_id > 0 {
                            push_link(
                                schema,
                                &thief.id,
                                &format!("message:{message_id}"),
                                "shows_message",
                                Confidence::SourceBacked,
                                vec![thief.record_ref.clone().unwrap_or_else(|| thief.id.clone())],
                                summary([("field", json!(array_name)), ("slot", json!(slot))]),
                            );
                        }
                    }
                }
            }
        }
        for array_name in ["successSounds", "failureSounds", "promptSounds"] {
            if let Some(values) = thief.summary.get(array_name).and_then(Value::as_array) {
                for (slot, value) in values.iter().enumerate() {
                    if let Some(sound_id) = value.as_i64() {
                        if sound_id > 0 {
                            push_link(
                                schema,
                                &thief.id,
                                &format!("resource:snd :{sound_id}"),
                                "uses_resource",
                                Confidence::Inferred,
                                vec![thief.record_ref.clone().unwrap_or_else(|| thief.id.clone())],
                                summary([
                                    ("field", json!(array_name)),
                                    ("slot", json!(slot)),
                                    ("resourceType", json!("snd ")),
                                ]),
                            );
                        }
                    }
                }
            }
        }
        for array_name in ["successCodes", "failureCodes"] {
            if let Some(values) = thief.summary.get(array_name).and_then(Value::as_array) {
                for (slot, value) in values.iter().enumerate() {
                    if let Some(macro_id) = value.as_i64() {
                        if macro_id > 0 {
                            push_link(
                                schema,
                                &thief.id,
                                &format!("macro:{macro_id}"),
                                "calls_macro",
                                Confidence::Inferred,
                                vec![thief.record_ref.clone().unwrap_or_else(|| thief.id.clone())],
                                summary([("field", json!(array_name)), ("slot", json!(slot))]),
                            );
                        }
                    }
                }
            }
        }
        if let Some(spell_id) = thief.summary.get("spell").and_then(Value::as_i64) {
            if spell_id > 0 {
                push_link(
                    schema,
                    &thief.id,
                    &format!("spell:{spell_id}"),
                    "casts_spell",
                    Confidence::SourceBacked,
                    vec![thief.record_ref.clone().unwrap_or_else(|| thief.id.clone())],
                    BTreeMap::new(),
                );
            }
        }
    }
}

fn add_timed_encounter_links(schema: &mut SemanticSchema) {
    let timed: Vec<_> = schema
        .entities
        .iter()
        .filter(|entity| entity.entity_type == "timed-encounter")
        .cloned()
        .collect();
    for encounter in timed {
        if let Some(door) = encounter.summary.get("door").and_then(Value::as_i64) {
            if door > 0 {
                push_link(
                    schema,
                    &encounter.id,
                    &format!("macro:{door}"),
                    "calls_macro",
                    Confidence::SourceBacked,
                    vec![encounter
                        .record_ref
                        .clone()
                        .unwrap_or_else(|| encounter.id.clone())],
                    summary([("field", json!("door"))]),
                );
            }
        }
        if let Some(item) = encounter
            .summary
            .get("requiredItem")
            .and_then(Value::as_i64)
        {
            if item > 0 {
                push_link(
                    schema,
                    &encounter.id,
                    &format!("item:{item}"),
                    "requires_item",
                    Confidence::SourceBacked,
                    vec![encounter
                        .record_ref
                        .clone()
                        .unwrap_or_else(|| encounter.id.clone())],
                    BTreeMap::new(),
                );
            }
        }
        if let Some(quest) = encounter
            .summary
            .get("requiredQuest")
            .and_then(Value::as_i64)
        {
            if quest >= 0 {
                push_link(
                    schema,
                    &encounter.id,
                    &format!("quest-flag:{quest}"),
                    "reads_flag",
                    Confidence::SourceBacked,
                    vec![encounter
                        .record_ref
                        .clone()
                        .unwrap_or_else(|| encounter.id.clone())],
                    BTreeMap::new(),
                );
            }
        }
        let level_kind = encounter
            .summary
            .get("locationKind")
            .and_then(Value::as_str)
            .unwrap_or("any");
        let level = encounter
            .summary
            .get("requiredLevel")
            .and_then(Value::as_i64);
        if let Some(level) = level {
            let level_type = match level_kind {
                "land" => Some(LevelType::Land),
                "dungeon" => Some(LevelType::Dungeon),
                _ => None,
            };
            if let Some(level_type) = level_type {
                push_link(
                    schema,
                    &encounter.id,
                    &map_entity_id(level_type, level.max(0) as usize),
                    "requires_location",
                    Confidence::SourceBacked,
                    vec![encounter
                        .record_ref
                        .clone()
                        .unwrap_or_else(|| encounter.id.clone())],
                    BTreeMap::new(),
                );
                if let Some(rect) = encounter
                    .summary
                    .get("requiredRandomRect")
                    .and_then(Value::as_i64)
                {
                    if rect >= 0 {
                        push_link(
                            schema,
                            &encounter.id,
                            &format!("random:{}:{}:{rect}", level_type.as_str(), level.max(0)),
                            "uses_region",
                            Confidence::SourceBacked,
                            vec![encounter
                                .record_ref
                                .clone()
                                .unwrap_or_else(|| encounter.id.clone())],
                            BTreeMap::new(),
                        );
                    }
                }
            }
        }
        push_link(
            schema,
            &encounter.id,
            "runtime-cache:CTD3",
            "writes_runtime_state",
            Confidence::Confirmed,
            vec!["anchor:runtime-consumer-matrix".to_string()],
            summary([(
                "reason",
                json!("day and percent are updated after runtime checks"),
            )]),
        );
    }
}

fn add_menu_cache_links(schema: &mut SemanticSchema) {
    let menus: Vec<_> = schema
        .entities
        .iter()
        .filter(|entity| entity.entity_type == "menu-cache")
        .cloned()
        .collect();
    for menu in menus {
        if let Some(entries) = menu.summary.get("menuEntries").and_then(Value::as_array) {
            for entry in entries {
                let Some(monster_id) = entry.get("monsterRecord").and_then(Value::as_i64) else {
                    continue;
                };
                let menu_index = entry
                    .get("menuIndex")
                    .and_then(Value::as_i64)
                    .unwrap_or_default();
                push_link(
                    schema,
                    &menu.id,
                    &format!("monster:{monster_id}"),
                    "indexes_monster",
                    Confidence::SourceBacked,
                    vec![menu.record_ref.clone().unwrap_or_else(|| menu.id.clone())],
                    summary([("menuIndex", json!(menu_index))]),
                );
            }
        }
        push_link(
            schema,
            &menu.id,
            "runtime-cache:menu",
            "writes_runtime_state",
            Confidence::Inferred,
            vec!["anchor:runtime-consumer-matrix".to_string()],
            summary([(
                "reason",
                json!("Data MENU is rebuilt from Data MD when stale"),
            )]),
        );
    }
}

fn add_item_reference_entities(schema: &mut SemanticSchema) {
    let existing: BTreeSet<String> = schema
        .entities
        .iter()
        .map(|entity| entity.id.clone())
        .collect();
    let refs: BTreeSet<String> = schema
        .links
        .iter()
        .filter_map(|link| {
            if link.to.starts_with("item:") && !existing.contains(&link.to) {
                Some(link.to.clone())
            } else {
                None
            }
        })
        .collect();
    for id in refs {
        let item_id = id.trim_start_matches("item:").to_string();
        schema.entities.push(SemanticEntity {
            id,
            entity_type: "item-reference".to_string(),
            label: format!("Item {item_id}"),
            edit_state: SemanticEditState::InspectOnly,
            confidence: Confidence::Inferred,
            source: "supporting records".to_string(),
            record_ref: None,
            byte_range: None,
            editable: false,
            summary: summary([
                ("itemId", json!(item_id)),
                (
                    "referenceOnly",
                    json!("item database coverage is outside this pass"),
                ),
            ]),
        });
    }
}

fn add_spell_reference_entities(schema: &mut SemanticSchema) {
    let existing: BTreeSet<String> = schema
        .entities
        .iter()
        .map(|entity| entity.id.clone())
        .collect();
    let refs: BTreeSet<String> = schema
        .links
        .iter()
        .filter_map(|link| {
            if link.to.starts_with("spell:") && !existing.contains(&link.to) {
                Some(link.to.clone())
            } else {
                None
            }
        })
        .collect();
    for id in refs {
        let spell_id = id.trim_start_matches("spell:").to_string();
        schema.entities.push(SemanticEntity {
            id,
            entity_type: "spell-reference".to_string(),
            label: format!("Spell {spell_id}"),
            edit_state: SemanticEditState::InspectOnly,
            confidence: Confidence::Inferred,
            source: "supporting records".to_string(),
            record_ref: None,
            byte_range: None,
            editable: false,
            summary: summary([
                ("spellId", json!(spell_id)),
                (
                    "referenceOnly",
                    json!("spell database coverage is outside this pass"),
                ),
            ]),
        });
    }
}

fn push_link_if_known(
    schema: &mut SemanticSchema,
    known: &BTreeSet<String>,
    from: &str,
    to: &str,
    kind: &str,
) {
    if known.contains(to) {
        push_link(
            schema,
            from,
            to,
            kind,
            Confidence::SourceBacked,
            vec![from.to_string()],
            BTreeMap::new(),
        );
    }
}

fn parse_battle(buffer: &[u8], id: usize) -> BTreeMap<String, Value> {
    let mut monsters = BTreeSet::new();
    let mut monster_slots = 0usize;
    for slot in 0..13 * 13 {
        let value = i16_be(buffer, slot * 2);
        if value != 0 {
            monster_slots += 1;
            monsters.insert(value);
        }
    }
    summary([
        ("id", json!(id)),
        ("dist", json!(buffer[338] as i8)),
        ("messageBefore", json!(i16_be(buffer, 340))),
        ("messageAfter", json!(i16_be(buffer, 342))),
        ("battleMacro", json!(i16_be(buffer, 344))),
        ("monsterSlots", json!(monster_slots)),
        ("monsters", json!(monsters.into_iter().collect::<Vec<_>>())),
    ])
}

fn parse_monster(buffer: &[u8], id: usize) -> BTreeMap<String, Value> {
    summary([
        ("id", json!(id)),
        ("hd", json!(buffer[0])),
        ("bonus", json!(buffer[1])),
        ("dx", json!(buffer[2])),
        ("nameStringId", json!(buffer[3])),
        ("movementMax", json!(buffer[4])),
        ("ac", json!(buffer[5] as i8)),
        ("iconId", json!(i16_be(buffer, 98))),
        ("exp", json!(i16_be(buffer, 102))),
        ("staminaMax", json!(i16_be(buffer, 106))),
        ("todoOnDeath", json!(i16_be(buffer, 166))),
        ("maxSpellPoints", json!(i16_be(buffer, 168))),
        ("name", json!(decode_classic_text(&buffer[170..210]))),
    ])
}

fn parse_shop(buffer: &[u8], id: usize) -> BTreeMap<String, Value> {
    let mut item_ids = Vec::new();
    for slot in 0..1000 {
        let value = i16_be(buffer, slot * 2);
        if value != 0 {
            item_ids.push(value);
        }
    }
    summary([
        ("id", json!(id)),
        ("itemCount", json!(item_ids.len())),
        (
            "quantitySlots",
            json!(buffer[2000..3000]
                .iter()
                .filter(|value| **value != 0)
                .count()),
        ),
        ("inflation", json!(i16_be(buffer, 3000))),
        (
            "sampleItems",
            json!(item_ids.into_iter().take(18).collect::<Vec<_>>()),
        ),
    ])
}

fn parse_message(buffer: &[u8], id: usize) -> BTreeMap<String, Value> {
    let text = decode_pascal_text(buffer);
    summary([
        ("id", json!(id)),
        ("length", json!(buffer.first().copied().unwrap_or(0))),
        ("text", json!(text)),
        ("preview", json!(text.chars().take(96).collect::<String>())),
    ])
}

fn parse_map_record(
    buffer: &[u8],
    id: usize,
    map_names: &BTreeMap<usize, ResourceMapName>,
) -> BTreeMap<String, Value> {
    let mut data = summary([
        ("id", json!(id)),
        ("startX", json!(i16_be(buffer, 60))),
        ("startY", json!(i16_be(buffer, 62))),
        ("level", json!(i16_be(buffer, 64))),
        ("pictId", json!(i16_be(buffer, 66))),
        ("iconSize", json!(i16_be(buffer, 68))),
        ("show", json!(i16_be(buffer, 70))),
        ("isDungeon", json!(i16_be(buffer, 72) != 0)),
        (
            "rect",
            json!({
                "top": i16_be(buffer, 76),
                "left": i16_be(buffer, 78),
                "bottom": i16_be(buffer, 80),
                "right": i16_be(buffer, 82),
            }),
        ),
        ("note", json!(decode_pascal_text(&buffer[84..340]))),
    ]);
    if let Some(name) = map_record_name(map_names, id) {
        data.insert("name".to_string(), json!(name.name));
        data.insert("primaryName".to_string(), json!(name.primary_name));
        data.insert("secondaryName".to_string(), json!(name.secondary_name));
        data.insert(
            "nameSource".to_string(),
            json!("Scenario resource fork STR# Map Names"),
        );
    }
    data
}

fn parse_treasure(buffer: &[u8], id: usize) -> BTreeMap<String, Value> {
    let items: Vec<Value> = (0..20)
        .filter_map(|slot| {
            let item = i16_be(buffer, slot * 2);
            (item != 0).then(|| json!({"slot": slot, "id": item}))
        })
        .collect();
    let exp = i16_be(buffer, 40);
    let gold = i16_be(buffer, 42);
    let gems = i16_be(buffer, 44);
    let jewelry = i16_be(buffer, 46);
    summary([
        ("id", json!(id)),
        ("items", json!(items)),
        ("itemCount", json!(items.len())),
        ("exp", json!(exp)),
        ("gold", json!(gold)),
        ("gems", json!(gems)),
        ("jewelry", json!(jewelry)),
        (
            "hasRandomizedRewards",
            json!([exp, gold, gems, jewelry].iter().any(|value| *value < 0)),
        ),
        (
            "preview",
            json!(format!("{} items, exp {exp}, gold {gold}", items.len())),
        ),
    ])
}

fn parse_thief(buffer: &[u8], id: usize) -> BTreeMap<String, Value> {
    let type_flags: Vec<bool> = buffer[0..10].iter().map(|value| *value != 0).collect();
    let modifiers = signed_bytes(&buffer[10..18]);
    let success_codes = signed_bytes(&buffer[18..26]);
    let failure_codes = signed_bytes(&buffer[26..34]);
    let success_text = read_short_array(buffer, 34, 8);
    let failure_text = read_short_array(buffer, 50, 8);
    let success_sounds = read_short_array(buffer, 66, 8);
    let failure_sounds = read_short_array(buffer, 82, 8);
    let spell = i16_be(buffer, 98);
    let low_damage = i16_be(buffer, 100);
    let high_damage = i16_be(buffer, 102);
    let tumblers = i16_be(buffer, 104);
    let prompts = read_short_array(buffer, 106, 3);
    let prompt_sounds = read_short_array(buffer, 112, 3);
    summary([
        ("id", json!(id)),
        ("typeFlags", json!(type_flags)),
        (
            "enabledTypeSlots",
            json!(type_flags
                .iter()
                .enumerate()
                .filter_map(|(slot, enabled)| enabled.then_some(slot))
                .collect::<Vec<_>>()),
        ),
        ("modifiers", json!(modifiers)),
        ("successCodes", json!(success_codes)),
        ("failureCodes", json!(failure_codes)),
        ("successText", json!(success_text)),
        ("failureText", json!(failure_text)),
        ("successSounds", json!(success_sounds)),
        ("failureSounds", json!(failure_sounds)),
        ("spell", json!(spell)),
        ("lowDamage", json!(low_damage)),
        ("highDamage", json!(high_damage)),
        ("tumblers", json!(tumblers)),
        ("prompts", json!(prompts)),
        ("promptSounds", json!(prompt_sounds)),
        (
            "preview",
            json!(format!(
                "{} enabled checks, damage {}-{}, spell {}",
                type_flags.iter().filter(|enabled| **enabled).count(),
                low_damage,
                high_damage,
                spell
            )),
        ),
    ])
}

fn parse_timed_encounter(buffer: &[u8], id: usize) -> BTreeMap<String, Value> {
    let stuff = read_short_array(buffer, 20, 10);
    let location_kind = match stuff.first().copied().unwrap_or_default() {
        1 => "land",
        2 => "dungeon",
        _ => "any",
    };
    summary([
        ("id", json!(id)),
        ("day", json!(i16_be(buffer, 0))),
        ("increment", json!(i16_be(buffer, 2))),
        ("percent", json!(i16_be(buffer, 4))),
        ("door", json!(i16_be(buffer, 6))),
        ("requiredLevel", json!(i16_be(buffer, 8))),
        ("requiredRandomRect", json!(i16_be(buffer, 10))),
        ("requiredX", json!(i16_be(buffer, 12))),
        ("requiredY", json!(i16_be(buffer, 14))),
        ("requiredItem", json!(i16_be(buffer, 16))),
        ("requiredQuest", json!(i16_be(buffer, 18))),
        ("stuff", json!(stuff)),
        ("locationKind", json!(location_kind)),
        (
            "preview",
            json!(format!(
                "day {} +{} @ {}% -> door {}",
                i16_be(buffer, 0),
                i16_be(buffer, 2),
                i16_be(buffer, 4),
                i16_be(buffer, 6)
            )),
        ),
    ])
}

fn parse_contact(buffer: &[u8], id: usize) -> BTreeMap<String, Value> {
    let scenario_name = pascal_record_string(buffer, 0);
    let version = pascal_record_string(buffer, 1);
    let date = pascal_record_string(buffer, 2);
    let author = pascal_record_string(buffer, 3);
    let email = pascal_record_string(buffer, 4);
    let web = pascal_record_string(buffer, 5);
    let fee = pascal_record_string(buffer, 6);
    let pay_info: Vec<String> = (7..12)
        .map(|slot| pascal_record_string(buffer, slot))
        .collect();
    let titles: Vec<String> = (12..17)
        .map(|slot| pascal_record_string(buffer, slot))
        .collect();
    let description = pascal_record_string(buffer, 17);
    let non_empty = [
        scenario_name.as_str(),
        version.as_str(),
        date.as_str(),
        author.as_str(),
        email.as_str(),
        web.as_str(),
        fee.as_str(),
        description.as_str(),
    ]
    .into_iter()
    .filter(|value| !value.is_empty())
    .count()
        + pay_info.iter().filter(|value| !value.is_empty()).count()
        + titles.iter().filter(|value| !value.is_empty()).count();
    summary([
        ("id", json!(id)),
        ("scenarioName", json!(scenario_name)),
        ("version", json!(version)),
        ("date", json!(date)),
        ("author", json!(author)),
        ("email", json!(email)),
        ("web", json!(web)),
        ("fee", json!(fee)),
        ("payInfo", json!(pay_info)),
        ("titles", json!(titles)),
        ("description", json!(description)),
        ("preview", json!(pascal_record_string(buffer, 0))),
        ("nonEmptyFields", json!(non_empty)),
        (
            "nonzeroBytes",
            json!(buffer.iter().filter(|value| **value != 0).count()),
        ),
    ])
}

fn parse_solids(buffer: &[u8], id: usize) -> BTreeMap<String, Value> {
    let unique_values: BTreeSet<u8> = buffer.iter().copied().collect();
    let samples: Vec<Value> = buffer
        .iter()
        .enumerate()
        .filter(|(_, value)| **value != 0)
        .take(32)
        .map(|(index, value)| json!({"index": index, "value": value}))
        .collect();
    summary([
        ("id", json!(id)),
        (
            "solidEntries",
            json!(buffer.iter().filter(|value| **value != 0).count()),
        ),
        (
            "openEntries",
            json!(buffer.iter().filter(|value| **value == 0).count()),
        ),
        ("uniqueValues", json!(unique_values)),
        ("sampleSolidEntries", json!(samples)),
        ("tableKind", json!("terrain/contact lookup")),
        ("bytes", json!(buffer.len())),
    ])
}

fn parse_menu_cache(buffer: &[u8], id: usize) -> BTreeMap<String, Value> {
    let positions = read_short_array(buffer, 0, 251);
    let menu_entries: Vec<Value> = positions
        .iter()
        .enumerate()
        .filter_map(|(menu_index, value)| {
            (*value > 0).then(|| {
                json!({
                    "menuIndex": menu_index,
                    "storedPosition": value,
                    "monsterRecord": value - 1,
                })
            })
        })
        .collect();
    summary([
        ("id", json!(id)),
        ("positions", json!(positions)),
        ("menuEntries", json!(menu_entries)),
        ("entryCount", json!(menu_entries.len())),
        ("generatedCache", json!(true)),
        ("sourceOfTruth", json!("Data MD monster records")),
        (
            "preview",
            json!(format!("{} monster menu entries", menu_entries.len())),
        ),
    ])
}

fn read_short_array(buffer: &[u8], offset: usize, count: usize) -> Vec<i16> {
    (0..count)
        .map(|index| i16_be(buffer, offset + index * 2))
        .collect()
}

fn signed_bytes(buffer: &[u8]) -> Vec<i8> {
    buffer.iter().map(|value| *value as i8).collect()
}

fn pascal_record_string(buffer: &[u8], slot: usize) -> String {
    let start = slot * 256;
    if start >= buffer.len() {
        return String::new();
    }
    let end = (start + 256).min(buffer.len());
    decode_pascal_text(&buffer[start..end])
}

fn add_partial_diagnostic(
    schema: &mut SemanticSchema,
    source: &str,
    buffer: &[u8],
    block_bytes: usize,
    struct_bytes: usize,
) {
    let trailing = buffer.len() % block_bytes;
    if trailing >= struct_bytes {
        schema.diagnostics.push(SemanticDiagnostic {
            id: format!("diagnostic:partial:{}", source.replace(' ', "-")),
            diagnostic_type: "partial-records".to_string(),
            severity: DiagnosticSeverity::Warning,
            confidence: Confidence::FixtureBacked,
            source: Some(source.to_string()),
            message: format!("{source} contains a legacy partial record accepted by the parser."),
            data: summary([
                ("bytes", json!(buffer.len())),
                ("recordBytes", json!(block_bytes)),
                ("structBytes", json!(struct_bytes)),
                ("trailingBytes", json!(trailing)),
            ]),
        });
    } else if trailing != 0 {
        add_trailing_diagnostic(schema, source, buffer.len(), block_bytes);
    }
}

fn add_trailing_diagnostic(
    schema: &mut SemanticSchema,
    source: &str,
    bytes: usize,
    record_bytes: usize,
) {
    schema.diagnostics.push(SemanticDiagnostic {
        id: format!("diagnostic:trailing:{}", source.replace(' ', "-")),
        diagnostic_type: "trailing-bytes".to_string(),
        severity: DiagnosticSeverity::Warning,
        confidence: Confidence::FixtureBacked,
        source: Some(source.to_string()),
        message: format!(
            "{} has {} trailing bytes after full records.",
            source,
            bytes % record_bytes
        ),
        data: summary([
            ("bytes", json!(bytes)),
            ("recordBytes", json!(record_bytes)),
            ("trailingBytes", json!(bytes % record_bytes)),
        ]),
    });
}

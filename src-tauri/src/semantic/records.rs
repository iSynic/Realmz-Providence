use super::common::*;
use super::map_names::{map_record_name, ResourceMapName};
use super::opcodes::normalize_opcode;
use crate::project::*;
use crate::realmz::{
    shop_prefix_record_count, write_battles, write_complex_encounters, write_global_macro_hooks,
    write_messages, write_monster_descriptions, write_monster_set, write_monsters,
    write_option_labels, write_scenario_contact_info, write_scenario_items,
    write_scenario_restrictions, write_scenario_shell, write_shops, write_simple_encounters,
    write_thief_encounters, write_timed_encounters, write_treasures, ParsedScenario, BATTLE_BYTES,
    CASTE_BYTES, COMPLEX_ENCOUNTER_BYTES, GLOBAL_MACRO_HOOK_BYTES, ITEM_BYTES, MAP_RECORD_BYTES,
    MAP_RECORD_MARKERS, MAP_RECORD_MARKER_BYTES, MESSAGE_BYTES, MONSTER_BYTES,
    MONSTER_DESCRIPTION_BYTES, OPTION_LABEL_BYTES, RACE_BYTES, SCENARIO_CONTACT_INFO_BYTES,
    SCENARIO_RESTRICTIONS_BYTES, SHOP_BYTES, SIMPLE_ENCOUNTER_BYTES, SPELL_BYTES,
    THIEF_ENCOUNTER_BYTES, TILE_SOLIDS_BYTES, TIMED_ENCOUNTER_BYTES, TREASURE_BYTES,
};
use crate::rule_compiler::{
    write_fresh_caste_overrides, write_fresh_race_overrides, write_fresh_spell_overrides,
};
use serde_json::{json, Value};
use std::collections::{BTreeMap, BTreeSet};

pub(super) fn add_canonical_record_collections(
    schema: &mut SemanticSchema,
    scenario: &ScenarioMeta,
    parsed: &ParsedScenario,
) {
    let messages = parsed
        .messages
        .iter()
        .cloned()
        .map(|mut record| {
            record.authored = true;
            record
        })
        .collect::<Vec<_>>();
    let option_labels = parsed
        .option_labels
        .iter()
        .cloned()
        .map(|mut record| {
            record.authored = true;
            record
        })
        .collect::<Vec<_>>();
    let monster_descriptions = parsed
        .monster_descriptions
        .iter()
        .cloned()
        .map(|mut record| {
            record.authored = true;
            record
        })
        .collect::<Vec<_>>();
    let battles = parsed
        .battles
        .iter()
        .cloned()
        .map(|mut record| {
            record.authored = true;
            record
        })
        .collect::<Vec<_>>();
    let monsters = parsed
        .monsters
        .iter()
        .cloned()
        .map(|mut record| {
            record.authored = true;
            record
        })
        .collect::<Vec<_>>();
    let monster_sets: Vec<_> = parsed
        .monster_sets
        .iter()
        .cloned()
        .map(|mut set| {
            for monster in &mut set.monsters {
                monster.authored = true;
            }
            set
        })
        .collect();
    let shops = parsed
        .shops
        .iter()
        .cloned()
        .map(|mut record| {
            record.authored = true;
            record
        })
        .collect::<Vec<_>>();
    let simple_encounters = parsed
        .simple_encounters
        .iter()
        .cloned()
        .map(|mut record| {
            record.authored = true;
            record
        })
        .collect::<Vec<_>>();
    let complex_encounters = parsed
        .complex_encounters
        .iter()
        .cloned()
        .map(|mut record| {
            record.authored = true;
            record
        })
        .collect::<Vec<_>>();
    let scenario_items = parsed
        .scenario_items
        .iter()
        .cloned()
        .map(|mut record| {
            record.authored = true;
            record
        })
        .collect::<Vec<_>>();
    let treasures = parsed
        .treasures
        .iter()
        .cloned()
        .map(|mut record| {
            record.authored = true;
            record
        })
        .collect::<Vec<_>>();
    let thief_encounters = parsed
        .thief_encounters
        .iter()
        .cloned()
        .map(|mut record| {
            record.authored = true;
            record
        })
        .collect::<Vec<_>>();
    let timed_encounters = parsed
        .timed_encounters
        .iter()
        .cloned()
        .map(|mut record| {
            record.authored = true;
            record
        })
        .collect::<Vec<_>>();
    let spell_overrides = parsed
        .spell_overrides
        .iter()
        .cloned()
        .map(|mut record| {
            record.authored = true;
            record
        })
        .collect::<Vec<_>>();
    let race_overrides = parsed
        .race_overrides
        .iter()
        .cloned()
        .map(|mut record| {
            record.authored = true;
            record
        })
        .collect::<Vec<_>>();
    let caste_overrides = parsed
        .caste_overrides
        .iter()
        .cloned()
        .map(|mut record| {
            record.authored = true;
            record
        })
        .collect::<Vec<_>>();
    let mut buffers = BTreeMap::new();
    if let Some(shell) = &scenario.shell {
        let mut shell = shell.clone();
        shell.authored = true;
        let shell_source = shell.source_file.clone();
        insert_canonical_buffer(
            schema,
            &mut buffers,
            &shell_source,
            "project.json#scenario/shell",
            true,
            write_scenario_shell(&shell),
        );
        let mut security_backup = scenario.security_backup.clone().unwrap_or(shell);
        security_backup.authored = true;
        insert_canonical_buffer(
            schema,
            &mut buffers,
            "Data CS",
            if scenario.security_backup.is_some() {
                "project.json#scenario/securityBackup"
            } else {
                "project.json#scenario/shell"
            },
            true,
            write_scenario_shell(&security_backup),
        );
    }
    insert_canonical_buffer(
        schema,
        &mut buffers,
        "Data SD2",
        "project.json#messages",
        !messages.is_empty(),
        write_messages(&messages),
    );
    insert_canonical_buffer(
        schema,
        &mut buffers,
        "Data OD",
        "project.json#optionLabels",
        !option_labels.is_empty(),
        write_option_labels(&option_labels),
    );
    insert_canonical_buffer(
        schema,
        &mut buffers,
        "Data DES",
        "project.json#monsterDescriptions",
        !monster_descriptions.is_empty(),
        write_monster_descriptions(&monster_descriptions),
    );
    insert_canonical_buffer(
        schema,
        &mut buffers,
        "Data BD",
        "project.json#battles",
        !battles.is_empty(),
        write_battles(&battles),
    );
    insert_canonical_buffer(
        schema,
        &mut buffers,
        "Data MD",
        "project.json#monsters",
        !monsters.is_empty(),
        write_monsters(&monsters),
    );
    for monster_set in &monster_sets {
        if !matches!(monster_set.source_file.as_str(), "Data MD1" | "Data MD-1") {
            continue;
        }
        insert_canonical_buffer(
            schema,
            &mut buffers,
            &monster_set.source_file,
            &format!("project.json#monsterSets/{}", monster_set.set_id),
            !monster_set.monsters.is_empty(),
            write_monster_set(monster_set),
        );
    }
    insert_canonical_buffer(
        schema,
        &mut buffers,
        "Data SD",
        "project.json#shops",
        !shops.is_empty(),
        write_shops(&shops),
    );
    insert_canonical_buffer(
        schema,
        &mut buffers,
        "Data ED",
        "project.json#simpleEncounters",
        !simple_encounters.is_empty(),
        write_simple_encounters(&simple_encounters),
    );
    insert_canonical_buffer(
        schema,
        &mut buffers,
        "Data ED2",
        "project.json#complexEncounters",
        !complex_encounters.is_empty(),
        write_complex_encounters(&complex_encounters),
    );
    insert_canonical_buffer(
        schema,
        &mut buffers,
        "Data NI",
        "project.json#scenarioItems",
        !scenario_items.is_empty(),
        write_scenario_items(&scenario_items),
    );
    insert_canonical_buffer(
        schema,
        &mut buffers,
        "Data TD",
        "project.json#treasures",
        !treasures.is_empty(),
        write_treasures(&treasures),
    );
    insert_canonical_buffer(
        schema,
        &mut buffers,
        "Data TD2",
        "project.json#thiefEncounters",
        !thief_encounters.is_empty(),
        write_thief_encounters(&thief_encounters),
    );
    insert_canonical_buffer(
        schema,
        &mut buffers,
        "Data TD3",
        "project.json#timedEncounters",
        !timed_encounters.is_empty(),
        write_timed_encounters(&timed_encounters),
    );
    insert_canonical_buffer(
        schema,
        &mut buffers,
        "Data Spell",
        "project.json#spellOverrides",
        !spell_overrides.is_empty(),
        write_fresh_spell_overrides(&spell_overrides),
    );
    insert_canonical_buffer(
        schema,
        &mut buffers,
        "Data Race",
        "project.json#raceOverrides",
        !race_overrides.is_empty(),
        write_fresh_race_overrides(&race_overrides),
    );
    insert_canonical_buffer(
        schema,
        &mut buffers,
        "Data Caste",
        "project.json#casteOverrides",
        !caste_overrides.is_empty(),
        write_fresh_caste_overrides(&caste_overrides),
    );
    if let Some(contact) = &scenario.contact_info {
        let mut contact = contact.clone();
        contact.authored = true;
        insert_canonical_buffer(
            schema,
            &mut buffers,
            "Data CI",
            "project.json#scenario/contactInfo",
            true,
            write_scenario_contact_info(&contact),
        );
    }
    if let Some(restrictions) = &scenario.restrictions {
        let mut restrictions = restrictions.clone();
        restrictions.authored = true;
        insert_canonical_buffer(
            schema,
            &mut buffers,
            "Data RI",
            "project.json#scenario/restrictions",
            true,
            write_scenario_restrictions(&restrictions),
        );
    }
    if let Some(global_hooks) = &scenario.global_macro_hooks {
        let mut global_hooks = global_hooks.clone();
        global_hooks.authored = true;
        insert_canonical_buffer(
            schema,
            &mut buffers,
            "Global",
            "project.json#scenario/globalMacroHooks",
            true,
            write_global_macro_hooks(&global_hooks),
        );
    }
    if buffers.is_empty() {
        return;
    }

    add_encounters(schema, &buffers);
    add_fixed_collections(schema, &buffers, &parsed.maps, &BTreeMap::new());
    let mut canonical_sources = vec![
        (
            "Data BD",
            parsed.battles.iter().map(|record| record.id).collect(),
        ),
        (
            "Data MD",
            parsed.monsters.iter().map(|record| record.id).collect(),
        ),
        (
            "Data SD2",
            parsed.messages.iter().map(|record| record.id).collect(),
        ),
        (
            "Data OD",
            parsed
                .option_labels
                .iter()
                .map(|record| record.id)
                .collect(),
        ),
        (
            "Data DES",
            parsed
                .monster_descriptions
                .iter()
                .map(|record| record.id)
                .collect(),
        ),
        (
            "Data SD",
            parsed.shops.iter().map(|record| record.id).collect(),
        ),
        (
            "Data ED",
            parsed
                .simple_encounters
                .iter()
                .map(|record| record.id)
                .collect(),
        ),
        (
            "Data ED2",
            parsed
                .complex_encounters
                .iter()
                .map(|record| record.id)
                .collect(),
        ),
        (
            "Data NI",
            parsed
                .scenario_items
                .iter()
                .map(|record| record.id)
                .collect(),
        ),
        (
            "Data TD",
            parsed.treasures.iter().map(|record| record.id).collect(),
        ),
        (
            "Data TD2",
            parsed
                .thief_encounters
                .iter()
                .map(|record| record.id)
                .collect(),
        ),
        (
            "Data TD3",
            parsed
                .timed_encounters
                .iter()
                .map(|record| record.id)
                .collect(),
        ),
        (
            "Data Spell",
            parsed
                .spell_overrides
                .iter()
                .map(|record| record.id)
                .collect(),
        ),
        (
            "Data Race",
            parsed
                .race_overrides
                .iter()
                .map(|record| record.id)
                .collect(),
        ),
        (
            "Data Caste",
            parsed
                .caste_overrides
                .iter()
                .map(|record| record.id)
                .collect(),
        ),
    ];
    for monster_set in &parsed.monster_sets {
        if !matches!(monster_set.source_file.as_str(), "Data MD1" | "Data MD-1") {
            continue;
        }
        canonical_sources.push((
            monster_set.source_file.as_str(),
            monster_set
                .monsters
                .iter()
                .map(|record| record.id)
                .collect(),
        ));
    }
    if scenario.contact_info.is_some() {
        canonical_sources.push(("Data CI", [0usize].into_iter().collect()));
    }
    if scenario.restrictions.is_some() {
        canonical_sources.push(("Data RI", [0usize].into_iter().collect()));
    }
    if scenario.global_macro_hooks.is_some() {
        canonical_sources.push(("Global", [0usize].into_iter().collect()));
    }
    retain_canonical_records(schema, canonical_sources);
}

fn insert_canonical_buffer(
    schema: &mut SemanticSchema,
    buffers: &mut BTreeMap<String, Vec<u8>>,
    source: &str,
    path: &str,
    present: bool,
    encoded: crate::error::Result<Vec<u8>>,
) {
    if !present {
        return;
    }
    match encoded {
        Ok(bytes) => {
            schema.sources.push(SemanticSource {
                id: source_id(source),
                source_type: "canonical compiler input".to_string(),
                origin: SemanticSourceOrigin::AuthoredSource,
                name: source.to_string(),
                path: Some(path.to_string()),
                exists: true,
                bytes: bytes.len() as u64,
                sha256: None,
                layout: layout_for(source),
                confidence: Confidence::Confirmed,
            });
            buffers.insert(source.to_string(), bytes);
        }
        Err(error) => schema.diagnostics.push(SemanticDiagnostic {
            id: format!(
                "diagnostic:canonical-record-encoding:{}",
                source.replace(' ', "-").to_lowercase()
            ),
            diagnostic_type: "canonical-record-encoding".to_string(),
            severity: DiagnosticSeverity::Error,
            confidence: Confidence::Confirmed,
            source: Some(source.to_string()),
            message: format!("Could not map canonical {source} records: {error}"),
            data: BTreeMap::new(),
        }),
    }
}

fn retain_canonical_records(schema: &mut SemanticSchema, sources: Vec<(&str, BTreeSet<usize>)>) {
    let source_ids: BTreeSet<_> = sources
        .iter()
        .map(|(source, _)| source_id(source))
        .collect();
    let allowed_records: BTreeSet<_> = sources
        .iter()
        .flat_map(|(source, ids)| ids.iter().map(move |id| format!("record:{source}:{id}")))
        .collect();
    let removed_entities: BTreeSet<_> = schema
        .entities
        .iter()
        .filter(|entity| {
            source_ids.contains(&source_id(&entity.source))
                && entity
                    .record_ref
                    .as_ref()
                    .is_some_and(|record| !allowed_records.contains(record))
        })
        .map(|entity| entity.id.clone())
        .collect();
    schema.records.retain(|record| {
        !source_ids.contains(&record.source) || allowed_records.contains(&record.id)
    });
    schema
        .entities
        .retain(|entity| !removed_entities.contains(&entity.id));
    schema
        .links
        .retain(|link| !removed_entities.contains(&link.from));
    for record in &mut schema.records {
        if !allowed_records.contains(&record.id) {
            continue;
        }
        record.edit_state = SemanticEditState::Editable;
        record.confidence = Confidence::Confirmed;
        record.summary.insert("canonical".to_string(), json!(true));
    }
    for entity in &mut schema.entities {
        if entity
            .record_ref
            .as_ref()
            .is_some_and(|record| allowed_records.contains(record))
        {
            entity.edit_state = SemanticEditState::Editable;
            entity.confidence = Confidence::Confirmed;
            entity.editable = true;
            entity.summary.insert("canonical".to_string(), json!(true));
        }
    }
}

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

pub(super) fn add_encounter_macro_links(
    schema: &mut SemanticSchema,
    simple_encounters: &[SimpleEncounterRecord],
    complex_encounters: &[ComplexEncounterRecord],
) {
    for (kind, encounters) in [
        (
            "simple",
            simple_encounters
                .iter()
                .map(|encounter| (encounter.id, &encounter.actions))
                .collect::<Vec<_>>(),
        ),
        (
            "complex",
            complex_encounters
                .iter()
                .map(|encounter| (encounter.id, &encounter.actions))
                .collect::<Vec<_>>(),
        ),
    ] {
        for (encounter_id, actions) in encounters {
            let entity_id = format!("encounter:{kind}:{encounter_id}");
            for action in actions {
                if normalize_opcode(action.raw_code) != 39 || action.id < 0 {
                    continue;
                }
                let result = action.slot / 8 + 1;
                let step = action.slot % 8 + 1;
                push_link(
                    schema,
                    &entity_id,
                    &format!("macro:{}", action.id),
                    "calls_macro",
                    Confidence::SourceBacked,
                    vec![format!(
                        "record:Data E{}:{encounter_id}",
                        if kind == "complex" { "D2" } else { "D" }
                    )],
                    summary([
                        ("opcode", json!(39)),
                        ("rawCode", json!(action.raw_code)),
                        ("slot", json!(action.slot)),
                        ("result", json!(result)),
                        ("step", json!(step)),
                    ]),
                );
            }
        }
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
        BATTLE_BYTES,
        "battle",
        "battle",
        parse_battle,
    );
    parse_fixed_collection(
        schema,
        buffers,
        "Data MD",
        MONSTER_BYTES,
        "monster",
        "monster",
        parse_monster,
    );
    parse_fixed_collection(
        schema,
        buffers,
        "Data MD1",
        MONSTER_BYTES,
        "alternate-monster",
        "monster-set:1",
        parse_monster,
    );
    parse_fixed_collection(
        schema,
        buffers,
        "Data MD-1",
        MONSTER_BYTES,
        "alternate-monster",
        "monster-set:-1",
        parse_monster,
    );
    parse_fixed_collection(
        schema,
        buffers,
        "Data DES",
        MONSTER_DESCRIPTION_BYTES,
        "monster-description",
        "monster-description",
        parse_monster_description,
    );
    parse_fixed_collection(
        schema, buffers, "Data SD", SHOP_BYTES, "shop", "shop", parse_shop,
    );
    parse_fixed_collection(
        schema,
        buffers,
        "Data SD2",
        MESSAGE_BYTES,
        "message",
        "message",
        parse_message,
    );
    parse_fixed_collection(
        schema,
        buffers,
        "Data OD",
        OPTION_LABEL_BYTES,
        "option-label",
        "option-label",
        parse_option_label,
    );
    parse_map_record_collection(schema, buffers, map_names);
    parse_fixed_collection(
        schema,
        buffers,
        "Data TD",
        TREASURE_BYTES,
        "treasure",
        "treasure",
        parse_treasure,
    );
    parse_fixed_collection(
        schema,
        buffers,
        "Data TD2",
        THIEF_ENCOUNTER_BYTES,
        "thief-encounter",
        "thief",
        parse_thief,
    );
    parse_fixed_collection(
        schema,
        buffers,
        "Data TD3",
        TIMED_ENCOUNTER_BYTES,
        "timed-encounter",
        "time",
        parse_timed_encounter,
    );
    parse_fixed_collection(
        schema,
        buffers,
        "Data Spell",
        SPELL_BYTES,
        "spell-override",
        "spell-override",
        parse_spell_override,
    );
    parse_fixed_collection(
        schema,
        buffers,
        "Data Race",
        RACE_BYTES,
        "race-override",
        "race-override",
        parse_race_override,
    );
    parse_fixed_collection(
        schema,
        buffers,
        "Data Caste",
        CASTE_BYTES,
        "caste-override",
        "caste-override",
        parse_caste_override,
    );
    parse_fixed_collection(
        schema,
        buffers,
        "Data CI",
        SCENARIO_CONTACT_INFO_BYTES,
        "contact-info",
        "contact",
        parse_contact,
    );
    parse_fixed_collection(
        schema,
        buffers,
        "Data RI",
        SCENARIO_RESTRICTIONS_BYTES,
        "scenario-restriction",
        "restriction",
        parse_restriction,
    );
    parse_fixed_collection(
        schema,
        buffers,
        "Global",
        GLOBAL_MACRO_HOOK_BYTES,
        "global-macro",
        "global",
        parse_global_macros,
    );
    parse_fixed_collection(
        schema,
        buffers,
        "Data Solids",
        TILE_SOLIDS_BYTES,
        "solidity-table",
        "solids",
        parse_solids,
    );
    parse_item_collection(schema, buffers);
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
    add_global_macro_links(schema);
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
    let count = if source == "Data SD" {
        shop_prefix_record_count(buffer)
    } else {
        buffer.len() / record_bytes
    };
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
            record_ref: Some(record_id.clone()),
            byte_range: Some(byte_range(start, record_bytes)),
            editable: false,
            summary: record_summary,
        });
    }
    if buffer.len() % record_bytes != 0 {
        add_trailing_diagnostic(schema, source, buffer.len(), record_bytes);
    }
}

fn parse_item_collection(schema: &mut SemanticSchema, buffers: &BTreeMap<String, Vec<u8>>) {
    let source = "Data NI";
    let record_bytes = ITEM_BYTES;
    let Some(buffer) = buffers.get(source) else {
        return;
    };
    let count = buffer.len() / record_bytes;
    for index in 0..count {
        let start = index * record_bytes;
        let record_summary = parse_item(&buffer[start..start + record_bytes], index, source);
        let item_id = record_summary
            .get("itemId")
            .and_then(Value::as_i64)
            .unwrap_or((800 + index) as i64);
        let category = record_summary
            .get("category")
            .and_then(Value::as_str)
            .unwrap_or("Item");
        let label = format!("{category} {item_id}");
        let record_id = format!("record:{source}:{index}");
        let icon_id = record_summary
            .get("iconId")
            .and_then(Value::as_i64)
            .unwrap_or(0);
        let sound_id = record_summary
            .get("sound")
            .and_then(Value::as_i64)
            .unwrap_or(0);
        let item_type = record_summary
            .get("type")
            .and_then(Value::as_i64)
            .unwrap_or_default();
        let special1 = record_summary
            .get("special1")
            .and_then(Value::as_i64)
            .unwrap_or_default();
        let special5 = record_summary
            .get("special5")
            .and_then(Value::as_i64)
            .unwrap_or(-1);
        schema.records.push(SemanticRecord {
            id: record_id.clone(),
            source: source_id(source),
            record_type: "item".to_string(),
            label: label.clone(),
            edit_state: SemanticEditState::InspectOnly,
            byte_range: Some(byte_range(start, record_bytes)),
            confidence: Confidence::SourceBacked,
            summary: record_summary.clone(),
        });
        let entity_id = format!("item:{item_id}");
        schema.entities.push(SemanticEntity {
            id: entity_id.clone(),
            entity_type: "item".to_string(),
            label,
            edit_state: SemanticEditState::InspectOnly,
            confidence: Confidence::SourceBacked,
            source: source.to_string(),
            record_ref: Some(record_id.clone()),
            byte_range: Some(byte_range(start, record_bytes)),
            editable: false,
            summary: record_summary,
        });
        if icon_id != 0 {
            push_link(
                schema,
                &entity_id,
                &format!("resource:cicn:{icon_id}"),
                "uses_resource",
                Confidence::SourceBacked,
                vec![record_id.clone()],
                summary([("field", json!("iconId"))]),
            );
        }
        if sound_id != 0 {
            push_link(
                schema,
                &entity_id,
                &format!("resource:snd :{sound_id}"),
                "uses_resource",
                Confidence::SourceBacked,
                vec![record_id.clone()],
                summary([("field", json!("sound"))]),
            );
        }
        if (item_type.abs() == 23 || special1 == -23) && special5 >= 0 {
            push_link(
                schema,
                &entity_id,
                &format!("macro:{special5}"),
                "calls_macro",
                Confidence::SourceBacked,
                vec![record_id.clone()],
                summary([
                    ("field", json!("special5")),
                    ("itemType", json!(item_type)),
                    ("special1", json!(special1)),
                    ("reason", json!("door item activates an Extra Action Point")),
                ]),
            );
        }
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
    let record_bytes = MAP_RECORD_BYTES;
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

fn parse_item(buffer: &[u8], index: usize, source_name: &str) -> BTreeMap<String, Value> {
    let base_id = if source_name == "Data NI" { 800 } else { 0 };
    let item_number = base_id + index;
    let category_index = item_number / 200;
    let category_slot = item_number % 200;
    let category = match category_index {
        0 => "Weapon",
        1 => "Armor",
        2 => "Accessory",
        3 => "Magic",
        4 => "Supply / Special",
        _ => "Item",
    };
    let stored_id = i16_be(buffer, 2);
    let item_id = if stored_id != 0 {
        stored_id
    } else {
        item_number as i16
    };
    summary([
        ("id", json!(index)),
        ("itemId", json!(item_id)),
        ("category", json!(category)),
        ("categorySlot", json!(category_slot)),
        ("sourceFile", json!(source_name)),
        ("scenarioLocal", json!(source_name == "Data NI")),
        (
            "divinityEditableRange",
            json!((900..=999).contains(&item_id)),
        ),
        ("st", json!(i16_be(buffer, 0))),
        ("storedItemId", json!(stored_id)),
        ("iconId", json!(i16_be(buffer, 4))),
        ("type", json!(i16_be(buffer, 6))),
        ("blunt", json!(i16_be(buffer, 8))),
        ("hands", json!(i16_be(buffer, 10))),
        ("lu", json!(i16_be(buffer, 12))),
        ("movement", json!(i16_be(buffer, 14))),
        ("ac", json!(i16_be(buffer, 16))),
        ("magicResistance", json!(i16_be(buffer, 18))),
        ("damage", json!(i16_be(buffer, 20))),
        ("spellPoints", json!(i16_be(buffer, 22))),
        ("sound", json!(i16_be(buffer, 24))),
        ("weight", json!(i16_be(buffer, 26))),
        ("cost", json!(i16_be(buffer, 28))),
        ("charge", json!(i16_be(buffer, 30))),
        ("cursedItemId", json!(i16_be(buffer, 32))),
        ("magical", json!(i16_be(buffer, 34))),
        ("itemCat0", json!(i32_be(buffer, 36))),
        ("itemCat1", json!(i32_be(buffer, 40))),
        ("raceRestrictions", json!(i16_be(buffer, 44))),
        ("casteRestrictions", json!(i16_be(buffer, 46))),
        ("specificRace", json!(i16_be(buffer, 48))),
        ("specificCaste", json!(i16_be(buffer, 50))),
        ("raceClassOnly", json!(i16_be(buffer, 52))),
        ("casteClassOnly", json!(i16_be(buffer, 54))),
        ("vSmall", json!(i16_be(buffer, 70))),
        ("vLarge", json!(i16_be(buffer, 72))),
        ("heat", json!(i16_be(buffer, 74))),
        ("cold", json!(i16_be(buffer, 76))),
        ("electric", json!(i16_be(buffer, 78))),
        ("vsUndead", json!(i16_be(buffer, 80))),
        ("vsDemonDevil", json!(i16_be(buffer, 82))),
        ("vsEvil", json!(i16_be(buffer, 84))),
        ("special1", json!(i16_be(buffer, 86))),
        ("special2", json!(i16_be(buffer, 88))),
        ("special3", json!(i16_be(buffer, 90))),
        ("special4", json!(i16_be(buffer, 92))),
        ("special5", json!(i16_be(buffer, 94))),
        ("weightPerCharge", json!(i16_be(buffer, 96))),
        ("dropOnEmpty", json!(i16_be(buffer, 98))),
        (
            "preview",
            json!(format!(
                "{category} {}, cost {}, icon {}",
                item_id,
                i16_be(buffer, 28),
                i16_be(buffer, 4)
            )),
        ),
    ])
}

fn add_monster_links(schema: &mut SemanticSchema) {
    let monsters: Vec<_> = schema
        .entities
        .iter()
        .filter(|entity| matches!(entity.entity_type.as_str(), "monster" | "alternate-monster"))
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
        ] {
            if let Some(id) = battle.summary.get(field).and_then(Value::as_i64) {
                if id != 0 {
                    let target = format!("message:{id}");
                    push_link_if_known(schema, &known, &battle.id, &target, kind);
                }
            }
        }
        if let Some(id) = battle.summary.get("battleMacro").and_then(Value::as_i64) {
            if id != 0 {
                let target = format!("macro:{}", id.abs());
                if known.contains(&target) {
                    push_link(
                        schema,
                        &battle.id,
                        &target,
                        "calls_battle_macro",
                        Confidence::SourceBacked,
                        vec![battle
                            .record_ref
                            .clone()
                            .unwrap_or_else(|| battle.id.clone())],
                        summary([("rawValue", json!(id))]),
                    );
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
        if let Some(pict_id) = record.summary.get("pictId").and_then(Value::as_i64) {
            if pict_id != 0 {
                push_link(
                    schema,
                    &record.id,
                    &format!("resource:PICT:{pict_id}"),
                    "uses_resource",
                    Confidence::SourceBacked,
                    vec![record
                        .record_ref
                        .clone()
                        .unwrap_or_else(|| record.id.clone())],
                    summary([("field", json!("pictid"))]),
                );
            }
        }
        if let Some(icon_slots) = record.summary.get("iconSlots").and_then(Value::as_array) {
            for icon in icon_slots {
                let icon_id = icon
                    .get("iconId")
                    .and_then(Value::as_i64)
                    .unwrap_or_default();
                if icon_id == 0 {
                    continue;
                }
                let slot = icon.get("slot").and_then(Value::as_i64).unwrap_or_default();
                push_link(
                    schema,
                    &record.id,
                    &format!("resource:cicn:{icon_id}"),
                    "uses_resource",
                    Confidence::SourceBacked,
                    vec![record
                        .record_ref
                        .clone()
                        .unwrap_or_else(|| record.id.clone())],
                    summary([("field", json!("icon")), ("slot", json!(slot))]),
                );
            }
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
        if let Some(id) = encounter
            .summary
            .get("thiefSuccess")
            .and_then(Value::as_i64)
        {
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
                    summary([("field", json!("thiefSuccess"))]),
                );
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

fn add_global_macro_links(schema: &mut SemanticSchema) {
    let globals: Vec<_> = schema
        .entities
        .iter()
        .filter(|entity| entity.entity_type == "global-macro" && entity.id.starts_with("global:"))
        .cloned()
        .collect();
    for global in globals {
        let Some(active_slots) = global.summary.get("activeSlots").and_then(Value::as_array) else {
            continue;
        };
        for slot in active_slots {
            let slot_index = slot.get("slot").and_then(Value::as_i64).unwrap_or_default();
            let door = slot.get("door").and_then(Value::as_i64).unwrap_or_default();
            let source_backed = slot
                .get("sourceBacked")
                .and_then(Value::as_bool)
                .unwrap_or(false);
            if door <= 0 || !source_backed {
                continue;
            }
            let label = slot
                .get("label")
                .and_then(Value::as_str)
                .unwrap_or("Global macro hook");
            push_link(
                schema,
                &global.id,
                &format!("macro:{door}"),
                "calls_macro",
                Confidence::SourceBacked,
                vec![global
                    .record_ref
                    .clone()
                    .unwrap_or_else(|| global.id.clone())],
                summary([
                    ("slot", json!(slot_index)),
                    ("field", json!(label)),
                    ("door", json!(door)),
                ]),
            );
        }
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

fn parse_monster_description(buffer: &[u8], id: usize) -> BTreeMap<String, Value> {
    let text = decode_pascal_text(buffer);
    summary([
        ("id", json!(id)),
        ("length", json!(buffer.first().copied().unwrap_or(0))),
        ("text", json!(text)),
        ("preview", json!(text.chars().take(96).collect::<String>())),
    ])
}

fn parse_option_label(buffer: &[u8], id: usize) -> BTreeMap<String, Value> {
    let text = decode_pascal_text(buffer);
    let shortcut = text
        .chars()
        .find(|value| !value.is_whitespace())
        .map(|value| value.to_ascii_lowercase().to_string());
    summary([
        ("id", json!(id)),
        ("length", json!(buffer.first().copied().unwrap_or(0))),
        ("text", json!(text)),
        ("preview", json!(text.chars().take(24).collect::<String>())),
        ("shortcut", json!(shortcut)),
    ])
}

fn parse_map_record(
    buffer: &[u8],
    id: usize,
    map_names: &BTreeMap<usize, ResourceMapName>,
) -> BTreeMap<String, Value> {
    let icon_slots: Vec<Value> = (0..MAP_RECORD_MARKERS)
        .filter_map(|slot| {
            let offset = slot * MAP_RECORD_MARKER_BYTES;
            let icon_id = i16_be(buffer, offset);
            (icon_id != 0).then(|| {
                json!({
                    "slot": slot,
                    "iconId": icon_id,
                    "x": i16_be(buffer, offset + 2),
                    "y": i16_be(buffer, offset + 4),
                })
            })
        })
        .collect();
    let mut data = summary([
        ("id", json!(id)),
        ("iconSlots", json!(icon_slots)),
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
        (
            "note",
            json!(decode_pascal_text(&buffer[84..MAP_RECORD_BYTES])),
        ),
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

fn parse_spell_override(buffer: &[u8], id: usize) -> BTreeMap<String, Value> {
    summary([
        ("id", json!(id)),
        ("range1", json!(buffer[0])),
        ("range2", json!(buffer[1])),
        ("queueIcon", json!(buffer[2])),
        ("toHitBonus", json!(buffer[3] as i8)),
        ("saveBonus", json!(buffer[4] as i8)),
        ("fixedTargetNum", json!(buffer[5])),
        ("canRotate", json!(buffer[6])),
        ("saveAdjust", json!(buffer[7] as i8)),
        ("cannot", json!(buffer[8])),
        ("resistAdjust", json!(buffer[9] as i8)),
        ("cost", json!(buffer[10])),
        (
            "damage",
            json!([buffer[11], buffer[12], buffer[13], buffer[14]]),
        ),
        (
            "duration",
            json!([buffer[15], buffer[16], buffer[17], buffer[18]]),
        ),
        ("spellLooks", json!([buffer[19], buffer[20]])),
        ("sounds", json!([buffer[21], buffer[22]])),
        ("targetType", json!(buffer[23])),
        ("size", json!(buffer[24])),
        ("special", json!(buffer[25])),
        ("damageType", json!(buffer[26])),
        ("spellClass", json!(buffer[27])),
        ("inCombat", json!(buffer[28] != 0)),
        ("inCamp", json!(buffer[29] != 0)),
    ])
}

fn parse_race_override(buffer: &[u8], id: usize) -> BTreeMap<String, Value> {
    summary([
        ("id", json!(id)),
        ("maxAge", json!(i16_be(buffer, 192))),
        ("doesNotDie", json!(i16_be(buffer, 194))),
        ("baseMove", json!(i16_be(buffer, 196))),
        ("magRes", json!(i16_be(buffer, 198))),
        ("twoHand", json!(i16_be(buffer, 200))),
        ("missile", json!(i16_be(buffer, 202))),
        ("numOfAttacks", json!(read_short_array(buffer, 204, 2))),
        (
            "casteSlots",
            json!(buffer[208..238]
                .iter()
                .enumerate()
                .filter_map(|(slot, enabled)| (*enabled != 0).then_some(slot))
                .collect::<Vec<_>>()),
        ),
        ("canRegenerate", json!(buffer[333])),
        ("defaultIconSet", json!(i16_be(buffer, 334))),
        (
            "itemTypes",
            json!([i32_be(buffer, 336), i32_be(buffer, 340)]),
        ),
        ("descriptors", json!(i16_be(buffer, 344))),
    ])
}

fn parse_caste_override(buffer: &[u8], id: usize) -> BTreeMap<String, Value> {
    summary([
        ("id", json!(id)),
        ("canUseMissile", json!(i16_be(buffer, 212))),
        ("getsMissileBonus", json!(i16_be(buffer, 214))),
        ("stamina", json!(read_short_array(buffer, 216, 2))),
        ("strength", json!(read_short_array(buffer, 220, 2))),
        ("dodge", json!(read_short_array(buffer, 224, 2))),
        ("toHit", json!(read_short_array(buffer, 228, 2))),
        ("missile", json!(read_short_array(buffer, 232, 2))),
        ("hand2Hand", json!(read_short_array(buffer, 236, 2))),
        ("casteClass", json!(i16_be(buffer, 248))),
        ("minimumAgeGroup", json!(i16_be(buffer, 250))),
        ("moveBonus", json!(i16_be(buffer, 252))),
        ("magRes", json!(i16_be(buffer, 254))),
        ("twoHand", json!(i16_be(buffer, 256))),
        ("maxStaminaBonus", json!(i16_be(buffer, 258))),
        ("bonusAttacks", json!(i16_be(buffer, 260))),
        ("maxAttacks", json!(i16_be(buffer, 262))),
        ("startMoney", json!(i16_be(buffer, 384))),
        ("startItems", json!(read_short_array(buffer, 386, 20))),
        ("attacks", json!(buffer[426..436].to_vec())),
        (
            "itemTypes",
            json!([i32_be(buffer, 436), i32_be(buffer, 440)]),
        ),
        ("defaultIcon", json!(i16_be(buffer, 444))),
        ("maxSpellsAttacks", json!(i16_be(buffer, 446))),
        ("spellsSoFar", json!(i16_be(buffer, 448))),
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

fn parse_restriction(buffer: &[u8], id: usize) -> BTreeMap<String, Value> {
    let description = decode_pascal_text(&buffer[0..256]);
    let max_pc = i16_be(buffer, 256);
    let max_level = i16_be(buffer, 258);
    let banned_races: Vec<Value> = buffer[260..290]
        .iter()
        .enumerate()
        .filter(|(_, value)| **value != 0)
        .map(|(index, value)| json!({"raceId": index + 1, "value": value}))
        .collect();
    let banned_castes: Vec<Value> = buffer[290..320]
        .iter()
        .enumerate()
        .filter(|(_, value)| **value != 0)
        .map(|(index, value)| json!({"casteId": index + 1, "value": value}))
        .collect();
    summary([
        ("id", json!(id)),
        ("description", json!(description)),
        (
            "preview",
            json!(description.chars().take(96).collect::<String>()),
        ),
        ("maxPartyCharacters", json!(max_pc)),
        ("maxPartyLevel", json!(max_level)),
        ("bannedRaces", json!(banned_races)),
        ("bannedCastes", json!(banned_castes)),
        (
            "bannedRaceCount",
            json!(buffer[260..290].iter().filter(|value| **value != 0).count()),
        ),
        (
            "bannedCasteCount",
            json!(buffer[290..320].iter().filter(|value| **value != 0).count()),
        ),
    ])
}

fn parse_global_macros(buffer: &[u8], id: usize) -> BTreeMap<String, Value> {
    let slots: Vec<Value> = (0..30)
        .map(|slot| {
            let door = i16_be(buffer, slot * 2);
            json!({
                "slot": slot,
                "door": door,
                "label": global_macro_slot_label(slot),
                "runtimeConsumer": global_macro_slot_runtime_consumer(slot),
                "sourceBacked": matches!(slot, 0 | 1 | 2 | 4 | 5),
            })
        })
        .collect();
    let active_slots: Vec<Value> = (0..30)
        .filter_map(|slot| {
            let door = i16_be(buffer, slot * 2);
            (door != 0).then(|| {
                json!({
                    "slot": slot,
                    "door": door,
                    "label": global_macro_slot_label(slot),
                    "sourceBacked": matches!(slot, 0 | 1 | 2 | 4 | 5),
                })
            })
        })
        .collect();
    summary([
        ("id", json!(id)),
        ("slots", json!(slots)),
        ("activeSlots", json!(active_slots)),
        (
            "preview",
            json!(format!(
                "{} active global macro hook(s)",
                buffer
                    .chunks_exact(2)
                    .filter(|chunk| i16_be(chunk, 0) != 0)
                    .count()
            )),
        ),
    ])
}

fn global_macro_slot_label(slot: usize) -> &'static str {
    match slot {
        0 => "Start game",
        1 => "Party death",
        2 => "End/quit game",
        4 => "Before shop",
        5 => "Before temple",
        _ => "Preserved slot",
    }
}

fn global_macro_slot_runtime_consumer(slot: usize) -> &'static str {
    match slot {
        0 => "mainscreeninit/new-game start",
        1 => "partyloss death/revive path",
        2 => "end current game",
        4 => "shop button when shop is available",
        5 => "shop/temple button when temple is available",
        _ => "no source-backed runtime consumer found",
    }
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
        ("tableKind", json!("special negative tile solidity")),
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

fn i32_be(buffer: &[u8], offset: usize) -> i32 {
    if offset + 4 > buffer.len() {
        return 0;
    }
    i32::from_be_bytes([
        buffer[offset],
        buffer[offset + 1],
        buffer[offset + 2],
        buffer[offset + 3],
    ])
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

#[cfg(test)]
mod tests {
    use super::*;

    fn entity(id: &str, entity_type: &str, summary: BTreeMap<String, Value>) -> SemanticEntity {
        SemanticEntity {
            id: id.to_string(),
            entity_type: entity_type.to_string(),
            label: id.to_string(),
            edit_state: SemanticEditState::InspectOnly,
            confidence: Confidence::SourceBacked,
            source: "test".to_string(),
            record_ref: Some(format!("record:{id}")),
            byte_range: None,
            editable: false,
            summary,
        }
    }

    #[test]
    fn negative_battle_macro_links_to_positive_ed3_row() {
        let mut schema = SemanticSchema::default();
        schema.entities.push(entity(
            "battle:3",
            "battle",
            summary([("battleMacro", json!(-7)), ("monsters", json!([]))]),
        ));
        schema
            .entities
            .push(entity("macro:7", "ed3-action-record", BTreeMap::new()));

        add_battle_links(&mut schema);

        let link = schema
            .links
            .iter()
            .find(|link| link.kind == "calls_battle_macro")
            .expect("negative battle macro should link to the positive ED3 row");
        assert_eq!(link.from, "battle:3");
        assert_eq!(link.to, "macro:7");
        assert_eq!(link.metadata.get("rawValue"), Some(&json!(-7)));
    }

    #[test]
    fn timed_summary_omits_annex_only_reserved_words() {
        let mut bytes = vec![0; crate::realmz::TIMED_ENCOUNTER_BYTES];
        bytes[20..22].copy_from_slice(&1i16.to_be_bytes());
        bytes[22..24].copy_from_slice(&0x3456i16.to_be_bytes());

        let summary = parse_timed_encounter(&bytes, 0);

        assert_eq!(summary.get("locationKind"), Some(&json!("land")));
        assert!(!summary.contains_key("reservedWords"));
    }

    #[test]
    fn complex_encounter_result_links_to_its_extra_action_point() {
        let mut schema = SemanticSchema::default();
        let encounter = ComplexEncounterRecord {
            id: 15,
            actions: vec![EncounterActionRow {
                slot: 3,
                raw_code: 39,
                id: 175,
                media_required_for_progression: None,
            }],
            action_result: 1,
            word_result: 0,
            groups: vec![0; 8],
            spell_ids: vec![0; 10],
            spell_results: vec![0; 10],
            item_ids: vec![0; 5],
            item_results: vec![0; 5],
            choice_results: Vec::new(),
            word_results: Vec::new(),
            can_back_out: false,
            thief: false,
            max_times: 0,
            caste_success: 0,
            thief_success: 0,
            thief_fail: 0,
            prompt: 0,
            texts: vec![String::new(); 9],
            authored: false,
            provenance: Provenance {
                source_file: "Data ED2".to_string(),
                record_index: 15,
                byte_offset: 15 * COMPLEX_ENCOUNTER_BYTES,
                byte_length: COMPLEX_ENCOUNTER_BYTES,
                confidence: Confidence::SourceBacked,
            },
        };

        add_encounter_macro_links(&mut schema, &[], &[encounter]);

        let link = schema
            .links
            .iter()
            .find(|link| link.kind == "calls_macro")
            .expect("complex encounter result should call its Extra Action Point");
        assert_eq!(link.from, "encounter:complex:15");
        assert_eq!(link.to, "macro:175");
        assert_eq!(link.metadata.get("result"), Some(&json!(1)));
        assert_eq!(link.metadata.get("step"), Some(&json!(4)));
        assert_eq!(link.metadata.get("slot"), Some(&json!(3)));
    }
}

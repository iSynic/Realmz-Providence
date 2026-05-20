use super::common::*;
use super::opcodes::{action_semantics, ReferenceCounts};
use crate::project::*;
use crate::realmz::{COMPLEX_ENCOUNTER_BYTES, DOOR_BYTES, SIMPLE_ENCOUNTER_BYTES};
use serde_json::{json, Value};
use std::collections::BTreeMap;

pub(super) fn add_triggers(
    schema: &mut SemanticSchema,
    triggers: &[TriggerRecord],
    extracodes: &[ExtraCodeRow],
    buffers: &BTreeMap<String, Vec<u8>>,
) {
    let extra_rows: BTreeMap<usize, [i16; 5]> =
        extracodes.iter().map(|row| (row.id, row.values)).collect();
    let simple_count = encounter_count(
        buffers.get("Data ED"),
        SIMPLE_ENCOUNTER_BYTES,
        super::common::SIMPLE_STRUCT_BYTES,
    );
    let complex_count = encounter_count(
        buffers.get("Data ED2"),
        COMPLEX_ENCOUNTER_BYTES,
        super::common::COMPLEX_STRUCT_BYTES,
    );
    let counts = ReferenceCounts {
        simple: simple_count,
        complex: complex_count,
        battle: full_record_count(buffers.get("Data BD"), 346),
        shop: full_record_count(buffers.get("Data SD"), 3002),
        message: full_record_count(buffers.get("Data SD2"), 256),
        monster: full_record_count(buffers.get("Data MD"), 210),
        treasure: full_record_count(buffers.get("Data TD"), 48),
        timed: full_record_count(buffers.get("Data TD3"), 40),
    };

    for trigger in triggers {
        let record_id = trigger_record_id(trigger);
        let actions_summary = action_summary_values(trigger, &extra_rows, counts);
        schema.records.push(SemanticRecord {
            id: record_id.clone(),
            source: source_id(&trigger.source),
            record_type: if trigger.source == "Data ED3" {
                "macro action record".to_string()
            } else {
                "map trigger/action record".to_string()
            },
            label: trigger.id.clone(),
            edit_state: SemanticEditState::InspectOnly,
            byte_range: Some(byte_range(trigger.provenance.byte_offset, DOOR_BYTES)),
            confidence: Confidence::SourceBacked,
            summary: summary([
                ("active", json!(trigger.active)),
                ("doorid", json!(trigger.doorid)),
                ("percent", json!(trigger.percent)),
                ("coordinate", json!(trigger.coordinate)),
                ("actionCount", json!(trigger.actions.len())),
                ("actions", json!(actions_summary)),
            ]),
        });
        if !trigger.active {
            continue;
        }
        let entity_id = trigger_entity_id(trigger);
        schema.entities.push(SemanticEntity {
            id: entity_id.clone(),
            entity_type: if trigger.source == "Data ED3" {
                "macro".to_string()
            } else {
                "trigger".to_string()
            },
            label: trigger_label(trigger),
            edit_state: SemanticEditState::InspectOnly,
            confidence: Confidence::SourceBacked,
            source: trigger.source.clone(),
            record_ref: Some(record_id.clone()),
            byte_range: Some(byte_range(trigger.provenance.byte_offset, DOOR_BYTES)),
            editable: true,
            summary: summary([
                (
                    "levelType",
                    json!(trigger.level_type.map(LevelType::as_str)),
                ),
                ("levelIndex", json!(trigger.level_index)),
                ("coordinate", json!(trigger.coordinate)),
                ("percent", json!(trigger.percent)),
                ("actionCount", json!(trigger.actions.len())),
                ("actions", json!(actions_summary)),
            ]),
        });
        if let (Some(level_type), Some(level_index), Some(_coord)) =
            (trigger.level_type, trigger.level_index, &trigger.coordinate)
        {
            push_link(
                schema,
                &entity_id,
                &map_entity_id(level_type, level_index),
                "located_on",
                Confidence::SourceBacked,
                vec![record_id.clone()],
                BTreeMap::new(),
            );
        }
        add_action_slot_entities(schema, trigger, &entity_id, &record_id, &extra_rows, counts);
    }
}

fn action_summary_values(
    trigger: &TriggerRecord,
    extra_rows: &BTreeMap<usize, [i16; 5]>,
    counts: ReferenceCounts,
) -> Vec<Value> {
    trigger
        .actions
        .iter()
        .map(|action| {
            let semantics = action_semantics(action, trigger, extra_rows, counts);
            let mut value = json!(action);
            if let (Value::Object(object), Some(edcd_usage)) = (&mut value, semantics.edcd_usage) {
                object.insert("edcdUsage".to_string(), edcd_usage);
            }
            value
        })
        .collect()
}

fn add_action_slot_entities(
    schema: &mut SemanticSchema,
    trigger: &TriggerRecord,
    entity_id: &str,
    record_id: &str,
    extra_rows: &BTreeMap<usize, [i16; 5]>,
    counts: ReferenceCounts,
) {
    for action in &trigger.actions {
        let slot_id = action_slot_entity_id(entity_id, action.slot);
        let semantics = action_semantics(action, trigger, extra_rows, counts);
        let mut slot_summary = summary([
            ("trigger", json!(entity_id)),
            ("slot", json!(action.slot)),
            ("code", json!(action.code)),
            ("rawCode", json!(action.raw_code)),
            ("id", json!(action.id)),
            ("label", json!(action.label)),
            ("category", json!(action.category)),
            ("gosub", json!(action.gosub)),
        ]);
        if let Some(edcd_usage) = semantics.edcd_usage.clone() {
            slot_summary.insert("edcdUsage".to_string(), edcd_usage);
        }
        schema.entities.push(SemanticEntity {
            id: slot_id.clone(),
            entity_type: "action-slot".to_string(),
            label: format!("{} action {}", trigger_label(trigger), action.slot),
            edit_state: SemanticEditState::InspectOnly,
            confidence: Confidence::SourceBacked,
            source: trigger.source.clone(),
            record_ref: Some(record_id.to_string()),
            byte_range: Some(byte_range(
                trigger.provenance.byte_offset + 8 + action.slot * 2,
                2,
            )),
            editable: false,
            summary: slot_summary,
        });
        push_link(
            schema,
            entity_id,
            &slot_id,
            "has_action_slot",
            Confidence::SourceBacked,
            vec![format!("{}:slot:{}", record_id, action.slot)],
            BTreeMap::new(),
        );
        for target in semantics.targets {
            let mut metadata = summary([
                ("slot", json!(action.slot)),
                ("code", json!(action.code)),
                ("rawCode", json!(action.raw_code)),
                ("id", json!(action.id)),
                ("label", json!(action.label)),
                ("category", json!(action.category)),
            ]);
            metadata.insert("targetKind".to_string(), json!(target.kind));
            if let Some(values) = target.edcd_values {
                metadata.insert("edcdValues".to_string(), json!(values));
            }
            metadata.extend(target.metadata);
            push_link(
                schema,
                &slot_id,
                &target.id,
                &target.role,
                Confidence::SourceBacked,
                vec![format!("{}:slot:{}", record_id, action.slot)],
                metadata,
            );
            if !target.resolved {
                schema.diagnostics.push(SemanticDiagnostic {
                    id: format!("diagnostic:unresolved:{}", schema.diagnostics.len()),
                    diagnostic_type: "unresolved-reference".to_string(),
                    severity: DiagnosticSeverity::Warning,
                    confidence: Confidence::SourceBacked,
                    source: Some(trigger.source.clone()),
                    message: format!(
                        "{} action slot {} references missing {} {}",
                        trigger.id, action.slot, target.kind, action.id
                    ),
                    data: summary([
                        ("trigger", json!(trigger.id)),
                        ("slot", json!(action.slot)),
                        ("code", json!(action.code)),
                        ("target", json!(target.id)),
                        ("targetKind", json!(target.kind)),
                        ("linkKind", json!(target.role)),
                    ]),
                });
            }
        }
        for diagnostic in semantics.diagnostics {
            schema.diagnostics.push(SemanticDiagnostic {
                id: format!("diagnostic:opcode:{}", schema.diagnostics.len()),
                diagnostic_type: diagnostic.diagnostic_type,
                severity: diagnostic.severity,
                confidence: Confidence::SourceBacked,
                source: Some(trigger.source.clone()),
                message: diagnostic.message,
                data: {
                    let mut data = summary([
                        ("trigger", json!(trigger.id)),
                        ("slot", json!(action.slot)),
                        ("code", json!(action.code)),
                        ("record", json!(record_id)),
                    ]);
                    if let Some(target) = diagnostic.target {
                        data.insert("target".to_string(), json!(target));
                    }
                    data.extend(diagnostic.data);
                    data
                },
            });
        }
    }
}

fn trigger_record_id(trigger: &TriggerRecord) -> String {
    if trigger.source == "Data ED3" {
        format!("record:Data ED3:{}", trigger.record_index)
    } else {
        format!(
            "record:{}:{}:{}",
            trigger.source,
            trigger.level_index.unwrap_or(0),
            trigger.record_index
        )
    }
}

fn trigger_entity_id(trigger: &TriggerRecord) -> String {
    if trigger.source == "Data ED3" {
        format!("macro:{}", trigger.record_index)
    } else {
        format!(
            "trigger:{}:{}:{}",
            trigger
                .level_type
                .map(LevelType::as_str)
                .unwrap_or("unknown"),
            trigger.level_index.unwrap_or(0),
            trigger.record_index
        )
    }
}

fn action_slot_entity_id(trigger_entity_id: &str, slot: usize) -> String {
    format!("action-slot:{trigger_entity_id}:{slot}")
}

fn trigger_label(trigger: &TriggerRecord) -> String {
    if trigger.source == "Data ED3" {
        format!("Macro {}", trigger.record_index)
    } else {
        format!(
            "{} {} trigger {}",
            trigger
                .level_type
                .map(LevelType::as_str)
                .unwrap_or("unknown"),
            trigger.level_index.unwrap_or(0),
            trigger.record_index
        )
    }
}

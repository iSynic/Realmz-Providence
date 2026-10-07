use super::MonsterDraftChange;
use crate::model::{ProjectSnapshot, StableId};
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};

pub(super) fn changes(
    before: &ProjectSnapshot,
    after: &ProjectSnapshot,
    changed: &BTreeSet<StableId>,
) -> Vec<MonsterDraftChange> {
    let previous = records(before, changed);
    let current = records(after, changed);
    let mut result = Vec::new();
    for entity in changed {
        append_changes(
            entity,
            "",
            previous.get(entity).unwrap_or(&Value::Null),
            current.get(entity).unwrap_or(&Value::Null),
            &mut result,
        );
    }
    result
}

fn records(snapshot: &ProjectSnapshot, changed: &BTreeSet<StableId>) -> BTreeMap<StableId, Value> {
    let mut records = BTreeMap::new();
    for record in snapshot.monster_sets.iter().flat_map(|set| &set.monsters) {
        if changed.contains(&record.identity) {
            records.insert(
                record.identity.clone(),
                serde_json::to_value(record).expect("Monster serialization"),
            );
        }
    }
    for description in &snapshot.monster_descriptions {
        if changed.contains(&description.identity) {
            records.insert(
                description.identity.clone(),
                serde_json::json!({"description": description.text}),
            );
        }
    }
    for battle in &snapshot.battles {
        if changed.contains(&battle.identity) {
            records.insert(
                battle.identity.clone(),
                serde_json::to_value(battle).expect("Battle serialization"),
            );
        }
    }
    for row in &snapshot.world.action_points {
        if changed.contains(&row.identity) {
            records.insert(
                row.identity.clone(),
                serde_json::to_value(row).expect("AP serialization"),
            );
        }
    }
    for row in &snapshot.extra_action_points {
        if changed.contains(&row.identity) {
            records.insert(
                row.identity.clone(),
                serde_json::to_value(row).expect("XAP serialization"),
            );
        }
    }
    for row in &snapshot.simple_encounters {
        if changed.contains(&row.identity) {
            records.insert(
                row.identity.clone(),
                serde_json::to_value(row).expect("Simple Encounter serialization"),
            );
        }
    }
    for row in &snapshot.complex_encounters {
        if changed.contains(&row.identity) {
            records.insert(
                row.identity.clone(),
                serde_json::to_value(row).expect("Complex Encounter serialization"),
            );
        }
    }
    records
}

fn append_changes(
    entity: &StableId,
    field: &str,
    before: &Value,
    after: &Value,
    changes: &mut Vec<MonsterDraftChange>,
) {
    if before == after {
        return;
    }
    if let Value::Object(object) = after {
        for (key, value) in object {
            if !matches!(key.as_str(), "identity" | "nativeId" | "authored") {
                let path = if field.is_empty() {
                    key.clone()
                } else {
                    format!("{field}.{key}")
                };
                append_changes(entity, &path, &before[key], value, changes);
            }
        }
    } else if let Value::Array(array) = after {
        for (index, value) in array.iter().enumerate() {
            append_changes(
                entity,
                &format!("{field}.{index}"),
                &before[index],
                value,
                changes,
            );
        }
    } else if after.is_null() && (before.is_object() || before.is_array()) {
        append_removed_fields(entity, field, before, changes);
    } else {
        changes.push(MonsterDraftChange {
            entity: entity.clone(),
            field: field.into(),
            before: before.clone(),
            after: after.clone(),
        });
    }
}

fn append_removed_fields(
    entity: &StableId,
    field: &str,
    before: &Value,
    changes: &mut Vec<MonsterDraftChange>,
) {
    if let Some(object) = before.as_object() {
        for (key, value) in object {
            if !matches!(key.as_str(), "identity" | "nativeId" | "authored") {
                let path = if field.is_empty() {
                    key.clone()
                } else {
                    format!("{field}.{key}")
                };
                append_changes(entity, &path, value, &Value::Null, changes);
            }
        }
    } else if let Some(array) = before.as_array() {
        for (index, value) in array.iter().enumerate() {
            append_changes(
                entity,
                &format!("{field}.{index}"),
                value,
                &Value::Null,
                changes,
            );
        }
    }
}

pub(crate) fn record_changes(
    entity: &StableId,
    before: &Value,
    after: &Value,
) -> Vec<MonsterDraftChange> {
    let mut changes = Vec::new();
    append_changes(entity, "", before, after, &mut changes);
    changes
}

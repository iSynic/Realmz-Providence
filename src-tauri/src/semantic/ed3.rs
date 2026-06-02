use crate::project::*;
use serde_json::json;
use std::collections::{BTreeMap, BTreeSet, VecDeque};

pub(super) fn classify_ed3_reachability(schema: &mut SemanticSchema, triggers: &[TriggerRecord]) {
    let ed3_triggers: Vec<_> = triggers
        .iter()
        .filter(|trigger| trigger.source == "Data ED3" && trigger.active)
        .collect();
    if ed3_triggers.is_empty() {
        return;
    }

    let ed3_ids: BTreeSet<String> = ed3_triggers
        .iter()
        .map(|trigger| macro_entity_id(trigger.record_index))
        .collect();
    let mut incoming: BTreeMap<String, Vec<SemanticLink>> = BTreeMap::new();
    let mut outgoing_by_macro: BTreeMap<usize, Vec<SemanticLink>> = BTreeMap::new();
    for link in &schema.links {
        if is_macro_reachability_link(link) {
            if let Some(index) = action_slot_macro_index(&link.from) {
                outgoing_by_macro
                    .entry(index)
                    .or_default()
                    .push(link.clone());
            }
        }
        if ed3_ids.contains(&link.to) {
            incoming
                .entry(link.to.clone())
                .or_default()
                .push(link.clone());
        }
    }

    let mut roots: BTreeMap<String, ReachabilityRoot> = BTreeMap::new();
    for (target, links) in &incoming {
        for link in links {
            if is_macro_reachability_link(link) && !is_ed3_action_slot(&link.from) {
                roots
                    .entry(target.clone())
                    .or_insert_with(|| ReachabilityRoot {
                        root_type: root_type_for(&link.from),
                        evidence: vec![link.id.clone()],
                    });
            }
            if link.kind == "calls_battle_macro" && is_negative_battle_macro(link) {
                roots
                    .entry(target.clone())
                    .or_insert_with(|| ReachabilityRoot {
                        root_type: "negative-battle-macro".to_string(),
                        evidence: vec![link.id.clone()],
                    });
            }
        }
    }

    let mut reachable = BTreeMap::new();
    let mut queue = VecDeque::new();
    for (id, root) in roots {
        reachable.insert(id.clone(), root);
        queue.push_back(id);
    }

    while let Some(current) = queue.pop_front() {
        let Some(current_index) = current.trim_start_matches("macro:").parse::<usize>().ok() else {
            continue;
        };
        for link in outgoing_by_macro.get(&current_index).into_iter().flatten() {
            if !ed3_ids.contains(&link.to) || reachable.contains_key(&link.to) {
                continue;
            }
            let mut evidence = reachable
                .get(&current)
                .map(|root| root.evidence.clone())
                .unwrap_or_default();
            evidence.push(link.id.clone());
            reachable.insert(
                link.to.clone(),
                ReachabilityRoot {
                    root_type: "recursive-macro-call".to_string(),
                    evidence,
                },
            );
            queue.push_back(link.to.clone());
        }
    }

    let mut debt_counts: BTreeMap<String, usize> = BTreeMap::new();
    for trigger in ed3_triggers {
        let entity_id = macro_entity_id(trigger.record_index);
        let incoming_refs = incoming.get(&entity_id).map(Vec::len).unwrap_or(0);
        let action_count = trigger
            .actions
            .iter()
            .filter(|action| action.raw_code != 0 || action.id != 0)
            .count();
        let raw_signature = trigger
            .actions
            .iter()
            .flat_map(|action| [action.raw_code, action.id])
            .collect();
        let root = reachable.get(&entity_id);
        let (classification, path_status, root_type, evidence, promotion_rule) = if let Some(root) =
            root
        {
            (
                "reachable-macro".to_string(),
                "source-backed-root".to_string(),
                Some(root.root_type.clone()),
                root.evidence.clone(),
                "Promoted from Data ED3 because a source-backed root reaches this record."
                    .to_string(),
            )
        } else {
            let classification = nonreachable_classification(trigger, action_count);
            *debt_counts.entry(classification.clone()).or_default() += 1;
            (
                    classification,
                    "not-source-reachable".to_string(),
                    None,
                    vec!["anchor:ed3-reachability".to_string()],
                    "Preserved as Data ED3 evidence until source-backed reachability or explicit authoring exists."
                        .to_string(),
                )
        };
        let is_reachable = root.is_some();
        let author_label = extra_action_classification(root_type.as_deref(), &classification, is_reachable);

        if let Some(entity) = schema
            .entities
            .iter_mut()
            .find(|entity| entity.id == entity_id)
        {
            entity.entity_type = if is_reachable {
                "macro".to_string()
            } else {
                "ed3-action-record".to_string()
            };
            entity.label = format!("{author_label} {}", trigger.record_index);
            entity.editable = is_reachable;
            entity.edit_state = if is_reachable {
                SemanticEditState::InspectOnly
            } else {
                SemanticEditState::InspectOnly
            };
            entity
                .summary
                .insert("callable".to_string(), json!(is_reachable));
            entity
                .summary
                .insert("reachability".to_string(), json!(path_status));
            entity
                .summary
                .insert("classification".to_string(), json!(classification));
            entity
                .summary
                .insert("incomingRefs".to_string(), json!(incoming_refs));
            entity
                .summary
                .insert("promotionRule".to_string(), json!(promotion_rule));
        }

        schema.decoding.ed3_reachability.push(Ed3ReachabilityRow {
            record_index: trigger.record_index,
            entity_id,
            classification,
            reachable: is_reachable,
            path_status,
            root_type,
            incoming_refs,
            action_count,
            raw_signature,
            evidence,
            promotion_rule,
        });
    }

    for (group, claim_count) in debt_counts {
        schema.decoding.confidence_debt.push(ConfidenceDebtRow {
            group,
            confidence: Confidence::Inferred,
            impact: "Non-reachable Data ED3 rows are preserved and inspectable but not offered as callable macros.".to_string(),
            claim_count,
            next_step: "Use source-backed links, runtime traces, or explicit duplicate/promote authoring before editing.".to_string(),
        });
    }
}

fn extra_action_classification(root_type: Option<&str>, classification: &str, reachable: bool) -> &'static str {
    if !reachable {
        if classification == "probable-editor-padding" {
            return "Imported Empty Slot";
        }
        return "Imported Extra Action";
    }
    let root_type = root_type.unwrap_or_default();
    if root_type.contains("global") {
        "Global Macro"
    } else if root_type.contains("random") {
        "Random Encounter Action"
    } else if root_type.contains("time") {
        "Timed Encounter Action"
    } else if root_type.contains("battle") || root_type.contains("monster") || root_type.contains("item") {
        "Battle / Monster / Item Action"
    } else {
        "Callable Extra Action Point"
    }
}

struct ReachabilityRoot {
    root_type: String,
    evidence: Vec<String>,
}

fn macro_entity_id(record_index: usize) -> String {
    format!("macro:{record_index}")
}

fn is_ed3_action_slot(id: &str) -> bool {
    id.starts_with("action-slot:macro:")
}

fn action_slot_macro_index(id: &str) -> Option<usize> {
    let mut parts = id.split(':');
    if parts.next()? != "action-slot" || parts.next()? != "macro" {
        return None;
    }
    parts.next()?.parse().ok()
}

fn is_macro_reachability_link(link: &SemanticLink) -> bool {
    matches!(
        link.kind.as_str(),
        "calls_macro"
            | "branches_to"
            | "branches_true"
            | "branches_false"
            | "branches_keep"
            | "branches_drop"
            | "branches_on_coward"
            | "branches_on_revived_loss"
    )
}

fn root_type_for(from: &str) -> String {
    if from.starts_with("action-slot:trigger:") {
        "map-trigger-call".to_string()
    } else if from.starts_with("random:") {
        "random-region-door".to_string()
    } else if from.starts_with("time:") {
        "timed-encounter-door".to_string()
    } else if from.starts_with("item:") {
        "door-item-macro".to_string()
    } else if from.starts_with("monster:") {
        "monster-death-hook".to_string()
    } else if from.contains("global") {
        "global-macro-slot".to_string()
    } else {
        "source-backed-root".to_string()
    }
}

fn is_negative_battle_macro(link: &SemanticLink) -> bool {
    link.metadata
        .get("rawValue")
        .and_then(|value| value.as_i64())
        .is_some_and(|value| value < 0)
}

fn nonreachable_classification(trigger: &TriggerRecord, action_count: usize) -> String {
    if action_count == 0 {
        return "probable-editor-padding".to_string();
    }
    if trigger
        .actions
        .iter()
        .any(|action| matches!(action.code, 7 | 13))
    {
        return "runtime-mutation-candidate".to_string();
    }
    if action_count >= 2 {
        "needs-runtime-trace".to_string()
    } else {
        "orphan-authored-content".to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::BTreeMap;

    fn ed3_trigger(record_index: usize, actions: Vec<Action>) -> TriggerRecord {
        TriggerRecord {
            id: format!("Data ED3:macro:{record_index}"),
            source: "Data ED3".to_string(),
            level_type: None,
            level_index: None,
            record_index,
            active: true,
            doorid: 0,
            landid: 0,
            target_x: 0,
            target_y: 0,
            percent: 0,
            coordinate: None,
            actions,
            provenance: Provenance {
                source_file: "Data ED3".to_string(),
                record_index,
                byte_offset: record_index * 40,
                byte_length: 40,
                confidence: Confidence::SourceBacked,
            },
        }
    }

    fn macro_entity(record_index: usize) -> SemanticEntity {
        SemanticEntity {
            id: format!("macro:{record_index}"),
            entity_type: "ed3-action-record".to_string(),
            label: format!("Imported Extra Action {record_index}"),
            edit_state: SemanticEditState::InspectOnly,
            confidence: Confidence::SourceBacked,
            source: "Data ED3".to_string(),
            record_ref: Some(format!("record:Data ED3:{record_index}")),
            byte_range: None,
            editable: false,
            summary: BTreeMap::new(),
        }
    }

    fn macro_link(id: &str, from: &str, to_record: usize, kind: &str) -> SemanticLink {
        SemanticLink {
            id: id.to_string(),
            from: from.to_string(),
            to: format!("macro:{to_record}"),
            kind: kind.to_string(),
            confidence: Confidence::SourceBacked,
            evidence: vec!["record:Data DD:0:1".to_string()],
            metadata: BTreeMap::new(),
        }
    }

    #[test]
    fn nonreachable_empty_ed3_is_editor_padding() {
        let trigger = ed3_trigger(4, Vec::new());
        assert_eq!(
            nonreachable_classification(&trigger, 0),
            "probable-editor-padding"
        );
    }

    #[test]
    fn source_backed_macro_call_promotes_ed3_record() {
        let trigger = ed3_trigger(
            2,
            vec![Action {
                slot: 0,
                raw_code: 1,
                code: 1,
                id: 12,
                label: "Message".to_string(),
                category: ActionCategory::UiText,
                gosub: false,
            }],
        );
        let mut schema = SemanticSchema::default();
        schema.entities.push(SemanticEntity {
            id: "macro:2".to_string(),
            entity_type: "ed3-action-record".to_string(),
            label: "ED3 record 2".to_string(),
            edit_state: SemanticEditState::InspectOnly,
            confidence: Confidence::SourceBacked,
            source: "Data ED3".to_string(),
            record_ref: Some("record:Data ED3:2".to_string()),
            byte_range: None,
            editable: false,
            summary: BTreeMap::new(),
        });
        schema.links.push(SemanticLink {
            id: "link:0".to_string(),
            from: "action-slot:trigger:land:0:1:0".to_string(),
            to: "macro:2".to_string(),
            kind: "calls_macro".to_string(),
            confidence: Confidence::SourceBacked,
            evidence: vec!["record:Data DD:0:1".to_string()],
            metadata: BTreeMap::new(),
        });

        classify_ed3_reachability(&mut schema, &[trigger]);

        let entity = schema
            .entities
            .iter()
            .find(|entity| entity.id == "macro:2")
            .unwrap();
        assert_eq!(entity.entity_type, "macro");
        assert_eq!(entity.summary.get("callable"), Some(&json!(true)));
        assert_eq!(
            schema.decoding.ed3_reachability[0].classification,
            "reachable-macro"
        );
    }

    #[test]
    fn edcd_branch_from_map_trigger_promotes_ed3_record() {
        let trigger = ed3_trigger(
            7,
            vec![Action {
                slot: 0,
                raw_code: 1,
                code: 1,
                id: 12,
                label: "Message".to_string(),
                category: ActionCategory::UiText,
                gosub: false,
            }],
        );
        let mut schema = SemanticSchema::default();
        schema.entities.push(macro_entity(7));
        schema.links.push(macro_link(
            "link:branch:true",
            "action-slot:trigger:land:0:1:0",
            7,
            "branches_true",
        ));

        classify_ed3_reachability(&mut schema, &[trigger]);

        let row = &schema.decoding.ed3_reachability[0];
        assert!(row.reachable);
        assert_eq!(row.classification, "reachable-macro");
        assert_eq!(row.root_type.as_deref(), Some("map-trigger-call"));
    }

    #[test]
    fn edcd_branch_from_reachable_macro_recurses_to_ed3_record() {
        let root_trigger = ed3_trigger(
            2,
            vec![Action {
                slot: 0,
                raw_code: 39,
                code: 39,
                id: 7,
                label: "Extend AP".to_string(),
                category: ActionCategory::Branch,
                gosub: false,
            }],
        );
        let nested_trigger = ed3_trigger(
            7,
            vec![Action {
                slot: 0,
                raw_code: 1,
                code: 1,
                id: 12,
                label: "Message".to_string(),
                category: ActionCategory::UiText,
                gosub: false,
            }],
        );
        let mut schema = SemanticSchema::default();
        schema.entities.push(macro_entity(2));
        schema.entities.push(macro_entity(7));
        schema.links.push(macro_link(
            "link:root",
            "action-slot:trigger:land:0:1:0",
            2,
            "calls_macro",
        ));
        schema.links.push(macro_link(
            "link:recursive:branch",
            "action-slot:macro:2:0",
            7,
            "branches_false",
        ));

        classify_ed3_reachability(&mut schema, &[root_trigger, nested_trigger]);

        let row = schema
            .decoding
            .ed3_reachability
            .iter()
            .find(|row| row.record_index == 7)
            .unwrap();
        assert!(row.reachable);
        assert_eq!(row.root_type.as_deref(), Some("recursive-macro-call"));
        assert_eq!(row.evidence, vec!["link:root", "link:recursive:branch"]);
    }

    #[test]
    fn battle_outcome_macro_roles_promote_ed3_records() {
        let coward_trigger = ed3_trigger(
            12,
            vec![Action {
                slot: 0,
                raw_code: 1,
                code: 1,
                id: 12,
                label: "Message".to_string(),
                category: ActionCategory::UiText,
                gosub: false,
            }],
        );
        let revive_trigger = ed3_trigger(
            17,
            vec![Action {
                slot: 0,
                raw_code: 1,
                code: 1,
                id: 17,
                label: "Message".to_string(),
                category: ActionCategory::UiText,
                gosub: false,
            }],
        );
        let mut schema = SemanticSchema::default();
        schema.entities.push(macro_entity(12));
        schema.entities.push(macro_entity(17));
        schema.links.push(macro_link(
            "link:coward",
            "action-slot:trigger:land:0:1:0",
            12,
            "branches_on_coward",
        ));
        schema.links.push(macro_link(
            "link:revive",
            "action-slot:trigger:land:0:1:1",
            17,
            "branches_on_revived_loss",
        ));

        classify_ed3_reachability(&mut schema, &[coward_trigger, revive_trigger]);

        assert!(schema
            .decoding
            .ed3_reachability
            .iter()
            .any(|row| row.record_index == 12 && row.reachable));
        assert!(schema
            .decoding
            .ed3_reachability
            .iter()
            .any(|row| row.record_index == 17 && row.reachable));
    }

    #[test]
    fn positive_battle_macro_does_not_promote_ed3_record() {
        let trigger = ed3_trigger(
            3,
            vec![Action {
                slot: 0,
                raw_code: 1,
                code: 1,
                id: 12,
                label: "Message".to_string(),
                category: ActionCategory::UiText,
                gosub: false,
            }],
        );
        let mut schema = SemanticSchema::default();
        schema.entities.push(macro_entity(3));
        let mut metadata = BTreeMap::new();
        metadata.insert("rawValue".to_string(), json!(3));
        schema.links.push(SemanticLink {
            id: "link:battle:positive".to_string(),
            from: "battle:1".to_string(),
            to: "macro:3".to_string(),
            kind: "calls_battle_macro".to_string(),
            confidence: Confidence::SourceBacked,
            evidence: vec!["record:Data BD:1".to_string()],
            metadata,
        });

        classify_ed3_reachability(&mut schema, &[trigger]);

        let row = &schema.decoding.ed3_reachability[0];
        assert!(!row.reachable);
        assert_ne!(row.classification, "reachable-macro");
    }

    #[test]
    fn door_item_macro_promotes_ed3_record() {
        let trigger = ed3_trigger(
            5,
            vec![Action {
                slot: 0,
                raw_code: 1,
                code: 1,
                id: 12,
                label: "Message".to_string(),
                category: ActionCategory::UiText,
                gosub: false,
            }],
        );
        let mut schema = SemanticSchema::default();
        schema.entities.push(macro_entity(5));
        schema.links.push(macro_link(
            "link:item:door",
            "item:923",
            5,
            "calls_macro",
        ));

        classify_ed3_reachability(&mut schema, &[trigger]);

        let row = &schema.decoding.ed3_reachability[0];
        assert!(row.reachable);
        assert_eq!(row.root_type.as_deref(), Some("door-item-macro"));
    }
}

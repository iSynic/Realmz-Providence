use super::common::*;
use crate::project::*;
use serde_json::json;
use std::collections::{BTreeMap, BTreeSet};

pub(super) fn add_scenario_entity(schema: &mut SemanticSchema, scenario: &ScenarioMeta) {
    schema.entities.push(SemanticEntity {
        id: scenario.id.clone(),
        entity_type: "scenario".to_string(),
        label: scenario.name.clone(),
        edit_state: SemanticEditState::InspectOnly,
        confidence: Confidence::SourceBacked,
        source: "project.json".to_string(),
        record_ref: None,
        byte_range: None,
        editable: false,
        summary: summary([
            ("scenarioId", json!(scenario.id)),
            ("name", json!(scenario.name)),
            ("projectPath", json!(scenario.project_path)),
            ("importedAt", json!(scenario.imported_at)),
        ]),
    });
    for (suffix, entity_type, label, note) in [
        (
            "startup",
            "scenario-startup",
            "Scenario Startup Information",
            "Starting level/position and recommended level metadata; exact field mapping remains legacy-source backed pending writer support.",
        ),
        (
            "restrictions",
            "scenario-restriction",
            "Scenario Restrictions",
            "Character count, race, caste, and level restrictions from Divinity's Scenario Data workflow.",
        ),
        (
            "registration",
            "registration-security",
            "Scenario Security / Registration Codes",
            "Legacy registration-code workflow is preserved for inspection; export writing requires fixture-proven codec support.",
        ),
        (
            "global-macros",
            "global-macro",
            "Global Macros",
            "Start, death, quit, shop, and temple macro hooks defined by Divinity's Scenario Data workflow.",
        ),
    ] {
        schema.entities.push(SemanticEntity {
            id: format!("{}:{suffix}", scenario.id),
            entity_type: entity_type.to_string(),
            label: label.to_string(),
            edit_state: SemanticEditState::InspectOnly,
            confidence: Confidence::Inferred,
            source: "project.json".to_string(),
            record_ref: None,
            byte_range: None,
            editable: false,
            summary: summary([
                ("scenarioId", json!(scenario.id)),
                ("name", json!(label)),
                ("note", json!(note)),
            ]),
        });
    }
}

pub(super) fn add_scenario_metadata_links(schema: &mut SemanticSchema, scenario: &ScenarioMeta) {
    let scenario_id = scenario.id.as_str();
    let entity_ids: BTreeSet<String> = schema
        .entities
        .iter()
        .map(|entity| entity.id.clone())
        .collect();
    let source_ids: Vec<String> = schema
        .sources
        .iter()
        .map(|source| source.id.clone())
        .collect();
    for source_id_value in source_ids {
        if source_id_value == "source:file:Scenario" {
            push_link(
                schema,
                scenario_id,
                &source_id_value,
                "has_source",
                Confidence::SourceBacked,
                vec![source_id_value.clone()],
                BTreeMap::new(),
            );
        }
    }

    if entity_ids.contains("contact:0") {
        push_link(
            schema,
            scenario_id,
            "contact:0",
            "has_contact_info",
            Confidence::SourceBacked,
            vec!["anchor:runtime-consumer-matrix".to_string()],
            BTreeMap::new(),
        );
        if let Some(contact) = schema
            .entities
            .iter()
            .find(|entity| entity.id == "contact:0")
        {
            if let Some(name) = contact
                .summary
                .get("scenarioName")
                .and_then(|value| value.as_str())
            {
                if !name.is_empty() {
                    push_link(
                        schema,
                        scenario_id,
                        "contact:0",
                        "has_name_evidence",
                        Confidence::SourceBacked,
                        vec![contact
                            .record_ref
                            .clone()
                            .unwrap_or_else(|| "contact:0".to_string())],
                        summary([("name", json!(name))]),
                    );
                }
            }
        }
    }

    let resource_entities: Vec<_> = schema
        .entities
        .iter()
        .filter(|entity| entity.entity_type == "resource")
        .cloned()
        .collect();
    for resource in resource_entities {
        let resource_type = resource
            .summary
            .get("type")
            .and_then(|value| value.as_str())
            .unwrap_or_default();
        let resource_id = resource
            .summary
            .get("resourceId")
            .and_then(|value| value.as_i64())
            .unwrap_or_default();
        match resource_type {
            "RLMZ" => push_link(
                schema,
                scenario_id,
                &resource.id,
                "has_metadata_resource",
                Confidence::Inferred,
                vec!["anchor:resource-fork-taxonomy".to_string()],
                summary([(
                    "note",
                    json!("RLMZ resources identify Realmz-specific scenario metadata; field taxonomy is still unknown."),
                )]),
            ),
            "STR#" if resource_id == -102 || resource_id == -101 => push_link(
                schema,
                scenario_id,
                &resource.id,
                "has_name_evidence",
                Confidence::SourceBacked,
                vec!["anchor:resource-fork-taxonomy".to_string()],
                summary([("resourceRole", json!("map/scenario name string list"))]),
            ),
            "TEXT" => push_link(
                schema,
                scenario_id,
                &resource.id,
                "has_text_resource",
                Confidence::Inferred,
                vec!["anchor:resource-fork-taxonomy".to_string()],
                BTreeMap::new(),
            ),
            "styl" => push_link(
                schema,
                scenario_id,
                &resource.id,
                "has_style_resource",
                Confidence::Inferred,
                vec!["anchor:resource-fork-taxonomy".to_string()],
                BTreeMap::new(),
            ),
            "PICT" if resource_id == 32128 => push_link(
                schema,
                scenario_id,
                &resource.id,
                "uses_resource",
                Confidence::SourceBacked,
                vec!["anchor:runtime-consumer-matrix".to_string()],
                summary([("resourceRole", json!("scenario splash picture"))]),
            ),
            _ => {}
        }
    }
}

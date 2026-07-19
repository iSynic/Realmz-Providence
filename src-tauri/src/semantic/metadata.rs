use super::common::*;
use crate::project::*;
use serde_json::json;
use std::collections::{BTreeMap, BTreeSet};

pub(super) fn add_scenario_entity(
    schema: &mut SemanticSchema,
    scenario: &ScenarioMeta,
    canonical_records: bool,
) {
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
            "The 316-byte marker core compiles from startup, level, security-segment, and creator semantics; imported identity and optional tails remain compatibility data.",
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
            "Security code segments compile into the marker and Data CS cores; unchanged imported identity and optional tails remain compatibility data.",
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
    if canonical_records {
        if let Some(shell) = &scenario.shell {
            let startup_id = format!("{}:startup", scenario.id);
            if let Some(startup) = schema
                .entities
                .iter_mut()
                .find(|entity| entity.id == startup_id)
            {
                startup.edit_state = SemanticEditState::Editable;
                startup.confidence = Confidence::Confirmed;
                startup.source = "project.json#scenario/shell".to_string();
                startup.editable = true;
                startup.summary = summary([
                    ("scenarioId", json!(scenario.id)),
                    ("sourceFile", json!(shell.source_file)),
                    ("recLevel", json!(shell.rec_level)),
                    ("maxLevel", json!(shell.max_level)),
                    ("landLevel", json!(shell.land_level)),
                    ("lookX", json!(shell.look_x)),
                    ("lookY", json!(shell.look_y)),
                    ("creatorUser", json!(shell.creator_user)),
                    ("canonical", json!(true)),
                ]);
            }
            let registration_id = format!("{}:registration", scenario.id);
            if let Some(registration) = schema
                .entities
                .iter_mut()
                .find(|entity| entity.id == registration_id)
            {
                registration.edit_state = SemanticEditState::Editable;
                registration.confidence = Confidence::Confirmed;
                registration.source = "project.json#scenario/shell".to_string();
                registration.editable = true;
                registration.summary = summary([
                    ("scenarioId", json!(scenario.id)),
                    ("codeseg1", json!(shell.codeseg1)),
                    ("codeseg2", json!(shell.codeseg2)),
                    (
                        "securityBackupPresent",
                        json!(scenario.security_backup.is_some()),
                    ),
                    ("canonical", json!(true)),
                ]);
            }
        }
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
    if entity_ids.contains("restriction:0") {
        push_link(
            schema,
            scenario_id,
            "restriction:0",
            "has_party_restrictions",
            Confidence::SourceBacked,
            vec!["anchor:runtime-consumer-matrix".to_string()],
            BTreeMap::new(),
        );
    }
}

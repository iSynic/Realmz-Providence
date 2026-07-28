use crate::project::ProvidenceProject;
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};

const CATALOG_JSON: &str = include_str!("../../schemas/remake-extension-catalog.json");

pub fn validate_remake_runtime(project: &ProvidenceProject) -> Vec<String> {
    let catalog: Value = match serde_json::from_str(CATALOG_JSON) {
        Ok(value) => value,
        Err(error) => {
            return vec![format!(
                "Built-in Remake extension catalog could not be parsed: {error}"
            )]
        }
    };
    let mut errors = Vec::new();
    let mut extensions = BTreeMap::<String, &Value>::new();
    let mut bindings = BTreeMap::<(String, String), (String, &Value)>::new();
    for extension in catalog["extensions"].as_array().into_iter().flatten() {
        let id = extension["id"].as_str().unwrap_or_default().to_string();
        extensions.insert(id.clone(), extension);
        if let Some(capabilities) = extension["capabilities"].as_object() {
            for (capability, entries) in capabilities {
                for entry in entries.as_array().into_iter().flatten() {
                    let binding_id = binding_id(entry).to_string();
                    bindings.insert((capability.clone(), binding_id), (id.clone(), entry));
                }
            }
        }
    }

    let mut required_ids = BTreeSet::new();
    for requirement in &project.remake_runtime.required_extensions {
        if !required_ids.insert(requirement.id.clone()) {
            errors.push(format!(
                "remakeRuntime.requiredExtensions duplicates '{}'.",
                requirement.id
            ));
            continue;
        }
        let Some(descriptor) = extensions.get(&requirement.id) else {
            errors.push(format!(
                "Required built-in Remake extension '{}' is unavailable.",
                requirement.id
            ));
            continue;
        };
        let provided_api = descriptor["apiVersion"].as_u64().unwrap_or_default();
        if u64::from(requirement.api_version) != provided_api {
            errors.push(format!(
                "Remake extension '{}' requires API {} but Providence provides API {}.",
                requirement.id, requirement.api_version, provided_api
            ));
        }
        if let Some(message) = validate_schema(
            &requirement.configuration,
            &descriptor["configurationSchema"],
            &format!("Remake extension '{}' configuration", requirement.id),
        ) {
            errors.push(message);
        }
    }

    let mut occupied_slots = BTreeSet::new();
    for action in &project.remake_runtime.semantic_actions {
        let context = format!(
            "Remake semantic action {}:{} slot {}",
            action.target_kind, action.record_id, action.slot
        );
        if !occupied_slots.insert((
            action.target_kind.clone(),
            action.record_id.clone(),
            action.slot,
        )) {
            errors.push(format!("{context} is duplicated."));
        }
        let max_slot = match action.target_kind.as_str() {
            "trigger" => {
                if !project
                    .triggers
                    .iter()
                    .any(|record| record.id == action.record_id)
                {
                    errors.push(format!("{context} references an unavailable Action Point."));
                }
                7
            }
            "simpleEncounter" => {
                if !project
                    .simple_encounters
                    .iter()
                    .any(|record| record.id.to_string() == action.record_id)
                {
                    errors.push(format!(
                        "{context} references an unavailable Simple Encounter."
                    ));
                }
                31
            }
            "complexEncounter" => {
                if !project
                    .complex_encounters
                    .iter()
                    .any(|record| record.id.to_string() == action.record_id)
                {
                    errors.push(format!(
                        "{context} references an unavailable Complex Encounter."
                    ));
                }
                31
            }
            other => {
                errors.push(format!("{context} has unsupported target kind '{other}'."));
                continue;
            }
        };
        if action.slot > max_slot {
            errors.push(format!(
                "{context} must use a slot from 0 through {max_slot}."
            ));
        }
        if !is_namespaced(&action.operation) || action.operation.starts_with("core.") {
            errors.push(format!(
                "{context} operation '{}' must use an additive scenario namespace.",
                action.operation
            ));
            continue;
        }
        let key = ("semanticOperations".to_string(), action.operation.clone());
        let Some((owner, descriptor)) = bindings.get(&key) else {
            errors.push(format!(
                "{context} uses unavailable semantic operation '{}'.",
                action.operation
            ));
            continue;
        };
        require_owner(&context, owner, &required_ids, &mut errors);
        if let Some(message) = validate_schema(
            &action.parameters,
            &descriptor["parametersSchema"],
            &format!("{context} parameters"),
        ) {
            errors.push(message);
        }
    }

    for (field, capability, values) in [
        ("spells", "spells", &project.remake_runtime.bindings.spells),
        (
            "items",
            "itemBehaviors",
            &project.remake_runtime.bindings.items,
        ),
        (
            "encounters",
            "encounterResolvers",
            &project.remake_runtime.bindings.encounters,
        ),
        (
            "monsterAi",
            "monsterAiProviders",
            &project.remake_runtime.bindings.monster_ai,
        ),
        (
            "lifecycle",
            "lifecycleHooks",
            &project.remake_runtime.bindings.lifecycle,
        ),
    ] {
        for (record_id, binding) in values {
            let context = format!("remakeRuntime.bindings.{field}.{record_id}");
            let key = (capability.to_string(), binding.clone());
            let Some((owner, _)) = bindings.get(&key) else {
                errors.push(format!(
                    "{context} uses unavailable built-in provider '{binding}'."
                ));
                continue;
            };
            require_owner(&context, owner, &required_ids, &mut errors);
        }
    }

    errors.extend(crate::remake_exporter::scripting::validate_project_scripts(
        project,
    ));
    errors
}

fn require_owner(
    context: &str,
    owner: &str,
    required_ids: &BTreeSet<String>,
    errors: &mut Vec<String>,
) {
    if !required_ids.contains(owner) {
        errors.push(format!(
            "{context} requires remakeRuntime.requiredExtensions to include '{owner}'."
        ));
    }
}

fn binding_id(entry: &Value) -> &str {
    entry
        .as_str()
        .or_else(|| entry["id"].as_str())
        .unwrap_or_default()
}

fn is_namespaced(value: &str) -> bool {
    let parts = value.split('.').collect::<Vec<_>>();
    parts.len() >= 2
        && parts.iter().all(|part| {
            !part.is_empty()
                && part
                    .bytes()
                    .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
        })
}

fn validate_schema(value: &Value, schema: &Value, context: &str) -> Option<String> {
    let Some(schema) = schema.as_object() else {
        return None;
    };
    let expected = schema.get("type").and_then(Value::as_str).unwrap_or("");
    let type_valid = match expected {
        "" => true,
        "object" => value.is_object(),
        "array" => value.is_array(),
        "string" => value.is_string(),
        "integer" => value.is_i64() || value.is_u64(),
        "number" => value.is_number(),
        "boolean" => value.is_boolean(),
        _ => false,
    };
    if !type_valid {
        return Some(format!("{context} must be a JSON {expected}."));
    }
    if let Some(allowed) = schema.get("enum").and_then(Value::as_array) {
        if !allowed.contains(value) {
            return Some(format!("{context} is not one of the allowed values."));
        }
    }
    if let Some(object) = value.as_object() {
        let properties = schema
            .get("properties")
            .and_then(Value::as_object)
            .cloned()
            .unwrap_or_default();
        for required in schema
            .get("required")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter_map(Value::as_str)
        {
            if !object.contains_key(required) {
                return Some(format!("{context} requires '{required}'."));
            }
        }
        for (key, child) in object {
            let Some(child_schema) = properties.get(key) else {
                if schema.get("additionalProperties").and_then(Value::as_bool) == Some(false) {
                    return Some(format!("{context} does not allow '{key}'."));
                }
                continue;
            };
            if let Some(error) = validate_schema(child, child_schema, &format!("{context}.{key}")) {
                return Some(error);
            }
        }
    }
    if let (Some(values), Some(items)) = (value.as_array(), schema.get("items")) {
        for (index, child) in values.iter().enumerate() {
            if let Some(error) = validate_schema(child, items, &format!("{context}[{index}]")) {
                return Some(error);
            }
        }
    }
    if let Some(number) = value.as_f64() {
        if schema
            .get("minimum")
            .and_then(Value::as_f64)
            .is_some_and(|minimum| number < minimum)
        {
            return Some(format!("{context} is below the allowed minimum."));
        }
        if schema
            .get("maximum")
            .and_then(Value::as_f64)
            .is_some_and(|maximum| number > maximum)
        {
            return Some(format!("{context} exceeds the allowed maximum."));
        }
    }
    None
}

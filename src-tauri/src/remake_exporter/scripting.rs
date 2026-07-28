use crate::error::{IoPath, ProvidenceError, Result};
use crate::project::{
    ProvidenceProject, RemakePersistentVariable, RemakeScript, RemakeScriptAttachment,
    RemakeScriptTier, RemakeScriptValueType,
};
use serde_json::{json, Map, Value};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::Path;

pub(crate) const SCRIPT_API_VERSION: u32 = 1;
pub(crate) const MAX_ARRAY_LENGTH: usize = 256;
const MAX_AST_NODES: usize = 4096;
const MAX_SCRIPT_CALL_DEPTH: usize = 32;
const FULL_SCRIPT_DENYLIST: [&str; 17] = [
    "@tool",
    "OS.",
    "FileAccess",
    "DirAccess",
    "ResourceLoader",
    "ResourceSaver",
    "ClassDB",
    "Engine.",
    "GDExtension",
    "JavaScriptBridge",
    "Thread",
    "WorkerThreadPool",
    "TCPServer",
    "StreamPeerTCP",
    "PacketPeerUDP",
    "HTTPRequest",
    "WebSocketPeer",
];
const CAPABILITY_CATALOG_BYTES: &[u8] =
    include_bytes!("../../../schemas/remake-scenario-capabilities.v1.json");

pub(crate) struct CompiledScriptBundle {
    pub(crate) document: Value,
    pub(crate) source_files: Vec<(String, Vec<u8>)>,
}

pub(crate) fn compile_project_scripts(project: &ProvidenceProject) -> Result<CompiledScriptBundle> {
    let errors = validate_project_scripts(project);
    if !errors.is_empty() {
        return Err(ProvidenceError::message(format!(
            "Realmz Remake scenario scripts are invalid:\n- {}",
            errors.join("\n- ")
        )));
    }

    let mut compiled = Vec::new();
    let mut source_files = Vec::new();
    for script in &project.remake_runtime.scripts {
        let state_schema_hash = hash_json(&script.state_schema)?;
        let common = json!({
            "id": script.id,
            "name": script.name,
            "documentation": script.documentation,
            "tier": script.tier,
            "apiVersion": script.api_version,
            "parameters": script.parameters,
            "returnType": script.return_type,
            "requestedCapabilities": script.requested_capabilities,
            "stateSchema": script.state_schema,
            "stateSchemaHash": state_schema_hash,
            "sourceMap": script.source_map,
        });
        let mut entry = common.as_object().cloned().unwrap_or_default();
        match script.tier {
            RemakeScriptTier::Safe => {
                let ast = script.ast.as_ref().expect("validated safe AST");
                entry.insert("contentHash".to_string(), Value::String(hash_json(ast)?));
                entry.insert("program".to_string(), canonical_value(ast));
            }
            RemakeScriptTier::Sandboxed | RemakeScriptTier::Trusted => {
                let source = script.source.as_deref().expect("validated full source");
                let relative_path = format!("remake/source/{}.gd", script.id);
                entry.insert(
                    "contentHash".to_string(),
                    Value::String(hash_bytes(source.as_bytes())),
                );
                entry.insert(
                    "sourcePath".to_string(),
                    Value::String(relative_path.clone()),
                );
                source_files.push((relative_path, source.as_bytes().to_vec()));
            }
        }
        compiled.push(Value::Object(entry));
    }

    let capability_catalog: Value =
        serde_json::from_slice(CAPABILITY_CATALOG_BYTES).map_err(|error| {
            ProvidenceError::message(format!("Remake capability catalog is invalid: {error}"))
        })?;
    Ok(CompiledScriptBundle {
        document: json!({
            "schemaVersion": super::REMAKE_DOCUMENT_SCHEMA_VERSION,
            "apiVersion": SCRIPT_API_VERSION,
            "capabilityCatalogHash": hash_json(&capability_catalog)?,
            "limits": {
                "maxArrayLength": MAX_ARRAY_LENGTH,
                "maxAstNodes": MAX_AST_NODES,
                "maxCallDepth": MAX_SCRIPT_CALL_DEPTH,
            },
            "capabilities": safe_capability_ids(),
            "persistentVariables": project.remake_runtime.persistent_variables,
            "attachments": project.remake_runtime.script_attachments,
            "scripts": compiled,
        }),
        source_files,
    })
}

pub(crate) fn write_script_sources(
    output_dir: &Path,
    sources: &[(String, Vec<u8>)],
) -> Result<Vec<String>> {
    let mut written = Vec::new();
    for (relative, bytes) in sources {
        let path = output_dir.join(relative);
        let parent = path
            .parent()
            .ok_or_else(|| ProvidenceError::message("Script source path has no parent"))?;
        fs::create_dir_all(parent).with_path(parent)?;
        fs::write(&path, bytes).with_path(&path)?;
        written.push(relative.clone());
    }
    written.sort();
    Ok(written)
}

pub(crate) fn validate_project_scripts(project: &ProvidenceProject) -> Vec<String> {
    let mut errors = Vec::new();
    let mut script_ids = BTreeSet::new();
    let mut calls = BTreeMap::<String, BTreeSet<String>>::new();

    for script in &project.remake_runtime.scripts {
        let context = format!("Scenario script '{}'", script.id);
        if !valid_script_id(&script.id) {
            errors.push(format!("{context} must use a lowercase dotted namespace."));
        }
        if !script_ids.insert(script.id.clone()) {
            errors.push(format!("{context} is duplicated."));
        }
        if script.api_version != SCRIPT_API_VERSION {
            errors.push(format!(
                "{context} requires API {} but Providence provides API {}.",
                script.api_version, SCRIPT_API_VERSION
            ));
        }
        validate_signature(script, &context, &mut errors);
        validate_capabilities(script, &context, &mut errors);
        match script.tier {
            RemakeScriptTier::Safe => {
                if script.source.is_some() {
                    errors.push(format!("{context} is safe-tier and cannot own GDScript source."));
                }
                let Some(ast) = script.ast.as_ref() else {
                    errors.push(format!("{context} requires a canonical safe AST."));
                    continue;
                };
                let mut node_count = 0;
                let mut script_calls = BTreeSet::new();
                validate_ast(
                    ast,
                    script,
                    &context,
                    &mut node_count,
                    &mut script_calls,
                    &mut errors,
                );
                calls.insert(script.id.clone(), script_calls);
            }
            RemakeScriptTier::Sandboxed | RemakeScriptTier::Trusted => {
                if script.ast.is_some() {
                    errors.push(format!("{context} is full-tier and cannot own a safe AST."));
                }
                let Some(source) = script.source.as_deref() else {
                    errors.push(format!("{context} requires exact UTF-8 GDScript source."));
                    continue;
                };
                if !source.contains("func step(") {
                    errors.push(format!(
                        "{context} must implement func step(event, state, context)."
                    ));
                }
                if matches!(script.tier, RemakeScriptTier::Sandboxed) {
                    for forbidden in FULL_SCRIPT_DENYLIST {
                        if source.contains(forbidden) {
                            errors.push(format!(
                                "{context} uses forbidden sandbox API token '{forbidden}'."
                            ));
                        }
                    }
                }
            }
        }
    }

    for (script_id, targets) in &calls {
        for target in targets {
            if !script_ids.contains(target) {
                errors.push(format!(
                    "Safe script '{script_id}' calls unavailable script '{target}'."
                ));
            }
        }
    }
    validate_acyclic_calls(&calls, &mut errors);
    validate_attachments(
        project,
        &project.remake_runtime.script_attachments,
        &script_ids,
        &mut errors,
    );
    validate_persistent_variables(
        &project.remake_runtime.persistent_variables,
        &mut errors,
    );
    errors
}

fn validate_signature(script: &RemakeScript, context: &str, errors: &mut Vec<String>) {
    let mut names = BTreeSet::new();
    for parameter in &script.parameters {
        if !valid_identifier(&parameter.name) {
            errors.push(format!(
                "{context} parameter '{}' is not a valid identifier.",
                parameter.name
            ));
        }
        if !names.insert(parameter.name.clone()) {
            errors.push(format!(
                "{context} duplicates parameter '{}'.",
                parameter.name
            ));
        }
        validate_array_bound(
            parameter.value_type,
            parameter.max_length,
            &format!("{context} parameter '{}'", parameter.name),
            errors,
        );
    }
}

fn validate_capabilities(script: &RemakeScript, context: &str, errors: &mut Vec<String>) {
    let allowed = safe_capability_ids().into_iter().collect::<BTreeSet<_>>();
    let mut seen = BTreeSet::new();
    for capability in &script.requested_capabilities {
        if !seen.insert(capability) {
            errors.push(format!("{context} duplicates capability '{capability}'."));
        }
        if !allowed.contains(capability) {
            errors.push(format!(
                "{context} requests unavailable capability '{capability}'."
            ));
        }
    }
}

fn safe_capability_ids() -> Vec<String> {
    let catalog: Value = serde_json::from_slice(CAPABILITY_CATALOG_BYTES)
        .expect("checked-in Remake capability catalog must be valid JSON");
    catalog["operations"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|operation| operation["id"].as_str().map(str::to_owned))
        .collect()
}

fn validate_ast(
    value: &Value,
    script: &RemakeScript,
    context: &str,
    node_count: &mut usize,
    calls: &mut BTreeSet<String>,
    errors: &mut Vec<String>,
) {
    *node_count += 1;
    if *node_count > MAX_AST_NODES {
        if *node_count == MAX_AST_NODES + 1 {
            errors.push(format!("{context} exceeds {MAX_AST_NODES} AST nodes."));
        }
        return;
    }
    match value {
        Value::Array(values) => {
            if values.len() > MAX_ARRAY_LENGTH {
                errors.push(format!(
                    "{context} contains an array longer than {MAX_ARRAY_LENGTH}."
                ));
            }
            for child in values {
                validate_ast(child, script, context, node_count, calls, errors);
            }
        }
        Value::Object(object) => {
            if let Some(kind) = object.get("kind").and_then(Value::as_str) {
                let allowed = [
                    "function",
                    "block",
                    "declare",
                    "assign",
                    "if",
                    "return",
                    "operation",
                    "call",
                    "literal",
                    "variable",
                    "array",
                    "unary",
                    "binary",
                ];
                if !allowed.contains(&kind) {
                    errors.push(format!(
                        "{context} contains unsupported AST node kind '{kind}'."
                    ));
                }
                if kind == "operation" {
                    let capability = object
                        .get("capability")
                        .and_then(Value::as_str)
                        .unwrap_or_default();
                    if !script
                        .requested_capabilities
                        .iter()
                        .any(|requested| requested == capability)
                    {
                        errors.push(format!(
                            "{context} uses undeclared capability '{capability}'."
                        ));
                    }
                } else if kind == "call" {
                    if let Some(target) = object.get("scriptId").and_then(Value::as_str) {
                        calls.insert(target.to_string());
                    }
                }
            }
            for child in object.values() {
                validate_ast(child, script, context, node_count, calls, errors);
            }
        }
        _ => {}
    }
}

fn validate_acyclic_calls(
    calls: &BTreeMap<String, BTreeSet<String>>,
    errors: &mut Vec<String>,
) {
    fn visit(
        current: &str,
        calls: &BTreeMap<String, BTreeSet<String>>,
        visiting: &mut Vec<String>,
        complete: &mut BTreeSet<String>,
        errors: &mut Vec<String>,
    ) {
        if complete.contains(current) {
            return;
        }
        if let Some(position) = visiting.iter().position(|item| item == current) {
            let mut cycle = visiting[position..].to_vec();
            cycle.push(current.to_string());
            errors.push(format!(
                "Safe script calls must be acyclic: {}.",
                cycle.join(" -> ")
            ));
            return;
        }
        if visiting.len() >= MAX_SCRIPT_CALL_DEPTH {
            errors.push(format!(
                "Safe script call graph exceeds depth {MAX_SCRIPT_CALL_DEPTH} at '{current}'."
            ));
            return;
        }
        visiting.push(current.to_string());
        for target in calls.get(current).into_iter().flatten() {
            visit(target, calls, visiting, complete, errors);
        }
        visiting.pop();
        complete.insert(current.to_string());
    }

    let mut complete = BTreeSet::new();
    for script in calls.keys() {
        visit(script, calls, &mut Vec::new(), &mut complete, errors);
    }
}

fn validate_attachments(
    project: &ProvidenceProject,
    attachments: &[RemakeScriptAttachment],
    script_ids: &BTreeSet<String>,
    errors: &mut Vec<String>,
) {
    let mut occupied = BTreeSet::new();
    let trigger_ids = project
        .triggers
        .iter()
        .map(|record| record.id.as_str())
        .collect::<BTreeSet<_>>();
    let simple_ids = project
        .simple_encounters
        .iter()
        .map(|record| record.id.to_string())
        .collect::<BTreeSet<_>>();
    let complex_ids = project
        .complex_encounters
        .iter()
        .map(|record| record.id.to_string())
        .collect::<BTreeSet<_>>();
    for attachment in attachments {
        let context = format!(
            "Script attachment {}:{}",
            attachment.target_kind, attachment.record_id
        );
        if !script_ids.contains(&attachment.script_id) {
            errors.push(format!(
                "{context} references unavailable script '{}'.",
                attachment.script_id
            ));
        }
        let target_exists = match attachment.target_kind.as_str() {
            "trigger" => trigger_ids.contains(attachment.record_id.as_str()),
            "simpleEncounter" => simple_ids.contains(&attachment.record_id),
            "complexEncounter" => complex_ids.contains(&attachment.record_id),
            "lifecycle" => true,
            _ => {
                errors.push(format!(
                    "{context} has unsupported target kind '{}'.",
                    attachment.target_kind
                ));
                false
            }
        };
        if !target_exists && attachment.target_kind != "lifecycle" {
            errors.push(format!("{context} does not resolve to a project record."));
        }
        if attachment.target_kind == "lifecycle" {
            if attachment.slot.is_some() || attachment.hook.as_deref().unwrap_or_default().is_empty()
            {
                errors.push(format!(
                    "{context} requires a lifecycle hook and no action slot."
                ));
            }
        } else if attachment.slot.is_none() || attachment.hook.is_some() {
            errors.push(format!(
                "{context} requires an action slot and no lifecycle hook."
            ));
        } else {
            let maximum = if attachment.target_kind == "trigger" { 7 } else { 31 };
            if attachment.slot.is_some_and(|slot| slot > maximum) {
                errors.push(format!(
                    "{context} slot must be between 0 and {maximum}."
                ));
            }
        }
        let key = (
            attachment.target_kind.clone(),
            attachment.record_id.clone(),
            attachment.slot,
            attachment.hook.clone(),
        );
        if !occupied.insert(key) {
            errors.push(format!("{context} is duplicated."));
        }
    }
}

fn validate_persistent_variables(
    variables: &[RemakePersistentVariable],
    errors: &mut Vec<String>,
) {
    let mut names = BTreeSet::new();
    for variable in variables {
        let context = format!("Persistent variable '{}'", variable.name);
        if !valid_identifier(&variable.name) {
            errors.push(format!("{context} is not a valid identifier."));
        }
        if !names.insert(variable.name.clone()) {
            errors.push(format!("{context} is duplicated."));
        }
        if variable.value_type == RemakeScriptValueType::Void {
            errors.push(format!("{context} cannot use void."));
        }
        validate_array_bound(
            variable.value_type,
            variable.max_length,
            &context,
            errors,
        );
        if !value_matches_type(
            &variable.default_value,
            variable.value_type,
            variable.max_length,
        ) {
            errors.push(format!("{context} has an invalid default value."));
        }
    }
}

fn validate_array_bound(
    value_type: RemakeScriptValueType,
    max_length: Option<usize>,
    context: &str,
    errors: &mut Vec<String>,
) {
    if value_type.is_array() {
        if !max_length.is_some_and(|length| (1..=MAX_ARRAY_LENGTH).contains(&length)) {
            errors.push(format!(
                "{context} requires maxLength from 1 through {MAX_ARRAY_LENGTH}."
            ));
        }
    } else if max_length.is_some() {
        errors.push(format!("{context} cannot declare maxLength for a scalar."));
    }
}

fn value_matches_type(
    value: &Value,
    value_type: RemakeScriptValueType,
    max_length: Option<usize>,
) -> bool {
    match value_type {
        RemakeScriptValueType::Void => value.is_null(),
        RemakeScriptValueType::Bool => value.is_boolean(),
        RemakeScriptValueType::Int => value.is_i64() || value.is_u64(),
        RemakeScriptValueType::Float => value.is_number(),
        RemakeScriptValueType::String => value.is_string(),
        RemakeScriptValueType::BoolArray
        | RemakeScriptValueType::IntArray
        | RemakeScriptValueType::FloatArray
        | RemakeScriptValueType::StringArray => value.as_array().is_some_and(|values| {
            values.len() <= max_length.unwrap_or_default()
                && values.iter().all(|value| match value_type {
                    RemakeScriptValueType::BoolArray => value.is_boolean(),
                    RemakeScriptValueType::IntArray => value.is_i64() || value.is_u64(),
                    RemakeScriptValueType::FloatArray => value.is_number(),
                    RemakeScriptValueType::StringArray => value.is_string(),
                    _ => false,
                })
        }),
    }
}

fn valid_script_id(value: &str) -> bool {
    let parts = value.split('.').collect::<Vec<_>>();
    parts.len() >= 2
        && parts.iter().all(|part| {
            !part.is_empty()
                && part.bytes().all(|byte| {
                    byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-'
                })
        })
}

fn valid_identifier(value: &str) -> bool {
    let mut bytes = value.bytes();
    bytes.next().is_some_and(|first| {
        (first.is_ascii_lowercase() || first == b'_')
            && bytes.all(|byte| {
                byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'_'
            })
    })
}

fn hash_json(value: &Value) -> Result<String> {
    let canonical = serde_json::to_vec(&canonical_value(value)).map_err(|error| {
        ProvidenceError::message(format!("Could not serialize canonical script data: {error}"))
    })?;
    Ok(hash_bytes(&canonical))
}

fn canonical_value(value: &Value) -> Value {
    match value {
        Value::Array(values) => Value::Array(values.iter().map(canonical_value).collect()),
        Value::Object(object) => {
            let mut sorted = BTreeMap::new();
            for (key, value) in object {
                sorted.insert(key.clone(), canonical_value(value));
            }
            Value::Object(sorted.into_iter().collect::<Map<_, _>>())
        }
        _ => value.clone(),
    }
}

fn hash_bytes(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    format!("{:x}", hasher.finalize())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sandbox_scanner_rejects_process_and_file_apis() {
        let source = "func step(event, state, context):\n  OS.execute(\"cmd\")\n  return FileAccess.open(\"x\", 1)\n";
        for token in ["OS.", "FileAccess"] {
            assert!(FULL_SCRIPT_DENYLIST
                .iter()
                .any(|forbidden| *forbidden == token && source.contains(forbidden)));
        }
    }

    #[test]
    fn canonical_hash_ignores_object_key_order() {
        let left = json!({"b": 2, "a": 1});
        let right: Value = serde_json::from_str(r#"{"a":1,"b":2}"#).unwrap();
        assert_eq!(hash_json(&left).unwrap(), hash_json(&right).unwrap());
    }
}

use crate::error::{IoPath, ProvidenceError, Result};
use crate::project::{
    ProvidenceProject, RemakeBehaviorBinding, RemakeBehaviorDefinition, RemakeBehaviorKind,
    RemakeBehaviorRole, RemakeBehaviorTier, RemakeScriptValueType, RemakeStateDefinition,
};
use serde_json::{json, Map, Value};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::Path;

pub(crate) const SCRIPT_API_VERSION: u32 = 2;
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
    include_bytes!("../../../schemas/remake-scenario-capabilities.v2.json");

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
    for script in &project.remake_runtime.behaviors {
        let state_schema_hash = hash_json(&script.state_schema)?;
        let common = json!({
            "id": script.id,
            "name": script.name,
            "description": script.description,
            "kind": script.kind,
            "role": script.role,
            "hook": script.hook,
            "tier": script.tier,
            "apiVersion": script.api_version,
            "behaviorVersion": script.behavior_version,
            "stateSchemaVersion": script.state_schema_version,
            "parameters": script.parameters,
            "returnType": script.return_type,
            "requestedCapabilities": script.requested_capabilities,
            "stateSchema": script.state_schema,
            "stateSchemaHash": state_schema_hash,
            "sourceMap": script.source_map,
        });
        let mut entry = common.as_object().cloned().unwrap_or_default();
        match script.tier {
            RemakeBehaviorTier::Safe => {
                let ast = script.ast.as_ref().expect("validated safe AST");
                entry.insert("contentHash".to_string(), Value::String(hash_json(ast)?));
                entry.insert("program".to_string(), canonical_value(ast));
            }
            RemakeBehaviorTier::Sandboxed => {
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
    let catalog_limits = capability_catalog
        .get("limits")
        .and_then(Value::as_object)
        .ok_or_else(|| ProvidenceError::message("Remake capability catalog has no limits"))?;
    let max_array_length = catalog_limit(catalog_limits, "maxArrayLength")?;
    let max_ast_nodes = catalog_limit(catalog_limits, "maxAstNodes")?;
    let max_call_depth = catalog_limit(catalog_limits, "maxCallDepth")?;
    let execution_budget = capability_catalog
        .get("executionBudget")
        .and_then(Value::as_u64)
        .ok_or_else(|| ProvidenceError::message("Remake capability catalog has no execution budget"))?;
    if max_array_length != MAX_ARRAY_LENGTH
        || max_ast_nodes != MAX_AST_NODES
        || max_call_depth != MAX_SCRIPT_CALL_DEPTH
    {
        return Err(ProvidenceError::message(
            "Providence Safe compiler limits do not match the Remake capability catalog",
        ));
    }
    Ok(CompiledScriptBundle {
        document: json!({
            "schemaVersion": super::REMAKE_DOCUMENT_SCHEMA_VERSION,
            "apiVersion": SCRIPT_API_VERSION,
            "capabilityCatalogHash": hash_json(&capability_catalog)?,
            "limits": {
                "maxArrayLength": max_array_length,
                "maxAstNodes": max_ast_nodes,
                "maxCallDepth": max_call_depth,
                "executionBudget": execution_budget,
            },
            "capabilities": safe_capability_ids(),
            "stateDefinitions": project.remake_runtime.state_definitions,
            "bindings": project.remake_runtime.behavior_bindings,
            "migrations": project.remake_runtime.migrations,
            "behaviors": compiled,
        }),
        source_files,
    })
}

fn catalog_limit(limits: &Map<String, Value>, name: &str) -> Result<usize> {
    limits
        .get(name)
        .and_then(Value::as_u64)
        .and_then(|value| usize::try_from(value).ok())
        .ok_or_else(|| ProvidenceError::message(format!(
            "Remake capability catalog has no valid {name}"
        )))
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
    let mut behaviors = BTreeMap::new();
    let mut calls = BTreeMap::<String, BTreeSet<String>>::new();

    for script in &project.remake_runtime.behaviors {
        let context = format!("Scenario behavior '{}'", script.id);
        if !valid_script_id(&script.id) {
            errors.push(format!("{context} must use a lowercase dotted namespace."));
        }
        if !script_ids.insert(script.id.clone()) {
            errors.push(format!("{context} is duplicated."));
        }
        behaviors.insert(script.id.clone(), script);
        validate_role(script, &context, &mut errors);
        if script.api_version != SCRIPT_API_VERSION {
            errors.push(format!(
                "{context} requires API {} but Providence provides API {}.",
                script.api_version, SCRIPT_API_VERSION
            ));
        }
        validate_signature(script, &context, &mut errors);
        validate_capabilities(script, &context, &mut errors);
        match script.tier {
            RemakeBehaviorTier::Safe => {
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
            RemakeBehaviorTier::Sandboxed => {
                if script.ast.is_some() {
                    errors.push(format!("{context} is sandboxed and cannot own a Safe AST."));
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
    validate_bindings(
        project,
        &project.remake_runtime.behavior_bindings,
        &behaviors,
        &mut errors,
    );
    validate_state_definitions(
        &project.remake_runtime.state_definitions,
        &mut errors,
    );
    errors
}

fn validate_signature(
    script: &RemakeBehaviorDefinition,
    context: &str,
    errors: &mut Vec<String>,
) {
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

fn validate_capabilities(
    script: &RemakeBehaviorDefinition,
    context: &str,
    errors: &mut Vec<String>,
) {
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
        let catalog: Value = serde_json::from_slice(CAPABILITY_CATALOG_BYTES)
            .expect("checked-in Remake capability catalog must be valid JSON");
        let role = serde_json::to_value(script.role)
            .ok()
            .and_then(|value| value.as_str().map(str::to_owned))
            .unwrap_or_default();
        let compatible = catalog["operations"]
            .as_array()
            .into_iter()
            .flatten()
            .find(|operation| operation["id"].as_str() == Some(capability))
            .and_then(|operation| operation["roles"].as_array())
            .is_some_and(|roles| roles.iter().any(|entry| entry.as_str() == Some(&role)));
        if allowed.contains(capability) && !compatible {
            errors.push(format!(
                "{context} cannot use capability '{capability}' from role '{role}'."
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
    script: &RemakeBehaviorDefinition,
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
                    "match",
                    "for",
                    "return",
                    "operation",
                    "call",
                    "literal",
                    "variable",
                    "array",
                    "unary",
                    "binary",
                    "member",
                    "collection",
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

fn validate_role(
    behavior: &RemakeBehaviorDefinition,
    context: &str,
    errors: &mut Vec<String>,
) {
    let allowed_hooks: &[&str] = match behavior.role {
        RemakeBehaviorRole::Action => &["run"],
        RemakeBehaviorRole::Encounter => &["enter", "option", "result", "complete"],
        RemakeBehaviorRole::Spell => &["validate", "cast", "effect", "tick", "expire"],
        RemakeBehaviorRole::Item => &[
            "use-field", "use-combat", "equip", "unequip", "attack", "defense", "passive",
        ],
        RemakeBehaviorRole::MonsterAi => &["decide"],
        RemakeBehaviorRole::Lifecycle => &[
            "campaign-start", "campaign-resume", "campaign-complete", "map-enter", "map-leave",
            "party-moved", "rest-start", "rest-complete", "time-advanced", "battle-start",
            "battle-complete", "character-defeated", "party-defeated",
        ],
        RemakeBehaviorRole::RuleModifier => &[
            "attack-chance", "damage", "healing", "spell-cost", "movement-cost", "fatigue",
            "experience", "loot", "encounter-chance", "rest-recovery", "time-advance",
            "condition-resistance",
        ],
        RemakeBehaviorRole::Helper => &[],
    };
    if matches!(behavior.kind, RemakeBehaviorKind::Helper) {
        if behavior.role != RemakeBehaviorRole::Helper || !behavior.hook.is_empty() {
            errors.push(format!("{context} helper must use the helper role and no hook."));
        }
    } else if behavior.role == RemakeBehaviorRole::Helper {
        errors.push(format!("{context} entry behavior cannot use the helper role."));
    } else if !allowed_hooks.contains(&behavior.hook.as_str()) {
        errors.push(format!(
            "{context} hook '{}' is unavailable for its role.",
            behavior.hook
        ));
    }
    if behavior.behavior_version == 0 || behavior.state_schema_version == 0 {
        errors.push(format!("{context} versions must start at 1."));
    }
}

fn validate_bindings(
    project: &ProvidenceProject,
    bindings: &[RemakeBehaviorBinding],
    behaviors: &BTreeMap<String, &RemakeBehaviorDefinition>,
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
    let spell_ids = project
        .spell_overrides
        .iter()
        .map(|record| record.id.to_string())
        .collect::<BTreeSet<_>>();
    let item_ids = project
        .scenario_items
        .iter()
        .map(|record| record.id.to_string())
        .collect::<BTreeSet<_>>();
    let monster_ids = project
        .monsters
        .iter()
        .map(|record| record.id.to_string())
        .collect::<BTreeSet<_>>();
    for attachment in bindings {
        let context = format!(
            "Behavior binding {}:{}",
            attachment.target_kind, attachment.record_id
        );
        let Some(behavior) = behaviors.get(&attachment.behavior_id) else {
            errors.push(format!(
                "{context} references unavailable behavior '{}'.",
                attachment.behavior_id
            ));
            continue;
        };
        if behavior.role != attachment.role || behavior.hook != attachment.hook {
            errors.push(format!(
                "{context} role and hook do not match behavior '{}'.",
                attachment.behavior_id
            ));
        }
        let target_exists = match attachment.target_kind.as_str() {
            "trigger" => trigger_ids.contains(attachment.record_id.as_str()),
            "simpleEncounter" => simple_ids.contains(&attachment.record_id),
            "complexEncounter" => complex_ids.contains(&attachment.record_id),
            "spell" => spell_ids.contains(&attachment.record_id),
            "item" => item_ids.contains(&attachment.record_id),
            "monster" => monster_ids.contains(&attachment.record_id),
            "lifecycle" => true,
            "rule" => true,
            _ => {
                errors.push(format!(
                    "{context} has unsupported target kind '{}'.",
                    attachment.target_kind
                ));
                false
            }
        };
        if !target_exists && attachment.target_kind != "lifecycle" && attachment.target_kind != "rule" {
            errors.push(format!("{context} does not resolve to a project record."));
        }
        if attachment.target_kind == "lifecycle" {
            if attachment.slot.is_some() || attachment.hook.is_empty() {
                errors.push(format!(
                    "{context} requires a lifecycle hook and no action slot."
                ));
            }
        } else if ["trigger", "simpleEncounter", "complexEncounter"].contains(&attachment.target_kind.as_str())
            && attachment.slot.is_none()
        {
            errors.push(format!(
                "{context} requires an action slot and no lifecycle hook."
            ));
        } else if ["trigger", "simpleEncounter", "complexEncounter"].contains(&attachment.target_kind.as_str()) {
            let maximum = if attachment.target_kind == "trigger" { 7 } else { 31 };
            if attachment.slot.is_some_and(|slot| slot > maximum) {
                errors.push(format!(
                    "{context} slot must be between 0 and {maximum}."
                ));
            }
        } else if attachment.slot.is_some() {
            errors.push(format!("{context} domain binding cannot use an action slot."));
        }
        let key = (
            attachment.target_kind.clone(),
            attachment.record_id.clone(),
            attachment.slot,
            attachment.hook.clone(),
            attachment.priority,
        );
        if !occupied.insert(key) {
            errors.push(format!("{context} is duplicated."));
        }
    }
}

fn validate_state_definitions(
    variables: &[RemakeStateDefinition],
    errors: &mut Vec<String>,
) {
    let mut names = BTreeSet::new();
    for variable in variables {
        let context = format!("Scenario state '{}:{}'", variable.scope, variable.name);
        if !valid_identifier(&variable.name) {
            errors.push(format!("{context} is not a valid identifier."));
        }
        if !names.insert((
            variable.scope.clone(),
            variable.owner_id.clone(),
            variable.name.clone(),
        )) {
            errors.push(format!("{context} is duplicated."));
        }
        if variable.value_type == RemakeScriptValueType::Void {
            errors.push(format!("{context} cannot use void."));
        }
        if variable.schema_version == 0 {
            errors.push(format!("{context} schema version must start at 1."));
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
        RemakeScriptValueType::LocationSnapshot => value.as_object().is_some_and(|snapshot| {
            snapshot.get("levelType").is_some_and(Value::is_string)
                && snapshot.get("levelIndex").is_some_and(Value::is_i64)
                && snapshot.get("x").is_some_and(Value::is_i64)
                && snapshot.get("y").is_some_and(Value::is_i64)
        }),
        RemakeScriptValueType::TimeSnapshot => value.as_object().is_some_and(|snapshot| {
            ["day", "hour", "minute", "second", "totalSeconds"]
                .iter()
                .all(|field| snapshot.get(*field).is_some_and(Value::is_i64))
        }),
        RemakeScriptValueType::WealthSnapshot => value.as_object().is_some_and(|snapshot| {
            ["gold", "gems", "jewelry", "pooledGold"]
                .iter()
                .all(|field| snapshot.get(*field).is_some_and(Value::is_i64))
        }),
        RemakeScriptValueType::CharacterSnapshot => character_snapshot_matches(value),
        RemakeScriptValueType::CombatSnapshot => value.as_object().is_some_and(|snapshot| {
            snapshot.get("active").is_some_and(Value::is_boolean)
                && snapshot.get("round").is_some_and(Value::is_i64)
                && snapshot.get("combatants").is_some_and(|combatants| {
                    combatants
                        .as_array()
                        .is_some_and(|entries| entries.iter().all(character_snapshot_matches))
                })
        }),
        RemakeScriptValueType::CharacterSnapshotArray => value.as_array().is_some_and(|values| {
            values.len() <= max_length.unwrap_or_default()
                && values.iter().all(character_snapshot_matches)
        }),
        RemakeScriptValueType::ActionOutcome => {
            outcome_kind_matches(value, &["continue", "halt", "call", "replace", "return"])
        }
        RemakeScriptValueType::EncounterOutcome => {
            outcome_kind_matches(value, &["continue", "resolve", "repeat", "close", "branch"])
        }
        RemakeScriptValueType::EffectOutcome => {
            outcome_kind_matches(value, &["applied", "no-effect", "invalid"])
        }
        RemakeScriptValueType::ItemOutcome => {
            outcome_kind_matches(value, &["used", "rejected", "no-effect"])
        }
        RemakeScriptValueType::MonsterDecision => {
            outcome_kind_matches(value, &["attack", "cast", "move", "flee", "wait", "use-item"])
        }
        RemakeScriptValueType::RuleModifier => value.as_object().is_some_and(|modifier| {
            modifier.iter().all(|(key, value)| {
                ["add", "multiply", "minimum", "maximum"].contains(&key.as_str())
                    && value.as_f64().is_some_and(f64::is_finite)
            })
        }),
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

fn outcome_kind_matches(value: &Value, allowed: &[&str]) -> bool {
    value
        .as_object()
        .and_then(|outcome| outcome.get("kind"))
        .and_then(Value::as_str)
        .is_some_and(|kind| allowed.contains(&kind))
}

fn character_snapshot_matches(value: &Value) -> bool {
    value.as_object().is_some_and(|snapshot| {
        snapshot.get("id").is_some_and(Value::is_string)
            && snapshot.get("name").is_some_and(Value::is_string)
            && ["level", "health", "maximumHealth", "spellPoints", "maximumSpellPoints"]
                .iter()
                .all(|field| snapshot.get(*field).is_some_and(Value::is_i64))
            && snapshot.get("alive").is_some_and(Value::is_boolean)
    })
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

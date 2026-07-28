use super::assets::PackagedAssets;
use super::{portable_campaign_id, REMAKE_DOCUMENT_SCHEMA_VERSION};
use crate::error::Result;
use crate::project::{ProvidenceProject, SemanticSchema, TriggerRecord};
use crate::remake_exporter::portable::{portable_source_label, portable_value};
use serde::Serialize;
use serde_json::{json, Value};
use std::collections::BTreeMap;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ExportTrigger<'a> {
    #[serde(flatten)]
    trigger: &'a TriggerRecord,
    #[serde(skip_serializing_if = "Option::is_none")]
    callable: Option<bool>,
}

pub(crate) fn contract_files() -> BTreeMap<&'static str, &'static str> {
    BTreeMap::from([
        ("assets", "classic/assets.json"),
        ("content", "classic/content.json"),
        ("encounters", "classic/encounters.json"),
        ("evidence", "classic/evidence.json"),
        ("maps", "classic/maps.json"),
        ("rules", "classic/rules.json"),
        ("runtime", "runtime.json"),
        ("scenario", "classic/scenario.json"),
        ("scripts", "classic/scripts.json"),
    ])
}

pub(crate) fn build_documents(
    project: &ProvidenceProject,
    assets: &PackagedAssets,
) -> Result<Vec<(&'static str, Value)>> {
    let semantic_schema = crate::semantic::build_canonical_project_semantic_schema(project);
    Ok(vec![
        ("scenario.json", scenario_document(project)?),
        ("maps.json", maps_document(project)?),
        ("scripts.json", scripts_document(project, &semantic_schema)?),
        ("encounters.json", encounters_document(project)?),
        ("content.json", content_document(project)?),
        ("rules.json", rules_document(project)?),
        ("assets.json", assets.document()),
        (
            "evidence.json",
            evidence_document(project, &semantic_schema)?,
        ),
        ("runtime.json", runtime_document(project)?),
    ])
}

fn scenario_document(project: &ProvidenceProject) -> Result<Value> {
    Ok(json!({
        "schemaVersion": REMAKE_DOCUMENT_SCHEMA_VERSION,
        "identity": {
            "id": portable_campaign_id(&project.scenario.id, &project.scenario.name),
            "name": &project.scenario.name,
        },
        "shell": portable_value(&project.scenario.shell)?,
        "supportFile": portable_value(&project.scenario.support_file)?,
        "contactInfo": portable_value(&project.scenario.contact_info)?,
        "restrictions": portable_value(&project.scenario.restrictions)?,
        "globalMacroHooks": portable_value(&project.scenario.global_macro_hooks)?,
    }))
}

fn maps_document(project: &ProvidenceProject) -> Result<Value> {
    Ok(json!({
        "schemaVersion": REMAKE_DOCUMENT_SCHEMA_VERSION,
        "maps": portable_value(&project.maps)?,
        "landLayout": portable_value(&project.land_layout)?,
        "mapRecords": portable_value(&project.map_records)?,
        "tileAttributes": portable_value(&project.tile_attributes)?,
        "customLandlooks": portable_value(&project.custom_landlooks)?,
    }))
}

fn scripts_document(
    project: &ProvidenceProject,
    semantic_schema: &SemanticSchema,
) -> Result<Value> {
    let callable_by_record: BTreeMap<usize, bool> = semantic_schema
        .decoding
        .ed3_reachability
        .iter()
        .map(|row| (row.record_index, row.reachable))
        .collect();
    let triggers: Vec<_> = project
        .triggers
        .iter()
        .map(|trigger| ExportTrigger {
            trigger,
            callable: (trigger.source == "Data ED3").then(|| {
                callable_by_record
                    .get(&trigger.record_index)
                    .copied()
                    .unwrap_or(false)
            }),
        })
        .collect();
    let mut portable_triggers = portable_value(&triggers)?;
    add_classic_instruction_kinds(&mut portable_triggers);
    apply_semantic_actions(
        &mut portable_triggers,
        "trigger",
        &project.remake_runtime.semantic_actions,
    );
    Ok(json!({
        "schemaVersion": REMAKE_DOCUMENT_SCHEMA_VERSION,
        "triggers": portable_triggers,
        "randomLevels": portable_value(&project.random_levels)?,
        "extraCodes": portable_value(&project.extracodes)?,
        "messages": portable_value(&project.messages)?,
        "optionLabels": portable_value(&project.option_labels)?,
    }))
}

fn encounters_document(project: &ProvidenceProject) -> Result<Value> {
    let mut simple_encounters = portable_value(&project.simple_encounters)?;
    let mut complex_encounters = portable_value(&project.complex_encounters)?;
    add_classic_instruction_kinds(&mut simple_encounters);
    add_classic_instruction_kinds(&mut complex_encounters);
    apply_semantic_actions(
        &mut simple_encounters,
        "simpleEncounter",
        &project.remake_runtime.semantic_actions,
    );
    apply_semantic_actions(
        &mut complex_encounters,
        "complexEncounter",
        &project.remake_runtime.semantic_actions,
    );
    Ok(json!({
        "schemaVersion": REMAKE_DOCUMENT_SCHEMA_VERSION,
        "battles": portable_value(&project.battles)?,
        "treasures": portable_value(&project.treasures)?,
        "shops": portable_value(&project.shops)?,
        "simpleEncounters": simple_encounters,
        "complexEncounters": complex_encounters,
        "thiefEncounters": portable_value(&project.thief_encounters)?,
        "timedEncounters": portable_value(&project.timed_encounters)?,
    }))
}

fn content_document(project: &ProvidenceProject) -> Result<Value> {
    Ok(json!({
        "schemaVersion": REMAKE_DOCUMENT_SCHEMA_VERSION,
        "monsters": portable_value(&project.monsters)?,
        "monsterSets": portable_value(&project.monster_sets)?,
        "monsterDescriptions": portable_value(&project.monster_descriptions)?,
        "scenarioItems": portable_value(&project.scenario_items)?,
        "itemTexts": portable_value(&project.item_texts)?,
        "questLabels": portable_value(&project.quest_labels)?,
    }))
}

fn rules_document(project: &ProvidenceProject) -> Result<Value> {
    let rule_names = json!({
        "sourceFile": portable_source_label(&project.rule_names.source_file),
        "raceNames": &project.rule_names.race_names,
        "casteNames": &project.rule_names.caste_names,
        "authored": project.rule_names.authored,
        "provenance": portable_value(&project.rule_names.provenance)?,
    });
    Ok(json!({
        "schemaVersion": REMAKE_DOCUMENT_SCHEMA_VERSION,
        "spellOverrides": portable_value(&project.spell_overrides)?,
        "raceOverrides": portable_value(&project.race_overrides)?,
        "casteOverrides": portable_value(&project.caste_overrides)?,
        "ruleNames": rule_names,
    }))
}

fn evidence_document(
    project: &ProvidenceProject,
    semantic_schema: &SemanticSchema,
) -> Result<Value> {
    let source_files = project
        .source
        .files
        .iter()
        .map(|source| {
            json!({
                "name": portable_source_label(&source.name),
                "bytes": source.bytes,
                "sha256": &source.sha256,
                "role": source.role,
            })
        })
        .collect::<Vec<_>>();
    let alignments = project
        .records
        .alignments
        .iter()
        .map(|alignment| {
            json!({
                "source": portable_source_label(&alignment.source),
                "recordBytes": alignment.record_bytes,
                "count": alignment.count,
                "trailingBytes": alignment.trailing_bytes,
                "status": alignment.status,
            })
        })
        .collect::<Vec<_>>();
    let diagnostics = project
        .diagnostics
        .iter()
        .map(|diagnostic| {
            json!({
                "severity": diagnostic.severity,
                "code": &diagnostic.code,
                "message": &diagnostic.message,
                "source": diagnostic.source.as_deref().map(portable_source_label),
            })
        })
        .collect::<Vec<_>>();
    Ok(json!({
        "schemaVersion": REMAKE_DOCUMENT_SCHEMA_VERSION,
        "source": {
            "origin": project.source.resolved_origin(),
            "files": source_files,
        },
        "recordCatalog": {
            "counts": &project.records.counts,
            "alignments": alignments,
        },
        "diagnostics": diagnostics,
        "validation": {
            "ok": project.validation.ok,
            "errors": &project.validation.errors,
            "warnings": &project.validation.warnings,
        },
        "semanticDecoding": {
            "ed3Reachability": portable_value(&semantic_schema.decoding.ed3_reachability)?,
            "dispatcherNoops": portable_value(&semantic_schema.decoding.dispatcher_noops)?,
        },
    }))
}

fn runtime_document(project: &ProvidenceProject) -> Result<Value> {
    let remake_only_reasons = project.remake_runtime.remake_only_reasons();
    Ok(json!({
        "schemaVersion": REMAKE_DOCUMENT_SCHEMA_VERSION,
        "recommendedGameplayProfile": &project.remake_runtime.recommended_gameplay_profile,
        "requiredExtensions": portable_value(&project.remake_runtime.required_extensions)?,
        "bindings": portable_value(&project.remake_runtime.bindings)?,
        "targetSupport": {
            "realmzRemake": true,
            "nativeRealmz": remake_only_reasons.is_empty(),
            "remakeOnlyReasons": remake_only_reasons,
        },
    }))
}

fn add_classic_instruction_kinds(records: &mut Value) {
    let Some(records) = records.as_array_mut() else {
        return;
    };
    for record in records {
        let Some(actions) = record.get_mut("actions").and_then(Value::as_array_mut) else {
            continue;
        };
        for action in actions {
            let Some(action_object) = action.as_object_mut() else {
                continue;
            };
            action_object.insert("kind".to_string(), json!("classic"));
            let raw_code = action_object
                .get("rawCode")
                .and_then(Value::as_i64)
                .unwrap_or_default();
            let normalized = if raw_code < 0 && ![-14, -23].contains(&raw_code) {
                raw_code.abs()
            } else {
                raw_code
            };
            action_object.insert("code".to_string(), json!(normalized));
            action_object.insert(
                "gosub".to_string(),
                json!(raw_code < 0 && ![-14, -23].contains(&raw_code)),
            );
        }
    }
}

fn apply_semantic_actions(
    records: &mut Value,
    target_kind: &str,
    semantic_actions: &[crate::project::RemakeSemanticAction],
) {
    let Some(records) = records.as_array_mut() else {
        return;
    };
    for semantic in semantic_actions
        .iter()
        .filter(|action| action.target_kind == target_kind)
    {
        let Some(record) = records.iter_mut().find(|record| {
            let identity = record.get("id");
            identity.and_then(Value::as_str) == Some(semantic.record_id.as_str())
                || identity
                    .and_then(Value::as_i64)
                    .is_some_and(|id| id.to_string() == semantic.record_id)
        }) else {
            continue;
        };
        let Some(actions) = record.get_mut("actions").and_then(Value::as_array_mut) else {
            continue;
        };
        actions.retain(|action| {
            action.get("slot").and_then(Value::as_u64) != Some(semantic.slot as u64)
        });
        actions.push(json!({
            "kind": "semantic",
            "slot": semantic.slot,
            "operation": semantic.operation,
            "parameters": semantic.parameters,
        }));
        actions.sort_by_key(|action| {
            action
                .get("slot")
                .and_then(Value::as_u64)
                .unwrap_or(u64::MAX)
        });
    }
}

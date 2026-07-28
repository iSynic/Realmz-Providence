use super::assets::{remake_land_tile_value, PackagedAssets};
use super::evidence::RuntimeEvidence;
use super::rule_selection::rule_table_selection;
use super::{portable_campaign_id, REMAKE_DOCUMENT_SCHEMA_VERSION};
use crate::error::Result;
use crate::project::{
    BattleRecord, ComplexEncounterRecord, ProvidenceProject, SemanticSchema, SimpleEncounterRecord,
    TriggerRecord,
};
use crate::remake_exporter::portable::{
    portable_project_diagnostic_message, portable_source_label, portable_value,
};
use crate::semantic::RuntimeReachability;
use serde::Serialize;
use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::path::Path;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ExportTrigger<'a> {
    #[serde(flatten)]
    trigger: &'a TriggerRecord,
    #[serde(skip_serializing_if = "Option::is_none")]
    callable: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    macro_id: Option<usize>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ExportBattle<'a> {
    #[serde(flatten)]
    battle: &'a BattleRecord,
    callable: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ExportSimpleEncounter<'a> {
    #[serde(flatten)]
    encounter: &'a SimpleEncounterRecord,
    callable: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ExportComplexEncounter<'a> {
    #[serde(flatten)]
    encounter: &'a ComplexEncounterRecord,
    callable: bool,
}

pub(crate) fn contract_files() -> BTreeMap<&'static str, &'static str> {
    BTreeMap::from([
        ("assets", "classic/assets.json"),
        ("content", "classic/content.json"),
        ("encounters", "classic/encounters.json"),
        ("evidence", "classic/evidence.json"),
        ("maps", "classic/maps.json"),
        ("remakeScripts", "remake/scripts.json"),
        ("rules", "classic/rules.json"),
        ("runtime", "runtime.json"),
        ("scenario", "classic/scenario.json"),
        ("scripts", "classic/scripts.json"),
    ])
}

pub(crate) fn build_documents(
    project: &ProvidenceProject,
    assets: &PackagedAssets,
    project_dir: &Path,
    remake_scripts: Value,
) -> Result<Vec<(&'static str, Value)>> {
    let semantic_schema = crate::semantic::build_canonical_project_semantic_schema(project);
    let runtime_reachability = crate::semantic::classify_project_runtime_reachability(project);
    let mut documents = vec![
        ("scenario.json", scenario_document(project)?),
        ("maps.json", maps_document(project, assets)?),
        ("scripts.json", scripts_document(project, &semantic_schema)?),
        (
            "encounters.json",
            encounters_document(project, &runtime_reachability)?,
        ),
        ("content.json", content_document(project)?),
        ("rules.json", rules_document(project, project_dir)?),
        ("assets.json", assets.document()),
        ("remake/scripts.json", remake_scripts),
        ("runtime.json", runtime_document(project)?),
    ];
    let mut runtime_evidence = RuntimeEvidence::default();
    for (name, document) in &mut documents {
        let runtime_path = if *name == "runtime.json" || name.starts_with("remake/") {
            (*name).to_string()
        } else {
            format!("classic/{name}")
        };
        runtime_evidence.separate_document(&runtime_path, document);
    }
    documents.insert(
        documents.len() - 1,
        (
            "evidence.json",
            evidence_document(
                project,
                &semantic_schema,
                &runtime_reachability,
                project_dir,
                runtime_evidence.into_sorted_records(),
            )?,
        ),
    );
    Ok(documents)
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

fn maps_document(project: &ProvidenceProject, assets: &PackagedAssets) -> Result<Value> {
    let mut maps = portable_value(&project.maps)?;
    if let Some(records) = maps.as_array_mut() {
        for record in records {
            let Some(tiles) = record.get_mut("tiles").and_then(Value::as_array_mut) else {
                continue;
            };
            for tile in tiles {
                let Some(value) = tile.as_i64().and_then(|value| i16::try_from(value).ok()) else {
                    continue;
                };
                let runtime_value = remake_land_tile_value(value);
                if runtime_value != value {
                    *tile = json!(runtime_value);
                }
            }
        }
    }
    let mut map_records = portable_value(&project.map_records)?;
    if let Some(records) = map_records.as_array_mut() {
        for (record, source) in records.iter_mut().zip(&project.map_records) {
            if source.show >= 0 {
                continue;
            }
            let Some(scrolling_text) = assets.scrolling_text(source.show) else {
                continue;
            };
            record
                .as_object_mut()
                .expect("map records are objects")
                .insert("scrollingText".to_string(), scrolling_text.clone());
        }
    }
    Ok(json!({
        "schemaVersion": REMAKE_DOCUMENT_SCHEMA_VERSION,
        "maps": maps,
        "landLayout": portable_value(&project.land_layout)?,
        "mapRecords": map_records,
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
            macro_id: (trigger.source == "Data ED3").then_some(trigger.record_index),
        })
        .collect();
    let mut portable_triggers = portable_value(&triggers)?;
    add_classic_instruction_kinds(&mut portable_triggers);
    apply_semantic_actions(
        &mut portable_triggers,
        "trigger",
        &project.remake_runtime.semantic_actions,
    );
    apply_script_attachments(
        &mut portable_triggers,
        "trigger",
        &project.remake_runtime.script_attachments,
    );
    let dispatcher_noops = semantic_schema
        .decoding
        .dispatcher_noops
        .iter()
        .filter_map(|row| {
            let record_id = match row.source.as_str() {
                "Data ED" if project
                    .simple_encounters
                    .iter()
                    .any(|encounter| encounter.id == row.record_index) =>
                {
                    Some(format!("encounter:simple:{}", row.record_index))
                }
                "Data ED2" if project
                    .complex_encounters
                    .iter()
                    .any(|encounter| encounter.id == row.record_index) =>
                {
                    Some(format!("encounter:complex:{}", row.record_index))
                }
                _ => project
                    .triggers
                    .iter()
                    .find(|trigger| {
                        trigger.source == row.source
                            && trigger.record_index == row.record_index
                    })
                    .map(|trigger| trigger.id.clone()),
            };
            record_id.map(|trigger_id| {
                json!({
                    "triggerId": trigger_id,
                    "slot": row.slot,
                    "rawCode": row.raw_code,
                })
            })
        })
        .collect::<Vec<_>>();
    Ok(json!({
        "schemaVersion": REMAKE_DOCUMENT_SCHEMA_VERSION,
        "triggers": portable_triggers,
        "randomLevels": portable_value(&project.random_levels)?,
        "extraCodes": portable_value(&project.extracodes)?,
        "messages": portable_value(&project.messages)?,
        "optionLabels": portable_value(&project.option_labels)?,
        "dispatcherNoops": dispatcher_noops,
    }))
}

fn encounters_document(
    project: &ProvidenceProject,
    runtime_reachability: &RuntimeReachability,
) -> Result<Value> {
    let battles = project
        .battles
        .iter()
        .map(|battle| ExportBattle {
            battle,
            callable: runtime_reachability.battles.contains(&battle.id),
        })
        .collect::<Vec<_>>();
    let simple_encounters = project
        .simple_encounters
        .iter()
        .map(|encounter| ExportSimpleEncounter {
            encounter,
            callable: runtime_reachability
                .simple_encounters
                .contains(&encounter.id),
        })
        .collect::<Vec<_>>();
    let complex_encounters = project
        .complex_encounters
        .iter()
        .map(|encounter| ExportComplexEncounter {
            encounter,
            callable: runtime_reachability
                .complex_encounters
                .contains(&encounter.id),
        })
        .collect::<Vec<_>>();
    let mut simple_encounters = portable_value(&simple_encounters)?;
    let mut complex_encounters = portable_value(&complex_encounters)?;
    add_classic_instruction_kinds(&mut simple_encounters);
    add_classic_instruction_kinds(&mut complex_encounters);
    apply_semantic_actions(
        &mut simple_encounters,
        "simpleEncounter",
        &project.remake_runtime.semantic_actions,
    );
    apply_script_attachments(
        &mut simple_encounters,
        "simpleEncounter",
        &project.remake_runtime.script_attachments,
    );
    apply_semantic_actions(
        &mut complex_encounters,
        "complexEncounter",
        &project.remake_runtime.semantic_actions,
    );
    apply_script_attachments(
        &mut complex_encounters,
        "complexEncounter",
        &project.remake_runtime.script_attachments,
    );
    Ok(json!({
        "schemaVersion": REMAKE_DOCUMENT_SCHEMA_VERSION,
        "battles": portable_value(&battles)?,
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

fn rules_document(project: &ProvidenceProject, project_dir: &Path) -> Result<Value> {
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
        "tableSelection": rule_table_selection(project, project_dir)?,
    }))
}

fn evidence_document(
    project: &ProvidenceProject,
    semantic_schema: &SemanticSchema,
    runtime_reachability: &RuntimeReachability,
    project_dir: &Path,
    record_evidence: Vec<Value>,
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
            let source = diagnostic.source.as_deref();
            json!({
                "severity": diagnostic.severity,
                "code": &diagnostic.code,
                "message": portable_project_diagnostic_message(
                    &diagnostic.message,
                    source,
                    project_dir,
                ),
                "source": source.map(portable_source_label),
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
            "records": record_evidence,
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
            "runtimeReachability": {
                "battles": runtime_reachability.battles,
                "simpleEncounters": runtime_reachability.simple_encounters,
                "complexEncounters": runtime_reachability.complex_encounters,
                "macros": runtime_reachability.macros,
                "monsters": runtime_reachability.monsters,
                "evidence": runtime_reachability.evidence(),
            },
        },
    }))
}

fn runtime_document(project: &ProvidenceProject) -> Result<Value> {
    let remake_only_reasons = project.remake_runtime.remake_only_reasons();
    let script_tiers = project
        .remake_runtime
        .scripts
        .iter()
        .map(|script| script.tier)
        .collect::<std::collections::BTreeSet<_>>();
    Ok(json!({
        "schemaVersion": REMAKE_DOCUMENT_SCHEMA_VERSION,
        "authoringTarget": project.authoring_target,
        "recommendedGameplayProfile": &project.remake_runtime.recommended_gameplay_profile,
        "requiredExtensions": portable_value(&project.remake_runtime.required_extensions)?,
        "bindings": portable_value(&project.remake_runtime.bindings)?,
        "scriptExecution": {
            "apiVersion": super::scripting::SCRIPT_API_VERSION,
            "scriptCount": project.remake_runtime.scripts.len(),
            "tiers": script_tiers,
            "requiresApproval": script_tiers.contains(&crate::project::RemakeScriptTier::Trusted),
            "requiresSandbox": script_tiers.contains(&crate::project::RemakeScriptTier::Sandboxed),
        },
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

fn apply_script_attachments(
    records: &mut Value,
    target_kind: &str,
    attachments: &[crate::project::RemakeScriptAttachment],
) {
    let Some(records) = records.as_array_mut() else {
        return;
    };
    for attachment in attachments
        .iter()
        .filter(|attachment| attachment.target_kind == target_kind)
    {
        let Some(slot) = attachment.slot else {
            continue;
        };
        let Some(record) = records.iter_mut().find(|record| {
            let identity = record.get("id");
            identity.and_then(Value::as_str) == Some(attachment.record_id.as_str())
                || identity
                    .and_then(Value::as_i64)
                    .is_some_and(|id| id.to_string() == attachment.record_id)
        }) else {
            continue;
        };
        let Some(actions) = record.get_mut("actions").and_then(Value::as_array_mut) else {
            continue;
        };
        actions.retain(|action| action.get("slot").and_then(Value::as_u64) != Some(slot as u64));
        actions.push(json!({
            "kind": "semantic",
            "slot": slot,
            "operation": "core.script.call",
            "parameters": {
                "scriptId": attachment.script_id,
            },
        }));
        actions.sort_by_key(|action| {
            action
                .get("slot")
                .and_then(Value::as_u64)
                .unwrap_or(u64::MAX)
        });
    }
}

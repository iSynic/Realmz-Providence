use super::assets::PackagedAssets;
use super::{portable_campaign_id, REMAKE_CLASSIC_FORMAT_VERSION};
use crate::error::Result;
use crate::project::ProvidenceProject;
use crate::remake_exporter::portable::{portable_source_label, portable_value};
use serde_json::{json, Value};
use std::collections::BTreeMap;

pub(crate) fn contract_files() -> BTreeMap<&'static str, &'static str> {
    BTreeMap::from([
        ("assets", "classic/assets.json"),
        ("content", "classic/content.json"),
        ("encounters", "classic/encounters.json"),
        ("evidence", "classic/evidence.json"),
        ("maps", "classic/maps.json"),
        ("rules", "classic/rules.json"),
        ("scenario", "classic/scenario.json"),
        ("scripts", "classic/scripts.json"),
    ])
}

pub(crate) fn build_documents(
    project: &ProvidenceProject,
    assets: &PackagedAssets,
) -> Result<Vec<(&'static str, Value)>> {
    Ok(vec![
        ("scenario.json", scenario_document(project)?),
        ("maps.json", maps_document(project)?),
        ("scripts.json", scripts_document(project)?),
        ("encounters.json", encounters_document(project)?),
        ("content.json", content_document(project)?),
        ("rules.json", rules_document(project)?),
        ("assets.json", assets.document()),
        ("evidence.json", evidence_document(project)?),
    ])
}

fn scenario_document(project: &ProvidenceProject) -> Result<Value> {
    Ok(json!({
        "schemaVersion": REMAKE_CLASSIC_FORMAT_VERSION,
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
        "schemaVersion": REMAKE_CLASSIC_FORMAT_VERSION,
        "maps": portable_value(&project.maps)?,
        "landLayout": portable_value(&project.land_layout)?,
        "mapRecords": portable_value(&project.map_records)?,
        "tileAttributes": portable_value(&project.tile_attributes)?,
        "customLandlooks": portable_value(&project.custom_landlooks)?,
    }))
}

fn scripts_document(project: &ProvidenceProject) -> Result<Value> {
    Ok(json!({
        "schemaVersion": REMAKE_CLASSIC_FORMAT_VERSION,
        "triggers": portable_value(&project.triggers)?,
        "randomLevels": portable_value(&project.random_levels)?,
        "extraCodes": portable_value(&project.extracodes)?,
        "messages": portable_value(&project.messages)?,
        "optionLabels": portable_value(&project.option_labels)?,
    }))
}

fn encounters_document(project: &ProvidenceProject) -> Result<Value> {
    Ok(json!({
        "schemaVersion": REMAKE_CLASSIC_FORMAT_VERSION,
        "battles": portable_value(&project.battles)?,
        "treasures": portable_value(&project.treasures)?,
        "shops": portable_value(&project.shops)?,
        "simpleEncounters": portable_value(&project.simple_encounters)?,
        "complexEncounters": portable_value(&project.complex_encounters)?,
        "thiefEncounters": portable_value(&project.thief_encounters)?,
        "timedEncounters": portable_value(&project.timed_encounters)?,
    }))
}

fn content_document(project: &ProvidenceProject) -> Result<Value> {
    Ok(json!({
        "schemaVersion": REMAKE_CLASSIC_FORMAT_VERSION,
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
        "schemaVersion": REMAKE_CLASSIC_FORMAT_VERSION,
        "spellOverrides": portable_value(&project.spell_overrides)?,
        "raceOverrides": portable_value(&project.race_overrides)?,
        "casteOverrides": portable_value(&project.caste_overrides)?,
        "ruleNames": rule_names,
    }))
}

fn evidence_document(project: &ProvidenceProject) -> Result<Value> {
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
        "schemaVersion": REMAKE_CLASSIC_FORMAT_VERSION,
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
            "dispatcherNoops": portable_value(&project.semantic_schema.decoding.dispatcher_noops)?,
        },
    }))
}

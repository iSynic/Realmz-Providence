//! Native project requests; decoding and bounded projections stay with this feature.

use crate::classic_publication::write_classic_slice;
use crate::reachability_problems::reachability_problem_projection;
use crate::rebuilt_packages::inspect_rebuilt_world_projection;
use crate::request_params::required_string;
use providence_core::codecs::encode_messages;
use providence_core::compiler::ClassicCompatibilitySources;
use providence_core::rebuilt::compile_rebuilt_v3_content;
use providence_core::rebuilt::derive_rebuilt_v3_reachability;
use providence_core::rebuilt::project_rebuilt_v3_asset_index;
use providence_core::rebuilt::project_rebuilt_v3_battles;
use providence_core::rebuilt::project_rebuilt_v3_bootstrap;
use providence_core::rebuilt::project_rebuilt_v3_combined_item_catalog;
use providence_core::rebuilt::project_rebuilt_v3_combined_spell_catalog;
use providence_core::rebuilt::project_rebuilt_v3_complex_encounters;
use providence_core::rebuilt::project_rebuilt_v3_item_catalog;
use providence_core::rebuilt::project_rebuilt_v3_map_inputs;
use providence_core::rebuilt::project_rebuilt_v3_monster_catalog;
use providence_core::rebuilt::project_rebuilt_v3_option_labels;
use providence_core::rebuilt::project_rebuilt_v3_rogue_encounters;
use providence_core::rebuilt::project_rebuilt_v3_rule_catalog;
use providence_core::rebuilt::project_rebuilt_v3_scenario;
use providence_core::rebuilt::project_rebuilt_v3_scenario_item_catalog;
use providence_core::rebuilt::project_rebuilt_v3_shops;
use providence_core::rebuilt::project_rebuilt_v3_simple_encounters;
use providence_core::rebuilt::project_rebuilt_v3_spell_catalog;
use providence_core::rebuilt::project_rebuilt_v3_standard_spell_catalog;
use providence_core::rebuilt::project_rebuilt_v3_timed_encounters;
use providence_core::rebuilt::project_rebuilt_v3_treasures;
use providence_core::rebuilt::project_rebuilt_v3_trigger_programs;
use providence_core::session::EditorSession;
use providence_core::snapshot::to_deterministic_json;
use serde_json::Value;
use serde_json::json;
use std::collections::BTreeMap;
use std::fs;

pub(super) fn dispatch(
    session: &mut EditorSession,
    method: &str,
    params: Value,
) -> Result<Value, String> {
    match method {
        "project.inspect-rebuilt-bootstrap" => project_inspect_rebuilt_bootstrap(session, params),
        "project.inspect-rebuilt-map-inputs" => project_inspect_rebuilt_map_inputs(session, params),
        "project.inspect-rebuilt-assets" => project_inspect_rebuilt_assets(session, params),
        "project.inspect-rebuilt-battles" => project_inspect_rebuilt_battles(session, params),
        "project.inspect-rebuilt-treasures" => project_inspect_rebuilt_treasures(session, params),
        "project.inspect-rebuilt-shops" => project_inspect_rebuilt_shops(session, params),
        "project.inspect-rebuilt-option-labels" => {
            project_inspect_rebuilt_option_labels(session, params)
        }
        "project.inspect-rebuilt-monsters" => project_inspect_rebuilt_monsters(session, params),
        "project.inspect-rebuilt-spells" => project_inspect_rebuilt_spells(session, params),
        "project.inspect-rebuilt-content" => project_inspect_rebuilt_content(session, params),
        "project.inspect-rebuilt-world" => {
            inspect_rebuilt_world_projection(session.snapshot(), None)
        }
        "project.inspect-rebuilt-standard-spells" => {
            project_inspect_rebuilt_standard_spells(session, params)
        }
        "project.inspect-rebuilt-custom-spells" => {
            project_inspect_rebuilt_custom_spells(session, params)
        }
        "project.inspect-rebuilt-complex-encounters" => {
            project_inspect_rebuilt_complex_encounters(session, params)
        }
        "project.inspect-rebuilt-rogue-encounters" => {
            project_inspect_rebuilt_rogue_encounters(session, params)
        }
        "project.inspect-rebuilt-timed-encounters" => {
            project_inspect_rebuilt_timed_encounters(session, params)
        }
        "project.inspect-rebuilt-simple-encounters" => {
            project_inspect_rebuilt_simple_encounters(session, params)
        }
        "project.inspect-rebuilt-trigger-programs" => {
            project_inspect_rebuilt_trigger_programs(session, params)
        }
        "project.inspect-rebuilt-reachability" => {
            project_inspect_rebuilt_reachability(session, params)
        }
        "project.inspect-rebuilt-rules" => project_inspect_rebuilt_rules(session, params),
        "project.inspect-rebuilt-items" => project_inspect_rebuilt_items(session, params),
        "project.inspect-rebuilt-scenario-items" => {
            project_inspect_rebuilt_scenario_items(session, params)
        }
        "project.inspect-rebuilt-all-items" => project_inspect_rebuilt_all_items(session, params),
        "project.inspect-rebuilt-scenario" => project_inspect_rebuilt_scenario(session, params),
        "project.export-snapshot" => project_export_snapshot(session, params),
        "project.compile-messages" => project_compile_messages(session, params),
        "project.compile-classic-slice" => project_compile_classic_slice(session, params),
        _ => Err(format!("unknown method {method}")),
    }
}

fn project_inspect_rebuilt_bootstrap(
    session: &mut EditorSession,
    _params: Value,
) -> Result<Value, String> {
    project_rebuilt_v3_bootstrap(session.snapshot())
        .map(|projection| serde_json::to_value(projection).expect("bootstrap serializes"))
        .ok_or_else(|| {
            "Rebuilt bootstrap requires canonical campaign metadata and a start location"
                .to_string()
        })
}

fn project_inspect_rebuilt_map_inputs(
    session: &mut EditorSession,
    _params: Value,
) -> Result<Value, String> {
    project_rebuilt_v3_map_inputs(session.snapshot())
        .map(|projection| serde_json::to_value(projection).expect("map inputs serialize"))
        .ok_or_else(|| {
            "Rebuilt map inputs require runtime metadata for every map and a terrain catalog"
                .to_string()
        })
}

fn project_inspect_rebuilt_assets(
    session: &mut EditorSession,
    _params: Value,
) -> Result<Value, String> {
    let projection =
        project_rebuilt_v3_asset_index(session.snapshot()).map_err(|error| error.to_string())?;
    serde_json::to_value(projection).map_err(|error| error.to_string())
}

fn project_inspect_rebuilt_battles(
    session: &mut EditorSession,
    _params: Value,
) -> Result<Value, String> {
    let projection =
        project_rebuilt_v3_battles(session.snapshot()).map_err(|error| error.to_string())?;
    serde_json::to_value(projection).map_err(|error| error.to_string())
}

fn project_inspect_rebuilt_treasures(
    session: &mut EditorSession,
    _params: Value,
) -> Result<Value, String> {
    let items = project_rebuilt_v3_combined_item_catalog(session.snapshot())
        .map_err(|error| error.to_string())?;
    let item_ids = items.into_iter().map(|item| item.id).collect();
    let projection = project_rebuilt_v3_treasures(session.snapshot(), &item_ids)
        .map_err(|error| error.to_string())?;
    serde_json::to_value(projection).map_err(|error| error.to_string())
}

fn project_inspect_rebuilt_shops(
    session: &mut EditorSession,
    _params: Value,
) -> Result<Value, String> {
    let items = project_rebuilt_v3_combined_item_catalog(session.snapshot())
        .map_err(|error| error.to_string())?;
    let item_ids = items.into_iter().map(|item| item.id).collect();
    let projection = project_rebuilt_v3_shops(session.snapshot(), &item_ids)
        .map_err(|error| error.to_string())?;
    serde_json::to_value(projection).map_err(|error| error.to_string())
}

fn project_inspect_rebuilt_option_labels(
    session: &mut EditorSession,
    _params: Value,
) -> Result<Value, String> {
    let projection =
        project_rebuilt_v3_option_labels(session.snapshot()).map_err(|error| error.to_string())?;
    serde_json::to_value(projection).map_err(|error| error.to_string())
}

fn project_inspect_rebuilt_monsters(
    session: &mut EditorSession,
    _params: Value,
) -> Result<Value, String> {
    let projection = project_rebuilt_v3_monster_catalog(session.snapshot())
        .map_err(|error| error.to_string())?;
    serde_json::to_value(projection).map_err(|error| error.to_string())
}

fn project_inspect_rebuilt_spells(
    session: &mut EditorSession,
    _params: Value,
) -> Result<Value, String> {
    let projection = project_rebuilt_v3_combined_spell_catalog(session.snapshot())
        .map_err(|error| error.to_string())?;
    serde_json::to_value(projection).map_err(|error| error.to_string())
}

fn project_inspect_rebuilt_content(
    session: &mut EditorSession,
    _params: Value,
) -> Result<Value, String> {
    let artifact =
        compile_rebuilt_v3_content(session.snapshot()).map_err(|error| error.to_string())?;
    let document = &artifact.document;
    Ok(json!({
        "kind": document.kind,
        "schemaVersion": document.schema_version,
        "canonicalBytes": artifact.canonical_json.len(),
        "sha256": artifact.sha256,
        "counts": {
            "messages": document.messages.len(),
            "optionLabels": document.option_labels.len(),
            "battles": document.battles.len(),
            "monsters": document.monsters.len(),
            "monsterSets": document.monster_sets.len(),
            "monsterDescriptions": document.monster_descriptions.len(),
            "items": document.items.len(),
            "itemTexts": document.item_texts.len(),
            "treasures": document.treasures.len(),
            "shops": document.shops.len(),
            "simpleEncounters": document.simple_encounters.len(),
            "complexEncounters": document.complex_encounters.len(),
            "thiefEncounters": document.thief_encounters.len(),
            "timedEncounters": document.timed_encounters.len(),
            "spells": document.spells.len(),
            "races": document.races.len(),
            "castes": document.castes.len(),
        },
        "intentionalEmptySections": ["itemTexts"],
    }))
}

fn project_inspect_rebuilt_standard_spells(
    session: &mut EditorSession,
    _params: Value,
) -> Result<Value, String> {
    let projection = project_rebuilt_v3_standard_spell_catalog(session.snapshot())
        .map_err(|error| error.to_string())?;
    serde_json::to_value(projection).map_err(|error| error.to_string())
}

fn project_inspect_rebuilt_custom_spells(
    session: &mut EditorSession,
    _params: Value,
) -> Result<Value, String> {
    let projection =
        project_rebuilt_v3_spell_catalog(session.snapshot()).map_err(|error| error.to_string())?;
    serde_json::to_value(projection).map_err(|error| error.to_string())
}

fn project_inspect_rebuilt_complex_encounters(
    session: &mut EditorSession,
    _params: Value,
) -> Result<Value, String> {
    let projection = project_rebuilt_v3_complex_encounters(session.snapshot())
        .map_err(|error| error.to_string())?;
    serde_json::to_value(projection).map_err(|error| error.to_string())
}

fn project_inspect_rebuilt_rogue_encounters(
    session: &mut EditorSession,
    _params: Value,
) -> Result<Value, String> {
    let projection = project_rebuilt_v3_rogue_encounters(session.snapshot())
        .map_err(|error| error.to_string())?;
    serde_json::to_value(projection).map_err(|error| error.to_string())
}

fn project_inspect_rebuilt_timed_encounters(
    session: &mut EditorSession,
    _params: Value,
) -> Result<Value, String> {
    let projection = project_rebuilt_v3_timed_encounters(session.snapshot())
        .map_err(|error| error.to_string())?;
    serde_json::to_value(projection).map_err(|error| error.to_string())
}

fn project_inspect_rebuilt_simple_encounters(
    session: &mut EditorSession,
    _params: Value,
) -> Result<Value, String> {
    let projection = project_rebuilt_v3_simple_encounters(session.snapshot())
        .map_err(|error| error.to_string())?;
    serde_json::to_value(projection).map_err(|error| error.to_string())
}

fn project_inspect_rebuilt_trigger_programs(
    session: &mut EditorSession,
    _params: Value,
) -> Result<Value, String> {
    let projection = project_rebuilt_v3_trigger_programs(session.snapshot())
        .map_err(|error| error.to_string())?;
    serde_json::to_value(projection).map_err(|error| error.to_string())
}

fn project_inspect_rebuilt_reachability(
    session: &mut EditorSession,
    params: Value,
) -> Result<Value, String> {
    let projection =
        derive_rebuilt_v3_reachability(session.snapshot()).map_err(|error| error.to_string())?;
    let references = session.references();
    let offset = params.get("offset").and_then(Value::as_u64).unwrap_or(0) as usize;
    let limit = params
        .get("limit")
        .and_then(Value::as_u64)
        .unwrap_or(100)
        .clamp(1, 200) as usize;
    let total = projection.unresolved_references.len();
    let problems = projection
        .unresolved_references
        .iter()
        .skip(offset)
        .take(limit)
        .map(|reference| {
            reachability_problem_projection(session.snapshot(), &references, reference)
        })
        .collect::<Vec<_>>();
    Ok(json!({
        "revision": session.revision(),
        "counts": {
            "programs": projection.reachable_program_ids.len(),
            "simpleEncounters": projection.reachable_simple_encounter_ids.len(),
            "complexEncounters": projection.reachable_complex_encounter_ids.len(),
            "battles": projection.reachable_battle_ids.len(),
            "monsters": projection.reachable_monster_ids.len(),
            "references": projection.references.len(),
            "unresolved": total,
        },
        "problems": problems,
        "offset": offset,
        "limit": limit,
        "total": total,
        "truncated": offset.saturating_add(limit) < total,
    }))
}

fn project_inspect_rebuilt_rules(
    session: &mut EditorSession,
    _params: Value,
) -> Result<Value, String> {
    let projection =
        project_rebuilt_v3_rule_catalog(session.snapshot()).map_err(|error| error.to_string())?;
    serde_json::to_value(projection).map_err(|error| error.to_string())
}

fn project_inspect_rebuilt_items(
    session: &mut EditorSession,
    _params: Value,
) -> Result<Value, String> {
    let projection =
        project_rebuilt_v3_item_catalog(session.snapshot()).map_err(|error| error.to_string())?;
    serde_json::to_value(projection).map_err(|error| error.to_string())
}

fn project_inspect_rebuilt_scenario_items(
    session: &mut EditorSession,
    _params: Value,
) -> Result<Value, String> {
    let projection = project_rebuilt_v3_scenario_item_catalog(session.snapshot())
        .map_err(|error| error.to_string())?;
    serde_json::to_value(projection).map_err(|error| error.to_string())
}

fn project_inspect_rebuilt_all_items(
    session: &mut EditorSession,
    _params: Value,
) -> Result<Value, String> {
    let projection = project_rebuilt_v3_combined_item_catalog(session.snapshot())
        .map_err(|error| error.to_string())?;
    serde_json::to_value(projection).map_err(|error| error.to_string())
}

fn project_inspect_rebuilt_scenario(
    session: &mut EditorSession,
    _params: Value,
) -> Result<Value, String> {
    let projection =
        project_rebuilt_v3_scenario(session.snapshot()).map_err(|error| error.to_string())?;
    serde_json::to_value(projection).map_err(|error| error.to_string())
}

fn project_export_snapshot(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    let path = required_string(&params, "path")?;
    let json = to_deterministic_json(session.snapshot()).map_err(|error| error.to_string())?;
    fs::write(&path, json).map_err(|error| format!("could not save {path}: {error}"))?;
    Ok(json!({ "revision": session.revision(), "path": path }))
}

fn project_compile_messages(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    let path = required_string(&params, "path")?;
    let source = params
        .get("compatibilitySourcePath")
        .and_then(Value::as_str)
        .map(fs::read)
        .transpose()
        .map_err(|error| format!("could not read compatibility source: {error}"))?;
    let bytes = encode_messages(&session.snapshot().messages, source.as_deref())
        .map_err(|error| error.to_string())?;
    fs::write(&path, &bytes).map_err(|error| format!("could not compile {path}: {error}"))?;
    Ok(json!({ "revision": session.revision(), "path": path, "bytes": bytes.len() }))
}

fn project_compile_classic_slice(
    session: &mut EditorSession,
    params: Value,
) -> Result<Value, String> {
    write_classic_slice(
        session,
        &params,
        ClassicCompatibilitySources::default(),
        &BTreeMap::new(),
    )
}

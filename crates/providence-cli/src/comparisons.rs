use crate::projects::read_project_snapshot;
use providence_core::model::ProjectOrigin;
use providence_core::model::ProjectSnapshot;
use providence_core::model::StableId;
use providence_core::snapshot::to_deterministic_json;
use serde_json::json;
use sha2::Digest;
use sha2::Sha256;
use std::collections::BTreeSet;
use std::process::ExitCode;

pub(crate) fn compare_project_snapshots(first_path: &str, second_path: &str) -> ExitCode {
    let result = read_project_snapshot(first_path).and_then(|first| {
        read_project_snapshot(second_path)
            .and_then(|second| normalized_project_comparison(first, second))
    });
    match result {
        Ok(report) => {
            let equivalent = report["equivalent"].as_bool().unwrap_or(false);
            println!(
                "{}",
                serde_json::to_string_pretty(&report)
                    .expect("project comparison report is serializable")
            );
            if equivalent {
                ExitCode::SUCCESS
            } else {
                ExitCode::FAILURE
            }
        }
        Err(error) => {
            eprintln!("could not compare project snapshots: {error}");
            ExitCode::FAILURE
        }
    }
}

pub(crate) fn compare_project_semantics(first_path: &str, second_path: &str) -> ExitCode {
    let result = read_project_snapshot(first_path).and_then(|first| {
        read_project_snapshot(second_path)
            .and_then(|second| normalized_project_semantic_comparison(first, second))
    });
    match result {
        Ok(report) => {
            let equivalent = report["equivalent"].as_bool().unwrap_or(false);
            println!(
                "{}",
                serde_json::to_string_pretty(&report)
                    .expect("project semantic comparison report is serializable")
            );
            if equivalent {
                ExitCode::SUCCESS
            } else {
                ExitCode::FAILURE
            }
        }
        Err(error) => {
            eprintln!("could not compare project semantics: {error}");
            ExitCode::FAILURE
        }
    }
}

pub(crate) fn normalized_project_comparison(
    first: ProjectSnapshot,
    second: ProjectSnapshot,
) -> Result<serde_json::Value, String> {
    normalized_project_comparison_with_policy(first, second, false)
}

pub(crate) fn normalized_project_semantic_comparison(
    first: ProjectSnapshot,
    second: ProjectSnapshot,
) -> Result<serde_json::Value, String> {
    normalized_project_comparison_with_policy(first, second, true)
}

pub(crate) fn normalized_project_comparison_with_policy(
    mut first: ProjectSnapshot,
    mut second: ProjectSnapshot,
    exclude_source_provenance: bool,
) -> Result<serde_json::Value, String> {
    let first_project_id = first.project_id.clone();
    let second_project_id = second.project_id.clone();
    let normalized_id = StableId("providence-project-equivalence".into());
    first.project_id = normalized_id.clone();
    second.project_id = normalized_id;
    if exclude_source_provenance {
        first.origin = ProjectOrigin::Authored;
        second.origin = ProjectOrigin::Authored;
        first.classic_sources.clear();
        second.classic_sources.clear();
        clear_codec_authoring_state(&mut first);
        clear_codec_authoring_state(&mut second);
        clear_derived_classic_state(&mut first);
        clear_derived_classic_state(&mut second);
    }
    first.normalize();
    second.normalize();

    let first_json = to_deterministic_json(&first).map_err(|error| error.to_string())?;
    let second_json = to_deterministic_json(&second).map_err(|error| error.to_string())?;
    let mismatched_top_level_fields = mismatched_fields(&first, &second)?;
    let equivalent = first == second;

    let mut report = json!({
        "equivalent": equivalent,
        "firstProjectId": first_project_id,
        "secondProjectId": second_project_id,
        "firstCanonicalBytes": first_json.len(),
        "secondCanonicalBytes": second_json.len(),
        "firstCanonicalSha256": format!("{:x}", Sha256::digest(first_json.as_bytes())),
        "secondCanonicalSha256": format!("{:x}", Sha256::digest(second_json.as_bytes())),
        "mismatchedTopLevelFields": mismatched_top_level_fields,
        "counts": comparison_counts(&first)
    });
    if exclude_source_provenance {
        report["comparison"] = json!("canonical-authored-semantics");
        report["excludedFields"] = json!([
            "projectId",
            "origin",
            "classicSources",
            "codecAuthoringFlags",
            "nestedSourceProvenance",
            "inactiveClassicRows"
        ]);
        report["sourceProvenanceRequiresSeparateByteVerification"] = json!(true);
    } else {
        report["ignoredField"] = json!("projectId");
    }
    Ok(report)
}

pub(crate) fn clear_codec_authoring_state(snapshot: &mut ProjectSnapshot) {
    for message in &mut snapshot.messages {
        message.authored = false;
    }
    for label in &mut snapshot.option_labels {
        label.authored = false;
    }
    for spell in snapshot
        .standard_spells
        .iter_mut()
        .chain(snapshot.scenario_spells.iter_mut())
    {
        spell.name_authored = false;
        spell.definition.authored = false;
    }
    for encounter in &mut snapshot.simple_encounters {
        encounter.authored = false;
    }
    for encounter in &mut snapshot.complex_encounters {
        encounter.authored = false;
    }
    for encounter in &mut snapshot.rogue_encounters {
        encounter.authored = false;
    }
    for encounter in &mut snapshot.timed_encounters {
        encounter.authored = false;
    }
    for monster in snapshot
        .monster_sets
        .iter_mut()
        .flat_map(|set| set.monsters.iter_mut())
    {
        monster.authored = false;
    }
    for description in &mut snapshot.monster_descriptions {
        description.authored = false;
    }
    for battle in &mut snapshot.battles {
        battle.authored = false;
    }
    for treasure in &mut snapshot.treasures {
        treasure.authored = false;
    }
    for shop in &mut snapshot.shops {
        shop.authored = false;
    }
    for player_map in &mut snapshot.world.player_maps {
        player_map.authored = false;
    }
}

pub(crate) fn clear_derived_classic_state(snapshot: &mut ProjectSnapshot) {
    for map in &mut snapshot.world.maps {
        if let Some(runtime) = &mut map.runtime {
            runtime.source_blob = None;
        }
    }
    snapshot.world.action_points.retain(|action_point| {
        action_point.classic_door_id != 0
            || action_point.post_action_level != 0
            || action_point.post_action_x != 0
            || action_point.post_action_y != 0
            || action_point.chance_percent != 0
            || !action_point.actions.is_empty()
    });
}

fn mismatched_fields(
    first: &ProjectSnapshot,
    second: &ProjectSnapshot,
) -> Result<Vec<String>, String> {
    let first_value = serde_json::to_value(first).map_err(|error| error.to_string())?;
    let second_value = serde_json::to_value(second).map_err(|error| error.to_string())?;
    let first_object = first_value
        .as_object()
        .ok_or_else(|| "first canonical snapshot is not an object".to_string())?;
    let second_object = second_value
        .as_object()
        .ok_or_else(|| "second canonical snapshot is not an object".to_string())?;
    let keys = first_object
        .keys()
        .chain(second_object.keys())
        .cloned()
        .collect::<BTreeSet<_>>();
    Ok(keys
        .into_iter()
        .filter(|key| first_object.get(key) != second_object.get(key))
        .collect::<Vec<_>>())
}

fn comparison_counts(snapshot: &ProjectSnapshot) -> serde_json::Value {
    json!({
        "classicSources": snapshot.classic_sources.len(),
        "maps": snapshot.world.maps.len(),
        "actionPoints": snapshot.world.action_points.len(),
        "messages": snapshot.messages.len(),
        "terrainProfiles": snapshot.terrain_catalog.len(),
        "landlookCatalogs": snapshot.landlook_catalogs.len(),
        "assets": snapshot.assets.len(),
        "scenarioItems": snapshot.scenario_item_rules.len(),
        "scenarioSpells": snapshot.scenario_spells.len(),
        "monsters": snapshot.monster_sets.iter().map(|set| set.monsters.len()).sum::<usize>(),
        "battles": snapshot.battles.len(),
    })
}

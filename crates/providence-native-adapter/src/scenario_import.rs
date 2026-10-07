mod bootstrap;
mod inputs;
mod timing;
use inputs::ScenarioSources;

use crate::classic_dungeon_import::import_classic_dungeon_slice;
use crate::classic_import_files::CAPTURED_SCENARIO_SOURCE_FILES;
use crate::classic_land_import::import_classic_land_slice;
use crate::classic_media_import::import_classic_media;
use crate::combat_import::import_classic_battles;
use crate::combat_import::import_classic_monsters;
use crate::economy_import::import_classic_option_labels;
use crate::economy_import::import_classic_shops;
use crate::economy_import::import_classic_treasures;
use crate::encounter_import::import_classic_complex_encounters;
use crate::encounter_import::import_classic_rogue_encounters;
use crate::encounter_import::import_classic_timed_encounters;
use crate::mapstats_import::import_mapstats_catalog_into_session;
use crate::player_map_import::import_classic_player_map_names;
use crate::player_map_import::import_classic_player_maps;
use crate::request_params::required_u64;
use crate::rule_import::import_caste_rules;
use crate::rule_import::import_race_rules;
use crate::rule_import::import_rule_names;
use crate::rule_import::import_scenario_items;
use crate::rule_import::import_standard_items;
use crate::scenario_music;
use crate::scenario_preflight::resolve_classic_native_file;
use crate::spell_import::import_classic_spells;
use crate::spell_import::import_standard_spells;
use providence_core::codecs::{
    decode_special_land_solidity, parse_resource_entries_preserving_duplicates,
};
use providence_core::model::ClassicSourceBlob;
use providence_core::model::ProjectSnapshot;
use providence_core::model::SpecialLandSolidityCatalog;
use providence_core::session::EditorCommand;
use providence_core::session::EditorSession;
use providence_core::session::ExpectedRevisionCommand;
use providence_core::session::Revision;
use providence_storage::ProjectStore;
use serde_json::Value;
use serde_json::json;
use std::collections::BTreeSet;
use std::fs;
use std::path::Path;

pub(crate) fn import_classic_scenario(
    session: &mut EditorSession,
    store: Option<&ProjectStore>,
    params: Value,
) -> Result<Value, String> {
    let store = store.ok_or_else(|| {
        "project.import-classic-scenario requires serve-project so the complete source set is durable"
            .to_string()
    })?;
    let expected_revision = Revision(required_u64(&params, "expectedRevision")?);
    if expected_revision != session.revision() {
        return Err(format!(
            "revision conflict: expected {}, current revision is {}",
            expected_revision.0,
            session.revision().0
        ));
    }
    let mut timing = timing::ImportTiming::new(&params);
    let sources = timing.run("source-preflight", || ScenarioSources::read(&params))?;
    let (imported, (steps, source_report, music_omissions)) =
        EditorSession::stage_classic_import(session.snapshot().project_id.clone(), |scratch| {
            stage_import(scratch, store, &sources, &mut timing)
        })?;
    let mut result = timing.run("commit", || {
        finish_import(
            session,
            imported,
            expected_revision,
            &sources,
            steps,
            source_report,
            music_omissions,
        )
    })?;
    timing.attach(&mut result);
    Ok(result)
}

type StagedImportReport = (
    Vec<String>,
    (u64, Vec<String>),
    Vec<scenario_music::ScenarioMusicOmission>,
);

fn stage_import(
    scratch: &mut EditorSession,
    store: &ProjectStore,
    sources: &ScenarioSources,
    timing: &mut timing::ImportTiming,
) -> Result<StagedImportReport, String> {
    let mut steps = Vec::new();
    timing.run("rules", || {
        import_rules(scratch, store, sources, &mut steps)
    })?;
    timing.run("terrain", || {
        import_terrain(scratch, store, sources, &mut steps)
    })?;
    timing.run("maps-and-combat", || {
        import_map_and_combat(scratch, store, sources, &mut steps)
    })?;
    timing.run("encounters-and-economy", || {
        import_encounters_and_economy(scratch, store, sources, &mut steps)
    })?;
    timing.run("optional-world", || {
        import_optional_world(scratch, store, sources, &mut steps)
    })?;
    timing.run("items-and-spells", || {
        import_items_and_spells(scratch, store, sources, &mut steps)
    })?;
    let music_omissions = timing.run("media-and-solidity", || {
        import_media_and_solidity(scratch, store, sources, &mut steps)
    })?;
    let source_report = timing.run("source-capture-and-bootstrap", || {
        bootstrap::import(scratch, store, sources, &mut steps)
    })?;
    Ok((steps, source_report, music_omissions))
}

fn import_rules(
    scratch: &mut EditorSession,
    store: &ProjectStore,
    sources: &ScenarioSources,
    steps: &mut Vec<String>,
) -> Result<(), String> {
    run_import(
        scratch,
        store,
        import_race_rules,
        json!({"path": race_import_path(sources)?}),
    )?;
    steps.push("race-rules".into());

    run_import(
        scratch,
        store,
        import_caste_rules,
        json!({"path": rule_path(sources, "Data Caste")}),
    )?;
    steps.push("caste-rules".into());
    run_import(
        scratch,
        store,
        import_rule_names,
        json!({
            "path": sources.application_data_directory.join("Custom Names.rsrc"),
            "source": "Data Files/Custom Names.rsrc",
        }),
    )?;
    steps.push("rule-names".into());
    run_import(
        scratch,
        store,
        import_standard_items,
        json!({
            "path": sources.application_data_directory.join("Data ID"),
            "textPath": sources.application_data_directory.join("Data ID.rsrc"),
        }),
    )?;
    steps.push("standard-items".into());
    run_import(
        scratch,
        store,
        import_standard_spells,
        json!({
            "path": sources.application_data_directory.join("Data S"),
            "textPath": sources.application_data_directory.join("Custom Names.rsrc"),
        }),
    )?;
    steps.push("standard-spells".into());
    Ok(())
}

fn rule_path(sources: &ScenarioSources, family: &str) -> std::path::PathBuf {
    let scenario = sources.scenario_directory.join(family);
    if scenario.is_file() {
        scenario
    } else {
        sources.application_data_directory.join(family)
    }
}

fn race_import_path(sources: &ScenarioSources) -> Result<std::path::PathBuf, String> {
    let path = rule_path(sources, "Data Race");
    let bytes = fs::read(&path).map_err(|error| format!("could not read Data Race: {error}"))?;
    if path.starts_with(&sources.scenario_directory)
        && bytes.len() < 30 * providence_core::codecs::RACE_RECORD_BYTES
    {
        // Bootstrap retains the malformed optional table. Application rules
        // remain a separate selectable source, never recovered scenario data.
        return Ok(sources.application_data_directory.join("Data Race"));
    }
    Ok(path)
}

fn import_terrain(
    scratch: &mut EditorSession,
    store: &ProjectStore,
    sources: &ScenarioSources,
    steps: &mut Vec<String>,
) -> Result<(), String> {
    for (landlook, native_name) in [
        (-1_i8, "Combat Data BD"),
        (0_i8, "Data P BD"),
        (3, "Data SUB BD"),
        (4, "Data Castle BD"),
        (5, "Data Desert BD"),
        (9, "Data Swamp BD"),
        (10, "Data Snow BD"),
    ] {
        import_mapstats_catalog_into_session(
            scratch,
            store,
            landlook,
            sources.application_data_directory.join(native_name),
            format!("Data Files/{native_name}"),
        )?;
    }
    for (landlook, native_name) in [
        (6_i8, "Data Custom 1 BD"),
        (7, "Data Custom 2 BD"),
        (8, "Data Custom 3 BD"),
    ] {
        let path = sources.scenario_directory.join(native_name);
        if path.is_file() {
            import_mapstats_catalog_into_session(
                scratch,
                store,
                landlook,
                path,
                native_name.to_string(),
            )?;
        }
    }
    steps.push("terrain-catalogs".into());
    Ok(())
}

fn import_map_and_combat(
    scratch: &mut EditorSession,
    store: &ProjectStore,
    sources: &ScenarioSources,
    steps: &mut Vec<String>,
) -> Result<(), String> {
    run_import(
        scratch,
        store,
        import_classic_land_slice,
        json!({"directory": sources.scenario_directory}),
    )?;
    steps.push("land".into());
    run_import(
        scratch,
        store,
        import_classic_dungeon_slice,
        json!({"directory": sources.scenario_directory}),
    )?;
    steps.push("dungeon".into());
    run_import(
        scratch,
        store,
        import_classic_monsters,
        json!({"directory": sources.scenario_directory}),
    )?;
    steps.push("monsters".into());
    run_import(
        scratch,
        store,
        import_classic_battles,
        json!({"directory": sources.scenario_directory}),
    )?;
    steps.push("battles".into());
    Ok(())
}

fn import_encounters_and_economy(
    scratch: &mut EditorSession,
    store: &ProjectStore,
    sources: &ScenarioSources,
    steps: &mut Vec<String>,
) -> Result<(), String> {
    run_import(
        scratch,
        store,
        import_classic_complex_encounters,
        json!({"directory": sources.scenario_directory}),
    )?;
    steps.push("complex-encounters".into());
    run_import(
        scratch,
        store,
        import_classic_rogue_encounters,
        json!({"directory": sources.scenario_directory}),
    )?;
    steps.push("rogue-encounters".into());
    run_import(
        scratch,
        store,
        import_classic_timed_encounters,
        json!({"directory": sources.scenario_directory}),
    )?;
    steps.push("timed-encounters".into());
    run_import(
        scratch,
        store,
        import_classic_treasures,
        json!({"directory": sources.scenario_directory}),
    )?;
    steps.push("treasures".into());
    run_import(
        scratch,
        store,
        import_classic_shops,
        json!({"directory": sources.scenario_directory}),
    )?;
    steps.push("shops".into());
    Ok(())
}

fn import_optional_world(
    scratch: &mut EditorSession,
    store: &ProjectStore,
    sources: &ScenarioSources,
    steps: &mut Vec<String>,
) -> Result<(), String> {
    let data_od = sources.scenario_directory.join("Data OD");
    if data_od.is_file() {
        run_import(
            scratch,
            store,
            import_classic_option_labels,
            json!({"directory": sources.scenario_directory}),
        )?;
        steps.push("option-labels".into());
    }
    let data_md2 = sources.scenario_directory.join("Data MD2");
    if data_md2.is_file() {
        run_import(
            scratch,
            store,
            import_classic_player_maps,
            json!({"directory": sources.scenario_directory}),
        )?;
        run_import(
            scratch,
            store,
            import_classic_player_map_names,
            json!({"directory": sources.scenario_directory}),
        )?;
        steps.push("player-maps".into());
    }
    Ok(())
}

fn import_items_and_spells(
    scratch: &mut EditorSession,
    store: &ProjectStore,
    sources: &ScenarioSources,
    steps: &mut Vec<String>,
) -> Result<(), String> {
    let item_text_path = scenario_item_text_path(&sources.scenario_directory)?;
    let mut item_params = json!({
        "path": sources.scenario_directory.join("Data NI"),
    });
    if let Some(item_text_path) = item_text_path {
        item_params["textPath"] = json!(item_text_path);
    }
    run_import(scratch, store, import_scenario_items, item_params)?;
    steps.push("scenario-items".into());
    if let Some((spell_path, spell_names_path)) = &sources.spells {
        let mut params = json!({"path": spell_path});
        if let Some(names) = spell_names_path {
            params["textPath"] = json!(names);
            params["textNativePath"] = json!("Data Spell.rsrc");
        }
        run_import(scratch, store, import_classic_spells, params)?;
        steps.push("scenario-spells".into());
    }
    Ok(())
}

pub(crate) fn scenario_item_text_path(
    directory: &Path,
) -> Result<Option<std::path::PathBuf>, String> {
    for native_path in ["Scenario.rsrc"] {
        let Some(path) = resolve_classic_native_file(directory, native_path) else {
            continue;
        };
        let bytes =
            fs::read(&path).map_err(|error| format!("could not read {native_path}: {error}"))?;
        let entries = parse_resource_entries_preserving_duplicates(&bytes)
            .map_err(|error| format!("could not inspect {native_path} item text: {error}"))?;
        if entries
            .iter()
            .any(|entry| entry.resource_type == *b"STR#" && (800..=802).contains(&entry.id))
        {
            return Ok(Some(path));
        }
    }
    Ok(None)
}

fn import_media_and_solidity(
    scratch: &mut EditorSession,
    store: &ProjectStore,
    sources: &ScenarioSources,
    steps: &mut Vec<String>,
) -> Result<Vec<scenario_music::ScenarioMusicOmission>, String> {
    run_import(
        scratch,
        store,
        import_classic_media,
        json!({"directory": sources.scenario_directory}),
    )?;
    steps.push("scenario-media".into());
    let music_omissions = scenario_music::import_into(scratch, store, &sources.scenario_directory)?;
    steps.push("scenario-music".into());

    let solidity_path = sources.scenario_directory.join("Data Solids");
    let solidity_bytes = fs::read(&solidity_path)
        .map_err(|error| format!("could not read {}: {error}", solidity_path.display()))?;
    let solidity_blob = store
        .put_blob(&solidity_bytes)
        .map_err(|error| error.to_string())?;
    let solid = decode_special_land_solidity(&solidity_bytes)
        .map_err(|error| format!("Data Solids failed native validation: {error}"))?;
    scratch
        .execute(ExpectedRevisionCommand {
            expected_revision: scratch.revision(),
            command: EditorCommand::SetSpecialLandSolidityCatalog {
                catalog: Box::new(SpecialLandSolidityCatalog {
                    source: "Data Solids".into(),
                    source_blob: solidity_blob,
                    solid,
                }),
            },
        })
        .map_err(|error| error.to_string())?;
    steps.push("special-land-solidity".into());
    Ok(music_omissions)
}

fn finish_import(
    session: &mut EditorSession,
    mut imported: ProjectSnapshot,
    expected_revision: Revision,
    sources: &ScenarioSources,
    steps: Vec<String>,
    (source_bytes, unowned_files): (u64, Vec<String>),
    music_omissions: Vec<scenario_music::ScenarioMusicOmission>,
) -> Result<Value, String> {
    imported.import_interpretation_version = providence_core::import_repair::INTERPRETATION_VERSION;
    let counts = json!({
        "maps": imported.world.maps.len(),
        "actionPoints": imported.world.action_points.len(),
        "messages": imported.messages.len(),
        "simpleEncounters": imported.simple_encounters.len(),
        "complexEncounters": imported.complex_encounters.len(),
        "rogueEncounters": imported.rogue_encounters.len(),
        "timedEncounters": imported.timed_encounters.len(),
        "battles": imported.battles.len(),
        "monsterSets": imported.monster_sets.len(),
        "monsters": imported.monster_sets.iter().map(|set| set.monsters.len()).sum::<usize>(),
        "treasures": imported.treasures.len(),
        "shops": imported.shops.len(),
        "scenarioItems": imported.scenario_item_rules.len(),
        "scenarioSpells": imported.scenario_spells.len(),
        "assets": imported.assets.len(),
        "terrainProfiles": imported.terrain_catalog.len(),
        "solidSpecialLandIds": imported.world.special_land_solidity.as_ref().map_or(0, |catalog| catalog.solid.iter().filter(|solid| **solid).count()),
    });
    let projection = session
        .commit_classic_scenario_import(expected_revision, imported)
        .map_err(|error| error.to_string())?;
    let mut result = serde_json::to_value(projection).map_err(|error| error.to_string())?;
    if let Some(object) = result.as_object_mut() {
        object.insert("refreshRequired".into(), json!(true));
        object.insert("scenarioName".into(), json!(sources.scenario_name));
        object.insert("steps".into(), json!(steps));
        object.insert("counts".into(), counts);
        object.insert(
            "sourceFiles".into(),
            json!(session.snapshot().classic_sources.len()),
        );
        object.insert("sourceBytes".into(), json!(source_bytes));
        object.insert("unownedFiles".into(), json!(unowned_files));
        object.insert("quarantinedMusic".into(), json!(music_omissions));
    }
    Ok(result)
}

type ImportSlice = fn(&mut EditorSession, Option<&ProjectStore>, Value) -> Result<Value, String>;

fn run_import(
    scratch: &mut EditorSession,
    store: &ProjectStore,
    import: ImportSlice,
    params: Value,
) -> Result<(), String> {
    let params = scratch_params(scratch, params);
    import(scratch, Some(store), params).map(|_| ())
}

pub(crate) fn scratch_params(session: &EditorSession, mut params: Value) -> Value {
    params["expectedRevision"] = json!(session.revision().0);
    params
}

pub(crate) fn capture_scenario_sources(
    store: &ProjectStore,
    directory: &Path,
    scenario_name: &str,
) -> Result<(Vec<ClassicSourceBlob>, u64, Vec<String>), String> {
    let mut captured_names = CAPTURED_SCENARIO_SOURCE_FILES
        .iter()
        .map(|name| name.to_string())
        .collect::<BTreeSet<_>>();
    captured_names.insert(scenario_name.to_string());
    let mut sources = Vec::new();
    let mut total_bytes = 0_u64;
    for native_path in &captured_names {
        let Some(path) = resolve_classic_native_file(directory, native_path) else {
            continue;
        };
        let bytes = fs::read(&path)
            .map_err(|error| format!("could not read source {}: {error}", path.display()))?;
        total_bytes = total_bytes.saturating_add(bytes.len() as u64);
        sources.push(ClassicSourceBlob {
            native_path: native_path.clone(),
            blob: store.put_blob(&bytes).map_err(|error| error.to_string())?,
            byte_length: bytes.len() as u64,
        });
    }
    sources.sort_by(|left, right| left.native_path.cmp(&right.native_path));
    let mut unowned_files = fs::read_dir(directory)
        .map_err(|error| format!("could not list {}: {error}", directory.display()))?
        .filter_map(Result::ok)
        .filter_map(|entry| {
            entry
                .file_type()
                .ok()
                .filter(|kind| kind.is_file())
                .and_then(|_| entry.file_name().to_str().map(str::to_owned))
        })
        .filter(|name| !captured_names.contains(name))
        .collect::<Vec<_>>();
    unowned_files.sort();
    Ok((sources, total_bytes, unowned_files))
}

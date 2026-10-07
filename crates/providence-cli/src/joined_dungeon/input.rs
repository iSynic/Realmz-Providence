use providence_core::codecs::decode_battles;
use providence_core::codecs::decode_complex_encounters;
use providence_core::codecs::decode_extra_action_points;
use providence_core::codecs::decode_extra_codes;
use providence_core::codecs::decode_global_macro_hooks;
use providence_core::codecs::decode_messages;
use providence_core::codecs::decode_monster_set;
use providence_core::codecs::decode_rogue_encounters;
use providence_core::codecs::decode_shops;
use providence_core::codecs::decode_simple_encounters;
use providence_core::codecs::decode_timed_encounters;
use providence_core::codecs::decode_treasures;
use providence_core::model::ProjectSnapshot;
use providence_core::model::StableId;
use serde_json::json;

use super::{resources, round_trip, rules, sources::JoinedSources, world};
use std::{collections::BTreeMap, path::Path};

pub(super) struct JoinedInput {
    pub(super) snapshot: ProjectSnapshot,
    pub(super) exact_sources: BTreeMap<&'static str, bool>,
    pub(super) spell_report: serde_json::Value,
    pub(super) resource_report: serde_json::Value,
}

pub(super) fn load(directory: &Path) -> Result<JoinedInput, String> {
    let sources = JoinedSources::load(directory)?;
    let dungeon = world::decode_dungeon(&sources.scenario)?;
    let land = world::decode_land(&sources.scenario)?;
    let mut snapshot = ProjectSnapshot::new_authored(StableId("joined-dungeon-probe".into()));
    populate_records(&mut snapshot, &sources);
    rules::populate_items(&mut snapshot, &sources)?;
    snapshot.standard_spells = rules::decode_standard_spells_with_names(&sources.shared)?;
    let (scenario_spells, warnings) = rules::decode_scenario_spells_with_names(&sources.scenario)?;
    snapshot.scenario_spells = scenario_spells;
    let mut resource_report = resources::populate_resources(&mut snapshot, &sources.scenario)?;
    let exact_sources = round_trip::exact_sources(&sources, &snapshot, &land, &dungeon);
    snapshot.world.maps = land.maps.into_iter().chain(dungeon.maps).collect();
    snapshot.world.action_points = land
        .action_points
        .into_iter()
        .chain(dungeon.action_points)
        .collect();
    let spell_report = spell_report(&snapshot, &sources, &exact_sources, warnings);
    resource_report["exactNoEdit"] =
        json!(exact_sources.get("Scenario.rsrc").copied().unwrap_or(false));
    Ok(JoinedInput {
        snapshot,
        exact_sources,
        spell_report,
        resource_report,
    })
}

fn populate_records(snapshot: &mut ProjectSnapshot, sources: &JoinedSources) {
    let files = &sources.scenario;
    snapshot.battles = decode_battles(&files.data_bd).records;
    snapshot
        .monster_sets
        .push(decode_monster_set(&files.data_md, "Data MD", 0));
    snapshot.messages = decode_messages(&files.data_sd2).messages;
    snapshot.extra_action_points = decode_extra_action_points(&files.data_ed3).records;
    snapshot.simple_encounters = decode_simple_encounters(&files.data_ed).records;
    snapshot.complex_encounters = decode_complex_encounters(&files.data_ed2).records;
    snapshot.extra_codes = decode_extra_codes(&files.data_edcd).rows;
    snapshot.timed_encounters = decode_timed_encounters(&files.data_td3).records;
    snapshot.rogue_encounters = decode_rogue_encounters(&files.data_td2).records;
    snapshot.treasures = decode_treasures(&files.data_td).records;
    snapshot.shops = decode_shops(&files.data_sd).records;
    snapshot.scenario_application = Some(decode_global_macro_hooks(&files.global).contract);
}

fn spell_report(
    snapshot: &ProjectSnapshot,
    sources: &JoinedSources,
    exact_sources: &BTreeMap<&str, bool>,
    warnings: Vec<String>,
) -> serde_json::Value {
    json!({
        "standardBytes": sources.shared.standard_spell_bytes.len(),
        "standardSpells": snapshot.standard_spells.len(),
        "customSourcePresent": sources.scenario.data_spell.is_some(),
        "customBytes": sources.scenario.data_spell.as_ref().map(Vec::len),
        "customSpells": snapshot.scenario_spells.len(),
        "customNameSourcePresent": sources.scenario.data_spell_resources.is_some(),
        "customNameWarnings": warnings,
        "standardExactNoEdit": exact_sources.get("Data S").copied().unwrap_or(false),
        "standardNamesExactNoEdit": exact_sources.get("Custom Names.rsrc").copied().unwrap_or(false),
        "customExactNoEdit": exact_sources.get("Data Spell").copied(),
        "customNamesExactNoEdit": exact_sources.get("Data Spell.rsrc").copied(),
    })
}

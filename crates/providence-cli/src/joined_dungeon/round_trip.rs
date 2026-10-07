use providence_core::codecs::ACTION_POINT_LEVEL_BYTES;
use providence_core::codecs::encode_battles;
use providence_core::codecs::encode_complex_encounters;
use providence_core::codecs::encode_dungeon_action_points;
use providence_core::codecs::encode_dungeon_maps;
use providence_core::codecs::encode_dungeon_random_levels;
use providence_core::codecs::encode_extra_action_points;
use providence_core::codecs::encode_extra_codes;
use providence_core::codecs::encode_global_macro_hooks;
use providence_core::codecs::encode_land_action_points;
use providence_core::codecs::encode_land_maps;
use providence_core::codecs::encode_land_random_levels;
use providence_core::codecs::encode_messages;
use providence_core::codecs::encode_monster_set;
use providence_core::codecs::encode_rogue_encounters;
use providence_core::codecs::encode_scenario_item_rules;
use providence_core::codecs::encode_scenario_spells;
use providence_core::codecs::encode_shops;
use providence_core::codecs::encode_simple_encounters;
use providence_core::codecs::encode_standard_item_rules;
use providence_core::codecs::encode_standard_spells;
use providence_core::codecs::encode_timed_encounters;
use providence_core::codecs::encode_treasures;
use providence_core::codecs::merge_resource_entries_preserving_unowned_duplicates;
use providence_core::model::ProjectSnapshot;
use std::collections::BTreeMap;

use super::{sources::JoinedSources, world::WorldRows};

pub(super) fn exact_sources(
    sources: &JoinedSources,
    snapshot: &ProjectSnapshot,
    land: &WorldRows,
    dungeon: &WorldRows,
) -> BTreeMap<&'static str, bool> {
    let mut checks = world_round_trips(sources, land, dungeon);
    checks.extend(encounter_round_trips(sources, snapshot));
    checks.extend(combat_round_trips(sources, snapshot));
    checks.extend(rule_round_trips(sources, snapshot));
    checks.extend(fork_round_trips(sources, snapshot));

    if let Some(bytes) = sources.scenario.data_spell.as_ref() {
        checks.insert(
            "Data Spell",
            encode_scenario_spells(&snapshot.scenario_spells, Some(bytes))
                .is_ok_and(|encoded| encoded == *bytes),
        );
    }
    if let Some(bytes) = sources.scenario.data_spell_resources.as_ref() {
        checks.insert(
            "Data Spell.rsrc",
            merge_resource_entries_preserving_unowned_duplicates(bytes, Vec::new())
                .is_ok_and(|encoded| encoded == *bytes),
        );
    }

    checks
}

fn world_round_trips(
    sources: &JoinedSources,
    land: &WorldRows,
    dungeon: &WorldRows,
) -> BTreeMap<&'static str, bool> {
    BTreeMap::from([
        (
            "Data DD",
            encode_land_action_points(
                &land.action_points,
                sources.scenario.data_dd.len() / ACTION_POINT_LEVEL_BYTES,
                Some(&sources.scenario.data_dd),
            )
            .is_ok_and(|encoded| encoded == sources.scenario.data_dd),
        ),
        (
            "Data DDD",
            encode_dungeon_action_points(
                &dungeon.action_points,
                dungeon.maps.len(),
                Some(&sources.scenario.data_ddd),
            )
            .is_ok_and(|encoded| encoded == sources.scenario.data_ddd),
        ),
        (
            "Data LD",
            encode_land_maps(&land.maps, Some(&sources.scenario.data_ld))
                .is_ok_and(|encoded| encoded == sources.scenario.data_ld),
        ),
        (
            "Data DL",
            encode_dungeon_maps(&dungeon.maps, Some(&sources.scenario.data_dl))
                .is_ok_and(|encoded| encoded == sources.scenario.data_dl),
        ),
        (
            "Data RDD",
            encode_dungeon_random_levels(&dungeon.maps, Some(&sources.scenario.data_rdd))
                .is_ok_and(|encoded| encoded == sources.scenario.data_rdd),
        ),
        (
            "Data RD",
            encode_land_random_levels(&land.maps, Some(&sources.scenario.data_rd))
                .is_ok_and(|encoded| encoded == sources.scenario.data_rd),
        ),
    ])
}

fn encounter_round_trips(
    sources: &JoinedSources,
    snapshot: &ProjectSnapshot,
) -> BTreeMap<&'static str, bool> {
    BTreeMap::from([
        (
            "Data ED",
            encode_simple_encounters(&snapshot.simple_encounters, Some(&sources.scenario.data_ed))
                .is_ok_and(|encoded| encoded == sources.scenario.data_ed),
        ),
        (
            "Data ED2",
            encode_complex_encounters(
                &snapshot.complex_encounters,
                Some(&sources.scenario.data_ed2),
            )
            .is_ok_and(|encoded| encoded == sources.scenario.data_ed2),
        ),
        (
            "Data ED3",
            encode_extra_action_points(
                &snapshot.extra_action_points,
                Some(&sources.scenario.data_ed3),
            )
            .is_ok_and(|encoded| encoded == sources.scenario.data_ed3),
        ),
        (
            "Data EDCD",
            encode_extra_codes(&snapshot.extra_codes, Some(&sources.scenario.data_edcd))
                .is_ok_and(|encoded| encoded == sources.scenario.data_edcd),
        ),
        (
            "Data SD2",
            encode_messages(&snapshot.messages, Some(&sources.scenario.data_sd2))
                .is_ok_and(|encoded| encoded == sources.scenario.data_sd2),
        ),
        (
            "Data TD2",
            encode_rogue_encounters(&snapshot.rogue_encounters, Some(&sources.scenario.data_td2))
                .is_ok_and(|encoded| encoded == sources.scenario.data_td2),
        ),
        (
            "Data TD3",
            encode_timed_encounters(&snapshot.timed_encounters, Some(&sources.scenario.data_td3))
                .is_ok_and(|encoded| encoded == sources.scenario.data_td3),
        ),
    ])
}

fn combat_round_trips(
    sources: &JoinedSources,
    snapshot: &ProjectSnapshot,
) -> BTreeMap<&'static str, bool> {
    BTreeMap::from([
        (
            "Data BD",
            encode_battles(&snapshot.battles, Some(&sources.scenario.data_bd))
                .is_ok_and(|encoded| encoded == sources.scenario.data_bd),
        ),
        (
            "Data MD",
            encode_monster_set(&snapshot.monster_sets[0], Some(&sources.scenario.data_md))
                .is_ok_and(|encoded| encoded == sources.scenario.data_md),
        ),
        (
            "Data TD",
            encode_treasures(&snapshot.treasures, Some(&sources.scenario.data_td))
                .is_ok_and(|encoded| encoded == sources.scenario.data_td),
        ),
        (
            "Data SD",
            encode_shops(&snapshot.shops, Some(&sources.scenario.data_sd))
                .is_ok_and(|encoded| encoded == sources.scenario.data_sd),
        ),
    ])
}

fn rule_round_trips(
    sources: &JoinedSources,
    snapshot: &ProjectSnapshot,
) -> BTreeMap<&'static str, bool> {
    BTreeMap::from([
        (
            "Data NI",
            encode_scenario_item_rules(&snapshot.scenario_item_rules, &sources.scenario.data_ni)
                .is_ok_and(|encoded| encoded == sources.scenario.data_ni),
        ),
        (
            "Data S",
            encode_standard_spells(
                &snapshot.standard_spells,
                Some(&sources.shared.standard_spell_bytes),
            )
            .is_ok_and(|encoded| encoded == sources.shared.standard_spell_bytes),
        ),
        (
            "Data ID",
            encode_standard_item_rules(&snapshot.item_rules, &sources.shared.standard_item_bytes)
                .is_ok_and(|encoded| encoded == sources.shared.standard_item_bytes),
        ),
    ])
}

fn fork_round_trips(
    sources: &JoinedSources,
    snapshot: &ProjectSnapshot,
) -> BTreeMap<&'static str, bool> {
    BTreeMap::from([
        (
            "Data ID.rsrc",
            merge_resource_entries_preserving_unowned_duplicates(
                &sources.shared.standard_item_text_bytes,
                Vec::new(),
            )
            .is_ok_and(|encoded| encoded == sources.shared.standard_item_text_bytes),
        ),
        (
            "Custom Names.rsrc",
            merge_resource_entries_preserving_unowned_duplicates(
                &sources.shared.custom_names_bytes,
                Vec::new(),
            )
            .is_ok_and(|encoded| encoded == sources.shared.custom_names_bytes),
        ),
        (
            "Global",
            encode_global_macro_hooks(
                snapshot
                    .scenario_application
                    .as_ref()
                    .expect("decoded Global contract"),
                Some(&sources.scenario.global),
            )
            .is_ok_and(|encoded| encoded == sources.scenario.global),
        ),
        (
            "Scenario.rsrc",
            merge_resource_entries_preserving_unowned_duplicates(
                &sources.scenario.scenario_resources,
                Vec::new(),
            )
            .is_ok_and(|encoded| encoded == sources.scenario.scenario_resources),
        ),
    ])
}

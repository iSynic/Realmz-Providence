use super::classic_media::{
    classic_scenario_icon_blockers, classic_scenario_picture_blockers,
    classic_scenario_sound_blockers, classic_special_land_tile_blockers,
};
use super::classic_records::{
    classic_battle_blockers, classic_caste_blockers, classic_caste_is_output_candidate,
    classic_complex_encounter_blockers, classic_global_macro_blockers, classic_monster_blockers,
    classic_option_label_blockers, classic_player_map_name_blockers,
    classic_rogue_encounter_blockers, classic_shop_blockers, classic_timed_encounter_blockers,
    classic_treasure_blockers,
};
use super::finding_groups;
use super::imported_instruction;
use super::reference_readiness;
use super::{CompileTarget, TargetCompatibility, blocker, finish_with_warnings};
use crate::model::{CLASSIC_MAP_SIZE, LevelType, ProjectSnapshot};
use crate::rebuilt::ApplicationMediaCatalog;

pub fn classify_classic_slice(snapshot: &ProjectSnapshot) -> TargetCompatibility {
    classify_classic_slice_internal(snapshot, None)
}

pub fn classify_classic_slice_with_application(
    snapshot: &ProjectSnapshot,
    application_media: &ApplicationMediaCatalog,
) -> TargetCompatibility {
    classify_classic_slice_internal(snapshot, Some(application_media))
}

fn classify_classic_slice_internal(
    snapshot: &ProjectSnapshot,
    application_media: Option<&ApplicationMediaCatalog>,
) -> TargetCompatibility {
    let (mut blockers, mut warnings) = reference_readiness::classic(snapshot, application_media);
    imported_instruction::classify_opcode_92(snapshot, &mut blockers, &mut warnings);
    finding_groups::runtime_conditions(snapshot, &mut blockers, &mut warnings);
    blockers.extend(classic_global_macro_blockers(snapshot));
    blockers.extend(classic_scenario_picture_blockers(snapshot));
    blockers.extend(classic_scenario_sound_blockers(snapshot));
    blockers.extend(classic_scenario_icon_blockers(snapshot));
    blockers.extend(classic_special_land_tile_blockers(snapshot));
    blockers.extend(classic_monster_blockers(snapshot));
    blockers.extend(classic_battle_blockers(snapshot));
    blockers.extend(classic_treasure_blockers(snapshot));
    blockers.extend(classic_shop_blockers(snapshot));
    blockers.extend(classic_caste_blockers(snapshot));
    blockers.extend(classic_option_label_blockers(snapshot));
    blockers.extend(classic_player_map_name_blockers(snapshot));
    blockers.extend(classic_complex_encounter_blockers(snapshot));
    blockers.extend(classic_rogue_encounter_blockers(snapshot));
    blockers.extend(classic_timed_encounter_blockers(snapshot));
    if slice_is_empty(snapshot) {
        blockers.push(blocker(
            "classic.slice.empty",
            "The Classic certification slice has no messages, maps, Action Points, Extra Action Points, simple, complex, Rogue, or Timed encounters, spells, E-code rows, monsters, monster descriptions, battles, treasures, Scenario Pictures, Scenario Sounds, Scenario Icons, or Special Land Tiles.",
            None,
        ));
    }
    blockers.extend(map_blockers(snapshot));
    finish_with_warnings(CompileTarget::ClassicCertificationSlice, blockers, warnings)
}

fn slice_is_empty(snapshot: &ProjectSnapshot) -> bool {
    snapshot.messages.is_empty()
        && snapshot.world.maps.is_empty()
        && snapshot.world.action_points.is_empty()
        && snapshot.world.player_maps.is_empty()
        && snapshot.player_map_names.is_none()
        && snapshot.simple_encounters.is_empty()
        && snapshot.complex_encounters.is_empty()
        && snapshot.rogue_encounters.is_empty()
        && snapshot.timed_encounters.is_empty()
        && snapshot.scenario_item_rules.is_empty()
        && !classic_caste_is_output_candidate(snapshot)
        && snapshot.scenario_spells.is_empty()
        && snapshot.extra_codes.is_empty()
        && snapshot.extra_action_points.is_empty()
        && snapshot
            .monster_sets
            .iter()
            .all(|set| set.monsters.is_empty())
        && snapshot.monster_descriptions.is_empty()
        && snapshot.battles.is_empty()
        && snapshot.treasures.is_empty()
        && snapshot.shops.is_empty()
        && snapshot.option_labels.is_empty()
        && !snapshot.assets.iter().any(|asset| asset.kind == "picture")
        && !snapshot.assets.iter().any(|asset| asset.kind == "sound")
        && !snapshot.assets.iter().any(|asset| asset.kind == "icon")
        && !snapshot
            .assets
            .iter()
            .any(|asset| asset.kind == "special-land-tile")
}

fn map_blockers(snapshot: &ProjectSnapshot) -> Vec<super::CompatibilityBlocker> {
    let mut blockers = Vec::new();
    for map in &snapshot.world.maps {
        if map.tiles.len() != CLASSIC_MAP_SIZE * CLASSIC_MAP_SIZE {
            let (code, label, native_path) = match map.level_type {
                LevelType::Land => ("classic.land-map.cell-count", "Land", "Data LD"),
                LevelType::Dungeon => ("classic.dungeon-map.cell-count", "Dungeon", "Data DL"),
            };
            blockers.push(blocker(
                code,
                format!(
                    "{label} map '{}' has {} cells; {native_path} requires exactly 8100.",
                    map.identity.0,
                    map.tiles.len()
                ),
                Some(map.identity.clone()),
            ));
        }
        if map.level_type == LevelType::Dungeon {
            match map.runtime.as_ref() {
                None => blockers.push(blocker(
                    "classic.dungeon-random-level.missing",
                    format!(
                        "Dungeon map '{}' lacks its Data RDD runtime record.",
                        map.identity.0
                    ),
                    Some(map.identity.clone()),
                )),
                Some(runtime) if runtime.landlook.is_none() => blockers.push(blocker(
                    "classic.dungeon-random-level.landlook",
                    format!(
                        "Dungeon map '{}' lacks its signed Data RDD landlook byte.",
                        map.identity.0
                    ),
                    Some(map.identity.clone()),
                )),
                Some(_) => {}
            }
        }
    }
    blockers
}

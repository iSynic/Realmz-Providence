use super::{CompatibilityBlocker, blocker};
use crate::codecs::{
    OPTION_LABEL_TEXT_BYTES, encode_caste_rules, player_map_record_has_semantics,
    validate_battle_record_shape, validate_complex_encounter_shape, validate_monster_record_shape,
    validate_player_map_name_catalog, validate_rogue_encounter_shape, validate_shop_record_shape,
    validate_timed_encounter_shape, validate_treasure_record_shape,
};
use crate::model::ProjectSnapshot;

pub(super) fn classic_caste_is_output_candidate(snapshot: &ProjectSnapshot) -> bool {
    snapshot
        .classic_sources
        .iter()
        .any(|source| source.native_path == "Data Caste")
        || snapshot
            .caste_rules
            .iter()
            .any(|rule| rule.source_blob.is_none())
}

pub(super) fn classic_caste_blockers(snapshot: &ProjectSnapshot) -> Vec<CompatibilityBlocker> {
    if snapshot.caste_rules.is_empty() {
        return Vec::new();
    }
    if snapshot.caste_rules.len() != 30 {
        return vec![blocker(
            "classic.caste.record-count",
            format!(
                "Data Caste requires exactly 30 records; found {}.",
                snapshot.caste_rules.len()
            ),
            None,
        )];
    }
    encode_caste_rules(&snapshot.caste_rules, None)
        .err()
        .map(|error| vec![blocker("classic.caste.invalid", error.to_string(), None)])
        .unwrap_or_default()
}

pub(super) fn classic_player_map_name_blockers(
    snapshot: &ProjectSnapshot,
) -> Vec<CompatibilityBlocker> {
    let has_player_maps = snapshot
        .world
        .player_maps
        .iter()
        .any(player_map_record_has_semantics);
    match &snapshot.player_map_names {
        None if has_player_maps
            && matches!(
                snapshot.origin,
                crate::model::ProjectOrigin::Imported { .. }
            ) =>
        {
            Vec::new()
        }
        None if has_player_maps => vec![blocker(
            "classic.player-map-names.missing",
            "Data MD2 defines Player Maps, but Scenario.rsrc STR# -102 and -101 names are unavailable.",
            None,
        )],
        Some(catalog) => validate_player_map_name_catalog(catalog)
            .err()
            .map(|error| {
                vec![blocker(
                    "classic.player-map-names.invalid",
                    error.to_string(),
                    None,
                )]
            })
            .unwrap_or_default(),
        None => Vec::new(),
    }
}

pub(super) fn classic_option_label_blockers(
    snapshot: &ProjectSnapshot,
) -> Vec<CompatibilityBlocker> {
    let mut blockers = Vec::new();
    let mut seen = std::collections::BTreeSet::new();
    for label in &snapshot.option_labels {
        if !seen.insert(label.native_id) {
            blockers.push(blocker(
                "classic.option-label.duplicate-id",
                format!("Data OD contains duplicate record {}.", label.native_id.0),
                Some(label.identity.clone()),
            ));
        }
        let bytes = label.text.chars().count();
        if bytes > OPTION_LABEL_TEXT_BYTES {
            blockers.push(blocker(
                "classic.option-label.text-too-long",
                format!(
                    "Option label {} uses {bytes} bytes; Data OD allows {OPTION_LABEL_TEXT_BYTES}.",
                    label.native_id.0
                ),
                Some(label.identity.clone()),
            ));
        }
    }
    blockers
}

pub(super) fn classic_complex_encounter_blockers(
    snapshot: &ProjectSnapshot,
) -> Vec<CompatibilityBlocker> {
    let mut blockers = Vec::new();
    let mut seen = std::collections::BTreeSet::new();
    for encounter in &snapshot.complex_encounters {
        if !seen.insert(encounter.native_id) {
            blockers.push(blocker(
                "classic.complex-encounter.duplicate-id",
                format!(
                    "Data ED2 contains duplicate record {}.",
                    encounter.native_id.0
                ),
                Some(encounter.identity.clone()),
            ));
        }
        if let Err(error) = validate_complex_encounter_shape(encounter) {
            blockers.push(blocker(
                "classic.complex-encounter.invalid",
                error.to_string(),
                Some(encounter.identity.clone()),
            ));
        }
    }
    blockers
}

pub(super) fn classic_rogue_encounter_blockers(
    snapshot: &ProjectSnapshot,
) -> Vec<CompatibilityBlocker> {
    let mut blockers = Vec::new();
    let mut seen = std::collections::BTreeSet::new();
    for encounter in &snapshot.rogue_encounters {
        if !seen.insert(encounter.native_id) {
            blockers.push(blocker(
                "classic.rogue-encounter.duplicate-id",
                format!(
                    "Data TD2 contains duplicate record {}.",
                    encounter.native_id.0
                ),
                Some(encounter.identity.clone()),
            ));
        }
        if let Err(error) = validate_rogue_encounter_shape(encounter) {
            blockers.push(blocker(
                "classic.rogue-encounter.invalid",
                error.to_string(),
                Some(encounter.identity.clone()),
            ));
        }
    }
    blockers
}

pub(super) fn classic_timed_encounter_blockers(
    snapshot: &ProjectSnapshot,
) -> Vec<CompatibilityBlocker> {
    let mut blockers = Vec::new();
    let mut seen = std::collections::BTreeSet::new();
    for encounter in &snapshot.timed_encounters {
        if !seen.insert(encounter.native_id) {
            blockers.push(blocker(
                "classic.timed-encounter.duplicate-id",
                format!(
                    "Data TD3 contains duplicate record {}.",
                    encounter.native_id.0
                ),
                Some(encounter.identity.clone()),
            ));
        }
        if let Err(error) = validate_timed_encounter_shape(encounter) {
            blockers.push(blocker(
                "classic.timed-encounter.invalid",
                error.to_string(),
                Some(encounter.identity.clone()),
            ));
        }
    }
    blockers
}

pub(super) fn classic_battle_blockers(snapshot: &ProjectSnapshot) -> Vec<CompatibilityBlocker> {
    let mut blockers = Vec::new();
    let mut seen = std::collections::BTreeSet::new();
    for battle in &snapshot.battles {
        if !seen.insert(battle.native_id) {
            blockers.push(blocker(
                "classic.battle.duplicate-id",
                format!(
                    "Data BD contains duplicate battle record {}.",
                    battle.native_id.0
                ),
                Some(battle.identity.clone()),
            ));
        }
        if let Err(error) = validate_battle_record_shape(battle) {
            blockers.push(blocker(
                "classic.battle.invalid",
                error.to_string(),
                Some(battle.identity.clone()),
            ));
        }
    }
    blockers
}

pub(super) fn classic_treasure_blockers(snapshot: &ProjectSnapshot) -> Vec<CompatibilityBlocker> {
    let mut blockers = Vec::new();
    let mut seen = std::collections::BTreeSet::new();
    for treasure in &snapshot.treasures {
        if !seen.insert(treasure.native_id) {
            blockers.push(blocker(
                "classic.treasure.duplicate-id",
                format!(
                    "Data TD contains duplicate treasure record {}.",
                    treasure.native_id.0
                ),
                Some(treasure.identity.clone()),
            ));
        }
        if let Err(error) = validate_treasure_record_shape(treasure) {
            blockers.push(blocker(
                "classic.treasure.invalid",
                error.to_string(),
                Some(treasure.identity.clone()),
            ));
        }
    }
    blockers
}

pub(super) fn classic_shop_blockers(snapshot: &ProjectSnapshot) -> Vec<CompatibilityBlocker> {
    let mut blockers = Vec::new();
    let mut seen = std::collections::BTreeSet::new();
    for shop in &snapshot.shops {
        if !seen.insert(shop.native_id) {
            blockers.push(blocker(
                "classic.shop.duplicate-id",
                format!(
                    "Data SD contains duplicate shop record {}.",
                    shop.native_id.0
                ),
                Some(shop.identity.clone()),
            ));
        }
        if let Err(error) = validate_shop_record_shape(shop) {
            blockers.push(blocker(
                "classic.shop.invalid",
                error.to_string(),
                Some(shop.identity.clone()),
            ));
        }
    }
    blockers
}

pub(super) fn classic_monster_blockers(snapshot: &ProjectSnapshot) -> Vec<CompatibilityBlocker> {
    let mut blockers = Vec::new();
    let mut seen_set_ids = std::collections::BTreeSet::new();
    for set in &snapshot.monster_sets {
        let expected_path = match set.set_id {
            0 => Some("Data MD"),
            1 => Some("Data MD1"),
            -1 => Some("Data MD-1"),
            _ => None,
        };
        if expected_path != Some(set.native_path.as_str()) || !seen_set_ids.insert(set.set_id) {
            blockers.push(blocker(
                "classic.monster-set.invalid",
                format!(
                    "Monster set {} must be unique and use its certified native path.",
                    set.set_id
                ),
                None,
            ));
        }
        blockers.extend(monster_records(set));
    }
    for description in &snapshot.monster_descriptions {
        if description.text.chars().count() > 255 {
            blockers.push(blocker(
                "classic.monster-description.too-long",
                format!(
                    "Monster description {} exceeds the 255-byte Data DES Str255 field.",
                    description.native_id.0
                ),
                Some(description.identity.clone()),
            ));
        }
    }
    blockers
}

fn monster_records(set: &crate::model::MonsterSet) -> Vec<CompatibilityBlocker> {
    let mut blockers = Vec::new();
    let mut seen_records = std::collections::BTreeSet::new();
    for monster in &set.monsters {
        if !seen_records.insert(monster.native_id) {
            blockers.push(blocker(
                "classic.monster.duplicate-id",
                format!(
                    "{} contains duplicate monster record {}.",
                    set.native_path, monster.native_id.0
                ),
                Some(monster.identity.clone()),
            ));
        }
        if let Err(error) = validate_monster_record_shape(monster) {
            blockers.push(blocker(
                "classic.monster.invalid-shape",
                error.to_string(),
                Some(monster.identity.clone()),
            ));
        }
        if monster.display_name.chars().count() > 40 {
            blockers.push(blocker(
                "classic.monster.display-name-too-long",
                format!(
                    "Monster '{}' exceeds the 40-byte Data MD display-name field.",
                    monster.identity.0
                ),
                Some(monster.identity.clone()),
            ));
        }
        if monster.authored && monster.hit_dice == u8::MAX {
            blockers.push(blocker(
                "classic.monster.hit-dice-terminator",
                "Hit Dice 255 is a dangerous Classic terminator value and cannot be authored as an active monster.",
                Some(monster.identity.clone()),
            ));
        }
    }
    blockers
}

pub(super) fn classic_global_macro_blockers(
    snapshot: &ProjectSnapshot,
) -> Vec<CompatibilityBlocker> {
    let Some(contract) = &snapshot.scenario_application else {
        return Vec::new();
    };
    [
        ("start", &contract.hooks.start_game),
        ("death", &contract.hooks.party_death),
        ("quit", &contract.hooks.end_adventure),
        ("shop", &contract.hooks.shop),
        ("temple", &contract.hooks.temple),
    ]
    .into_iter()
    .filter_map(|(field, target)| {
        let target = target.as_ref()?;
        let native_id = target
            .0
            .strip_prefix("extra-action-point:")
            .and_then(|value| value.parse::<i16>().ok())
            .filter(|native_id| *native_id != 0);
        native_id.is_none().then(|| {
            blocker(
                "classic.global-macro.target-kind",
                format!(
                    "Global {field} hook '{}' is not a Data ED3 Extra Action Point.",
                    target.0
                ),
                Some(snapshot.project_id.clone()),
            )
        })
    })
    .collect()
}

use super::{CompatibilityBlocker, blocker};
use crate::model::ProjectSnapshot;
use crate::rebuilt::{
    RebuiltV3ContentError, imported_requires_rebuilt_v4, project_rebuilt_v3_battle_terrain_sets,
    project_rebuilt_v3_battles, project_rebuilt_v3_complex_encounters, project_rebuilt_v3_content,
    project_rebuilt_v3_item_catalog, project_rebuilt_v3_monster_catalog,
    project_rebuilt_v3_rogue_encounters, project_rebuilt_v3_rule_catalog,
    project_rebuilt_v3_scenario, project_rebuilt_v3_scenario_item_catalog,
    project_rebuilt_v3_shops, project_rebuilt_v3_simple_encounters,
    project_rebuilt_v3_spell_catalog, project_rebuilt_v3_standard_spell_catalog,
    project_rebuilt_v3_timed_encounters, project_rebuilt_v3_treasures,
    project_rebuilt_v3_trigger_programs, project_rebuilt_v4_imported_monster_catalog,
};

pub(super) fn rebuilt_content_document_blockers(
    snapshot: &ProjectSnapshot,
) -> Vec<CompatibilityBlocker> {
    match project_rebuilt_v3_content(snapshot) {
        Err(
            error @ RebuiltV3ContentError::InvalidSection {
                section: "shops" | "treasures",
                ..
            },
        ) => vec![blocker(
            "rebuilt.content-document.invalid-catalog-reference",
            error.to_string(),
            None,
        )],
        _ => Vec::new(),
    }
}

pub(super) fn rebuilt_standard_spell_blockers(
    snapshot: &ProjectSnapshot,
) -> Vec<CompatibilityBlocker> {
    project_rebuilt_v3_standard_spell_catalog(snapshot)
        .err()
        .map(|error| {
            vec![blocker(
                "rebuilt.standard-spell-catalog.invalid",
                error.to_string(),
                None,
            )]
        })
        .unwrap_or_default()
}

pub(super) fn rebuilt_spell_blockers(snapshot: &ProjectSnapshot) -> Vec<CompatibilityBlocker> {
    if snapshot.scenario_spells.is_empty() {
        return Vec::new();
    }
    project_rebuilt_v3_spell_catalog(snapshot)
        .err()
        .map(|error| {
            vec![blocker(
                "rebuilt.spell-catalog.invalid",
                error.to_string(),
                None,
            )]
        })
        .unwrap_or_default()
}

pub(super) fn rebuilt_simple_encounter_blockers(
    snapshot: &ProjectSnapshot,
) -> Vec<CompatibilityBlocker> {
    if snapshot.messages.is_empty() && snapshot.simple_encounters.is_empty() {
        return Vec::new();
    }
    project_rebuilt_v3_simple_encounters(snapshot)
        .err()
        .map(|error| {
            vec![blocker(
                "rebuilt.simple-encounters.invalid",
                error.to_string(),
                None,
            )]
        })
        .unwrap_or_default()
}

pub(super) fn rebuilt_complex_encounter_blockers(
    snapshot: &ProjectSnapshot,
) -> Vec<CompatibilityBlocker> {
    if snapshot.complex_encounters.is_empty() {
        return Vec::new();
    }
    project_rebuilt_v3_complex_encounters(snapshot)
        .err()
        .map(|error| {
            vec![blocker(
                "rebuilt.complex-encounters.invalid",
                error.to_string(),
                None,
            )]
        })
        .unwrap_or_default()
}

pub(super) fn rebuilt_rogue_encounter_blockers(
    snapshot: &ProjectSnapshot,
) -> Vec<CompatibilityBlocker> {
    if snapshot.rogue_encounters.is_empty() {
        return Vec::new();
    }
    project_rebuilt_v3_rogue_encounters(snapshot)
        .err()
        .map(|error| {
            vec![blocker(
                "rebuilt.rogue-encounters.invalid",
                error.to_string(),
                None,
            )]
        })
        .unwrap_or_default()
}

pub(super) fn rebuilt_timed_encounter_blockers(
    snapshot: &ProjectSnapshot,
) -> Vec<CompatibilityBlocker> {
    if snapshot.timed_encounters.is_empty() {
        return Vec::new();
    }
    project_rebuilt_v3_timed_encounters(snapshot)
        .err()
        .map(|error| {
            vec![blocker(
                "rebuilt.timed-encounters.invalid",
                error.to_string(),
                None,
            )]
        })
        .unwrap_or_default()
}

pub(super) fn rebuilt_monster_blockers(snapshot: &ProjectSnapshot) -> Vec<CompatibilityBlocker> {
    if snapshot.monster_sets.is_empty() && snapshot.monster_descriptions.is_empty() {
        return Vec::new();
    }
    (if imported_requires_rebuilt_v4(snapshot) {
        project_rebuilt_v4_imported_monster_catalog(snapshot)
    } else {
        project_rebuilt_v3_monster_catalog(snapshot)
    })
    .err()
    .map(|error| vec![blocker("rebuilt.monsters.invalid", error.to_string(), None)])
    .unwrap_or_default()
}

pub(super) fn rebuilt_battle_blockers(snapshot: &ProjectSnapshot) -> Vec<CompatibilityBlocker> {
    if snapshot.battles.is_empty() {
        return Vec::new();
    }
    project_rebuilt_v3_battles(snapshot)
        .err()
        .map(|error| vec![blocker("rebuilt.battles.invalid", error.to_string(), None)])
        .unwrap_or_default()
}

pub(super) fn rebuilt_treasure_blockers(snapshot: &ProjectSnapshot) -> Vec<CompatibilityBlocker> {
    if snapshot.treasures.is_empty() {
        return Vec::new();
    }
    let items = match crate::rebuilt::project_rebuilt_v3_combined_item_catalog(snapshot) {
        Ok(items) => items,
        Err(_) => return Vec::new(),
    };
    let item_ids = items.into_iter().map(|item| item.id).collect();
    project_rebuilt_v3_treasures(snapshot, &item_ids)
        .err()
        .map(|error| {
            vec![blocker(
                "rebuilt.treasures.invalid",
                error.to_string(),
                None,
            )]
        })
        .unwrap_or_default()
}

pub(super) fn rebuilt_shop_blockers(snapshot: &ProjectSnapshot) -> Vec<CompatibilityBlocker> {
    if snapshot.shops.is_empty() {
        return Vec::new();
    }
    let items = match crate::rebuilt::project_rebuilt_v3_combined_item_catalog(snapshot) {
        Ok(items) => items,
        Err(_) => return Vec::new(),
    };
    let item_ids = items.into_iter().map(|item| item.id).collect();
    project_rebuilt_v3_shops(snapshot, &item_ids)
        .err()
        .map(|error| vec![blocker("rebuilt.shops.invalid", error.to_string(), None)])
        .unwrap_or_default()
}

pub(super) fn battle_terrain_blockers(snapshot: &ProjectSnapshot) -> Vec<CompatibilityBlocker> {
    project_rebuilt_v3_battle_terrain_sets(snapshot)
        .err()
        .map(|error| {
            vec![blocker(
                "rebuilt.battle-terrain.invalid",
                error.to_string(),
                None,
            )]
        })
        .unwrap_or_default()
}

pub(super) fn scenario_item_catalog_blockers(
    snapshot: &ProjectSnapshot,
) -> Vec<CompatibilityBlocker> {
    if snapshot.scenario_item_rules.is_empty() {
        return vec![blocker(
            "rebuilt.scenario-item-catalog.unavailable",
            "Schema v3 requires the scenario Data NI catalog for Classic IDs 800 through 999.",
            None,
        )];
    }
    project_rebuilt_v3_scenario_item_catalog(snapshot)
        .err()
        .map(|error| {
            vec![blocker(
                "rebuilt.scenario-item-catalog.invalid",
                error.to_string(),
                None,
            )]
        })
        .unwrap_or_default()
}

pub(super) fn item_catalog_blockers(snapshot: &ProjectSnapshot) -> Vec<CompatibilityBlocker> {
    if snapshot.item_rules.is_empty() {
        return vec![blocker(
            "rebuilt.item-catalog.unavailable",
            "Schema v3 requires the complete standard item catalog for Classic IDs 1 through 799.",
            None,
        )];
    }
    project_rebuilt_v3_item_catalog(snapshot)
        .err()
        .map(|error| {
            vec![blocker(
                "rebuilt.item-catalog.invalid",
                error.to_string(),
                None,
            )]
        })
        .unwrap_or_default()
}

pub(super) fn application_contract_blockers(
    snapshot: &ProjectSnapshot,
) -> Vec<CompatibilityBlocker> {
    if snapshot.scenario_application.is_none() {
        return vec![blocker(
            "rebuilt.application-hooks.unavailable",
            "Scenario lifecycle hooks must be explicitly authored, including an all-null contract.",
            Some(snapshot.project_id.clone()),
        )];
    }
    match project_rebuilt_v3_scenario(snapshot) {
        Ok(_) => Vec::new(),
        Err(error) => vec![blocker(
            "rebuilt.application-hooks.invalid",
            format!("The scenario application contract is invalid: {error}."),
            Some(snapshot.project_id.clone()),
        )],
    }
}

pub(super) fn trigger_program_blockers(snapshot: &ProjectSnapshot) -> Vec<CompatibilityBlocker> {
    project_rebuilt_v3_trigger_programs(snapshot)
        .err()
        .map(|error| {
            vec![blocker(
                "rebuilt.trigger-program.invalid-input",
                error.to_string(),
                None,
            )]
        })
        .unwrap_or_default()
}

pub(super) fn rule_catalog_blockers(snapshot: &ProjectSnapshot) -> Vec<CompatibilityBlocker> {
    if snapshot.race_rules.is_empty() && snapshot.caste_rules.is_empty() {
        return vec![blocker(
            "rebuilt.rules-catalog.unavailable",
            "Schema v3 requires sourced definitions for all 30 Classic races and 30 Classic castes.",
            None,
        )];
    }
    project_rebuilt_v3_rule_catalog(snapshot)
        .err()
        .map(|error| {
            vec![blocker(
                "rebuilt.rules-catalog.invalid",
                error.to_string(),
                None,
            )]
        })
        .unwrap_or_default()
}

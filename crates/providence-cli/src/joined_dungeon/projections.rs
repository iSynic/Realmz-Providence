use providence_core::model::ProjectSnapshot;
use providence_core::rebuilt::project_rebuilt_v3_battles;
use providence_core::rebuilt::project_rebuilt_v3_battles_by_classic_ids;
use providence_core::rebuilt::project_rebuilt_v3_reachable_combat;
use providence_core::rebuilt::project_rebuilt_v3_topologies;
use providence_core::rebuilt::rebuilt_v3_random_rectangle_battle_ids;
use providence_core::rebuilt::rebuilt_v3_referenced_battle_ids;
use providence_core::rebuilt::validate_rebuilt_v3_random_rectangle_references;
use serde_json::json;
use sha2::Digest;
use sha2::Sha256;
use std::collections::BTreeMap;

use super::ProjectionCheck;

pub(super) fn topology(snapshot: &ProjectSnapshot) -> ProjectionCheck {
    let mut topology_snapshot = snapshot.clone();
    topology_snapshot
        .world
        .maps
        .retain(|map| map.level_type == providence_core::model::LevelType::Dungeon);
    topology_snapshot
        .world
        .action_points
        .retain(|row| row.level_type == providence_core::model::LevelType::Dungeon);
    let topology = project_rebuilt_v3_topologies(&topology_snapshot, &BTreeMap::new());
    let (topology_maps, topology_cells, topology_sha256, topology_error) = match topology {
        Ok(topologies) => {
            let bytes = serde_json::to_vec(&topologies).expect("topology projection serializes");
            (
                topologies.len(),
                topologies.iter().map(|topology| topology.cells.len()).sum(),
                Some(format!("{:x}", Sha256::digest(&bytes))),
                None,
            )
        }
        Err(error) => (0, 0, None, Some(error.to_string())),
    };

    ProjectionCheck {
        valid: topology_error.is_none(),
        report: json!({
            "valid": topology_error.is_none(),
            "maps": topology_maps,
            "cells": topology_cells,
            "sha256": topology_sha256,
            "error": topology_error,
        }),
    }
}

pub(super) fn battles(snapshot: &ProjectSnapshot) -> ProjectionCheck {
    let battle_projection = project_rebuilt_v3_battles(snapshot);
    let (projected_battles, battle_placements, battle_error) = match battle_projection {
        Ok(battles) => (
            battles.len(),
            battles
                .iter()
                .map(|battle| battle.monster_slots.len())
                .sum(),
            None,
        ),
        Err(error) => (0, 0, Some(error.to_string())),
    };

    ProjectionCheck {
        valid: battle_error.is_none(),
        report: json!({
            "valid": battle_error.is_none(),
            "battles": projected_battles,
            "placements": battle_placements,
            "error": battle_error,
        }),
    }
}

pub(super) fn random_battles(snapshot: &ProjectSnapshot) -> ProjectionCheck {
    let random_battle_ids = rebuilt_v3_random_rectangle_battle_ids(snapshot);
    let random_battle_projection =
        project_rebuilt_v3_battles_by_classic_ids(snapshot, &random_battle_ids);
    let (projected_random_battles, random_battle_error) = match random_battle_projection {
        Ok(battles) => (battles.len(), None),
        Err(error) => (0, Some(error.to_string())),
    };

    ProjectionCheck {
        valid: random_battle_error.is_none(),
        report: json!({
            "valid": random_battle_error.is_none(),
            "requested": random_battle_ids.len(),
            "battles": projected_random_battles,
            "error": random_battle_error,
        }),
    }
}

pub(super) fn referenced_battles(snapshot: &ProjectSnapshot) -> ProjectionCheck {
    let referenced_battle_ids = rebuilt_v3_referenced_battle_ids(snapshot);
    let (referenced_battle_count, projected_referenced_battles, referenced_battle_error) =
        match referenced_battle_ids {
            Ok(classic_ids) => {
                match project_rebuilt_v3_battles_by_classic_ids(snapshot, &classic_ids) {
                    Ok(battles) => (classic_ids.len(), battles.len(), None),
                    Err(error) => (classic_ids.len(), 0, Some(error.to_string())),
                }
            }
            Err(error) => (0, 0, Some(error.to_string())),
        };

    ProjectionCheck {
        valid: referenced_battle_error.is_none(),
        report: json!({
            "valid": referenced_battle_error.is_none(),
            "requested": referenced_battle_count,
            "battles": projected_referenced_battles,
            "error": referenced_battle_error,
        }),
    }
}

pub(super) fn random_ranges(snapshot: &ProjectSnapshot) -> ProjectionCheck {
    let random_validation = validate_rebuilt_v3_random_rectangle_references(snapshot);
    let random_error = random_validation.as_ref().err().map(ToString::to_string);

    ProjectionCheck {
        valid: random_error.is_none(),
        report: json!({
            "valid": random_error.is_none(),
            "error": random_error,
        }),
    }
}

pub(super) fn reachable_combat(snapshot: &ProjectSnapshot) -> ProjectionCheck {
    let reachable_combat = project_rebuilt_v3_reachable_combat(snapshot);
    let (
        reachable_combat_valid,
        reachable_combat_battles,
        reachable_combat_monsters,
        reachable_combat_sha256,
        reachable_combat_error,
    ) = match reachable_combat {
        Ok(selection) => {
            let bytes = serde_json::to_vec(&selection).expect("combat selection serializes");
            (
                true,
                selection.battles.len(),
                selection.monsters.len(),
                Some(format!("{:x}", Sha256::digest(&bytes))),
                None,
            )
        }
        Err(error) => (false, 0, 0, None, Some(error.to_string())),
    };

    ProjectionCheck {
        valid: reachable_combat_valid,
        report: json!({
            "valid": reachable_combat_valid,
            "battles": reachable_combat_battles,
            "monsters": reachable_combat_monsters,
            "sha256": reachable_combat_sha256,
            "error": reachable_combat_error,
            "packageOutputChanged": false,
        }),
    }
}

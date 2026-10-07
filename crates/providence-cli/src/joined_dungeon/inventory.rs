use providence_core::model::ProjectSnapshot;
use providence_core::references::ResolutionState;
use providence_core::references::TargetKind;
use providence_core::session::references_for;
use serde_json::json;
use std::collections::BTreeMap;
use std::collections::BTreeSet;

use providence_core::model::LevelType;
use std::path::Path;

pub(super) struct RandomReferenceReport {
    pub(super) rectangles: usize,
    pub(super) report: serde_json::Value,
}

pub(super) fn random_references(snapshot: &ProjectSnapshot) -> RandomReferenceReport {
    let rectangle_ids = snapshot
        .world
        .maps
        .iter()
        .filter_map(|map| map.runtime.as_ref())
        .flat_map(|runtime| &runtime.random_rectangles)
        .map(|rectangle| rectangle.identity.clone())
        .collect::<BTreeSet<_>>();
    let random_references = references_for(snapshot)
        .into_iter()
        .filter(|reference| rectangle_ids.contains(&reference.source))
        .collect::<Vec<_>>();
    let reference_count = |kind: TargetKind| {
        random_references
            .iter()
            .filter(|reference| reference.target_kind == kind)
            .count()
    };
    let resolution_count = |resolution: ResolutionState| {
        random_references
            .iter()
            .filter(|reference| reference.resolution == resolution)
            .count()
    };

    RandomReferenceReport {
        rectangles: rectangle_ids.len(),
        report: json!({
            "total": random_references.len(),
            "battle": reference_count(TargetKind::Battle),
            "message": reference_count(TargetKind::Message),
            "sound": reference_count(TargetKind::Sound),
            "extraActionPoint": reference_count(TargetKind::ExtraActionPoint),
            "resolved": resolution_count(ResolutionState::Resolved),
            "stockFallback": resolution_count(ResolutionState::StockFallback),
            "missing": resolution_count(ResolutionState::Missing),
            "ambiguous": resolution_count(ResolutionState::Ambiguous),
        }),
    }
}

pub(super) fn base_report(snapshot: &ProjectSnapshot, directory: &Path) -> serde_json::Value {
    let dungeon_levels = snapshot
        .world
        .maps
        .iter()
        .filter(|map| map.level_type == LevelType::Dungeon)
        .count();
    let mut map_tileset_uses = BTreeMap::<String, usize>::new();
    for tileset_id in snapshot
        .world
        .maps
        .iter()
        .filter_map(|map| map.runtime.as_ref().map(|runtime| &runtime.tileset_id.0))
    {
        *map_tileset_uses.entry(tileset_id.clone()).or_default() += 1;
    }
    json!({
        "directory": directory,
        "levels": dungeon_levels,
        "cells": dungeon_levels * providence_core::model::CLASSIC_MAP_SIZE * providence_core::model::CLASSIC_MAP_SIZE,
        "landLevels": snapshot.world.maps.iter().filter(|map| map.level_type == LevelType::Land).count(),
        "runtimeSelectionLevels": snapshot.world.maps.len(),
        "landActionPoints": snapshot.world.action_points.iter().filter(|row| row.level_type == LevelType::Land).count(),
        "dungeonActionPoints": snapshot.world.action_points.iter().filter(|row| row.level_type == LevelType::Dungeon).count(),
        "populatedDungeonActionPoints": snapshot.world.action_points.iter().filter(|row| row.level_type == LevelType::Dungeon && (row.coordinate.is_some() || !row.actions.is_empty())).count(),
        "battles": snapshot.battles.len(),
        "messages": snapshot.messages.len(),
        "extraActionPoints": snapshot.extra_action_points.len(),
        "mapTilesetUses": map_tileset_uses,
        "readOnlyProbe": true,
    })
}

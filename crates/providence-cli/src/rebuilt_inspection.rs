use crate::projects::read_project_snapshot;
use providence_core::rebuilt::compile_rebuilt_v3_content;
use providence_core::rebuilt::compile_rebuilt_v3_world;
use providence_rebuilt_package::inspect_rebuilt_v3_archive;
use serde_json::json;
use std::fs;
use std::process::ExitCode;

pub(crate) fn inspect_rebuilt_content(snapshot_path: &str) -> ExitCode {
    let result = read_project_snapshot(snapshot_path).and_then(|snapshot| {
        compile_rebuilt_v3_content(&snapshot).map_err(|error| error.to_string())
    });
    match result {
        Ok(artifact) => {
            let document = artifact.document;
            println!(
                "{}",
                serde_json::to_string_pretty(&json!({
                    "snapshotPath": snapshot_path,
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
                .expect("content summary is serializable")
            );
            ExitCode::SUCCESS
        }
        Err(error) => {
            eprintln!("Rebuilt content inspection failed: {error}");
            ExitCode::FAILURE
        }
    }
}

pub(crate) fn inspect_rebuilt_world(snapshot_path: &str) -> ExitCode {
    let result = read_project_snapshot(snapshot_path).and_then(|snapshot| {
        compile_rebuilt_v3_world(&snapshot).map_err(|error| error.to_string())
    });
    match result {
        Ok(artifact) => {
            let document = artifact.document;
            println!(
                "{}",
                serde_json::to_string_pretty(&json!({
                    "snapshotPath": snapshot_path,
                    "kind": document.kind,
                    "schemaVersion": document.schema_version,
                    "canonicalBytes": artifact.canonical_json.len(),
                    "sha256": artifact.sha256,
                    "counts": {
                        "battleTerrainSets": document.battle_terrain_sets.len(),
                        "maps": document.maps.len(),
                        "cells": document.maps.iter().map(|map| map.cells.len()).sum::<usize>(),
                        "randomRectangles": document.maps.iter().map(|map| map.random_rectangles.len()).sum::<usize>(),
                        "triggers": document.triggers.len(),
                        "transitions": document.transitions.len(),
                        "landLayout": usize::from(document.land_layout.is_some()),
                        "playerMaps": document.player_maps.len(),
                        "timedEncounters": document.timed_encounters.len(),
                    },
                    "intentionalEmptySections": [],
                }))
                .expect("world summary is serializable")
            );
            ExitCode::SUCCESS
        }
        Err(error) => {
            eprintln!("Rebuilt world inspection failed: {error}");
            ExitCode::FAILURE
        }
    }
}

pub(crate) fn inspect_rebuilt_package_file(path: &str) -> ExitCode {
    let file = match fs::File::open(path) {
        Ok(file) => file,
        Err(error) => {
            eprintln!("could not open Rebuilt package: {error}");
            return ExitCode::FAILURE;
        }
    };
    let source_bytes = file.metadata().map(|metadata| metadata.len()).unwrap_or(0);
    match inspect_rebuilt_v3_archive(file) {
        Ok(inspection) => {
            let report = json!({
                "path": path,
                "sourceBytes": source_bytes,
                "archiveFiles": inspection.archive_file_count,
                "manifestFiles": inspection.manifest.files.len(),
                "mediaFiles": inspection.media_file_count,
                "campaignId": inspection.manifest.campaign_id,
                "contentId": inspection.manifest.content_id,
                "packageHash": inspection.manifest.package_hash,
                "compilerCommit": inspection.manifest.compiler.commit,
                "schemaVersion": inspection.manifest.schema_version,
                "counts": {
                    "maps": inspection.world.maps.len(),
                    "playerMaps": inspection.world.player_maps.len(),
                    "programs": inspection.scenario.programs.len(),
                    "messages": inspection.content.messages.len(),
                    "monsters": inspection.content.monsters.len(),
                    "assets": inspection.asset_index.assets.len(),
                }
            });
            println!(
                "{}",
                serde_json::to_string_pretty(&report)
                    .expect("Rebuilt package inspection is serializable")
            );
            ExitCode::SUCCESS
        }
        Err(error) => {
            eprintln!("could not inspect Rebuilt package: {error}");
            ExitCode::FAILURE
        }
    }
}

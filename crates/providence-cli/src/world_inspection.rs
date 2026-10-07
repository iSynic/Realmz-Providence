use crate::output::report_error;
use providence_core::codecs::ACTION_POINT_LEVEL_BYTES;
use providence_core::codecs::LAND_LAYOUT_BYTES;
use providence_core::codecs::MAP_LEVEL_BYTES;
use providence_core::codecs::MAPSTATS_CORE_BYTES;
use providence_core::codecs::MAPSTATS_REFERENCE_BYTES;
use providence_core::codecs::PLAYER_MAP_RECORD_BYTES;
use providence_core::codecs::RANDOM_LEVEL_RECORD_BYTES;
use providence_core::codecs::classic_land_index;
use providence_core::codecs::decode_dungeon_action_points;
use providence_core::codecs::decode_dungeon_maps;
use providence_core::codecs::decode_dungeon_random_levels;
use providence_core::codecs::decode_land_layout;
use providence_core::codecs::decode_landlook_mapstats;
use providence_core::codecs::decode_player_map_name_catalog;
use providence_core::codecs::decode_player_maps;
use providence_core::codecs::encode_dungeon_action_points;
use providence_core::codecs::encode_dungeon_maps;
use providence_core::codecs::encode_dungeon_random_levels;
use providence_core::codecs::encode_land_layout;
use providence_core::codecs::encode_player_map_name_resources;
use providence_core::codecs::encode_player_maps;
use providence_core::codecs::player_map_record_has_semantics;
use providence_core::codecs::standard_landlook_source_name;
use providence_core::model::BlobId;
use providence_core::model::{ActionPoint, MapLevel};
use serde_json::json;
use std::collections::BTreeSet;
use std::fs;
use std::path::Path;
use std::process::ExitCode;

pub(crate) fn inspect_mapstats_reference(landlook: &str, path: &str) -> ExitCode {
    let landlook = match landlook.parse::<i8>() {
        Ok(landlook) => landlook,
        Err(error) => return report_error(format!("invalid signed-byte landlook: {error}")),
    };
    let source = match standard_landlook_source_name(landlook) {
        Some(source) => source,
        None => {
            return report_error(format!(
                "landlook {landlook} is not one of the certified built-in references"
            ));
        }
    };
    let bytes = match fs::read(path) {
        Ok(bytes) => bytes,
        Err(error) => return report_error(format!("could not read {source}: {error}")),
    };
    if bytes.len() != MAPSTATS_REFERENCE_BYTES {
        return report_error(format!(
            "{source} must contain exactly {MAPSTATS_REFERENCE_BYTES} bytes; found {}",
            bytes.len()
        ));
    }
    let decoded =
        match decode_landlook_mapstats(&bytes, landlook, source, BlobId("probe:mapstats".into())) {
            Ok(decoded) => decoded,
            Err(error) => return report_error(error.to_string()),
        };
    let walkable = decoded
        .profiles
        .iter()
        .filter(|profile| profile.walkable)
        .count();
    println!(
        "{}",
        serde_json::to_string_pretty(&json!({
            "path": path,
            "source": source,
            "landlook": landlook,
            "bytes": bytes.len(),
            "runtimeBytes": MAPSTATS_CORE_BYTES,
            "trailingBytes": decoded.trailing_bytes.len(),
            "profiles": decoded.profiles.len(),
            "walkableProfiles": walkable,
            "baseTile": decoded.catalog.base_tile,
            "baseScale": decoded.catalog.base_scale,
            "readOnly": true
        }))
        .expect("Map Stats report serializes")
    );
    ExitCode::SUCCESS
}

pub(crate) fn inspect_land_layout(path: &str) -> ExitCode {
    let bytes = match fs::read(path) {
        Ok(bytes) => bytes,
        Err(error) => return report_error(format!("could not read Layout: {error}")),
    };
    let decoded = match decode_land_layout(&bytes) {
        Ok(decoded) => decoded,
        Err(error) => return report_error(error.to_string()),
    };
    let encoded = match encode_land_layout(&decoded, Some(&bytes)) {
        Ok(encoded) => encoded,
        Err(error) => return report_error(error.to_string()),
    };
    if encoded != bytes {
        return report_error("Layout failed exact no-edit round-trip validation".into());
    }
    let mut native_indices = BTreeSet::new();
    let mut occupied = 0usize;
    let mut invalid = 0usize;
    let mut duplicates = 0usize;
    for value in decoded.cells.iter().copied().filter(|value| *value != 0) {
        occupied += 1;
        match classic_land_index(value) {
            Some(native_index) if !native_indices.insert(native_index) => duplicates += 1,
            Some(_) => {}
            None => invalid += 1,
        }
    }
    println!(
        "{}",
        serde_json::to_string_pretty(&json!({
            "path": path,
            "bytes": bytes.len(),
            "runtimeBytes": LAND_LAYOUT_BYTES,
            "trailingBytes": bytes.len() - LAND_LAYOUT_BYTES,
            "rows": providence_core::codecs::LAND_LAYOUT_ROWS,
            "columns": providence_core::codecs::LAND_LAYOUT_COLUMNS,
            "occupiedCells": occupied,
            "distinctLandLevels": native_indices.len(),
            "invalidCells": invalid,
            "duplicatePlacements": duplicates,
            "roundTripExact": true,
            "readOnlyProbe": true
        }))
        .expect("Layout report serializes")
    );
    if invalid == 0 && duplicates == 0 {
        ExitCode::SUCCESS
    } else {
        ExitCode::FAILURE
    }
}

pub(crate) fn inspect_player_maps(path: &str) -> ExitCode {
    let bytes = match fs::read(path) {
        Ok(bytes) => bytes,
        Err(error) => return report_error(format!("could not read Data MD2: {error}")),
    };
    let decoded = decode_player_maps(&bytes);
    let encoded = match encode_player_maps(&decoded.records, Some(&bytes)) {
        Ok(encoded) => encoded,
        Err(error) => return report_error(error.to_string()),
    };
    if encoded != bytes {
        return report_error("Data MD2 failed exact no-edit round-trip validation".into());
    }
    let (defined, scrolling_text, pictures, crops) = player_map_modes(&decoded.records);
    let runtime_addressable = decoded
        .records
        .iter()
        .filter(|record| record.native_id.0 < 20)
        .count();
    let out_of_range_physical_rows = decoded.records.len().saturating_sub(runtime_addressable);
    let invalid_runtime_icon_sizes = decoded
        .records
        .iter()
        .filter(|record| {
            record.native_id.0 < 20
                && player_map_record_has_semantics(record)
                && record.icon_size <= 0
        })
        .count();
    println!(
        "{}",
        serde_json::to_string_pretty(&json!({
            "path": path,
            "bytes": bytes.len(),
            "recordBytes": PLAYER_MAP_RECORD_BYTES,
            "records": decoded.records.len(),
            "definedRecords": defined,
            "runtimeAddressableRows": runtime_addressable,
            "outOfRangePhysicalRows": out_of_range_physical_rows,
            "modes": {
                "scrollingText": scrolling_text,
                "picture": pictures,
                "crop": crops,
            },
            "invalidRuntimeIconSizes": invalid_runtime_icon_sizes,
            "trailingBytes": decoded.trailing_bytes.len(),
            "roundTripExact": true,
            "readOnlyProbe": true,
        }))
        .expect("Data MD2 report serializes")
    );
    ExitCode::SUCCESS
}

pub(crate) fn inspect_player_map_names(path: &str) -> ExitCode {
    let bytes = match fs::read(path) {
        Ok(bytes) => bytes,
        Err(error) => return report_error(format!("could not read Scenario.rsrc: {error}")),
    };
    let catalog = match decode_player_map_name_catalog(&bytes, None) {
        Ok(catalog) => catalog,
        Err(error) => return report_error(error.to_string()),
    };
    let encoded = match encode_player_map_name_resources(&catalog, Some(&bytes)) {
        Ok(encoded) => encoded,
        Err(error) => return report_error(error.to_string()),
    };
    if encoded != bytes {
        return report_error(
            "Scenario.rsrc Player Map names failed exact no-edit validation".into(),
        );
    }
    println!(
        "{}",
        serde_json::to_string_pretty(&json!({
            "path": path,
            "bytes": bytes.len(),
            "availableNames": catalog.available_names.len(),
            "availableNonEmpty": catalog.available_names.iter().filter(|name| !name.is_empty()).count(),
            "unavailableNames": catalog.unavailable_names.len(),
            "unavailableNonEmpty": catalog.unavailable_names.iter().filter(|name| !name.is_empty()).count(),
            "firstAvailable": catalog.available_names.first(),
            "firstUnavailable": catalog.unavailable_names.first(),
            "roundTripExact": true,
            "readOnlyProbe": true,
        }))
        .expect("Player Map name report serializes")
    );
    ExitCode::SUCCESS
}

pub(crate) fn inspect_dungeon_slice(directory: &str) -> ExitCode {
    let directory = Path::new(directory);
    let [data_dl, data_ddd, data_rdd] = match read_dungeon_sources(directory) {
        Ok(sources) => sources,
        Err(error) => return report_error(error),
    };
    let (maps, action_points) = match decode_dungeon_trio(&data_dl, &data_ddd, &data_rdd) {
        Ok(records) => records,
        Err(error) => return report_error(error),
    };
    let exact_dl =
        encode_dungeon_maps(&maps, Some(&data_dl)).is_ok_and(|encoded| encoded == data_dl);
    let exact_ddd = encode_dungeon_action_points(&action_points, maps.len(), Some(&data_ddd))
        .is_ok_and(|encoded| encoded == data_ddd);
    let exact_rdd = encode_dungeon_random_levels(&maps, Some(&data_rdd))
        .is_ok_and(|encoded| encoded == data_rdd);
    if !exact_dl || !exact_ddd || !exact_rdd {
        return report_error("dungeon source trio failed exact no-edit validation".into());
    }

    let nonzero_cells = maps
        .iter()
        .flat_map(|map| &map.tiles)
        .filter(|value| **value != 0)
        .count();
    let active_action_points = action_points
        .iter()
        .filter(|row| row.coordinate.is_some() || !row.actions.is_empty())
        .count();
    println!(
        "{}",
        serde_json::to_string_pretty(&json!({
            "directory": directory,
            "levels": maps.len(),
            "dataDlBytes": data_dl.len(),
            "dataDddBytes": data_ddd.len(),
            "dataRddBytes": data_rdd.len(),
            "cells": maps.len() * providence_core::model::CLASSIC_MAP_SIZE * providence_core::model::CLASSIC_MAP_SIZE,
            "nonzeroCells": nonzero_cells,
            "actionPoints": action_points.len(),
            "activeActionPoints": active_action_points,
            "randomLevelRecords": maps.len(),
            "roundTripExact": true,
            "readOnlyProbe": true,
        }))
        .expect("dungeon slice report serializes")
    );
    ExitCode::SUCCESS
}

fn player_map_modes(
    records: &[providence_core::model::PlayerMapRecord],
) -> (usize, usize, usize, usize) {
    let defined = records
        .iter()
        .filter(|record| player_map_record_has_semantics(record))
        .count();
    let scrolling_text = records
        .iter()
        .filter(|record| player_map_record_has_semantics(record) && record.show < 0)
        .count();
    let pictures = records
        .iter()
        .filter(|record| {
            player_map_record_has_semantics(record) && record.show >= 0 && record.picture_id != 0
        })
        .count();
    let crops = defined.saturating_sub(scrolling_text + pictures);
    (defined, scrolling_text, pictures, crops)
}

fn decode_dungeon_trio(
    data_dl: &[u8],
    data_ddd: &[u8],
    data_rdd: &[u8],
) -> Result<(Vec<MapLevel>, Vec<ActionPoint>), String> {
    let mut maps = decode_dungeon_maps(data_dl);
    if maps.records.is_empty() || !maps.trailing_bytes.is_empty() {
        return Err(format!(
            "Data DL must contain one or more complete {MAP_LEVEL_BYTES}-byte dungeon levels"
        ));
    }
    let action_points = decode_dungeon_action_points(data_ddd);
    if !action_points.trailing_bytes.is_empty()
        || data_ddd.len() != maps.records.len() * ACTION_POINT_LEVEL_BYTES
    {
        return Err("Data DDD must contain exactly 100 records for every Data DL level".into());
    }
    let random_levels = decode_dungeon_random_levels(data_rdd);
    if !random_levels.trailing_bytes.is_empty()
        || data_rdd.len() != maps.records.len() * RANDOM_LEVEL_RECORD_BYTES
    {
        return Err(
            "Data RDD must contain exactly one 644-byte record for every Data DL level".into(),
        );
    }
    for (map, runtime) in maps.records.iter_mut().zip(random_levels.records) {
        if map.native_index != runtime.native_index {
            return Err("Data RDD record order does not match Data DL level order".into());
        }
        map.runtime = Some(runtime.runtime);
    }
    Ok((maps.records, action_points.records))
}

fn read_dungeon_sources(directory: &Path) -> Result<[Vec<u8>; 3], String> {
    let read = |name: &str| {
        let path = directory.join(name);
        fs::read(&path).map_err(|error| format!("could not read {}: {error}", path.display()))
    };
    Ok([read("Data DL")?, read("Data DDD")?, read("Data RDD")?])
}

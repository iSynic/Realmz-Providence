use super::{
    MAPSTATS_CORE_BYTES, MAPSTATS_RANGE_SLOT_BYTES, MAPSTATS_RANGE_SLOTS, MAPSTATS_RECORD_BYTES,
    MAPSTATS_RECORDS, MAPSTATS_REFERENCE_BYTES, MapstatsCodecError, custom_landlook_source_name,
    decode_custom_landlook_mapstats, overlay_bool, overlay_i16, overlay_word,
};
use crate::model::{LandlookCatalogMetadata, LandlookRangeSlot, TerrainProfile};
use std::collections::BTreeMap;

pub fn encode_custom_landlook_mapstats(
    catalog: &LandlookCatalogMetadata,
    profiles: &[TerrainProfile],
    source: &[u8],
) -> Result<Vec<u8>, MapstatsCodecError> {
    validate_source(catalog, profiles, source)?;
    let decoded =
        decode_custom_landlook_mapstats(source, catalog.landlook, catalog.source_blob.clone())?;
    let original = decoded
        .profiles
        .iter()
        .map(|profile| (profile.tile, profile))
        .collect::<BTreeMap<_, _>>();
    let desired = profiles
        .iter()
        .map(|profile| (profile.tile, profile))
        .collect::<BTreeMap<_, _>>();
    if desired.len() != MAPSTATS_RECORDS {
        return Err(MapstatsCodecError::InvalidCustomCatalog {
            reason: "terrain profile tile identities are duplicated or incomplete".into(),
        });
    }

    let mut output = source.to_vec();
    overlay_tiles(&mut output, catalog, &original, &desired)?;
    let base_offset = MAPSTATS_RECORD_BYTES * MAPSTATS_RECORDS;
    overlay_word(
        &mut output,
        base_offset,
        decoded.catalog.base_tile,
        catalog.base_tile,
    );
    overlay_word(
        &mut output,
        base_offset + 2,
        decoded.catalog.base_scale,
        catalog.base_scale,
    );
    overlay_ranges(&mut output, catalog, &decoded.catalog.range_slots)?;
    Ok(output)
}

fn validate_source(
    catalog: &LandlookCatalogMetadata,
    profiles: &[TerrainProfile],
    source: &[u8],
) -> Result<(), MapstatsCodecError> {
    let expected_source = custom_landlook_source_name(catalog.landlook).ok_or(
        MapstatsCodecError::InvalidCustomLandlook {
            landlook: catalog.landlook,
        },
    )?;
    if source.len() != MAPSTATS_REFERENCE_BYTES {
        return Err(MapstatsCodecError::WrongCustomLength {
            expected: MAPSTATS_REFERENCE_BYTES,
            actual: source.len(),
        });
    }
    if catalog.source != expected_source || catalog.byte_length != MAPSTATS_REFERENCE_BYTES as u64 {
        return Err(MapstatsCodecError::InvalidCustomCatalog {
            reason: "source name or byte length does not match the selected custom landlook".into(),
        });
    }
    if profiles.len() != MAPSTATS_RECORDS {
        return Err(MapstatsCodecError::InvalidCustomCatalog {
            reason: format!(
                "expected {MAPSTATS_RECORDS} terrain profiles; found {}",
                profiles.len()
            ),
        });
    }

    Ok(())
}

fn overlay_movement(
    output: &mut [u8],
    start: usize,
    before: &TerrainProfile,
    profile: &TerrainProfile,
) -> Result<(), MapstatsCodecError> {
    overlay_i16(
        output,
        start,
        before.movement_sound_id,
        profile.movement_sound_id,
    )?;
    overlay_word(
        output,
        start + 2,
        before.movement_cost,
        profile.movement_cost,
    );
    overlay_word(output, start + 4, before.solid_type, profile.solid_type);
    overlay_bool(output, start + 6, before.shore, profile.shore);
    overlay_word(
        output,
        start + 8,
        before.boat_requirement,
        profile.boat_requirement,
    );
    overlay_bool(output, start + 10, before.path, profile.path);
    overlay_bool(output, start + 12, before.blocks_los, profile.blocks_los);
    overlay_bool(output, start + 14, before.fly_float, profile.fly_float);
    Ok(())
}

fn overlay_geometry(
    output: &mut [u8],
    start: usize,
    before: &TerrainProfile,
    profile: &TerrainProfile,
) {
    overlay_word(output, start + 16, before.forest_type, profile.forest_type);
    for row in 0..3 {
        for column in 0..3 {
            overlay_word(
                output,
                start + 20 + (row * 3 + column) * 2,
                before.combat_build[row][column],
                profile.combat_build[row][column],
            );
        }
    }
}

fn overlay_ranges(
    output: &mut [u8],
    catalog: &LandlookCatalogMetadata,
    original: &[LandlookRangeSlot],
) -> Result<(), MapstatsCodecError> {
    if !catalog.range_slots.is_empty() {
        if catalog.range_slots.len() != MAPSTATS_RANGE_SLOTS {
            return Err(MapstatsCodecError::InvalidCustomCatalog {
                reason: format!(
                    "expected {MAPSTATS_RANGE_SLOTS} range slots; found {}",
                    catalog.range_slots.len()
                ),
            });
        }
        let ranges = catalog
            .range_slots
            .iter()
            .map(|range| (range.slot, range))
            .collect::<BTreeMap<_, _>>();
        if ranges.len() != MAPSTATS_RANGE_SLOTS {
            return Err(MapstatsCodecError::InvalidCustomCatalog {
                reason: "range slot identities are duplicated or incomplete".into(),
            });
        }
        for (slot, before) in original.iter().enumerate().take(MAPSTATS_RANGE_SLOTS) {
            let range = ranges.get(&(slot as u8)).ok_or_else(|| {
                MapstatsCodecError::InvalidCustomCatalog {
                    reason: format!("range slot {slot} is missing"),
                }
            })?;
            let start = MAPSTATS_CORE_BYTES + slot * MAPSTATS_RANGE_SLOT_BYTES;
            overlay_word(output, start, before.first_tile, range.first_tile);
            overlay_word(output, start + 2, before.last_tile, range.last_tile);
        }
    }
    Ok(())
}

fn overlay_tiles(
    output: &mut [u8],
    catalog: &LandlookCatalogMetadata,
    original: &BTreeMap<i16, &TerrainProfile>,
    desired: &BTreeMap<i16, &TerrainProfile>,
) -> Result<(), MapstatsCodecError> {
    for tile in 0..MAPSTATS_RECORDS {
        let tile = tile as i16;
        let profile =
            desired
                .get(&tile)
                .ok_or_else(|| MapstatsCodecError::InvalidCustomCatalog {
                    reason: format!("terrain profile {tile} is missing"),
                })?;
        if profile.landlook != Some(catalog.landlook)
            || profile.source != catalog.source
            || profile.source_blob.as_ref() != Some(&catalog.source_blob)
        {
            return Err(MapstatsCodecError::InvalidCustomCatalog {
                reason: format!("terrain profile {tile} has inconsistent source attribution"),
            });
        }
        let before = original[&tile];
        let start = tile as usize * MAPSTATS_RECORD_BYTES;
        overlay_movement(output, start, before, profile)?;
        overlay_geometry(output, start, before, profile);
    }
    Ok(())
}

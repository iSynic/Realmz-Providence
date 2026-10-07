//! Custom Map Stats authoring: 201 × 40 bytes plus base and range metadata.
//! Clear To remains in its native source word; no portable schema field is added.

use crate::{
    codecs::{
        MAPSTATS_RECORD_BYTES, decode_custom_landlook_mapstats, encode_custom_landlook_mapstats,
    },
    model::{LandlookCatalogMetadata, LevelType, ProjectSnapshot, StableId, TerrainProfile},
};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TileBehaviorEdit {
    pub solid: bool,
    pub path: bool,
    pub shore: bool,
    pub boat_required: bool,
    pub fly_float: bool,
    pub blocks_los: bool,
    pub movement_sound: i16,
    pub movement_time: i16,
    pub forest_type: i16,
    pub clear_tile: i16,
    pub combat_build: [[i16; 3]; 3],
}

pub struct TileBehaviorContext<'a> {
    pub catalog: &'a LandlookCatalogMetadata,
    pub profile: &'a TerrainProfile,
    pub profiles: Vec<TerrainProfile>,
    pub edit: TileBehaviorEdit,
    pub effective_source: Vec<u8>,
}

pub struct TileBehaviorPlan {
    pub bytes: Vec<u8>,
    pub changed_fields: Vec<String>,
    pub affected_maps: Vec<StableId>,
}

pub fn inspect<'a>(
    snapshot: &'a ProjectSnapshot,
    landlook: i8,
    tile: i16,
    source: &[u8],
) -> Result<TileBehaviorContext<'a>, String> {
    if !(6..=8).contains(&landlook) {
        return Err("Stock tile behavior is protected. Create or choose Custom 1–3.".into());
    }
    if !(0..=200).contains(&tile) {
        return Err("Choose a tile from 0 through 200.".into());
    }
    let mut catalogs = snapshot
        .landlook_catalogs
        .iter()
        .filter(|row| row.landlook == landlook);
    let catalog = catalogs
        .next()
        .ok_or("Create or restore this Custom Landlook first.")?;
    if catalogs.next().is_some() {
        return Err("This Custom Landlook has ambiguous behavior metadata.".into());
    }
    let profiles: Vec<_> = snapshot
        .terrain_catalog
        .iter()
        .filter(|row| row.landlook == Some(landlook))
        .cloned()
        .collect();
    let effective_source = encode_custom_landlook_mapstats(catalog, &profiles, source)
        .map_err(|error| error.to_string())?;
    let profile = snapshot
        .terrain_catalog
        .iter()
        .find(|row| row.landlook == Some(landlook) && row.tile == tile)
        .ok_or("The selected tile has no behavior record.")?;
    let start = tile as usize * MAPSTATS_RECORD_BYTES;
    let clear_tile =
        i16::from_be_bytes([effective_source[start + 38], effective_source[start + 39]]);
    let edit = edit_from_profile(profile, clear_tile)?;
    Ok(TileBehaviorContext {
        catalog,
        profile,
        profiles,
        edit,
        effective_source,
    })
}

fn edit_from_profile(
    profile: &TerrainProfile,
    clear_tile: i16,
) -> Result<TileBehaviorEdit, String> {
    Ok(TileBehaviorEdit {
        solid: profile.solid_type != 0,
        path: profile.path,
        shore: profile.shore,
        boat_required: profile.boat_requirement != 0,
        fly_float: profile.fly_float,
        blocks_los: profile.blocks_los,
        movement_sound: profile
            .movement_sound_id
            .ok_or("The tile has no movement sound value.")?,
        movement_time: profile.movement_cost,
        forest_type: profile.forest_type,
        clear_tile,
        combat_build: profile.combat_build,
    })
}

pub fn prepare(
    snapshot: &ProjectSnapshot,
    landlook: i8,
    tile: i16,
    source: &[u8],
    edit: &TileBehaviorEdit,
) -> Result<TileBehaviorPlan, String> {
    let context = inspect(snapshot, landlook, tile, source)?;
    validate(&context.edit, edit)?;
    let mut profiles = context.profiles.clone();
    let target = profiles
        .iter_mut()
        .find(|row| row.tile == tile)
        .expect("inspected tile");
    apply_profile(target, edit);
    let mut bytes =
        encode_custom_landlook_mapstats(context.catalog, &profiles, &context.effective_source)
            .map_err(|error| error.to_string())?;
    let offset = tile as usize * MAPSTATS_RECORD_BYTES + 38;
    if edit.clear_tile != context.edit.clear_tile {
        bytes[offset..offset + 2].copy_from_slice(&edit.clear_tile.to_be_bytes());
    }
    // Decode now so a successful preview guarantees the same canonical import can commit.
    decode_custom_landlook_mapstats(&bytes, landlook, context.catalog.source_blob.clone())
        .map_err(|error| error.to_string())?;
    let before = serde_json::to_value(&context.edit).expect("typed behavior");
    let after = serde_json::to_value(edit).expect("typed behavior");
    let changed_fields = before
        .as_object()
        .unwrap()
        .iter()
        .filter(|(field, value)| after[*field] != **value)
        .map(|(field, _)| field.clone())
        .collect();
    let affected_maps = snapshot
        .world
        .maps
        .iter()
        .filter(|map| {
            map.level_type == LevelType::Land
                && map.runtime.as_ref().and_then(|runtime| runtime.landlook) == Some(landlook)
        })
        .map(|map| map.identity.clone())
        .collect();
    Ok(TileBehaviorPlan {
        bytes,
        changed_fields,
        affected_maps,
    })
}

fn apply_profile(target: &mut TerrainProfile, edit: &TileBehaviorEdit) {
    target.solid_type = boolean_word(target.solid_type, edit.solid);
    target.boat_requirement = boolean_word(target.boat_requirement, edit.boat_required);
    target.path = edit.path;
    target.shore = edit.shore;
    target.fly_float = edit.fly_float;
    target.blocks_los = edit.blocks_los;
    target.movement_sound_id = Some(edit.movement_sound);
    target.movement_cost = edit.movement_time;
    target.forest_type = edit.forest_type;
    target.combat_build = edit.combat_build;
    target.walkable = target.solid_type == 0 && target.boat_requirement == 0 && !target.fly_float;
}

fn boolean_word(original: i16, enabled: bool) -> i16 {
    if enabled == (original != 0) {
        original
    } else {
        i16::from(enabled)
    }
}

fn validate(before: &TileBehaviorEdit, edit: &TileBehaviorEdit) -> Result<(), String> {
    for (label, value, original, maximum) in [
        (
            "Time / move",
            edit.movement_time,
            before.movement_time,
            32767,
        ),
        ("Forest type", edit.forest_type, before.forest_type, 32767),
        ("Clear To", edit.clear_tile, before.clear_tile, 200),
    ] {
        if value != original && !(0..=maximum).contains(&value) {
            return Err(format!("{label} must be between 0 and {maximum}."));
        }
    }
    for row in 0..3 {
        for column in 0..3 {
            let value = edit.combat_build[row][column];
            if value != before.combat_build[row][column] && !(0..=400).contains(&value) {
                return Err(format!(
                    "Combat cell {},{} must be between 0 and 400.",
                    row + 1,
                    column + 1
                ));
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests;

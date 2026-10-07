//! Scenario-owned Landlooks reuse the existing Map Stats and exact PICT writers.
use crate::{codecs::*, model::*};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum ArtworkMode {
    Full,
    Block,
    Tile,
}

pub fn validate_destination(look: i8) -> Result<(), String> {
    if (6..=8).contains(&look) {
        Ok(())
    } else {
        Err("Choose Custom 1, 2 or 3. Stock Landlooks are protected.".into())
    }
}

pub fn artwork_tiles(
    mode: ArtworkMode,
    tile: i16,
    width: u32,
    height: u32,
) -> Result<Vec<i16>, String> {
    if mode == ArtworkMode::Full {
        if (width, height) != (640, 320) {
            return Err("Full atlas import requires exactly 640 by 320 pixels.".into());
        }
        return Ok((1..=200).filter(|tile| ![60, 61].contains(tile)).collect());
    }
    if !(1..=200).contains(&tile) {
        return Err("Choose a destination tile from 1 to 200.".into());
    }
    if width == 0
        || height == 0
        || !width.is_multiple_of(32)
        || !height.is_multiple_of(32)
        || mode == ArtworkMode::Tile && (width, height) != (32, 32)
    {
        return Err(
            "One tile requires 32 by 32 pixels; block dimensions must be multiples of 32.".into(),
        );
    }
    let (x, y) = ((tile - 1) as u32 % 20, (tile - 1) as u32 / 20);
    if x + width / 32 > 20 || y + height / 32 > 10 {
        return Err("The block would exceed the 20 by 10 atlas.".into());
    }
    let tiles: Vec<i16> = (0..height / 32)
        .flat_map(|row| (0..width / 32).map(move |col| ((y + row) * 20 + x + col + 1) as i16))
        .collect();
    if tiles.iter().any(|tile| [60, 61].contains(tile)) {
        return Err(
            "Tiles 60 and 61 are protected; choose a block that does not overlap them.".into(),
        );
    }
    Ok(tiles)
}

pub fn compose_artwork(
    original: &[u8],
    source: &[u8],
    mode: ArtworkMode,
    tile: i16,
    width: u32,
    height: u32,
) -> Result<Vec<u8>, String> {
    let tiles = artwork_tiles(mode, tile, width, height)?;
    if original.len() != 640 * 320 * 4 || source.len() != (width * height * 4) as usize {
        return Err("The decoded artwork does not match its geometry.".into());
    }
    let mut pixels = original.to_vec();
    for target in tiles {
        let index = usize::try_from(target - 1).expect("bounded tile");
        let (dx, dy) = (index % 20 * 32, index / 20 * 32);
        let (sx, sy) = if mode == ArtworkMode::Full {
            (dx, dy)
        } else {
            let first = (tile - 1) as usize;
            (dx - first % 20 * 32, dy - first / 20 * 32)
        };
        for row in 0..32 {
            let dest = ((dy + row) * 640 + dx) * 4;
            let src = ((sy + row) * width as usize + sx) * 4;
            pixels[dest..dest + 128].copy_from_slice(&source[src..src + 128]);
        }
    }
    Ok(pixels)
}

pub fn clone_metadata(
    snapshot: &ProjectSnapshot,
    source_look: i8,
    destination: i8,
    bytes: &[u8],
) -> Result<Vec<u8>, String> {
    validate_destination(destination)?;
    if ![0, 3, 4, 5, 6, 7, 8, 9, 10].contains(&source_look) {
        return Err("This Landlook is not a compatible behavior template.".into());
    }
    let mut catalogs = snapshot
        .landlook_catalogs
        .iter()
        .filter(|row| row.landlook == source_look);
    let source = catalogs
        .next()
        .ok_or("The template behavior metadata is unavailable.")?;
    if catalogs.next().is_some() {
        return Err("The template behavior metadata is ambiguous.".into());
    }
    let mut catalog = source.clone();
    catalog.landlook = destination;
    catalog.source = custom_landlook_source_name(destination)
        .expect("custom")
        .into();
    catalog.byte_length = MAPSTATS_REFERENCE_BYTES as u64;
    let profiles = snapshot
        .terrain_catalog
        .iter()
        .filter(|row| row.landlook == Some(source_look))
        .map(|row| {
            let mut row = row.clone();
            row.landlook = Some(destination);
            row.source = catalog.source.clone();
            row.source_blob = Some(catalog.source_blob.clone());
            row
        })
        .collect::<Vec<_>>();
    encode_custom_landlook_mapstats(&catalog, &profiles, bytes).map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests;

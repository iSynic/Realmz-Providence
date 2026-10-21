//! Bounded editor imagery uses the same exact resources and cell decoders as native maps.
use crate::{catalogs::CatalogViews, personal_image::DecodedImage};
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
use providence_core::{
    codecs::{decode_land_cell, encode_runtime_rgba_png},
    model::{LevelType, MapLevel},
    session::EditorSession,
};
use providence_storage::ProjectStore;
use serde_json::{Value, json};
use std::collections::BTreeMap;

const CELL: usize = 16;
#[cfg(test)]
#[path = "map_region_preview_tests.rs"]
mod tests;

pub(crate) fn read(
    session: &EditorSession,
    store: Option<&ProjectStore>,
    catalogs: CatalogViews<'_>,
    params: Value,
) -> Result<Value, String> {
    let mut facts = crate::map_region::read(session, &params)?;
    let map = session
        .snapshot()
        .world
        .maps
        .iter()
        .find(|map| map.identity.0 == params["identity"])
        .ok_or("map is unavailable")?;
    let projection = crate::map_rendering::read_map_render_atlas(
        session,
        store,
        catalogs.application_media,
        catalogs.application_media_store,
        params,
    )?;
    if projection["available"] != true {
        facts["available"] = json!(false);
        facts["reason"] = projection["reason"].clone();
        return Ok(facts);
    }
    let atlas = decode(&projection)?;
    let overlays = projection["overlays"]
        .as_array()
        .into_iter()
        .flatten()
        .map(|overlay| {
            let id = i16::try_from(
                overlay["resourceId"]
                    .as_i64()
                    .ok_or("overlay identity is missing")?,
            )
            .map_err(|_| "overlay identity is out of range")?;
            Ok((id, decode(overlay)?))
        })
        .collect::<Result<BTreeMap<_, _>, String>>()?;
    let mut pixels = raster(map, &facts, &atlas, &overlays)?;
    mark_action_points(&mut pixels, &facts);
    let width = facts["width"].as_u64().unwrap() as usize * CELL;
    let height = facts["height"].as_u64().unwrap() as usize * CELL;
    let png = encode_runtime_rgba_png(&pixels, width as u32, height as u32)
        .map_err(|error| error.to_string())?;
    facts["available"] = json!(true);
    facts["pixelWidth"] = json!(width);
    facts["pixelHeight"] = json!(height);
    facts["cellPixels"] = json!(CELL);
    facts["base64"] = json!(BASE64.encode(png));
    facts["mimeType"] = json!("image/png");
    facts["artworkIdentity"] = projection["assetIdentity"].clone();
    facts["unresolvedOverlayResourceIds"] = projection["unresolvedOverlayResourceIds"].clone();
    facts["legend"] = json!({"cyan":"AP with positive authored chance","amber":"AP with nonpositive authored chance","scope":"complete editor map; borders do not imply runtime eligibility or player discovery","coordinates":"origin x,y; cells increase right and down"});
    Ok(facts)
}

fn decode(value: &Value) -> Result<DecodedImage, String> {
    let bytes = BASE64
        .decode(
            value["base64"]
                .as_str()
                .ok_or("preview pixels are missing")?,
        )
        .map_err(|error| error.to_string())?;
    crate::personal_image::decode(&bytes)
}

fn raster(
    map: &MapLevel,
    facts: &Value,
    atlas: &DecodedImage,
    overlays: &BTreeMap<i16, DecodedImage>,
) -> Result<Vec<u8>, String> {
    let geometry = if map.level_type == LevelType::Land {
        (640, 320)
    } else {
        (640, 640)
    };
    if (atlas.width, atlas.height) != geometry || map.tiles.len() != 8100 {
        return Err("map preview artwork or cell geometry is invalid".into());
    }
    let x = facts["x"].as_u64().unwrap() as usize;
    let y = facts["y"].as_u64().unwrap() as usize;
    let width = facts["width"].as_u64().unwrap() as usize;
    let height = facts["height"].as_u64().unwrap() as usize;
    let mut pixels = vec![0; width * height * CELL * CELL * 4];
    let base = map
        .runtime
        .as_ref()
        .and_then(|runtime| runtime.base_tile)
        .unwrap_or(1)
        .clamp(1, 200) as usize;
    for yy in 0..height {
        for xx in 0..width {
            let raw = map.tiles[(y + yy) * 90 + x + xx];
            for dy in 0..CELL {
                for dx in 0..CELL {
                    let target = ((yy * CELL + dy) * width * CELL + xx * CELL + dx) * 4;
                    let destination = &mut pixels[target..target + 4];
                    destination.copy_from_slice(&[23, 27, 32, 255]);
                    if map.level_type == LevelType::Land {
                        land_pixel(destination, raw, base, atlas, overlays, (dx, dy));
                    } else {
                        let (layers, _) = crate::map_rendering::dungeon_cell_render_layers(raw);
                        for tile in std::iter::once(15)
                            .chain((0..7).filter(|layer| layers & (1 << layer) != 0))
                        {
                            sample(
                                destination,
                                atlas,
                                576 + tile % 4 * 16 + dx,
                                320 + tile / 4 * 16 + dy,
                                true,
                            );
                        }
                    }
                }
            }
        }
    }
    Ok(pixels)
}

fn land_pixel(
    destination: &mut [u8],
    raw: i16,
    base: usize,
    atlas: &DecodedImage,
    overlays: &BTreeMap<i16, DecodedImage>,
    (x, y): (usize, usize),
) {
    let cell = decode_land_cell(raw);
    let tile = if raw >= 0 && cell.rendered_value == 0 {
        1
    } else {
        cell.terrain_tile.map(usize::from).unwrap_or(base)
    } - 1;
    sample(
        destination,
        atlas,
        tile % 20 * 32 + x * 2 + 1,
        tile / 20 * 32 + y * 2 + 1,
        false,
    );
    if let Some(overlay) = cell.icon_resource_id.and_then(|id| overlays.get(&id)) {
        sample(
            destination,
            overlay,
            x * overlay.width as usize / CELL,
            y * overlay.height as usize / CELL,
            false,
        );
    }
}

fn sample(destination: &mut [u8], image: &DecodedImage, x: usize, y: usize, white_key: bool) {
    let pixel = &image.rgba[(y * image.width as usize + x) * 4..][..4];
    if white_key && pixel[..3].iter().all(|channel| *channel > 245) {
        return;
    }
    let alpha = u32::from(pixel[3]);
    for channel in 0..3 {
        destination[channel] = ((u32::from(pixel[channel]) * alpha
            + u32::from(destination[channel]) * (255 - alpha)
            + 127)
            / 255) as u8;
    }
    destination[3] = 255;
}

fn mark_action_points(pixels: &mut [u8], facts: &Value) {
    let origin_x = facts["x"].as_u64().unwrap();
    let origin_y = facts["y"].as_u64().unwrap();
    let width = facts["width"].as_u64().unwrap() as usize * CELL;
    for ap in facts["actionPoints"].as_array().into_iter().flatten() {
        let x = (ap["coordinate"]["x"].as_u64().unwrap() - origin_x) as usize * CELL;
        let y = (ap["coordinate"]["y"].as_u64().unwrap() - origin_y) as usize * CELL;
        let color = if ap["activation"]["chancePositive"] == true {
            [0, 220, 240, 255]
        } else {
            [245, 170, 45, 255]
        };
        for yy in 1..CELL - 1 {
            for xx in 1..CELL - 1 {
                if xx == 1 || xx == CELL - 2 || yy == 1 || yy == CELL - 2 {
                    let offset = ((y + yy) * width + x + xx) * 4;
                    pixels[offset..offset + 4].copy_from_slice(&color);
                }
            }
        }
    }
}

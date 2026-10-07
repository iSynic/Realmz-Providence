use crate::{
    catalogs::CatalogViews,
    personal_image::DecodedImage,
    request_params::{required_string, required_u64},
};
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
use providence_core::{
    codecs::{decode_land_cell, encode_runtime_rgba_png},
    model::{LevelType, MapLevel, StableId},
    session::EditorSession,
};
use providence_storage::ProjectStore;
use serde_json::{Value, json};
use std::collections::BTreeMap;

pub(crate) fn read(
    session: &EditorSession,
    store: Option<&ProjectStore>,
    catalogs: CatalogViews<'_>,
    params: Value,
) -> Result<Value, String> {
    if required_u64(&params, "expectedRevision")? != session.revision().0 {
        return Err("The map preview changed. Refresh its thumbnail.".into());
    }
    let identity = StableId(required_string(&params, "identity")?);
    let map = session
        .snapshot()
        .world
        .maps
        .iter()
        .find(|map| map.identity == identity)
        .ok_or_else(|| format!("Map {} is unavailable.", identity.0))?;
    if map.level_type != LevelType::Land {
        return Err("Land Layout thumbnails require a Land map.".into());
    }
    let projection = crate::map_rendering::read_map_render_atlas(
        session,
        store,
        catalogs.application_media,
        catalogs.application_media_store,
        json!({"identity":identity}),
    )?;
    if projection["available"] != true {
        return Ok(
            json!({"revision":session.revision(),"identity":identity,"available":false,"reason":projection["reason"]}),
        );
    }
    let atlas = decode_projection(&projection)?;
    let mut overlays = BTreeMap::new();
    for overlay in projection["overlays"].as_array().into_iter().flatten() {
        overlays.insert(
            overlay["resourceId"]
                .as_i64()
                .ok_or("An overlay has no exact resource identity.")? as i16,
            decode_projection(overlay)?,
        );
    }
    let rgba = raster(map, &atlas, &overlays)?;
    let png = encode_runtime_rgba_png(&rgba, 180, 180).map_err(|error| error.to_string())?;
    Ok(
        json!({"revision":session.revision(),"identity":identity,"available":true,"width":180,"height":180,
        "unresolvedOverlayResourceIds":projection["unresolvedOverlayResourceIds"],"base64":BASE64.encode(png)}),
    )
}

fn decode_projection(projection: &Value) -> Result<DecodedImage, String> {
    let bytes = BASE64
        .decode(
            projection["base64"]
                .as_str()
                .ok_or("Map artwork has no preview pixels.")?,
        )
        .map_err(|error| error.to_string())?;
    crate::personal_image::decode(&bytes)
}

fn raster(
    map: &MapLevel,
    atlas: &DecodedImage,
    overlays: &BTreeMap<i16, DecodedImage>,
) -> Result<Vec<u8>, String> {
    if atlas.width != 640 || atlas.height != 320 || map.tiles.len() != 8100 {
        return Err("The Land thumbnail source has invalid geometry.".into());
    }
    let base = map
        .runtime
        .as_ref()
        .and_then(|runtime| runtime.base_tile)
        .unwrap_or(1)
        .clamp(1, 200) as usize;
    let mut rgba = vec![0; 180 * 180 * 4];
    for (index, raw) in map.tiles.iter().enumerate() {
        let cell = decode_land_cell(*raw);
        let tile = if *raw >= 0 && cell.rendered_value == 0 {
            1
        } else {
            cell.terrain_tile.map(usize::from).unwrap_or(base)
        }
        .saturating_sub(1);
        for y in 0..2 {
            for x in 0..2 {
                let source =
                    ((tile / 20 * 32 + y * 16 + 8) * 640 + tile % 20 * 32 + x * 16 + 8) * 4;
                let destination = ((index / 90 * 2 + y) * 180 + index % 90 * 2 + x) * 4;
                rgba[destination..destination + 4].copy_from_slice(&atlas.rgba[source..source + 4]);
                if let Some(overlay) = cell.icon_resource_id.and_then(|id| overlays.get(&id)) {
                    composite(&mut rgba[destination..destination + 4], overlay, x, y);
                }
            }
        }
    }
    Ok(rgba)
}

fn composite(destination: &mut [u8], overlay: &DecodedImage, x: usize, y: usize) {
    let xx = ((2 * x + 1) * overlay.width as usize / 4).min(overlay.width as usize - 1);
    let yy = ((2 * y + 1) * overlay.height as usize / 4).min(overlay.height as usize - 1);
    let pixel = &overlay.rgba[(yy * overlay.width as usize + xx) * 4..][..4];
    let alpha = u32::from(pixel[3]);
    for channel in 0..3 {
        destination[channel] = ((u32::from(pixel[channel]) * alpha
            + u32::from(destination[channel]) * (255 - alpha)
            + 127)
            / 255) as u8;
    }
    destination[3] = 255;
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::dispatch_result;
    use providence_core::model::{ProjectSnapshot, StableId};

    #[test]
    fn actual_tile_samples_and_signed_overlays_are_presentation_only() {
        let mut session =
            EditorSession::new(ProjectSnapshot::new_authored(StableId("thumb".into())));
        dispatch_result(
            &mut session,
            "map.create",
            json!({"expectedRevision":0,"levelType":"land"}),
        )
        .unwrap();
        let mut map = session.snapshot().world.maps[0].clone();
        map.tiles[0] = 0x6000 | 1002;
        map.tiles[1] = -1091;
        let mut atlas = DecodedImage {
            width: 640,
            height: 320,
            rgba: vec![0; 640 * 320 * 4],
        };
        for pixel in atlas.rgba.chunks_exact_mut(4) {
            pixel.copy_from_slice(&[10, 20, 30, 255]);
        }
        let start = (8 * 640 + 40) * 4;
        atlas.rgba[start..start + 4].copy_from_slice(&[50, 60, 70, 255]);
        let overlays = BTreeMap::from([(
            -91,
            DecodedImage {
                width: 32,
                height: 32,
                rgba: [110, 120, 130, 255].repeat(1024),
            },
        )]);
        let before = map.clone();
        let image = raster(&map, &atlas, &overlays).unwrap();
        assert_eq!(&image[..4], &[50, 60, 70, 255]);
        assert_eq!(&image[8..12], &[110, 120, 130, 255]);
        assert_eq!(map, before);
        assert!(
            raster(
                &map,
                &DecodedImage {
                    width: 32,
                    height: 32,
                    rgba: vec![0; 4096]
                },
                &overlays
            )
            .is_err()
        );
    }
}

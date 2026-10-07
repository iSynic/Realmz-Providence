//! A bounded draft preview uses exact resources and one source map without changing authored truth.
use crate::{
    catalogs::CatalogViews,
    request_params::{coerce_integral_numbers, required_u64, required_value},
};
use providence_core::{
    model::{LevelType, PlayerMapRecord},
    session::EditorSession,
};
use providence_storage::ProjectStore;
use serde_json::{Value, json};

pub(crate) fn read(
    session: &EditorSession,
    store: Option<&ProjectStore>,
    catalogs: CatalogViews<'_>,
    params: &Value,
) -> Result<Value, String> {
    if required_u64(params, "expectedRevision")? != session.revision().0 {
        return Err("The Player Map preview changed. Refresh it.".into());
    }
    let record: PlayerMapRecord = serde_json::from_value(coerce_integral_numbers(
        required_value(params, "playerMap")?.clone(),
    ))
    .map_err(|error| error.to_string())?;
    session
        .validate_player_map_draft(&record, None)
        .map_err(|error| error.to_string())?;
    if record.show < 0 {
        return Ok(
            json!({"revision":session.revision(),"mode":"scrolling-text","resource":crate::player_map_resources::preview(session, store, catalogs, "scrollingText", record.show)?}),
        );
    }
    if record.picture_id != 0 {
        return Ok(
            json!({"revision":session.revision(),"mode":"picture","rectangle":record.picture_rect,"resource":crate::player_map_resources::preview(session, store, catalogs, "picture", record.picture_id)?}),
        );
    }
    terrain(session, store, catalogs, &record)
}

fn terrain(
    session: &EditorSession,
    store: Option<&ProjectStore>,
    catalogs: CatalogViews<'_>,
    record: &PlayerMapRecord,
) -> Result<Value, String> {
    if record.icon_size <= 0 {
        return Err("Tile / Icon size must be positive before this crop can be previewed.".into());
    }
    let (map, width, cells) = target_crop(session, record)?;
    let mut atlas = crate::map_rendering::resolve_map_atlas(
        session,
        store,
        catalogs.application_media,
        catalogs.application_media_store,
        map,
    )?;
    if atlas["available"] != true {
        return Err(atlas["reason"]
            .as_str()
            .unwrap_or("The exact map artwork is unavailable.")
            .into());
    }
    if !record.is_dungeon {
        let overlays = cells
            .iter()
            .filter_map(|value| land_overlay_id(*value))
            .collect();
        crate::map_overlays::attach_resource_overlays(
            &mut atlas,
            session,
            store,
            catalogs.application_media,
            catalogs.application_media_store,
            &overlays,
        )?;
    }
    let markers = record.markers.iter().enumerate().filter(|(_, marker)| marker.icon_id != 0).map(|(slot, marker)| {
        let resource = crate::player_map_resources::preview(session, store, catalogs, "marker", marker.icon_id);
        json!({"slot":slot,"marker":marker,"resource":resource.as_ref().ok(),"reason":resource.as_ref().err()})
    }).collect::<Vec<_>>();
    let marker_bytes: u64 = markers
        .iter()
        .filter_map(|row| row["resource"]["bytes"].as_u64())
        .sum();
    if marker_bytes > 8 * 1024 * 1024 {
        return Err("Marker previews exceed the 8 MiB aggregate budget.".into());
    }
    Ok(
        json!({"revision":session.revision(),"mode":if record.is_dungeon { "dungeon-crop" } else { "land-crop" },
        "mapIdentity":map.identity,"columns":width,"cellSize":if record.is_dungeon {16} else {record.icon_size},
        "markerSize":record.icon_size,"baseTile":map.runtime.as_ref().and_then(|runtime| runtime.base_tile).unwrap_or(1),
        "cells":cells,"atlas":atlas,"markers":markers}),
    )
}

fn target_crop<'a>(
    session: &'a EditorSession,
    record: &PlayerMapRecord,
) -> Result<(&'a providence_core::model::MapLevel, i32, Vec<i16>), String> {
    let kind = if record.is_dungeon {
        LevelType::Dungeon
    } else {
        LevelType::Land
    };
    let map = session
        .snapshot()
        .world
        .maps
        .iter()
        .find(|map| {
            map.level_type == kind
                && i32::try_from(map.native_index).ok() == Some(i32::from(record.level))
        })
        .ok_or("The exact target map is missing. Choose another map to repair it.")?;
    let width = if record.is_dungeon {
        20
    } else {
        (320 + i32::from(record.icon_size) - 1) / i32::from(record.icon_size)
    };
    let x = i32::from(record.start_x);
    let y = i32::from(record.start_y);
    if !record.is_dungeon && (x < 0 || y < 0 || x + width > 90 || y + width > 90) {
        return Err("This 320 × 320 crop extends beyond the source map. Its imported values are retained; adjust the origin or tile size to preview it safely.".into());
    }
    if map.tiles.len() != 8100 {
        return Err("The source map has incomplete cell data.".into());
    }
    Ok((map, width, crop_cells(&map.tiles, x, y, width)))
}

fn crop_cells(tiles: &[i16], x: i32, y: i32, width: i32) -> Vec<i16> {
    (0..width)
        .flat_map(|yy| {
            (0..width).map(move |xx| {
                let (column, row) = (x + xx, y + yy);
                if (0..90).contains(&column) && (0..90).contains(&row) {
                    tiles[(row * 90 + column) as usize]
                } else {
                    0
                }
            })
        })
        .collect()
}

// Player Maps use fastplotmap's three overlay reductions, independently of the map editor.
fn land_overlay_id(value: i16) -> Option<i32> {
    let mut id = i32::from(value);
    if id >= 0 {
        return None;
    }
    for _ in 0..3 {
        if id < -999 {
            id += 1000;
        }
    }
    Some(id)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn crop_dependencies_and_dungeon_edges_follow_player_map_semantics() {
        let mut tiles = vec![1; 8100];
        tiles[0] = -3137;
        tiles[8099] = -12000;
        let cells = crop_cells(&tiles, 0, 0, 20);
        assert_eq!(cells.len(), 400);
        assert_eq!(
            cells
                .iter()
                .filter_map(|value| land_overlay_id(*value))
                .collect::<Vec<_>>(),
            vec![-137]
        );
        let edge = crop_cells(&tiles, 80, 80, 20);
        assert_eq!(edge.iter().filter(|value| **value == 0).count(), 300);
        assert_eq!(edge[9 * 20 + 9], -12000);
        assert_eq!(
            crop_cells(&tiles, -10, -10, 20)
                .iter()
                .filter(|value| **value == 0)
                .count(),
            300
        );
    }
}

use crate::map_overlays::attach_map_overlay_projections;
use crate::request_params::required_string;
use base64::Engine as _;
use base64::engine::general_purpose::STANDARD as BASE64;
use providence_core::codecs::decode_dungeon_cell;
use providence_core::model::AssetDescriptor;
use providence_core::model::CLASSIC_MAP_SIZE;
use providence_core::model::LevelType;
use providence_core::model::MapLevel;
use providence_core::model::StableId;
use providence_core::rebuilt::ApplicationMediaCatalog;
use providence_core::rebuilt::ApplicationMediaResolution;
use providence_core::session::EditorSession;
use providence_storage::ProjectStore;
use providence_storage::ReferenceLibraryStore;
use serde_json::Value;
use serde_json::json;

pub(crate) fn application_landlook_atlas_coverage(
    catalog: &ApplicationMediaCatalog,
) -> (Vec<i32>, Vec<i32>, bool) {
    let (available, missing) = [0, 1, 3, 4, 5, 6, 7, 8, 9, 10]
        .into_iter()
        .partition(|landlook| {
            matches!(
                catalog.resolve_landlook_tileset(&StableId(format!("classic.landlook.{landlook}"))),
                ApplicationMediaResolution::Resolved(_)
            )
        });
    let dungeon = matches!(
        catalog.resolve_map_tileset(&StableId("dungeon-top-down-302".into())),
        ApplicationMediaResolution::Resolved(_)
    );
    (available, missing, dungeon)
}

pub(crate) fn read_map_render_atlas(
    session: &EditorSession,
    project_store: Option<&ProjectStore>,
    application_media: Option<&ApplicationMediaCatalog>,
    application_media_store: Option<&ReferenceLibraryStore>,
    params: Value,
) -> Result<Value, String> {
    let map_identity = StableId(required_string(&params, "identity")?);
    let requested_overlay_ids = requested_overlay_ids(&params)?;
    let map = session
        .snapshot()
        .world
        .maps
        .iter()
        .find(|map| map.identity == map_identity)
        .ok_or_else(|| format!("map '{}' was not found", map_identity.0))?;
    let mut projection = resolve_map_atlas(
        session,
        project_store,
        application_media,
        application_media_store,
        map,
    )?;
    if projection["available"] == true {
        if map.level_type == LevelType::Land {
            let atlas = crate::terrain_atlas::evidence(&projection).ok();
            projection["tileCatalog"] =
                crate::land_tile_catalog::project_resolved(session, map, atlas.as_ref());
        }
        attach_map_overlay_projections(
            &mut projection,
            session,
            project_store,
            application_media,
            application_media_store,
            map,
            &requested_overlay_ids,
        )?;
    }
    Ok(projection)
}

pub(crate) fn requested_overlay_ids(params: &Value) -> Result<Vec<i32>, String> {
    let Some(values) = params.get("overlayResourceIds") else {
        return Ok(Vec::new());
    };
    let values = values
        .as_array()
        .ok_or_else(|| "overlayResourceIds must be an array".to_string())?;
    if values.len() > crate::map_overlays::MAX_MAP_OVERLAY_CANDIDATES {
        return Err("too many requested map-overlay previews".into());
    }
    values
        .iter()
        .map(|value| {
            let value = value
                .as_i64()
                .ok_or_else(|| "overlayResourceIds must contain integers".to_string())?;
            i32::try_from(value).map_err(|_| "map-overlay resource ID is out of range".to_string())
        })
        .collect()
}

pub(crate) fn map_atlas_projection(
    map: &MapLevel,
    asset: &AssetDescriptor,
    source_role: &str,
    bytes: Vec<u8>,
) -> Result<Value, String> {
    if bytes.len() > MAX_MAP_ATLAS_PREVIEW_BYTES {
        return Err(format!(
            "map tileset '{}' exceeds the {} byte preview limit",
            asset.identity.0, MAX_MAP_ATLAS_PREVIEW_BYTES
        ));
    }
    let runtime = map
        .runtime
        .as_ref()
        .ok_or_else(|| "map render metadata disappeared during atlas projection".to_string())?;
    let dungeon_render = (map.level_type == LevelType::Dungeon)
        .then(|| dungeon_render_projection(map))
        .transpose()?;
    Ok(json!({
        "available": true,
        "mapIdentity": map.identity,
        "tilesetId": runtime.tileset_id,
        "assetIdentity": asset.identity,
        "renderMode": if map.level_type == LevelType::Dungeon { "dungeon-top-down" } else { "outdoor-landlook" },
        "sourceRole": source_role,
        "source": asset.source,
        "blob": asset.blob,
        "mimeType": asset.mime_type,
        "bytes": bytes.len(),
        "width": asset.width,
        "height": asset.height,
        "tileWidth": asset.tile_width,
        "tileHeight": asset.tile_height,
        "columns": asset.columns,
        "rows": asset.rows,
        "landlook": runtime.landlook,
        "baseTile": runtime.base_tile,
        "base64": BASE64.encode(bytes),
        "dungeonRender": dungeon_render,
    }))
}

pub(crate) fn dungeon_render_projection(map: &MapLevel) -> Result<Value, String> {
    if map.tiles.len() != CLASSIC_MAP_SIZE * CLASSIC_MAP_SIZE {
        return Err(format!(
            "dungeon map '{}' has {} cells; expected {}",
            map.identity.0,
            map.tiles.len(),
            CLASSIC_MAP_SIZE * CLASSIC_MAP_SIZE
        ));
    }
    let mut sprite_layer_masks = Vec::with_capacity(map.tiles.len());
    let mut behavior_overlay_masks = Vec::with_capacity(map.tiles.len());
    for value in &map.tiles {
        let (sprite_layers, behavior_overlays) = dungeon_cell_render_layers(*value);
        sprite_layer_masks.push(sprite_layers);
        behavior_overlay_masks.push(behavior_overlays);
    }
    Ok(json!({
        "format": "realmz.dungeon-render.v1",
        "cellCount": map.tiles.len(),
        "spriteLayerOrder": [
            "wall",
            "horizontal-door",
            "vertical-door",
            "stairs",
            "column",
            "note-marker",
            "revealed-secret"
        ],
        "behaviorOverlayOrder": [
            "visible-arch",
            "allow-move-north",
            "allow-move-east",
            "allow-move-south",
            "allow-move-west",
            "no-wall-in-battle"
        ],
        "spriteLayerMasks": sprite_layer_masks,
        "behaviorOverlayMasks": behavior_overlay_masks,
    }))
}

pub(crate) fn dungeon_cell_render_layers(value: i16) -> (u8, u8) {
    let profile = decode_dungeon_cell(value);
    let sprites = u8::from(profile.wall)
        | (u8::from(profile.horizontal_door) << 1)
        | (u8::from(profile.vertical_door) << 2)
        | (u8::from(profile.stairs) << 3)
        | (u8::from(profile.column) << 4)
        | (u8::from(profile.note_marker) << 5)
        | (u8::from(profile.revealed_secret) << 6);
    let behaviors = u8::from(profile.visible_arch)
        | (u8::from(profile.allow_move_north) << 1)
        | (u8::from(profile.allow_move_east) << 2)
        | (u8::from(profile.allow_move_south) << 3)
        | (u8::from(profile.allow_move_west) << 4)
        | (u8::from(profile.no_wall_in_battle) << 5);
    (sprites, behaviors)
}
pub(crate) const MAX_MAP_ATLAS_PREVIEW_BYTES: usize = 4 * 1024 * 1024;

pub(crate) fn resolve_map_atlas(
    session: &EditorSession,
    project_store: Option<&ProjectStore>,
    application_media: Option<&ApplicationMediaCatalog>,
    application_media_store: Option<&ReferenceLibraryStore>,
    map: &MapLevel,
) -> Result<Value, String> {
    let Some(runtime) = map.runtime.as_ref() else {
        return Ok(json!({
            "available": false,
            "mapIdentity": map.identity,
            "reason": "The imported map has no source-attributed render metadata.",
        }));
    };

    use providence_core::map_artwork::{self, MapArtworkResolution};
    let asset = match map_artwork::scenario(session.snapshot(), &runtime.tileset_id) {
        MapArtworkResolution::Resolved(asset) => Some(asset),
        MapArtworkResolution::Missing => None,
        MapArtworkResolution::Ambiguous => {
            return Ok(unavailable_atlas(
                map,
                &runtime.tileset_id,
                "The scenario's exact map picture is ambiguous. Resolve its duplicate artwork first.",
            ));
        }
        MapArtworkResolution::WrongKind => {
            return Ok(unavailable_atlas(
                map,
                &runtime.tileset_id,
                "The scenario's exact map picture has an incompatible type or grid. Repair its artwork before choosing it.",
            ));
        }
    };
    if let Some(asset) = asset {
        let Some(store) = project_store else {
            return Ok(json!({
                "available": false,
                "mapIdentity": map.identity,
                "tilesetId": runtime.tileset_id,
                "reason": "The scenario tileset requires an open portable project.",
            }));
        };
        let bytes = store
            .read_blob(&asset.blob)
            .map_err(|error| error.to_string())?;
        if let Err(reason) = crate::map_artwork::validate_png(&bytes, asset.width, asset.height) {
            return Ok(unavailable_atlas(map, &runtime.tileset_id, &reason));
        }
        return map_atlas_projection(map, asset, "scenario-override", bytes);
    }
    application_map_atlas(
        map,
        &runtime.tileset_id,
        application_media,
        application_media_store,
    )
}

fn unavailable_atlas(map: &MapLevel, tileset_id: &StableId, reason: &str) -> Value {
    json!({ "available": false, "mapIdentity": map.identity, "tilesetId": tileset_id, "reason": reason })
}

fn application_map_atlas(
    map: &MapLevel,
    tileset_id: &StableId,
    application_media: Option<&ApplicationMediaCatalog>,
    application_media_store: Option<&ReferenceLibraryStore>,
) -> Result<Value, String> {
    let Some(catalog) = application_media else {
        return Ok(unavailable_atlas(
            map,
            tileset_id,
            "Configure a validated Classic application-media library to render this landlook.",
        ));
    };
    let asset = match catalog.resolve_map_tileset(tileset_id) {
        ApplicationMediaResolution::Resolved(asset) => asset,
        ApplicationMediaResolution::Ambiguous => {
            return Ok(unavailable_atlas(
                map,
                tileset_id,
                "The Classic application-media library has an ambiguous tileset resource.",
            ));
        }
        ApplicationMediaResolution::WrongKind => {
            return Ok(unavailable_atlas(
                map,
                tileset_id,
                "The Classic application-media resource is not a compatible tileset atlas.",
            ));
        }
        ApplicationMediaResolution::Missing => {
            return Ok(unavailable_atlas(
                map,
                tileset_id,
                "The Classic application-media library does not contain this tileset atlas.",
            ));
        }
    };
    let store = application_media_store.ok_or_else(|| {
        "the validated Classic application-media catalog has no readable blob store".to_string()
    })?;
    let bytes = store
        .read_blob(&asset.descriptor.blob)
        .map_err(|error| error.to_string())?;
    if let Err(reason) =
        crate::map_artwork::validate_png(&bytes, asset.descriptor.width, asset.descriptor.height)
    {
        return Ok(unavailable_atlas(map, tileset_id, &reason));
    }
    map_atlas_projection(
        map,
        &asset.descriptor,
        "classic-application-fallback",
        bytes,
    )
}

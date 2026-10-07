use crate::catalogs::CatalogViews;
use providence_core::session::EditorSession;
use providence_storage::ProjectStore;
use serde_json::Value;

pub(super) fn handles(method: &str) -> bool {
    matches!(
        method,
        "map.thumbnail"
            | "map.render-atlas"
            | "map.tile-catalog"
            | "player-map.resources.list"
            | "player-map.resource.preview"
            | "player-map.preview"
    ) || method.starts_with("smart-terrain.")
        || method.starts_with("terrain-mapping.")
        || method.starts_with("magic-brush.")
        || matches!(
            method.split('.').next(),
            Some(
                "paint-resources"
                    | "map-stamp"
                    | "special-art"
                    | "level-settings"
                    | "tile-behavior"
                    | "random-region"
            )
        )
        || (method.starts_with("custom-landlook.") && method != "custom-landlook.metadata.import")
}

pub(super) fn dispatch(
    session: &mut EditorSession,
    store: Option<&ProjectStore>,
    catalogs: CatalogViews<'_>,
    method: &str,
    params: Value,
) -> Result<Value, String> {
    match method.split('.').next().unwrap_or_default() {
        "smart-terrain" | "terrain-mapping" | "magic-brush" => {
            crate::terrain_atlas::dispatch(session, store, catalogs, method, &params)
        }
        "map" if method == "map.tile-catalog" => {
            crate::terrain_atlas::dispatch(session, store, catalogs, method, &params)
        }
        "player-map" if method == "player-map.preview" => {
            crate::player_map_preview::read(session, store, catalogs, &params)
        }
        "player-map" => {
            crate::player_map_resources::dispatch(session, store, catalogs, method, &params)
        }
        "map" if method == "map.thumbnail" => {
            crate::map_thumbnail::read(session, store, catalogs, params)
        }
        "map" => crate::map_rendering::read_map_render_atlas(
            session,
            store,
            catalogs.application_media,
            catalogs.application_media_store,
            params,
        ),
        "paint-resources" | "map-stamp" => {
            crate::paint_resources::dispatch(session, store, catalogs, method, &params)
        }
        "special-art" if method == "special-art.preview" => {
            crate::special_land_artwork::preview(session, store, catalogs, &params)
        }
        "special-art" if method == "special-art.uses" => {
            crate::special_land_artwork::uses(session, &params)
        }
        "level-settings" => {
            crate::level_settings::dispatch(session, store, catalogs, method, &params)
        }
        "tile-behavior" => {
            crate::tile_behavior::dispatch(session, store, catalogs, method, &params)
        }
        "custom-landlook" => {
            crate::custom_landlook::dispatch(session, store, catalogs, method, &params)
        }
        "random-region" => crate::random_regions::dispatch(session, catalogs, method, &params),
        _ => Err(format!("unknown method {method}")),
    }
}

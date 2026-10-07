use crate::{
    catalogs::CatalogViews,
    request_params::{required_string, required_u64},
};
use base64::{Engine as _, engine::general_purpose::STANDARD};
use providence_core::{
    model::*,
    session::EditorSession,
    terrain_joining::{self, AtlasEvidence},
};
use providence_storage::ProjectStore;
use serde_json::{Value, json};
use std::{
    collections::VecDeque,
    sync::{Mutex, OnceLock},
};

type Fingerprints = Vec<String>;
static CACHE: OnceLock<Mutex<VecDeque<(BlobId, Fingerprints)>>> = OnceLock::new();

pub(crate) fn evidence(projection: &Value) -> Result<AtlasEvidence, String> {
    if projection["available"] != true || projection["renderMode"] != "outdoor-landlook" {
        return Err(projection["reason"]
            .as_str()
            .unwrap_or("The outdoor atlas is unavailable.")
            .into());
    }
    let blob: BlobId =
        serde_json::from_value(projection["blob"].clone()).map_err(|error| error.to_string())?;
    let cache = CACHE.get_or_init(|| Mutex::new(VecDeque::new()));
    let cached = cache
        .lock()
        .map_err(|_| "Terrain atlas cache is unavailable.")?
        .iter()
        .find(|(key, _)| key == &blob)
        .map(|(_, tiles)| tiles.clone());
    let tile_fingerprints = match cached {
        Some(tiles) => tiles,
        None => {
            let bytes = STANDARD
                .decode(
                    projection["base64"]
                        .as_str()
                        .ok_or("Atlas pixels are unavailable.")?,
                )
                .map_err(|error| error.to_string())?;
            let image = crate::personal_image::decode(&bytes)?;
            let tiles = terrain_joining::fingerprint_rgba(&image.rgba, image.width, image.height)?;
            let mut cache = cache
                .lock()
                .map_err(|_| "Terrain atlas cache is unavailable.")?;
            cache.push_front((blob.clone(), tiles.clone()));
            cache.truncate(8);
            tiles
        }
    };
    Ok(AtlasEvidence {
        tileset_id: StableId(required_string(projection, "tilesetId")?),
        asset_identity: StableId(required_string(projection, "assetIdentity")?),
        blob,
        scenario_owned: projection["sourceRole"] == "scenario-override",
        tile_fingerprints,
    })
}

pub(crate) fn dispatch(
    session: &mut EditorSession,
    store: Option<&ProjectStore>,
    catalogs: CatalogViews<'_>,
    method: &str,
    params: &Value,
) -> Result<Value, String> {
    if required_u64(params, "expectedRevision")? != session.revision().0 {
        return Err("The map changed before its terrain mapping loaded.".into());
    }
    if method == "smart-terrain.reshape" {
        return crate::smart_terrain::dispatch(session, method, params);
    }
    let identity = StableId(required_string(params, "identity")?);
    let map = providence_core::map_paint::land_map(session.snapshot(), &identity)
        .map_err(|error| error.to_string())?;
    let projection = crate::map_rendering::resolve_map_atlas(
        session,
        store,
        catalogs.application_media,
        catalogs.application_media_store,
        map,
    )?;
    let resolved = evidence(&projection);
    if method.starts_with("magic-brush.") {
        return crate::magic_brush::dispatch(session, method, params, &resolved?);
    }
    if method.starts_with("terrain-mapping.") {
        return crate::terrain_mapping::dispatch(session, method, params, &resolved?);
    }
    if method == "map.tile-catalog" {
        return Ok(crate::land_tile_catalog::project_resolved(
            session,
            map,
            resolved.as_ref().ok(),
        ));
    }
    if method == "smart-terrain.open"
        && let Err(reason) = &resolved
    {
        return Ok(
            json!({"revision":session.revision(),"mapIdentity":identity,"available":false,
            "unavailableReason":reason,"presets":[]}),
        );
    }
    crate::smart_terrain::dispatch_mapped(session, method, params, Some(&resolved?))
}

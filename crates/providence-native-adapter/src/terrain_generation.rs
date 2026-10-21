//! Exact native terrain previews and guarded application; worker lifetime is connection-owned.
use crate::{
    catalogs::CatalogViews,
    request_params::{required_string, required_u64, required_value},
};
use providence_core::{
    model::*,
    session::{EditorCommand, EditorSession},
    terrain_generation::{self as core, Intent, Plan},
    terrain_joining::AtlasEvidence,
};
use providence_storage::ProjectStore;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};

pub(crate) mod jobs;
#[cfg(test)]
mod tests;

pub(crate) fn atlas(
    session: &EditorSession,
    store: Option<&ProjectStore>,
    catalogs: CatalogViews<'_>,
    params: &Value,
) -> Result<AtlasEvidence, String> {
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
    crate::terrain_atlas::evidence(&projection)
}

pub(crate) fn check_revision(session: &EditorSession, params: &Value) -> Result<(), String> {
    if required_u64(params, "expectedRevision")? != session.revision().0 {
        return Err("The map changed. Generate and review the terrain again.".into());
    }
    Ok(())
}

pub(crate) fn intent(params: &Value) -> Result<Intent, String> {
    serde_json::from_value(required_value(params, "intent")?.clone())
        .map_err(|error| error.to_string())
}

pub(crate) fn dispatch(
    session: &mut EditorSession,
    store: Option<&ProjectStore>,
    catalogs: CatalogViews<'_>,
    method: &str,
    params: &Value,
) -> Result<Value, String> {
    check_revision(session, params)?;
    let identity = StableId(required_string(params, "identity")?);
    if method == "map-connectivity.preview" {
        let connections = serde_json::from_value::<
            Vec<providence_core::map_connectivity::Connection>,
        >(required_value(params, "connections")?.clone())
        .map_err(|error| error.to_string())?;
        let routes =
            providence_core::map_connectivity::preview(session.snapshot(), &identity, &connections)
                .map_err(|error| error.to_string())?;
        return Ok(json!({"revision":session.revision(),"mapIdentity":identity,"routes":routes}));
    }
    let resolved = atlas(session, store, catalogs, params);
    if method == "terrain-generation.open" {
        return open(session, params, resolved);
    }
    generate(session, method, params, resolved?)
}

fn generate(
    session: &mut EditorSession,
    method: &str,
    params: &Value,
    atlas: AtlasEvidence,
) -> Result<Value, String> {
    check_revision(session, params)?;
    let identity = StableId(required_string(params, "identity")?);
    let intent = intent(params)?;
    let plan = core::preview(session.snapshot(), &identity, &intent, &atlas, &mut || {
        false
    })
    .map_err(|error| error.to_string())?;
    let mut result = project(
        session.revision().0,
        &session.snapshot().project_id,
        &identity,
        &plan,
    )?;
    if method == "terrain-generation.apply" {
        let hash = required_string(params, "reviewHash")?;
        if result["reviewHash"] != hash || plan.outcome != core::Outcome::Success {
            return Err(
                "The generated preview is stale or failed. Generate and review it again.".into(),
            );
        }
        let paint = core::reviewed_paint(
            session.snapshot(),
            &core::Apply {
                identity: identity.clone(),
                intent,
                atlas,
                review_hash: plan.review_hash.clone(),
            },
        )
        .map_err(|error| error.to_string())?;
        let applied = crate::execute(
            session,
            params,
            EditorCommand::PaintLandTerrain { identity, paint },
        )?;
        for (key, value) in applied
            .as_object()
            .ok_or("Missing terrain application result")?
        {
            result[key] = value.clone();
        }
    } else if method != "terrain-generation.preview" {
        return Err(format!("Unknown terrain method {method}"));
    }
    Ok(result)
}

pub(crate) fn project(
    revision: u64,
    project: &StableId,
    identity: &StableId,
    plan: &Plan,
) -> Result<Value, String> {
    let mut result = serde_json::to_value(plan).map_err(|error| error.to_string())?;
    result["revision"] = json!(revision);
    result["mapIdentity"] = json!(identity);
    result["reviewHash"] = json!(format!(
        "{:x}",
        Sha256::digest(
            serde_json::to_vec(&(project, revision, &plan.review_hash))
                .map_err(|error| error.to_string())?
        )
    ));
    result["canApply"] =
        json!(plan.outcome == core::Outcome::Success && !plan.painted_cells.is_empty());
    result["terrainCells"] = json!(plan.painted_cells);
    Ok(result)
}

fn open(
    session: &mut EditorSession,
    params: &Value,
    atlas: Result<AtlasEvidence, String>,
) -> Result<Value, String> {
    let atlas = match atlas {
        Ok(atlas) => atlas,
        Err(reason) => {
            return Ok(json!({"revision":session.revision(),"available":false,
            "unavailableReason":reason,"presets":[]}));
        }
    };
    let mut result =
        crate::smart_terrain::dispatch_mapped(session, "smart-terrain.open", params, Some(&atlas))?;
    if let Some(mapping) = providence_core::terrain_mapping::current(session.snapshot(), &atlas) {
        for preset in result["presets"].as_array_mut().unwrap() {
            if let Some(name) = preset["identity"]
                .as_str()
                .and_then(|id| mapping.category_labels.get(id))
            {
                preset["name"] = json!(name);
            }
        }
    }
    let identity = StableId(required_string(params, "identity")?);
    let map = providence_core::map_paint::land_map(session.snapshot(), &identity)
        .map_err(|error| error.to_string())?;
    let base = map.runtime.as_ref().and_then(|runtime| runtime.base_tile);
    if !base.is_some_and(|tile| (1..=200).contains(&tile)) {
        result["available"] = json!(false);
        result["unavailableReason"] =
            json!("Set this map's base ground before generating terrain.");
    }
    result["tilesetId"] = json!(atlas.tileset_id);
    result["algorithmVersion"] = json!(core::ALGORITHM_VERSION);
    result["densities"] = json!(["sparse", "balanced", "dense"]);
    result["maximumConnections"] = json!(32);
    Ok(result)
}

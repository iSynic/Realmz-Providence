use crate::request_params::{required_string, required_value};
use providence_core::{
    model::StableId,
    session::{EditorCommand, EditorSession},
    terrain_joining::{self, AtlasEvidence},
    terrain_mapping::{self, MappingEdit},
};
use serde_json::{Value, json};

pub(crate) fn dispatch(
    session: &mut EditorSession,
    method: &str,
    params: &Value,
    atlas: &AtlasEvidence,
) -> Result<Value, String> {
    let identity = StableId(required_string(params, "identity")?);
    if method == "terrain-mapping.accept" {
        if required_string(params, "atlasBlob")? != atlas.blob.0 {
            return Err("The artwork changed. Review this mapping again.".into());
        }
        let edit: MappingEdit = serde_json::from_value(required_value(params, "edit")?.clone())
            .map_err(|e| format!("Invalid terrain mapping: {e}"))?;
        return crate::execute(
            session,
            params,
            EditorCommand::AcceptTerrainMapping(terrain_mapping::Acceptance {
                identity,
                edit,
                atlas: atlas.clone(),
            }),
        );
    }
    if !matches!(method, "terrain-mapping.open" | "terrain-mapping.review") {
        return Err(format!("unknown method {method}"));
    }
    let map = providence_core::map_paint::land_map(session.snapshot(), &identity)
        .map_err(|e| e.to_string())?;
    let current = terrain_mapping::current(session.snapshot(), atlas);
    let requested = params
        .get("layoutIdentity")
        .and_then(Value::as_str)
        .or_else(|| current.map(|m| m.layout_identity.as_str()))
        .unwrap_or("classic-plains");
    let layout = terrain_joining::layouts()
        .iter()
        .find(|layout| layout.identity == requested)
        .ok_or("Choose an available terrain layout.")?;
    let families:Vec<_>=["water","mountains","forest"].into_iter().map(|family| {
        let tiles=terrain_joining::family_tiles(family);
        let exact=tiles.iter().all(|tile|atlas.tile_fingerprints[*tile-1]==layout.tile_fingerprints[*tile-1]);
        json!({"identity":family,"exact":exact,"state":if !layout.joining_enabled {"unavailable"} else if exact {"exact"} else {"review-required"},
            "tileIds":tiles,"reason":if !layout.joining_enabled {"This layout has no reviewed joining geometry."} else if exact {"These family tiles exactly match the stock layout."} else {"Inspect the joins using this artwork before accepting this family."}})
    }).collect();
    Ok(
        json!({"revision":session.revision(),"mapIdentity":identity,"atlasBlob":atlas.blob,
        "tilesetId":atlas.tileset_id,"assetIdentity":atlas.asset_identity,"scenarioOwned":atlas.scenario_owned,
        "mappingRevision":terrain_mapping::revision(session.snapshot(),&atlas.tileset_id),"current":current,
        "layoutIdentity":layout.identity,"layoutRevision":layout.revision,"families":families,
        "samples":if layout.joining_enabled { terrain_joining::mapping_samples() } else { &[] },
        "layouts":terrain_joining::layouts().iter().map(|layout|json!({"identity":layout.identity,"revision":layout.revision,"name":layout.name,"joiningEnabled":layout.joining_enabled})).collect::<Vec<_>>(),
        "tileCatalog":crate::land_tile_catalog::project_resolved(session,map,Some(atlas))}),
    )
}

pub(crate) fn labels(
    snapshot: &providence_core::model::ProjectSnapshot,
    atlas: &AtlasEvidence,
    tile: i16,
    row: &mut Value,
) {
    let Some(mapping) = terrain_mapping::current(snapshot, atlas) else {
        return;
    };
    if mapping.accepted_tile_fingerprints.get(tile as usize - 1)
        != atlas.tile_fingerprints.get(tile as usize - 1)
    {
        return;
    }
    if let Some(label) = mapping.tile_labels.get(&tile) {
        if let Some(name) = &label.name {
            row["name"] = json!(name);
        }
        if let Some(material) = &label.material {
            row["material"] = json!(material);
        }
    }
    if let Some(name) = row["category"]
        .as_str()
        .and_then(|category| mapping.category_labels.get(category))
    {
        row["categoryLabel"] = json!(name);
    }
    row["excludedFromJoining"] = json!(mapping.excluded_tiles.contains(&tile));
}

use crate::request_params::{required_string, required_u64};
use providence_core::{
    land_tile_catalog::semantics,
    model::{LevelType, MapLevel, StableId},
    session::EditorSession,
};
use serde_json::{Value, json};

pub(crate) fn read(session: &EditorSession, params: &Value) -> Result<Value, String> {
    if required_u64(params, "expectedRevision")? != session.revision().0 {
        return Err("The map changed before its tile catalog loaded.".into());
    }
    let identity = StableId(required_string(params, "identity")?);
    let map = session
        .snapshot()
        .world
        .maps
        .iter()
        .find(|map| map.identity == identity)
        .ok_or("This map no longer exists.")?;
    if map.level_type != LevelType::Land {
        return Err("Choose a Land map to browse terrain tiles.".into());
    }
    if map.runtime.is_none() {
        return Err("This map has no artwork context.".into());
    }
    Ok(project(session, map))
}

pub(crate) fn project(session: &EditorSession, map: &MapLevel) -> Value {
    project_catalog(session, map, None, true)
}

pub(crate) fn project_resolved(
    session: &EditorSession,
    map: &MapLevel,
    atlas: Option<&providence_core::terrain_joining::AtlasEvidence>,
) -> Value {
    project_catalog(session, map, atlas, false)
}

fn project_catalog(
    session: &EditorSession,
    map: &MapLevel,
    atlas: Option<&providence_core::terrain_joining::AtlasEvidence>,
    stock_fallback: bool,
) -> Value {
    let Some(runtime) = map
        .runtime
        .as_ref()
        .filter(|_| map.level_type == LevelType::Land)
    else {
        return json!({});
    };
    let mut categories = std::collections::BTreeMap::new();
    let items: Vec<_> = (1..=200).map(|tile| {
        let info = match atlas {
            Some(atlas) => providence_core::terrain_mapping::semantics(session.snapshot(),atlas,tile,runtime.landlook),
            None if stock_fallback => runtime.landlook.and_then(|look| semantics(look, tile)),
            None => None,
        };
        let (name, category, label, confidence) = match info {
            Some(info) => (info.name.to_string(), serde_json::to_value(info.category).unwrap(), info.category_label, info.confidence),
            None => (format!("Tile {tile}"), json!("unclassified"), "Unclassified", "uncertain"),
        };
        let connections: Vec<_> = info.map_or("", |entry| entry.connections).split(',').filter(|direction| !direction.is_empty()).collect();
        let mut row = json!({"tile":tile,"name":name,"category":category,"categoryLabel":label,"confidence":confidence,
            "shapeDescription":info.map_or("", |entry| entry.notes),"connections":connections});
        if let Some(atlas)=atlas { crate::terrain_mapping::labels(session.snapshot(),atlas,tile,&mut row); }
        categories.insert(row["category"].as_str().unwrap().to_owned(),row["categoryLabel"].as_str().unwrap().to_owned());
        row
    }).collect();
    let categories: Vec<_> = categories
        .into_iter()
        .map(|(identity, name)| json!({"identity":identity,"name":name}))
        .collect();
    let families: Vec<_> = ["water","mountains","forest"].into_iter().map(|family| {
        let layout = atlas.and_then(|atlas| providence_core::terrain_mapping::family_layout(session.snapshot(),atlas,family,runtime.landlook));
        json!({"identity":family,"available":layout.is_some(),"profileIdentity":layout.map(|layout| &layout.identity),
            "profileRevision":layout.map(|layout| layout.revision),
            "unavailableReason":layout.is_none().then_some("This family needs verified artwork and a reviewed mapping.")})
    }).collect();
    json!({"revision":session.revision(),"mapIdentity":map.identity,"tilesetId":runtime.tileset_id,
        "atlasBlob":atlas.map(|atlas| &atlas.blob),"mappingRevision":providence_core::terrain_mapping::revision(session.snapshot(),&runtime.tileset_id),"familyAvailability":families,
        "landlook":runtime.landlook,"items":items,"categories":categories})
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::dispatch_result;
    use providence_core::model::ProjectSnapshot;

    #[test]
    fn catalog_is_bounded_pure_and_does_not_label_custom_tiles_as_stock() {
        let mut session = EditorSession::new(ProjectSnapshot::new_authored(StableId(
            "tile-catalog".into(),
        )));
        dispatch_result(
            &mut session,
            "map.create",
            json!({"expectedRevision":0,"levelType":"land"}),
        )
        .unwrap();
        let original = session.snapshot().clone();
        let result = dispatch_result(
            &mut session,
            "map.tile-catalog",
            json!({"expectedRevision":1,"identity":"land:0"}),
        )
        .unwrap();
        assert_eq!(result["items"].as_array().unwrap().len(), 200);
        assert_eq!(result["items"][150]["name"], "Tree detail");
        let opened =
            dispatch_result(&mut session, "map.open", json!({"identity":"land:0"})).unwrap();
        assert_eq!(opened["tileCatalog"], result);
        assert!(result.get("snapshot").is_none());
        assert_eq!(session.snapshot(), &original);
        assert!(read(&session, &json!({"expectedRevision":0,"identity":"land:0"})).is_err());
        let mut custom = original;
        custom.world.maps[0].runtime.as_mut().unwrap().landlook = Some(6);
        let session = EditorSession::new(custom);
        let result = read(&session, &json!({"expectedRevision":0,"identity":"land:0"})).unwrap();
        assert_eq!(result["items"][150]["name"], "Tile 151");
        assert_eq!(result["items"][150]["category"], "unclassified");
    }
}

use super::*;
use providence_core::{model::LevelType, paint_resources::PaintResources};

pub(super) fn read(
    session: &EditorSession,
    resources: &PaintResources,
    params: &Value,
) -> Result<Value, String> {
    let kind = required_string(params, "kind")?;
    if !matches!(kind.as_str(), "stamp" | "palette") {
        return Err("Choose a stamp or palette.".into());
    }
    let map = crate::paint_resource_catalog::context_map(session, params)
        .ok_or("Choose an existing map before allocating a local paint resource.")?;
    if kind == "palette" && map.level_type != LevelType::Land {
        return Err("Tile palettes require a Land atlas.".into());
    }
    if resources.entries.len() >= providence_core::paint_resources::RESOURCE_LIMIT {
        return Err("The local paint collection is full. Remove an unused resource first.".into());
    }
    let identity = (0..=providence_core::paint_resources::RESOURCE_LIMIT)
        .map(|index| format!("paint:local-{index}"))
        .find(|identity| {
            resources
                .entries
                .iter()
                .all(|entry| entry.identity.0 != *identity)
        })
        .ok_or("No local paint identity remains available.")?;
    let tileset = &map
        .runtime
        .as_ref()
        .ok_or("The map has no authored atlas settings.")?
        .tileset_id;
    Ok(
        json!({"revision":session.revision(),"resourceRevision":resources.revision,"reserved":false,
        "resource":{"identity":identity,"name":if kind == "stamp" {"New stamp"} else {"New palette"},
        "collection":"","kind":kind,"levelType":map.level_type,"tilesetId":tileset,
        "width":1,"height":1,"cells":[{"x":0,"y":0,"tile":1}],"favorite":false}}),
    )
}

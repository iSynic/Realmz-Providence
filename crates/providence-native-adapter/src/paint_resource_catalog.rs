use crate::request_params::required_string;
use providence_core::{
    model::{MapLevel, StableId},
    paint_resources::{PaintResource, PaintResourceKind, PaintResources, builtins},
    session::EditorSession,
};
use serde_json::{Value, json};

struct Entry {
    resource: PaintResource,
    reason: Option<String>,
    built_in: bool,
    recent: Option<usize>,
}

pub(crate) fn read(
    session: &EditorSession,
    resources: &PaintResources,
    application: Option<&providence_core::rebuilt::ApplicationMediaCatalog>,
    atlas: Option<&providence_core::terrain_joining::AtlasEvidence>,
    method: &str,
    params: &Value,
) -> Result<Value, String> {
    let map = context_map(session, params);
    let mut entries = entries(session, resources, map, atlas);
    for entry in &mut entries {
        if entry.reason.is_none() {
            entry.reason = entry
                .resource
                .cells
                .iter()
                .filter(|cell| cell.tile < 0)
                .find_map(|cell| {
                    providence_core::special_land_artwork::resolve(
                        session.snapshot(),
                        application,
                        cell.tile,
                    )
                    .err()
                });
        }
    }
    if method == "paint-resources.open" {
        let identity = StableId(required_string(params, "resourceIdentity")?);
        let entry = entries
            .into_iter()
            .find(|entry| entry.resource.identity == identity)
            .ok_or("The resource no longer exists.")?;
        return Ok(
            json!({"revision":session.revision(),"resourceRevision":resources.revision,"resource":entry.resource,
            "ownership":if entry.built_in {"built-in"} else {"local"},"availabilityReason":entry.reason,"renderCells":render_resource_cells(&entry.resource)}),
        );
    }
    list(session, resources.revision, entries, params)
}

fn entries(
    session: &EditorSession,
    resources: &PaintResources,
    map: Option<&MapLevel>,
    atlas: Option<&providence_core::terrain_joining::AtlasEvidence>,
) -> Vec<Entry> {
    let mut result = resources
        .entries
        .iter()
        .map(|resource| {
            let reason = match map {
                None => Some("Choose a map to check this resource's availability.".into()),
                Some(map)
                    if map.level_type != resource.level_type
                        || map
                            .runtime
                            .as_ref()
                            .is_none_or(|runtime| runtime.tileset_id != resource.tileset_id) =>
                {
                    Some("This resource uses another map kind or atlas.".into())
                }
                _ => None,
            };
            Entry {
                resource: resource.clone(),
                reason,
                built_in: false,
                recent: resources
                    .recent
                    .iter()
                    .position(|id| *id == resource.identity),
            }
        })
        .collect::<Vec<_>>();
    if let Some(map) = map {
        result.extend(
            builtins::catalog_mapped(session.snapshot(), map, atlas)
                .into_iter()
                .map(|entry| Entry {
                    resource: entry.resource,
                    reason: entry.availability_reason,
                    built_in: true,
                    recent: None,
                }),
        );
    }
    result
}

fn list(
    session: &EditorSession,
    resource_revision: u64,
    entries: Vec<Entry>,
    params: &Value,
) -> Result<Value, String> {
    let offset = params.get("offset").and_then(Value::as_u64).unwrap_or(0) as usize;
    let limit = params
        .get("limit")
        .and_then(Value::as_u64)
        .unwrap_or(64)
        .min(128) as usize;
    if limit == 0 {
        return Err("Use a page size from 1 through 128.".into());
    }
    let query = params
        .get("query")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_lowercase();
    let kind = params.get("kind").and_then(Value::as_str).unwrap_or("");
    let scope = params.get("scope").and_then(Value::as_str).unwrap_or("all");
    if !["all", "favorites", "recent", "local", "built-in"].contains(&scope) {
        return Err("Unknown collection scope.".into());
    }
    let mut filtered = entries
        .into_iter()
        .filter(|entry| matches_entry(entry, &query, kind, scope))
        .collect::<Vec<_>>();
    filtered.sort_by_key(|entry| {
        (
            entry.reason.is_some(),
            if scope == "recent" {
                entry.recent.unwrap_or(usize::MAX)
            } else {
                usize::from(entry.built_in)
            },
        )
    });
    let items = filtered
        .iter()
        .skip(offset)
        .take(limit)
        .map(summary)
        .collect::<Vec<_>>();
    Ok(
        json!({"revision":session.revision(), "resourceRevision":resource_revision,"total":filtered.len(),
        "nextOffset":(offset + items.len() < filtered.len()).then_some(offset + items.len()),"items":items,"scope":"project-local"}),
    )
}

fn matches_entry(entry: &Entry, query: &str, kind: &str, scope: &str) -> bool {
    let resource = &entry.resource;
    let kind_matches = kind.is_empty()
        || match resource.kind {
            PaintResourceKind::Stamp => kind == "stamp",
            PaintResourceKind::Palette => kind == "palette",
        };
    let scope_matches = match scope {
        "favorites" => resource.favorite,
        "recent" => entry.recent.is_some(),
        "local" => !entry.built_in,
        "built-in" => entry.built_in,
        _ => true,
    };
    kind_matches
        && scope_matches
        && format!(
            "{} {} {}",
            resource.name, resource.identity.0, resource.collection
        )
        .to_lowercase()
        .contains(query)
}

fn summary(entry: &Entry) -> Value {
    let resource = &entry.resource;
    json!({"identity":resource.identity,"name":resource.name,"collection":resource.collection,"kind":resource.kind,
        "levelType":resource.level_type,"tilesetId":resource.tileset_id,"width":resource.width,"height":resource.height,
        "cellCount":resource.cells.len(),"favorite":resource.favorite,"recentIndex":entry.recent,
        "ownership":if entry.built_in {"built-in"} else {"local"},"availabilityReason":entry.reason})
}

pub(crate) fn render_resource_cells(resource: &PaintResource) -> Vec<Value> {
    if resource.level_type != providence_core::model::LevelType::Dungeon {
        return vec![];
    }
    resource.cells.iter().map(|cell| {
        let (sprites, behaviors) = crate::map_rendering::dungeon_cell_render_layers(cell.tile);
        json!({"x":cell.x,"y":cell.y,"tile":cell.tile,"spriteLayers":sprites,"behaviorOverlays":behaviors})
    }).collect()
}

pub(crate) fn context_map<'a>(session: &'a EditorSession, params: &Value) -> Option<&'a MapLevel> {
    let identity = params.get("identity")?.as_str()?;
    session
        .snapshot()
        .world
        .maps
        .iter()
        .find(|map| map.identity.0 == identity)
}

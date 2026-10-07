//! Native maps requests; decoding and bounded projections stay with this feature.

use crate::execute;
use crate::map_overlays::action_point_overlay_kind;
use crate::map_paint_commands;
use crate::request_params::required_i16;
use crate::request_params::required_string;
use crate::request_params::required_u8;
use crate::request_params::required_value;
use crate::world_route_projections::classic_source_present;
use crate::world_route_projections::map_catalog_item;
use providence_core::codecs::DungeonPrimitive;
use providence_core::codecs::MAP_LEVEL_BYTES;
use providence_core::codecs::decode_dungeon_cell;
use providence_core::model::CLASSIC_MAP_SIZE;
use providence_core::model::LevelType;
use providence_core::model::MapRuntimeMetadata;
use providence_core::model::StableId;
use providence_core::references::TargetKind;
use providence_core::session::EditorCommand;
use providence_core::session::EditorSession;
use serde_json::Value;
use serde_json::json;

pub(super) fn dispatch(
    session: &mut EditorSession,
    method: &str,
    params: Value,
) -> Result<Value, String> {
    match method {
        "map.catalog" => map_catalog(session, params),
        "map.list" => map_list(session, params),
        "map.open" => map_open(session, params),
        "map.tile-catalog" => crate::land_tile_catalog::read(session, &params),
        "map.selection-preview" => crate::map_selection_commands::preview(session, &params),
        "map.paint-options" | "map.preview-intent" | "map.apply-intent" => {
            crate::land_paint_intent::dispatch(session, method, &params)
        }
        "dungeon-cell.open" => dungeon_cell_open(session, params),
        "dungeon-cell.selection"
        | "dungeon-cell.preview-features"
        | "dungeon-cell.apply-features" => {
            crate::dungeon_feature_commands::dispatch(session, method, &params)
        }
        "map.create" => map_create(session, params),
        "map.creation-review" => crate::map_creation::review(session, &params),
        "map.duplicate" => map_duplicate(session, params),
        "map.paint-terrain" | "map.preview-terrain" => {
            map_paint_commands::dispatch(session, method, &params)
        }
        "map.paint-cells" => map_paint_commands::paint_raw_cells(session, &params),
        "map.update-cell" => map_update_cell(session, params),
        "dungeon-cell.update-primitive" => dungeon_cell_update_primitive(session, params),
        "map-runtime.set" => map_runtime_set(session, params),
        _ => Err(format!("unknown method {method}")),
    }
}

struct MapCatalogFilter {
    level_type: String,
    query: String,
}

impl MapCatalogFilter {
    fn from_params(params: &Value) -> Result<Self, String> {
        let level_type = params
            .get("levelType")
            .and_then(Value::as_str)
            .unwrap_or("all")
            .to_owned();
        if !matches!(level_type.as_str(), "all" | "land" | "dungeon") {
            return Err("map levelType must be all, land, or dungeon".into());
        }
        let query = params
            .get("query")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .trim()
            .to_lowercase();
        Ok(Self { level_type, query })
    }

    fn matches(&self, map: &providence_core::model::MapLevel) -> bool {
        (self.level_type == "all"
            || (self.level_type == "land" && map.level_type == LevelType::Land)
            || (self.level_type == "dungeon" && map.level_type == LevelType::Dungeon))
            && (self.query.is_empty()
                || format!("{} {} {}", map.identity.0, map.name, map.native_index)
                    .to_lowercase()
                    .contains(&self.query))
    }
}

fn map_catalog(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    let mut offset = params.get("offset").and_then(Value::as_u64).unwrap_or(0) as usize;
    let limit = params
        .get("limit")
        .and_then(Value::as_u64)
        .unwrap_or(64)
        .clamp(1, 128) as usize;
    let filter = MapCatalogFilter::from_params(&params)?;
    let references = map_references(session, &params)?;
    let diagnostics = map_diagnostics(session, &params)?;
    let maps = session
        .snapshot()
        .world
        .maps
        .iter()
        .filter(|map| filter.matches(map))
        .collect::<Vec<_>>();
    let total = maps.len();
    if params.get("seekCurrent").and_then(Value::as_bool) == Some(true)
        && let Some(current) = params.get("currentIdentity").and_then(Value::as_str)
        && let Some(index) = maps.iter().position(|map| map.identity.0 == current)
    {
        offset = index / limit * limit;
    }
    let items = maps
        .into_iter()
        .skip(offset)
        .take(limit)
        .map(|map| map_catalog_item(session, map, references.as_deref(), diagnostics.as_deref()))
        .collect::<Vec<_>>();
    Ok(json!({
        "revision": session.revision(),
        "items": items,
        "offset": offset,
        "limit": limit,
        "total": total,
        "truncated": offset.saturating_add(limit) < total,
    }))
}

fn map_list(session: &mut EditorSession, _params: Value) -> Result<Value, String> {
    Ok(Value::Array(
        session
            .snapshot()
            .world
            .maps
            .iter()
            .map(|map| {
                json!({
                    "identity": map.identity,
                    "levelType": map.level_type,
                    "nativeIndex": map.native_index,
                    "name": map.name,
                    "width": CLASSIC_MAP_SIZE,
                    "height": CLASSIC_MAP_SIZE,
                })
            })
            .collect(),
    ))
}

fn map_open(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    let identity = required_string(&params, "identity")?;
    let map = session
        .snapshot()
        .world
        .maps
        .iter()
        .find(|map| map.identity.0 == identity)
        .ok_or_else(|| format!("map {identity} was not found"))?;
    let action_points = session
        .snapshot()
        .world
        .action_points
        .iter()
        .filter(|action_point| {
            action_point.level_type == map.level_type
                && action_point.level_index == map.native_index
                && action_point.coordinate.is_some()
        })
        .map(|action_point| {
            let mut projection = json!(action_point);
            projection["overlayKind"] = json!(action_point_overlay_kind(&action_point.actions));
            projection
        })
        .collect::<Vec<_>>();
    let references = map_references(session, &params)?;
    let diagnostics = map_diagnostics(session, &params)?;
    Ok(json!({
        "revision": session.revision(),
        "map": map,
        "width": CLASSIC_MAP_SIZE,
        "terrainTiles": map_paint_commands::terrain_tiles(map),
        "tileCatalog": crate::land_tile_catalog::project(session, map),
        "losBlockers": providence_core::map_editor_preview::blocking_cells(session.snapshot(), map),
        "viewOverlays": providence_core::map_view_overlays::project(session.snapshot(), map),
        "height": CLASSIC_MAP_SIZE,
        "sourcePresent": classic_source_present(session.snapshot(), if map.level_type == LevelType::Land { "Data LD" } else { "Data DL" }),
        "editability": "editable",
        "referenceSummary": {
            "outgoing": references.as_ref().map(|rows| rows.iter().filter(|reference| reference.source == map.identity).count()),
            "usedBy": references.as_ref().map(|rows| rows.iter().filter(|reference| reference.target_kind == TargetKind::Map && reference.target_id == map.identity.0).count()),
        },
        "referencesChecked": references.is_some(),
        "diagnosticCount": diagnostics.as_ref().map(|rows| rows.iter().filter(|diagnostic| diagnostic.entity.as_ref() == Some(&map.identity)).count()),
        "diagnosticsChecked": diagnostics.is_some(),
        "actionPoints": action_points,
    }))
}

fn map_references(
    session: &EditorSession,
    params: &Value,
) -> Result<Option<Vec<providence_core::references::ReferenceDescriptor>>, String> {
    Ok(if include_projection(params, "includeReferences")? {
        Some(session.references())
    } else {
        session.cached_references().map(<[_]>::to_vec)
    })
}

fn include_projection(params: &Value, name: &str) -> Result<bool, String> {
    params.get(name).map_or(Ok(true), |value| {
        value
            .as_bool()
            .ok_or_else(|| format!("{name} must be a Boolean"))
    })
}

fn map_diagnostics(
    session: &EditorSession,
    params: &Value,
) -> Result<Option<Vec<providence_core::validation::Diagnostic>>, String> {
    let include = include_projection(params, "includeDiagnostics")?;
    Ok(if include {
        Some(session.diagnostics())
    } else {
        session.cached_diagnostics().map(<[_]>::to_vec)
    })
}

fn dungeon_cell_open(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    let identity = StableId(required_string(&params, "identity")?);
    let x = required_u8(&params, "x")?;
    let y = required_u8(&params, "y")?;
    if usize::from(x) >= CLASSIC_MAP_SIZE || usize::from(y) >= CLASSIC_MAP_SIZE {
        return Err(format!("map coordinate ({x},{y}) is outside 90 by 90"));
    }
    let map = session
        .snapshot()
        .world
        .maps
        .iter()
        .find(|map| map.identity == identity)
        .ok_or_else(|| format!("map {} was not found", identity.0))?;
    if map.level_type != LevelType::Dungeon {
        return Err(format!("map {} is not a Dungeon map", identity.0));
    }
    let cell_index = usize::from(y) * CLASSIC_MAP_SIZE + usize::from(x);
    let byte_start = map.native_index as usize * MAP_LEVEL_BYTES + cell_index * 2;
    let profile = decode_dungeon_cell(map.tiles[cell_index]);
    let primitive_policies = DungeonPrimitive::ALL
        .into_iter()
        .map(|primitive| {
            json!({
                "primitive": primitive,
                "writerStatus": primitive.writer_status(),
                "enabled": profile.raw_mask & primitive.mask() != 0,
            })
        })
        .collect::<Vec<_>>();
    Ok(json!({
        "revision": session.revision(),
        "mapIdentity": map.identity,
        "x": x,
        "y": y,
        "profile": profile,
        "primitivePolicies": primitive_policies,
        "byteProvenance": {
            "nativePath": "Data DL",
            "byteStart": byte_start,
            "byteEnd": byte_start + 2,
        },
    }))
}

fn map_create(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    let level_type: LevelType =
        serde_json::from_value(required_value(&params, "levelType")?.clone())
            .map_err(|error| format!("invalid map level type: {error}"))?;
    execute(session, &params, EditorCommand::CreateMap { level_type })
}

fn map_duplicate(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    execute(
        session,
        &params,
        EditorCommand::DuplicateMap {
            source: StableId(required_string(&params, "source")?),
        },
    )
}

fn map_update_cell(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    execute(
        session,
        &params,
        EditorCommand::UpdateLandMapCell {
            identity: StableId(required_string(&params, "identity")?),
            x: required_u8(&params, "x")?,
            y: required_u8(&params, "y")?,
            tile: required_i16(&params, "tile")?,
        },
    )
}

fn dungeon_cell_update_primitive(
    session: &mut EditorSession,
    params: Value,
) -> Result<Value, String> {
    let primitive: DungeonPrimitive =
        serde_json::from_value(required_value(&params, "primitive")?.clone())
            .map_err(|error| format!("invalid dungeon primitive: {error}"))?;
    let enabled = required_value(&params, "enabled")?
        .as_bool()
        .ok_or_else(|| "enabled must be a Boolean".to_string())?;
    execute(
        session,
        &params,
        EditorCommand::UpdateDungeonMapPrimitive {
            identity: StableId(required_string(&params, "identity")?),
            x: required_u8(&params, "x")?,
            y: required_u8(&params, "y")?,
            primitive,
            enabled,
        },
    )
}

fn map_runtime_set(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    let identity = StableId(required_string(&params, "identity")?);
    let metadata = required_value(&params, "metadata")?;
    let metadata: MapRuntimeMetadata = serde_json::from_value(metadata.clone())
        .map_err(|error| format!("invalid map runtime metadata: {error}"))?;
    execute(
        session,
        &params,
        EditorCommand::SetMapRuntimeMetadata {
            identity,
            metadata: Box::new(metadata),
        },
    )
}

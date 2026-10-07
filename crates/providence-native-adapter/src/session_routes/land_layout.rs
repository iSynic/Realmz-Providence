//! Native land layout requests; decoding and bounded projections stay with this feature.

use crate::execute;
use crate::request_params::required_u8;
use crate::request_params::required_u64;
use crate::request_params::required_value;
use crate::world_route_projections::classic_source_present;
use providence_core::codecs::LAND_LAYOUT_COLUMNS;
use providence_core::codecs::LAND_LAYOUT_ROWS;
use providence_core::model::LevelType;
use providence_core::model::StableId;
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
        "land-layout.open" => land_layout_open(session, params),
        "land-layout.set-cell" => land_layout_set_cell(session, params),
        "land-layout.preview-cell" | "land-layout.apply-cell" => {
            reviewed_layout_cell(session, method, params)
        }
        "land-layout.remove" => execute(session, &params, EditorCommand::RemoveLandLayout),
        _ => Err(format!("unknown method {method}")),
    }
}

fn land_layout_open(session: &mut EditorSession, _params: Value) -> Result<Value, String> {
    let identity = StableId("land-layout".into());
    let references = session
        .references()
        .into_iter()
        .filter(|reference| reference.source == identity)
        .collect::<Vec<_>>();
    let diagnostics = session
        .diagnostics()
        .into_iter()
        .filter(|diagnostic| diagnostic.entity.as_ref() == Some(&identity))
        .collect::<Vec<_>>();
    let land_maps = session
        .snapshot()
        .world
        .maps
        .iter()
        .filter(|map| map.level_type == LevelType::Land)
        .map(|map| {
            json!({
                "identity": map.identity,
                "nativeIndex": map.native_index,
                "name": map.name,
            })
        })
        .collect::<Vec<_>>();
    Ok(json!({
        "revision": session.revision(),
        "rows": LAND_LAYOUT_ROWS,
        "columns": LAND_LAYOUT_COLUMNS,
        "sourcePresent": classic_source_present(session.snapshot(), "Data LL"),
        "editability": "editable",
        "referenceSummary": { "outgoing": references.len(), "usedBy": 0 },
        "diagnosticCount": diagnostics.len(),
        "layout": session.snapshot().world.land_layout,
        "landMaps": land_maps,
        "references": references,
        "diagnostics": diagnostics,
    }))
}

fn land_layout_set_cell(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    let target = layout_target(&params)?;
    execute(
        session,
        &params,
        EditorCommand::SetLandLayoutCell {
            row: required_u8(&params, "row")?,
            column: required_u8(&params, "column")?,
            target,
        },
    )
}

fn layout_target(params: &Value) -> Result<Option<StableId>, String> {
    match required_value(params, "target")? {
        Value::Null => Ok(None),
        Value::String(identity) => Ok(Some(StableId(identity.clone()))),
        _ => Err("target must be a map identity or null".into()),
    }
}

fn reviewed_layout_cell(
    session: &mut EditorSession,
    method: &str,
    params: Value,
) -> Result<Value, String> {
    if required_u64(&params, "expectedRevision")? != session.revision().0 {
        return Err(
            "The layout revision changed. Review the placement again before applying.".into(),
        );
    }
    let preview = providence_core::land_layout_edit::preview_layout_placement(
        session.snapshot(),
        required_u8(&params, "row")?,
        required_u8(&params, "column")?,
        layout_target(&params)?.as_ref(),
    )
    .map_err(|error| error.to_string())?;
    if method == "land-layout.preview-cell" {
        return Ok(
            json!({"revision":session.revision(),"canApply":!preview.changes.is_empty(),"placement":preview}),
        );
    }
    if preview.changes.is_empty() {
        return Err("This layout cell already matches. No changes were applied.".into());
    }
    let mut result = land_layout_set_cell(session, params)?;
    result["layoutChanges"] = json!(preview.changes);
    Ok(result)
}

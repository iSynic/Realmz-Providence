//! Bounded map facts for native clients; no route or runtime eligibility is inferred.
use crate::request_params::{required_string, required_u64};
use providence_core::{
    model::{CLASSIC_MAP_SIZE, StableId},
    session::EditorSession,
};
use serde_json::{Value, json};

pub(crate) fn read(session: &EditorSession, params: &Value) -> Result<Value, String> {
    let identity = StableId(required_string(params, "identity")?);
    let x = coordinate(params, "x")?;
    let y = coordinate(params, "y")?;
    let width = coordinate(params, "width")?;
    let height = coordinate(params, "height")?;
    if width == 0
        || height == 0
        || width > 32
        || height > 32
        || x.checked_add(width).is_none_or(|n| n > CLASSIC_MAP_SIZE)
        || y.checked_add(height).is_none_or(|n| n > CLASSIC_MAP_SIZE)
    {
        return Err("map region must be 1–32 cells per side and inside the 90×90 map".into());
    }
    let map = session
        .snapshot()
        .world
        .maps
        .iter()
        .find(|m| m.identity == identity)
        .ok_or("map is unavailable")?;
    let cells = (y..y + height)
        .flat_map(|yy| {
            (x..x + width).map(
                move |xx| json!({"x":xx,"y":yy,"nativeWord":map.tiles.get(yy*CLASSIC_MAP_SIZE+xx)}),
            )
        })
        .collect::<Vec<_>>();
    let aps = session
        .snapshot()
        .world
        .action_points
        .iter()
        .filter(|ap| {
            ap.level_type == map.level_type
                && ap.level_index == map.native_index
                && ap.coordinate.as_ref().is_some_and(|cell| {
                    usize::from(cell.x) >= x
                        && usize::from(cell.x) < x + width
                        && usize::from(cell.y) >= y
                        && usize::from(cell.y) < y + height
                })
        })
        .map(|ap| {
            json!({"identity":ap.identity,"coordinate":ap.coordinate,
        "activation":providence_core::action_point_activation::project(session.snapshot(),ap)})
        })
        .collect::<Vec<_>>();
    Ok(
        json!({"revision":session.revision(),"identity":identity,"levelType":map.level_type,"nativeIndex":map.native_index,"x":x,"y":y,"width":width,"height":height,"cells":cells,"actionPoints":aps}),
    )
}
fn coordinate(params: &Value, key: &str) -> Result<usize, String> {
    usize::try_from(required_u64(params, key)?)
        .map_err(|_| format!("{key} exceeds the supported coordinate range"))
}

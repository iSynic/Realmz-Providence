use crate::{
    catalogs::CatalogViews,
    request_params::{coerce_integral_numbers, required_u64, required_value},
};
use providence_core::{battle_catalog, session::EditorSession};
use serde_json::{Value, json};

pub(crate) fn dispatch(
    session: &EditorSession,
    _catalogs: CatalogViews<'_>,
    method: &str,
    params: &Value,
) -> Result<Value, String> {
    if required_u64(params, "expectedRevision")? != session.revision().0 {
        return Err("The originating Battle project changed. Reopen this picker.".into());
    }
    let query = coerce_integral_numbers(required_value(params, "query")?.clone());
    let page = match method {
        "battle-reference.list" => serde_json::to_value(battle_catalog::references(
            session.snapshot(),
            &serde_json::from_value(query)
                .map_err(|error| format!("Invalid Battle reference query: {error}"))?,
        )?),
        "battle-monster.list" => serde_json::to_value(battle_catalog::palette(
            session.snapshot(),
            &serde_json::from_value(query)
                .map_err(|error| format!("Invalid Battle palette query: {error}"))?,
        )?),
        _ => return Err(format!("unknown method {method}")),
    }
    .map_err(|error| error.to_string())?;
    Ok(json!({"revision": session.revision(), "page": page}))
}

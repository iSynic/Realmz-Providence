use crate::{
    catalogs::CatalogViews,
    request_params::{coerce_integral_numbers, required_i16, required_u64, required_value},
};
use providence_core::{
    item_reference_catalog::{ItemReferenceQuery, item_artwork_choice, item_reference_choices},
    model::ItemRuleDefinition,
    session::EditorSession,
};
use serde_json::{Value, json};

pub(crate) fn list(
    session: &EditorSession,
    catalogs: CatalogViews<'_>,
    params: &Value,
) -> Result<Value, String> {
    if required_u64(params, "expectedRevision")? != session.revision().0 {
        return Err(
            "The originating item project changed. Reopen this picker; your draft is kept.".into(),
        );
    }
    let query: ItemReferenceQuery = serde_json::from_value(coerce_integral_numbers(
        required_value(params, "query")?.clone(),
    ))
    .map_err(|error| error.to_string())?;
    let definition: ItemRuleDefinition = serde_json::from_value(coerce_integral_numbers(
        required_value(params, "definition")?.clone(),
    ))
    .map_err(|error| error.to_string())?;
    let stock = catalogs
        .stock_items
        .map_or(&[][..], |stock| stock.definitions.as_slice());
    let page = item_reference_choices(
        session.snapshot(),
        catalogs.application_media,
        stock,
        &definition,
        &query,
    )?;
    Ok(json!({"revision": session.revision(), "page": page}))
}

pub(crate) fn artwork(
    session: &EditorSession,
    catalogs: CatalogViews<'_>,
    params: &Value,
) -> Result<Value, String> {
    let id = required_i16(params, "iconId")?;
    let choice = item_artwork_choice(
        session.snapshot(),
        catalogs.application_media,
        i32::from(id),
    );
    Ok(json!({"revision": session.revision(), "choice": choice}))
}

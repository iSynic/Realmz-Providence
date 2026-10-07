use crate::{
    catalogs::CatalogViews,
    request_params::{coerce_integral_numbers, required_u64, required_value},
};
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
use providence_core::{
    monster_reference_catalog::MonsterReferenceQuery, player_map_references, session::EditorSession,
};
use providence_storage::ProjectStore;
use serde_json::{Value, json};

pub(crate) fn dispatch(
    session: &EditorSession,
    store: Option<&ProjectStore>,
    catalogs: CatalogViews<'_>,
    method: &str,
    params: &Value,
) -> Result<Value, String> {
    if required_u64(params, "expectedRevision")? != session.revision().0 {
        return Err(
            "The Player Map project changed. Reopen this chooser or refresh the draft preview."
                .into(),
        );
    }
    match method {
        "player-map.resources.list" => {
            let query: MonsterReferenceQuery = serde_json::from_value(coerce_integral_numbers(
                required_value(params, "query")?.clone(),
            ))
            .map_err(|error| error.to_string())?;
            Ok(
                json!({"revision":session.revision(),"page":player_map_references::choices(session.snapshot(), catalogs.application_media, &query)?}),
            )
        }
        "player-map.resource.preview" => {
            let field = crate::request_params::required_string(params, "field")?;
            let value = i16::try_from(crate::request_params::required_i64(params, "value")?)
                .map_err(|_| "Resource ID is outside signed-short range.")?;
            preview(session, store, catalogs, &field, value)
        }
        _ => Err(format!("unknown method {method}")),
    }
}

pub(crate) fn preview(
    session: &EditorSession,
    store: Option<&ProjectStore>,
    catalogs: CatalogViews<'_>,
    field: &str,
    value: i16,
) -> Result<Value, String> {
    let choice = player_map_references::choice(
        session.snapshot(),
        catalogs.application_media,
        field,
        value,
    )?;
    if !choice.available {
        return Err(choice.reason);
    }
    let resource = player_map_references::resolve(
        session.snapshot(),
        catalogs.application_media,
        field,
        value,
    )?;
    let asset = resource.asset.ok_or("Exact resource unavailable.")?;
    if asset.byte_length > 2 * 1024 * 1024 {
        return Err("This exact resource exceeds the 2 MiB preview budget.".into());
    }
    let bytes = if resource.ownership == "scenario" {
        store
            .ok_or("Open the portable project to read scenario media.")?
            .read_blob(&asset.blob)
    } else {
        catalogs
            .application_media_store
            .ok_or("Configure the Classic application library to read stock media.")?
            .read_blob(&asset.blob)
    }
    .map_err(|error| error.to_string())?;
    if bytes.len() > 2 * 1024 * 1024 {
        return Err("The resource payload exceeds the preview budget.".into());
    }
    let text = if field == "scrollingText" {
        Some(String::from_utf8(bytes.clone()).map_err(|error| error.to_string())?)
    } else {
        None
    };
    Ok(
        json!({"revision":session.revision(),"choice":choice,"identity":asset.identity,"blob":asset.blob,
        "mimeType":asset.mime_type,"width":asset.width,"height":asset.height,"bytes":bytes.len(),"base64":BASE64.encode(bytes),"text":text}),
    )
}

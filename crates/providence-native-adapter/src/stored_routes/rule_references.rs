use crate::{
    catalogs::CatalogViews,
    request_params::{
        coerce_integral_numbers, required_i64, required_string, required_u64, required_value,
    },
};
use base64::{Engine as _, engine::general_purpose::STANDARD};
use providence_core::{
    monster_reference_catalog::MonsterReferenceQuery,
    rule_reference_catalog::{portrait_choice, rule_choices},
    session::EditorSession,
};
use providence_storage::ProjectStore;
use serde_json::{Value, json};

pub(super) fn dispatch(
    session: &mut EditorSession,
    store: Option<&ProjectStore>,
    catalogs: CatalogViews<'_>,
    method: &str,
    params: &Value,
) -> Result<Value, String> {
    if required_u64(params, "expectedRevision")? != session.revision().0 {
        return Err(
            "The originating rule project changed. Reopen this picker; your draft was retained."
                .into(),
        );
    }
    if method == "rule-reference.list" {
        let query: MonsterReferenceQuery = serde_json::from_value(coerce_integral_numbers(
            required_value(params, "query")?.clone(),
        ))
        .map_err(|e| e.to_string())?;
        let stock = catalogs
            .stock_items
            .map_or(&[][..], |s| s.definitions.as_slice());
        let page = rule_choices(
            session.snapshot(),
            catalogs.application_media,
            stock,
            &query,
        )?;
        return Ok(json!({"revision":session.revision(),"page":page}));
    }
    preview(session, store, catalogs, params)
}

fn preview(
    session: &mut EditorSession,
    store: Option<&ProjectStore>,
    catalogs: CatalogViews<'_>,
    params: &Value,
) -> Result<Value, String> {
    let field = required_string(params, "field")?;
    let value = i32::try_from(required_i64(params, "value")?)
        .map_err(|_| "The stored portrait value is outside its range.")?;
    let choice = portrait_choice(
        session.snapshot(),
        catalogs.application_media,
        &field,
        value,
    )?;
    let mut payloads = Vec::new();
    if choice.available {
        for resource in &choice.resources {
            let identity = resource
                .identity
                .as_ref()
                .ok_or("The exact resource owner is unavailable.")?;
            let payload = if resource.ownership == "scenario" {
                let asset = session
                    .snapshot()
                    .assets
                    .iter()
                    .find(|a| a.identity.0 == *identity)
                    .ok_or("The exact scenario portrait disappeared.")?;
                if asset.byte_length > 4 * 1024 * 1024 {
                    return Err("The portrait exceeds the bounded preview size.".into());
                }
                let bytes = store
                    .ok_or("Open a portable project to preview scenario portraits.")?
                    .read_blob(&asset.blob)
                    .map_err(|e| e.to_string())?;
                if bytes.len() as u64 != asset.byte_length {
                    return Err("The portrait payload does not match its descriptor.".into());
                }
                json!({"identity":identity,"mimeType":asset.mime_type,"base64":STANDARD.encode(bytes)})
            } else {
                super::application::dispatch(
                    session,
                    catalogs,
                    "application-media.preview",
                    json!({"identity":identity}),
                )?
            };
            payloads.push(json!({"resource":resource,"payload":payload}));
        }
    }
    Ok(json!({"revision":session.revision(),"choice":choice,"payloads":payloads}))
}

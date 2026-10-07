//! Spell picker reads share existing exact-owner preview services.
use crate::{
    catalogs::CatalogViews,
    request_params::{coerce_integral_numbers, required_string, required_u64, required_value},
};
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
use providence_core::{
    model::SpellDefinition,
    session::EditorSession,
    spell_reference_catalog::{
        SpellReferenceQuery, spell_reference_choice, spell_reference_choices,
    },
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
            "The originating spell project changed. Reopen the picker; your draft is kept.".into(),
        );
    }
    if method == "spell-reference.list" {
        let query: SpellReferenceQuery = serde_json::from_value(coerce_integral_numbers(
            required_value(params, "query")?.clone(),
        ))
        .map_err(|e| e.to_string())?;
        let definition: SpellDefinition = serde_json::from_value(coerce_integral_numbers(
            required_value(params, "definition")?.clone(),
        ))
        .map_err(|e| e.to_string())?;
        let page = spell_reference_choices(
            session.snapshot(),
            catalogs.application_media,
            &definition,
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
    let value = params
        .get("value")
        .and_then(Value::as_i64)
        .and_then(|v| i32::try_from(v).ok())
        .ok_or("Supply a whole stored spell value.")?;
    let choice = spell_reference_choice(
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
                .as_deref()
                .ok_or("The exact resource identity is unavailable.")?;
            let payload = preview_resource(session, store, catalogs, &field, identity, resource)?;
            payloads.push(json!({"resource":resource,"payload":payload}));
        }
    }
    Ok(json!({"revision":session.revision(),"choice":choice,"payloads":payloads}))
}

fn preview_resource(
    session: &mut EditorSession,
    store: Option<&ProjectStore>,
    catalogs: CatalogViews<'_>,
    field: &str,
    identity: &str,
    resource: &providence_core::spell_reference_catalog::SpellResource,
) -> Result<Value, String> {
    let input = json!({"identity":identity});
    let payload = if resource.ownership == "scenario" && field == "queueIcon" {
        let asset = session
            .snapshot()
            .assets
            .iter()
            .find(|asset| asset.identity.0 == identity)
            .ok_or("The exact atlas owner disappeared.")?;
        if asset.byte_length > 4 * 1024 * 1024 {
            return Err("The atlas exceeds the bounded preview limit.".into());
        }
        let bytes = store
            .ok_or("Open a portable project to preview the scenario atlas.")?
            .read_blob(&asset.blob)
            .map_err(|e| e.to_string())?;
        if bytes.len() as u64 != asset.byte_length {
            return Err(
                "The scenario atlas payload length does not match its exact descriptor.".into(),
            );
        }
        json!({"identity":asset.identity,"mimeType":asset.mime_type,"base64":BASE64.encode(bytes)})
    } else if resource.ownership == "scenario" {
        let method = if field.starts_with("sound") {
            "sound.preview"
        } else if field == "queueIcon" {
            "picture.preview"
        } else {
            "icon.preview"
        };
        super::media::dispatch(session, store, method, input)?
    } else {
        super::application::dispatch(session, catalogs, "application-media.preview", input)?
    };
    Ok(payload)
}

use crate::{
    catalogs::CatalogViews,
    request_params::{required_i16, required_u64},
};
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
use providence_core::{session::EditorSession, special_land_artwork::resolve};
use providence_storage::ProjectStore;
use serde_json::{Value, json};

pub(crate) fn preview(
    session: &EditorSession,
    store: Option<&ProjectStore>,
    catalogs: CatalogViews<'_>,
    params: &Value,
) -> Result<Value, String> {
    if required_u64(params, "expectedRevision")? != session.revision().0 {
        return Err("The destination changed. Reopen the Special Land picker.".into());
    }
    read(
        session,
        store,
        catalogs,
        required_i16(params, "resourceId")?,
    )
}

pub(crate) fn read(
    session: &EditorSession,
    store: Option<&ProjectStore>,
    catalogs: CatalogViews<'_>,
    id: i16,
) -> Result<Value, String> {
    let resolved = resolve(session.snapshot(), catalogs.application_media, id)?;
    let asset = resolved.asset;
    if asset.byte_length > 1024 * 1024 {
        return Err("The special artwork exceeds the preview limit.".into());
    }
    let bytes = if resolved.ownership == "scenario" {
        store
            .ok_or("The scenario artwork store is unavailable.")?
            .read_blob(&asset.blob)
            .map_err(|error| error.to_string())?
    } else {
        catalogs
            .application_media_store
            .ok_or("The stock artwork store is unavailable.")?
            .read_blob(&asset.blob)
            .map_err(|error| error.to_string())?
    };
    if bytes.len() as u64 != asset.byte_length {
        return Err("The special artwork payload is incomplete.".into());
    }
    crate::map_artwork::validate_png(&bytes, Some(32), Some(32))?;
    Ok(
        json!({"revision":session.revision(),"identity":asset.identity,"resourceId":id,"ownership":resolved.ownership,
        "width":32,"height":32,"landlook":asset.landlook,"baseTile":asset.base_tile,
        "bytes":bytes.len(),"mimeType":"image/png","base64":BASE64.encode(bytes)}),
    )
}

pub(crate) fn resource_previews(
    session: &EditorSession,
    store: Option<&ProjectStore>,
    catalogs: CatalogViews<'_>,
    resource: &providence_core::paint_resources::PaintResource,
) -> Result<Value, String> {
    let ids: std::collections::BTreeSet<_> = resource
        .cells
        .iter()
        .filter(|cell| cell.tile < 0)
        .map(|cell| cell.tile)
        .collect();
    let mut previews = vec![];
    let mut bytes = 0;
    for id in ids {
        let result = read(session, store, catalogs, id)?;
        bytes += result["bytes"].as_u64().unwrap_or_default();
        if bytes > 16 * 1024 * 1024 {
            return Err("The stamp artwork exceeds the aggregate preview limit.".into());
        }
        previews.push(result);
    }
    Ok(json!(previews))
}

pub(crate) fn uses(session: &EditorSession, params: &Value) -> Result<Value, String> {
    if required_u64(params, "expectedRevision")? != session.revision().0 {
        return Err("The Special Land placement list changed. Refresh before navigating.".into());
    }
    let id = required_i16(params, "resourceId")?;
    let rows = providence_core::special_land_artwork::uses(session.snapshot(), id);
    let offset = params.get("offset").and_then(Value::as_u64).unwrap_or(0) as usize;
    Ok(
        json!({"revision":session.revision(),"total":rows.len(),"offset":offset,"items":rows.into_iter().skip(offset).take(128).collect::<Vec<_>>()}),
    )
}

#[cfg(test)]
mod tests;

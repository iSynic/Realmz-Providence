use super::{MAX_REFERENCE_PREVIEW_BYTES, asset_matches_query, normalized_query, page};
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
use providence_core::rebuilt::{ApplicationMediaAsset, ApplicationMediaCatalog};
use providence_storage::ReferenceLibraryStore;
use serde_json::{Value, json};

pub(crate) fn application_media_list(
    catalog: Option<&ApplicationMediaCatalog>,
    params: &Value,
) -> Result<Value, String> {
    let Some(catalog) = catalog else {
        return Ok(unconfigured_list(params));
    };
    let mut matches = matching_assets(catalog, params);
    matches.sort_by_key(|asset| {
        (
            asset.source_priority,
            asset.descriptor.classic_resource.as_ref(),
            asset.descriptor.identity.0.as_str(),
        )
    });
    let total = matches.len();
    let (offset, limit) = page(params);
    let items = matches
        .into_iter()
        .skip(offset)
        .take(limit)
        .map(application_media_list_item)
        .collect::<Vec<_>>();
    Ok(json!({
        "configured": true, "libraryId": catalog.library_id, "items": items,
        "offset": offset, "limit": limit, "total": total,
        "truncated": offset.saturating_add(limit) < total,
    }))
}

fn matching_assets<'a>(
    catalog: &'a ApplicationMediaCatalog,
    params: &Value,
) -> Vec<&'a ApplicationMediaAsset> {
    let query = normalized_query(params);
    let filter = |name: &str| {
        params
            .get(name)
            .and_then(Value::as_str)
            .unwrap_or("all")
            .trim()
    };
    let kind = filter("kind");
    let source = filter("source");
    let identity = params
        .get("identity")
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim();
    catalog
        .assets
        .iter()
        .filter(|asset| super::media_kind_matches(&asset.descriptor.kind, kind))
        .filter(|asset| source == "all" || asset.source.0 == source)
        .filter(|asset| identity.is_empty() || asset.descriptor.identity.0 == identity)
        .filter(|asset| asset_matches_query(&asset.descriptor, &query))
        .collect()
}

fn unconfigured_list(params: &Value) -> Value {
    json!({
        "configured": false, "items": [], "offset": 0, "limit": page(params).1,
        "total": 0, "truncated": false,
    })
}

pub(crate) fn application_media_open(
    catalog: Option<&ApplicationMediaCatalog>,
    params: &Value,
) -> Result<Value, String> {
    let catalog = catalog.ok_or_else(|| {
        "application-media.open requires a configured Classic application library".to_string()
    })?;
    let identity = required_identity(params, "open")?;
    let asset = find_asset(catalog, identity)?;
    let source = catalog
        .sources
        .iter()
        .find(|source| source.identity == asset.source)
        .ok_or_else(|| format!("Application media asset '{identity}' has no source"))?;
    let ambiguity = asset
        .descriptor
        .classic_resource
        .as_ref()
        .and_then(|resource| {
            catalog.ambiguous_resources.iter().find(|candidate| {
                candidate.source == asset.source && candidate.resource == *resource
            })
        });
    Ok(json!({
        "configured": true, "libraryId": catalog.library_id, "asset": asset.descriptor,
        "source": source, "sourcePriority": asset.source_priority, "ambiguity": ambiguity,
        "previewAvailable": asset.descriptor.byte_length <= MAX_REFERENCE_PREVIEW_BYTES,
        "projectOwnership": false,
    }))
}

pub(crate) fn application_media_preview(
    catalog: Option<&ApplicationMediaCatalog>,
    store: Option<&ReferenceLibraryStore>,
    params: &Value,
) -> Result<Value, String> {
    let catalog = catalog.ok_or_else(|| {
        "application-media.preview requires a configured Classic application library".to_string()
    })?;
    let store = store.ok_or_else(|| {
        "application-media.preview requires the configured library blob store".to_string()
    })?;
    let identity = required_identity(params, "preview")?;
    let asset = find_asset(catalog, identity)?;
    if asset.descriptor.byte_length > MAX_REFERENCE_PREVIEW_BYTES {
        return Err(format!(
            "Application media preview exceeds the {MAX_REFERENCE_PREVIEW_BYTES} byte limit"
        ));
    }
    let bytes = store
        .read_blob(&asset.descriptor.blob)
        .map_err(|error| error.to_string())?;
    if bytes.len() as u64 != asset.descriptor.byte_length {
        return Err(format!(
            "Application media asset '{identity}' expected {} bytes but retained {}",
            asset.descriptor.byte_length,
            bytes.len()
        ));
    }
    Ok(json!({
        "identity": asset.descriptor.identity, "mimeType": asset.descriptor.mime_type,
        "byteLength": bytes.len(), "base64": BASE64.encode(bytes), "projectOwnership": false,
    }))
}

fn required_identity<'a>(params: &'a Value, operation: &str) -> Result<&'a str, String> {
    params
        .get("identity")
        .and_then(Value::as_str)
        .ok_or_else(|| format!("application-media.{operation} requires identity"))
}

fn find_asset<'a>(
    catalog: &'a ApplicationMediaCatalog,
    identity: &str,
) -> Result<&'a ApplicationMediaAsset, String> {
    catalog
        .assets
        .iter()
        .find(|asset| asset.descriptor.identity.0 == identity)
        .ok_or_else(|| format!("Application media asset '{identity}' was not found"))
}

fn application_media_list_item(asset: &ApplicationMediaAsset) -> Value {
    json!({
        "identity": asset.descriptor.identity, "label": asset.descriptor.label,
        "kind": asset.descriptor.kind, "mimeType": asset.descriptor.mime_type,
        "classicResource": asset.descriptor.classic_resource, "byteLength": asset.descriptor.byte_length,
        "width": asset.descriptor.width, "height": asset.descriptor.height,
        "durationMs": asset.descriptor.duration_ms, "source": asset.source,
        "sourcePriority": asset.source_priority,
        "previewAvailable": asset.descriptor.byte_length <= MAX_REFERENCE_PREVIEW_BYTES,
    })
}

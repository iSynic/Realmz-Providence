use super::{MAX_PREVIEW_BYTES, ReferenceCatalog, ReferenceCatalogAsset, Value, json, page};

pub(crate) fn reference_catalog_list(
    catalog: Option<&ReferenceCatalog>,
    params: &Value,
) -> Result<Value, String> {
    let (offset, limit) = page(params);
    let Some(catalog) = catalog else {
        return Ok(json!({
            "configured": false,
            "items": [],
            "offset": 0,
            "limit": limit,
            "total": 0,
            "truncated": false,
        }));
    };
    let query = params
        .get("query")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .trim()
        .to_lowercase();
    let kind = params
        .get("kind")
        .and_then(Value::as_str)
        .unwrap_or("all")
        .trim();
    if !matches!(kind, "all" | "bag-item" | "vault-icon") {
        return Err(format!(
            "reference-catalog.list kind must be all, bag-item, or vault-icon; found '{kind}'"
        ));
    }
    let mut matches = catalog
        .assets
        .iter()
        .filter(|asset| kind == "all" || asset.descriptor.kind == kind)
        .filter(|asset| matches_query(asset, &query))
        .collect::<Vec<_>>();
    matches.sort_by(|left, right| catalog_order(left, right));
    let total = matches.len();
    let items = matches
        .into_iter()
        .skip(offset)
        .take(limit)
        .map(catalog_row)
        .collect::<Vec<_>>();
    Ok(json!({
        "configured": true,
        "libraryId": catalog.library_id,
        "items": items,
        "offset": offset,
        "limit": limit,
        "total": total,
        "truncated": offset.saturating_add(limit) < total,
        "projectOwnership": false,
        "readOnly": true,
    }))
}

fn matches_query(asset: &ReferenceCatalogAsset, query: &str) -> bool {
    query.is_empty()
        || asset.descriptor.identity.0.to_lowercase().contains(query)
        || asset.descriptor.label.to_lowercase().contains(query)
        || asset.source.0.to_lowercase().contains(query)
        || asset.descriptor.source.to_lowercase().contains(query)
        || asset
            .descriptor
            .classic_payload_byte_length
            .is_some_and(|bytes| bytes.to_string().contains(query))
        || asset
            .descriptor
            .classic_resource
            .as_ref()
            .is_some_and(|resource| {
                resource.resource_id.to_string().contains(query)
                    || resource.resource_type.to_lowercase().contains(query)
            })
}

fn catalog_row(asset: &ReferenceCatalogAsset) -> Value {
    json!({
        "identity": asset.descriptor.identity,
        "label": asset.descriptor.label,
        "kind": asset.descriptor.kind,
        "resource": asset.descriptor.classic_resource,
        "width": asset.descriptor.width,
        "height": asset.descriptor.height,
        "source": asset.source,
        "sourceName": asset.descriptor.source,
        "nativeByteLength": asset.descriptor.classic_payload_byte_length,
        "previewByteLength": asset.descriptor.byte_length,
        "previewAvailable": asset.descriptor.byte_length <= MAX_PREVIEW_BYTES,
    })
}

fn catalog_order(
    left: &ReferenceCatalogAsset,
    right: &ReferenceCatalogAsset,
) -> std::cmp::Ordering {
    (
        left.descriptor.kind.as_str(),
        left.descriptor.classic_resource.as_ref(),
        left.descriptor.identity.0.as_str(),
    )
        .cmp(&(
            right.descriptor.kind.as_str(),
            right.descriptor.classic_resource.as_ref(),
            right.descriptor.identity.0.as_str(),
        ))
}

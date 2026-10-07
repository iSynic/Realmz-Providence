mod artwork;
pub(crate) use artwork::{apply_item_artwork, copy_artwork, prepare_copy};
mod browse;
mod import;
pub(crate) use browse::reference_catalog_list;
pub(crate) use import::import_divinity_reference_catalog;

use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
use providence_core::{
    codecs::{ResourceIdentity, inspect_resource_entry},
    reference_library::{ReferenceCatalog, ReferenceCatalogAsset, ReferenceCatalogSource},
};
use providence_storage::ReferenceCatalogStore;
use serde_json::{Value, json};

const DEFAULT_PAGE_SIZE: usize = 64;
const MAX_PAGE_SIZE: usize = 128;
const MAX_PREVIEW_BYTES: u64 = 4 * 1024 * 1024;
const MAX_SOURCE_EVIDENCE_BYTES: u64 = 16 * 1024 * 1024;

#[cfg(test)]
#[path = "reference_catalog_tests.rs"]
mod tests;

pub(crate) fn apply_scenario_item_artwork(
    session: &mut providence_core::session::EditorSession,
    project: Option<&providence_storage::ProjectStore>,
    params: &Value,
) -> Result<Value, String> {
    if crate::request_params::required_u64(params, "expectedRevision")? != session.revision().0 {
        return Err("The item changed. Review its current state before applying artwork.".into());
    }
    let project = project.ok_or("Open a saved scenario before choosing artwork.")?;
    let identity = crate::request_params::required_string(params, "identity")?;
    let asset = session
        .snapshot()
        .assets
        .iter()
        .find(|asset| asset.identity.0 == identity)
        .ok_or("The selected scenario artwork no longer exists.")?;
    let key = asset
        .classic_resource
        .as_ref()
        .ok_or("This artwork has no picture number.")?;
    let number = i16::try_from(key.resource_id)
        .map_err(|_| "This picture number is outside the Classic item range.")?;
    if asset.kind != "icon" || key.resource_type != "cicn" || number == 0 {
        return Err("Choose a scenario icon for this item.".into());
    }
    if session
        .snapshot()
        .assets
        .iter()
        .filter(|entry| entry.classic_resource.as_ref() == Some(key))
        .count()
        != 1
    {
        return Err(
            "This picture number is ambiguous. Resolve the duplicate artwork first.".into(),
        );
    }
    let length = asset
        .classic_payload_byte_length
        .ok_or("This icon has no Classic artwork.")?;
    if length > MAX_PREVIEW_BYTES {
        return Err("This icon is too large to check safely.".into());
    }
    let payload = project
        .read_blob(
            asset
                .classic_payload_blob
                .as_ref()
                .ok_or("This icon has no Classic artwork.")?,
        )
        .map_err(|_| "The icon is missing or damaged. Restore it before using it.")?;
    if payload.len() as u64 != length {
        return Err("The icon is incomplete. Restore it before using it.".into());
    }
    providence_core::codecs::decode_cicn(&payload).map_err(|_| "The icon cannot be decoded.")?;
    let record_index = crate::request_params::required_u16(params, "recordIndex")?;
    let mut definition = session
        .snapshot()
        .scenario_item_rules
        .iter()
        .find(|item| item.record_index == record_index)
        .ok_or("The selected item no longer exists.")?
        .definition
        .clone();
    definition.icon_id = i32::from(number);
    crate::execute(
        session,
        params,
        providence_core::session::EditorCommand::UpdateScenarioItem {
            record_index,
            definition: Box::new(definition),
        },
    )
}

pub(crate) fn apply_stock_item_artwork(
    session: &mut providence_core::session::EditorSession,
    project: Option<&providence_storage::ProjectStore>,
    catalog: Option<&providence_core::rebuilt::ApplicationMediaCatalog>,
    params: &Value,
) -> Result<Value, String> {
    use providence_core::{rebuilt::ApplicationMediaResolution, session::EditorCommand};
    if crate::request_params::required_u64(params, "expectedRevision")? != session.revision().0 {
        return Err("The item changed. Review its current state before applying artwork.".into());
    }
    let project = project.ok_or("Open a saved scenario before choosing artwork.")?;
    let catalog = catalog.ok_or("The stock artwork library is unavailable.")?;
    let identity = crate::request_params::required_string(params, "identity")?;
    let selected = catalog
        .assets
        .iter()
        .find(|entry| entry.descriptor.identity.0 == identity)
        .ok_or("The selected stock artwork is no longer available.")?;
    let key = selected
        .descriptor
        .classic_resource
        .as_ref()
        .ok_or("This artwork has no picture number.")?;
    let resource_id = i16::try_from(key.resource_id)
        .map_err(|_| "This artwork cannot be used by a Classic item.")?;
    if key.resource_type != "cicn" || resource_id == 0 {
        return Err("This artwork cannot be used by a Classic item.".into());
    }
    match catalog.resolve_resource(key, Some("icon")) {
        ApplicationMediaResolution::Resolved(entry) if entry.descriptor.identity == selected.descriptor.identity => {}
        _ => return Err("This stock picture number is ambiguous or resolves to different artwork. Choose another picture.".into()),
    }
    if session
        .snapshot()
        .assets
        .iter()
        .any(|asset| asset.classic_resource.as_ref() == Some(key))
    {
        return Err("Scenario artwork already uses this picture number. The stock picture would be hidden; choose another picture.".into());
    }
    for source in &session.snapshot().classic_sources {
        if !source.native_path.to_ascii_lowercase().ends_with(".rsrc") {
            continue;
        }
        if source.byte_length > MAX_SOURCE_EVIDENCE_BYTES {
            return Err(
                "This scenario resource file is too large to check safely for picture conflicts."
                    .into(),
            );
        }
        let bytes = project
            .read_blob(&source.blob)
            .map_err(|error| error.to_string())?;
        if providence_core::codecs::parse_resource_entries(&bytes)
            .map_err(|error| error.to_string())?
            .iter()
            .any(|entry| entry.resource_type == *b"cicn" && entry.id == resource_id)
        {
            return Err("Scenario artwork already uses this picture number. The stock picture would be hidden; choose another picture.".into());
        }
    }
    let record_index = crate::request_params::required_u16(params, "recordIndex")?;
    let mut definition = session
        .snapshot()
        .scenario_item_rules
        .iter()
        .find(|item| item.record_index == record_index)
        .ok_or("The selected item no longer exists.")?
        .definition
        .clone();
    definition.icon_id = i32::from(resource_id);
    crate::execute(
        session,
        params,
        EditorCommand::UpdateScenarioItem {
            record_index,
            definition: Box::new(definition),
        },
    )
}

pub(crate) fn reference_catalog_describe(catalog: Option<&ReferenceCatalog>) -> Value {
    catalog.map_or_else(
        || json!({"configured": false}),
        |catalog| {
            let bag_items = catalog
                .assets
                .iter()
                .filter(|asset| asset.descriptor.kind == "bag-item")
                .count();
            let vault_icons = catalog.assets.len().saturating_sub(bag_items);
            json!({
                "configured": true,
                "formatVersion": catalog.format_version,
                "libraryId": catalog.library_id,
                "sources": catalog.sources.len(),
                "assets": catalog.assets.len(),
                "counts": {
                    "bagItems": bag_items,
                    "vaultIcons": vault_icons,
                },
                "projectOwnership": false,
                "readOnly": true,
            })
        },
    )
}

pub(crate) fn reference_catalog_open(
    catalog: Option<&ReferenceCatalog>,
    store: Option<&ReferenceCatalogStore>,
    params: &Value,
) -> Result<Value, String> {
    let catalog = catalog.ok_or_else(|| {
        "reference-catalog.open requires a configured reference catalog".to_string()
    })?;
    let identity = required_string(params, "identity", "reference-catalog.open")?;
    let asset = catalog
        .assets
        .iter()
        .find(|asset| asset.descriptor.identity.0 == identity)
        .ok_or_else(|| format!("Reference catalog asset '{identity}' was not found"))?;
    let source = catalog
        .sources
        .iter()
        .find(|source| source.identity == asset.source)
        .ok_or_else(|| format!("Reference catalog asset '{identity}' has no source"))?;
    let evidence = reference_source_evidence(asset, source, store)?;
    Ok(json!({
        "configured": true,
        "libraryId": catalog.library_id,
        "asset": asset.descriptor,
        "source": source,
        "sourceEvidence": evidence,
        "previewAvailable": asset.descriptor.byte_length <= MAX_PREVIEW_BYTES,
        "projectOwnership": false,
        "readOnly": true,
    }))
}

fn reference_source_evidence(
    asset: &ReferenceCatalogAsset,
    source: &ReferenceCatalogSource,
    store: Option<&ReferenceCatalogStore>,
) -> Result<Value, String> {
    let Some(store) = store else {
        return Ok(
            json!({"state": "unavailable", "reason": "Reference source store is not attached."}),
        );
    };
    if source.byte_length > MAX_SOURCE_EVIDENCE_BYTES {
        return Ok(
            json!({"state": "unavailable", "reason": "Reference source exceeds the 16 MiB inspection limit."}),
        );
    }
    let resource = asset
        .descriptor
        .classic_resource
        .as_ref()
        .ok_or_else(|| "Reference asset has no native resource identity".to_string())?;
    let resource_type = resource
        .resource_type
        .as_bytes()
        .try_into()
        .map_err(|_| "Reference resource type must contain four bytes".to_string())?;
    let bytes = store
        .read_blob_bounded(&source.blob, MAX_SOURCE_EVIDENCE_BYTES)
        .map_err(|error| error.to_string())?;
    if bytes.len() as u64 != source.byte_length {
        return Err("Reference source byte length differs from its descriptor".into());
    }
    let evidence = inspect_resource_entry(
        &bytes,
        &ResourceIdentity {
            resource_type,
            id: i16::try_from(resource.resource_id)
                .map_err(|_| "Reference resource ID is outside signed Classic range".to_string())?,
        },
    )
    .map_err(|error| error.to_string())?
    .ok_or_else(|| "Selected resource is absent from its retained source".to_string())?;
    if asset.descriptor.classic_payload_byte_length != Some(evidence.byte_length as u64)
        || asset
            .descriptor
            .classic_payload_blob
            .as_ref()
            .map(|blob| blob.0.as_str())
            != Some(format!("sha256:{}", evidence.sha256).as_str())
    {
        return Err("Selected resource differs from its retained payload identity".into());
    }
    Ok(json!({
        "state": "ready",
        "offsetOrigin": "resource-fork",
        "summary": {
            "family": if resource_type == *b"cicn" { Some("color-icon") } else { None },
            "iconBytes": if resource_type == *b"cicn" { Some(evidence.byte_length) } else { None },
            "type": resource.resource_type,
            "resourceId": resource.resource_id,
            "name": evidence.name,
            "attributes": evidence.attributes,
            "bytes": evidence.byte_length,
            "offset": evidence.fork_offset,
            "sha256": evidence.sha256,
            "preview": evidence.preview.iter().map(|byte| format!("{byte:02x}")).collect::<Vec<_>>().join(" "),
        },
    }))
}

pub(crate) fn reference_catalog_preview(
    catalog: Option<&ReferenceCatalog>,
    store: Option<&ReferenceCatalogStore>,
    params: &Value,
) -> Result<Value, String> {
    let catalog = catalog.ok_or_else(|| {
        "reference-catalog.preview requires a configured reference catalog".to_string()
    })?;
    let store = store.ok_or_else(|| {
        "reference-catalog.preview requires the configured catalog blob store".to_string()
    })?;
    let identity = required_string(params, "identity", "reference-catalog.preview")?;
    let asset = catalog
        .assets
        .iter()
        .find(|asset| asset.descriptor.identity.0 == identity)
        .ok_or_else(|| format!("Reference catalog asset '{identity}' was not found"))?;
    if asset.descriptor.byte_length > MAX_PREVIEW_BYTES {
        return Err(format!(
            "Reference catalog preview exceeds the {MAX_PREVIEW_BYTES} byte limit"
        ));
    }
    let bytes = store
        .read_blob(&asset.descriptor.blob)
        .map_err(|error| error.to_string())?;
    if bytes.len() as u64 != asset.descriptor.byte_length {
        return Err(format!(
            "Reference catalog asset '{identity}' expected {} bytes but retained {}",
            asset.descriptor.byte_length,
            bytes.len()
        ));
    }
    Ok(json!({
        "identity": asset.descriptor.identity,
        "mimeType": asset.descriptor.mime_type,
        "byteLength": bytes.len(),
        "base64": BASE64.encode(bytes),
        "projectOwnership": false,
        "readOnly": true,
    }))
}

fn page(params: &Value) -> (usize, usize) {
    let offset = params
        .get("offset")
        .and_then(Value::as_u64)
        .and_then(|value| usize::try_from(value).ok())
        .unwrap_or(0);
    let limit = params
        .get("limit")
        .and_then(Value::as_u64)
        .and_then(|value| usize::try_from(value).ok())
        .unwrap_or(DEFAULT_PAGE_SIZE)
        .clamp(1, MAX_PAGE_SIZE);
    (offset, limit)
}

fn required_string(params: &Value, name: &str, method: &str) -> Result<String, String> {
    params
        .get(name)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
        .ok_or_else(|| format!("{method} requires {name}"))
}

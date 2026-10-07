use super::*;
use std::collections::BTreeSet;

pub(super) fn compile(
    assets: &[AssetDescriptor],
    payloads: &BTreeMap<String, Vec<u8>>,
    compatibility_source: Option<&[u8]>,
) -> Result<Vec<u8>, ClassicTextResourceError> {
    let original = compatibility_source
        .map(ToOwned::to_owned)
        .unwrap_or_else(empty_resource_fork);
    let entries = parse_resource_entries_preserving_duplicates(&original)?;
    let mut updates = Vec::new();
    let mut owned = BTreeSet::new();
    for asset in assets
        .iter()
        .filter(|asset| matches!(asset.kind.as_str(), "text-resource" | "text-style-resource"))
    {
        let resource = asset.classic_resource.as_ref().ok_or_else(|| {
            ClassicTextResourceError::InvalidResourceIdentity(asset.identity.clone())
        })?;
        let resource_id = i16::try_from(resource.resource_id).map_err(|_| {
            ClassicTextResourceError::InvalidResourceIdentity(asset.identity.clone())
        })?;
        let kind = if asset.kind == "text-resource" {
            *b"TEXT"
        } else {
            *b"styl"
        };
        if resource.resource_type.as_bytes() != kind {
            return Err(ClassicTextResourceError::InvalidResourceIdentity(
                asset.identity.clone(),
            ));
        }
        if !owned.insert((kind, resource_id)) {
            return Err(ClassicTextResourceError::DuplicateResourceId(resource_id));
        }
        if let Some(update) = resource_update(asset, payloads, &entries, kind, resource_id)? {
            updates.push(update);
        }
    }
    merge_resource_entries_preserving_unowned_duplicates(&original, updates).map_err(Into::into)
}

fn resource_update(
    asset: &AssetDescriptor,
    payloads: &BTreeMap<String, Vec<u8>>,
    entries: &[ResourceEntry],
    kind: [u8; 4],
    resource_id: i16,
) -> Result<Option<ResourceEntry>, ClassicTextResourceError> {
    let blob = asset
        .classic_payload_blob
        .as_ref()
        .ok_or_else(|| ClassicTextResourceError::MissingClassicPayload(asset.identity.clone()))?;
    let payload = payloads
        .get(&blob.0)
        .ok_or_else(|| ClassicTextResourceError::MissingClassicPayload(asset.identity.clone()))?;
    if let Some(expected) = asset.classic_payload_byte_length
        && expected != payload.len() as u64
    {
        return Err(ClassicTextResourceError::ClassicPayloadLengthMismatch {
            identity: asset.identity.clone(),
            expected,
            actual: payload.len() as u64,
        });
    }
    let existing = entries
        .iter()
        .find(|entry| entry.resource_type == kind && entry.id == resource_id);
    if existing.is_some_and(|entry| entry.data == *payload) {
        return Ok(None);
    }
    if kind == *b"styl"
        && let Some(existing) = existing
    {
        crate::text_styles::verify_preserved_style_fields(&existing.data, payload).map_err(
            |reason| ClassicTextResourceError::InvalidStyleEdit {
                identity: asset.identity.clone(),
                reason,
            },
        )?;
    }
    Ok(Some(ResourceEntry {
        resource_type: kind,
        id: resource_id,
        name: if asset.source == CLASSIC_SCENARIO_RESOURCE_SOURCE {
            existing.map_or_else(|| asset.label.clone(), |entry| entry.name.clone())
        } else {
            asset.label.clone()
        },
        attributes: existing.map_or(0, |entry| entry.attributes),
        data: payload.clone(),
    }))
}

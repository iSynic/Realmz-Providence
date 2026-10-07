use super::super::{
    CLASSIC_SCENARIO_RESOURCE_SOURCE, ResourceEntry, empty_resource_fork,
    merge_resource_entries_preserving_unowned_duplicates,
    parse_resource_entries_preserving_duplicates,
};
use super::{CicnCodecError, SCENARIO_ICON_MAX_ID, ScenarioIconCodecError};
use crate::model::AssetDescriptor;
use std::collections::{BTreeMap, BTreeSet};

pub fn compile_scenario_icon_resource_fork(
    assets: &[AssetDescriptor],
    payloads: &BTreeMap<String, Vec<u8>>,
    compatibility_source: Option<&[u8]>,
) -> Result<Vec<u8>, ScenarioIconCodecError> {
    compile_cicn_resource_fork_for_kinds(
        assets,
        payloads,
        compatibility_source,
        &["icon", "portrait", "combat-icon"],
        |resource_id| (0..=SCENARIO_ICON_MAX_ID).contains(&resource_id),
    )
}

pub(crate) fn compile_cicn_resource_fork_for_kind(
    assets: &[AssetDescriptor],
    payloads: &BTreeMap<String, Vec<u8>>,
    compatibility_source: Option<&[u8]>,
    asset_kind: &str,
    valid_resource_id: impl Fn(i16) -> bool,
) -> Result<Vec<u8>, CicnCodecError> {
    compile_cicn_resource_fork_for_kinds(
        assets,
        payloads,
        compatibility_source,
        &[asset_kind],
        valid_resource_id,
    )
}

pub(crate) fn compile_retained_icon_resource_fork(
    assets: &[AssetDescriptor],
    payloads: &BTreeMap<String, Vec<u8>>,
    compatibility_source: Option<&[u8]>,
    signed_icon_ids: &BTreeSet<i16>,
) -> Result<Vec<u8>, CicnCodecError> {
    compile_cicn_resource_fork_for_kinds(
        assets,
        payloads,
        compatibility_source,
        &["icon", "portrait", "combat-icon"],
        |id| id >= 0 || signed_icon_ids.contains(&id),
    )
}

fn compile_cicn_resource_fork_for_kinds(
    assets: &[AssetDescriptor],
    payloads: &BTreeMap<String, Vec<u8>>,
    compatibility_source: Option<&[u8]>,
    asset_kinds: &[&str],
    valid_resource_id: impl Fn(i16) -> bool,
) -> Result<Vec<u8>, CicnCodecError> {
    let original = compatibility_source
        .map(ToOwned::to_owned)
        .unwrap_or_else(empty_resource_fork);
    let original_entries = parse_resource_entries_preserving_duplicates(&original)?;
    let mut updates = Vec::new();
    let mut owned_ids = BTreeSet::new();
    for asset in assets
        .iter()
        .filter(|asset| asset_kinds.contains(&asset.kind.as_str()))
    {
        let resource_id = resource_id(asset, &valid_resource_id)?;
        if !owned_ids.insert(resource_id) {
            return Err(ScenarioIconCodecError::DuplicateResourceId(resource_id));
        }
        let payload = classic_payload(asset, payloads)?;
        if original_entries.iter().any(|entry| {
            entry.resource_type == *b"cicn"
                && entry.id == resource_id
                && (asset.source == CLASSIC_SCENARIO_RESOURCE_SOURCE || entry.name == asset.label)
                && entry.data == *payload
        }) {
            continue;
        }
        updates.push(updated_entry(
            asset,
            resource_id,
            payload,
            &original_entries,
        ));
    }
    merge_resource_entries_preserving_unowned_duplicates(&original, updates).map_err(Into::into)
}

fn resource_id(
    asset: &AssetDescriptor,
    valid_resource_id: &impl Fn(i16) -> bool,
) -> Result<i16, CicnCodecError> {
    let Some(resource) = &asset.classic_resource else {
        return Err(ScenarioIconCodecError::InvalidResourceIdentity(
            asset.identity.clone(),
        ));
    };
    let Ok(resource_id) = i16::try_from(resource.resource_id) else {
        return Err(ScenarioIconCodecError::InvalidResourceIdentity(
            asset.identity.clone(),
        ));
    };
    if resource.resource_type != "cicn" || !valid_resource_id(resource_id) {
        return Err(ScenarioIconCodecError::InvalidResourceIdentity(
            asset.identity.clone(),
        ));
    }
    Ok(resource_id)
}

fn classic_payload<'a>(
    asset: &AssetDescriptor,
    payloads: &'a BTreeMap<String, Vec<u8>>,
) -> Result<&'a Vec<u8>, CicnCodecError> {
    let blob = asset
        .classic_payload_blob
        .as_ref()
        .ok_or_else(|| ScenarioIconCodecError::MissingClassicPayload(asset.identity.clone()))?;
    let payload = payloads
        .get(&blob.0)
        .ok_or_else(|| ScenarioIconCodecError::MissingClassicPayload(asset.identity.clone()))?;
    if let Some(expected) = asset.classic_payload_byte_length
        && expected != payload.len() as u64
    {
        return Err(ScenarioIconCodecError::ClassicPayloadLengthMismatch {
            identity: asset.identity.clone(),
            expected,
            actual: payload.len() as u64,
        });
    }
    Ok(payload)
}

fn updated_entry(
    asset: &AssetDescriptor,
    resource_id: i16,
    payload: &[u8],
    original_entries: &[ResourceEntry],
) -> ResourceEntry {
    ResourceEntry {
        resource_type: *b"cicn",
        id: resource_id,
        name: if asset.source == CLASSIC_SCENARIO_RESOURCE_SOURCE {
            original_entries
                .iter()
                .find(|entry| entry.resource_type == *b"cicn" && entry.id == resource_id)
                .map_or_else(|| asset.label.clone(), |entry| entry.name.clone())
        } else {
            asset.label.clone()
        },
        attributes: original_entries
            .iter()
            .find(|entry| entry.resource_type == *b"cicn" && entry.id == resource_id)
            .map_or(0, |entry| entry.attributes),
        data: payload.to_vec(),
    }
}

//! Exact Caste slots and Classic-only controls use the existing native source blob.
use super::{CASTE_RECORD_BYTES, CasteCodecError};
use crate::model::StableId;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CasteNativeFields {
    pub starting_items: [Option<StableId>; 20],
    pub maximum_spells_per_round: i32,
}

pub fn read_caste_native_fields(
    bytes: &[u8],
    id: u8,
) -> Result<CasteNativeFields, CasteCodecError> {
    let row = caste_row(bytes, id)?;
    Ok(CasteNativeFields {
        starting_items: std::array::from_fn(|slot| {
            let offset = 386 + slot * 2;
            let value = i16::from_be_bytes([row[offset], row[offset + 1]]);
            (value != 0).then(|| StableId(format!("classic.item.{value}")))
        }),
        maximum_spells_per_round: i32::from(i16::from_be_bytes([row[446], row[447]])),
    })
}

pub fn patch_caste_native_fields(
    bytes: &[u8],
    id: u8,
    fields: &CasteNativeFields,
) -> Result<Vec<u8>, CasteCodecError> {
    caste_row(bytes, id)?;
    let maximum = i16::try_from(fields.maximum_spells_per_round).map_err(|_| {
        invalid(
            id,
            "Maximum spells per round must fit a signed 16-bit value.",
        )
    })?;
    let items = fields.starting_items.iter().map(|item| {
        match item {
            None => Ok(0i16),
            Some(item) => item.0.strip_prefix("classic.item.")
                .and_then(|value| value.parse::<i16>().ok())
                .filter(|value| *value != 0 && item.0 == format!("classic.item.{value}"))
                .ok_or_else(|| invalid(id, "Starting items need signed canonical identities; use null for an empty slot.")),
        }
    }).collect::<Result<Vec<_>, _>>()?;
    let mut output = bytes.to_vec();
    let start = usize::from(id - 1) * CASTE_RECORD_BYTES;
    for (slot, item) in items.iter().enumerate() {
        let offset = start + 386 + slot * 2;
        output[offset..offset + 2].copy_from_slice(&item.to_be_bytes());
    }
    output[start + 446..start + 448].copy_from_slice(&maximum.to_be_bytes());
    Ok(output)
}

fn caste_row(bytes: &[u8], id: u8) -> Result<&[u8], CasteCodecError> {
    if !(1..=30).contains(&id) {
        return Err(invalid(id, "Classic Caste identity must be in 1..=30."));
    }
    let start = usize::from(id - 1) * CASTE_RECORD_BYTES;
    bytes.get(start..start + CASTE_RECORD_BYTES).ok_or_else(|| {
        invalid(
            id,
            "The retained Caste row is incomplete; no missing bytes are inferred.",
        )
    })
}

fn invalid(id: u8, reason: &str) -> CasteCodecError {
    CasteCodecError::InvalidDefinition {
        classic_id: id,
        reason: reason.into(),
    }
}

#[cfg(test)]
mod tests;

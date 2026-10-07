use std::collections::BTreeMap;

use crate::model::AssetDescriptor;

use super::{CicnCodecError, compile_cicn_resource_fork_for_kind, encode_scenario_icon_cicn};

pub const SPECIAL_LAND_TILE_MIN_ID: i16 = i16::MIN;
pub const SPECIAL_LAND_TILE_DEFAULT_ID: i16 = -100;
pub const SPECIAL_LAND_TILE_MAX_ID: i16 = -1;
pub const SPECIAL_LAND_TILE_WIDTH: u32 = 32;
pub const SPECIAL_LAND_TILE_HEIGHT: u32 = 32;

pub type SpecialLandTileCodecError = CicnCodecError;

pub fn encode_special_land_tile_cicn(
    rgba: &[u8],
    width: u32,
    height: u32,
) -> Result<Vec<u8>, SpecialLandTileCodecError> {
    encode_scenario_icon_cicn(rgba, width, height)
}

pub fn compile_special_land_tile_resource_fork(
    assets: &[AssetDescriptor],
    payloads: &BTreeMap<String, Vec<u8>>,
    compatibility_source: Option<&[u8]>,
) -> Result<Vec<u8>, SpecialLandTileCodecError> {
    compile_cicn_resource_fork_for_kind(
        assets,
        payloads,
        compatibility_source,
        "special-land-tile",
        |resource_id| (SPECIAL_LAND_TILE_MIN_ID..=SPECIAL_LAND_TILE_MAX_ID).contains(&resource_id),
    )
}

/// Mirrors the one-step thousand-band normalization in Castle's `centerpict.c`.
/// The raw signed map word remains authoritative and is never rewritten by this function.
pub fn normalize_special_land_resource_id(raw_tile: i16) -> Option<i16> {
    if raw_tile >= 0 {
        return None;
    }
    if raw_tile < -1999 {
        raw_tile.checked_add(2000)
    } else if raw_tile < -999 {
        raw_tile.checked_add(1000)
    } else {
        Some(raw_tile)
    }
}

#[cfg(test)]
mod tests {
    use crate::model::{AssetDescriptor, BlobId, ClassicResourceKey, StableId};

    use super::*;
    use crate::codecs::{ResourceEntry, parse_resource_entries, write_resource_fork};

    fn special_land(blob: &str, bytes: usize) -> AssetDescriptor {
        AssetDescriptor {
            identity: StableId("special-land.-91".into()),
            label: "Western Moon Gate With Broken Portcullis".into(),
            kind: "special-land-tile".into(),
            mime_type: Some("image/png".into()),
            classic_resource: Some(ClassicResourceKey {
                resource_type: "cicn".into(),
                resource_id: -91,
            }),
            scenario_music_slot: None,
            blob: BlobId(format!("sha256:{}", "a".repeat(64))),
            byte_length: 64,
            classic_payload_blob: Some(BlobId(blob.into())),
            classic_payload_byte_length: Some(bytes as u64),
            extension: Some("png".into()),
            width: Some(SPECIAL_LAND_TILE_WIDTH),
            height: Some(SPECIAL_LAND_TILE_HEIGHT),
            duration_ms: None,
            sample_rate: None,
            channels: None,
            tile_width: None,
            tile_height: None,
            columns: None,
            rows: None,
            landlook: Some(0),
            base_tile: Some(7),
            source: "controlled transparent RGBA fixture".into(),
        }
    }

    #[test]
    fn classic_thousand_bands_resolve_without_rewriting_the_raw_value() {
        assert_eq!(normalize_special_land_resource_id(-91), Some(-91));
        assert_eq!(normalize_special_land_resource_id(-1091), Some(-91));
        assert_eq!(normalize_special_land_resource_id(-2091), Some(-91));
        assert_eq!(normalize_special_land_resource_id(-3999), Some(-1999));
        assert_eq!(normalize_special_land_resource_id(91), None);
    }

    #[test]
    fn special_land_merge_owns_only_matching_negative_cicn_resources() {
        let source = write_resource_fork(&[
            ResourceEntry {
                resource_type: *b"cicn",
                id: 30126,
                name: "Scenario Icon".into(),
                attributes: 2,
                data: vec![1, 2],
            },
            ResourceEntry {
                resource_type: *b"cicn",
                id: -91,
                name: "Original Special Land Tile".into(),
                attributes: 32,
                data: vec![4, 5],
            },
            ResourceEntry {
                resource_type: *b"PICT",
                id: 30000,
                name: "Picture".into(),
                attributes: 3,
                data: vec![3, 4],
            },
            ResourceEntry {
                resource_type: *b"snd ",
                id: 200,
                name: "Sound".into(),
                attributes: 4,
                data: vec![5, 6],
            },
        ])
        .unwrap();
        let blob = format!("sha256:{}", "b".repeat(64));
        let mut edited_asset = special_land(&blob, 3);
        edited_asset.label = "Violet Rift Gate — Certified".into();
        let output = compile_special_land_tile_resource_fork(
            &[edited_asset],
            &BTreeMap::from([(blob, vec![7, 8, 9])]),
            Some(&source),
        )
        .unwrap();
        let entries = parse_resource_entries(&output).unwrap();
        assert!(entries.iter().any(|entry| {
            entry.resource_type == *b"cicn" && entry.id == 30126 && entry.data == [1, 2]
        }));
        assert!(entries.iter().any(|entry| {
            entry.resource_type == *b"PICT" && entry.id == 30000 && entry.data == [3, 4]
        }));
        assert!(entries.iter().any(|entry| {
            entry.resource_type == *b"snd " && entry.id == 200 && entry.data == [5, 6]
        }));
        assert!(entries.iter().any(|entry| {
            entry.resource_type == *b"cicn"
                && entry.id == -91
                && entry.name == "Violet Rift Gate — Certified"
                && entry.attributes == 32
                && entry.data == [7, 8, 9]
        }));
    }

    #[test]
    fn no_edit_special_land_resource_fork_is_byte_exact() {
        let payload = vec![7, 8, 9];
        let source = write_resource_fork(&[ResourceEntry {
            resource_type: *b"cicn",
            id: -91,
            name: "Western Moon Gate With Broken Portcullis".into(),
            attributes: 0,
            data: payload.clone(),
        }])
        .unwrap();
        let blob = format!("sha256:{}", "c".repeat(64));
        let output = compile_special_land_tile_resource_fork(
            &[special_land(&blob, payload.len())],
            &BTreeMap::from([(blob, payload)]),
            Some(&source),
        )
        .unwrap();
        assert_eq!(output, source);
    }
}

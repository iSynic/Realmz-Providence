mod custom_encode;
pub use custom_encode::encode_custom_landlook_mapstats;

use crate::model::{BlobId, LandlookCatalogMetadata, LandlookRangeSlot, TerrainProfile};

pub const MAPSTATS_RECORD_BYTES: usize = 40;
pub const MAPSTATS_RECORDS: usize = 201;
pub const MAPSTATS_CORE_BYTES: usize = MAPSTATS_RECORD_BYTES * MAPSTATS_RECORDS + 4;
pub const MAPSTATS_RANGE_TAIL_BYTES: usize = 60;
pub const MAPSTATS_RANGE_SLOT_BYTES: usize = 6;
pub const MAPSTATS_RANGE_SLOTS: usize = MAPSTATS_RANGE_TAIL_BYTES / MAPSTATS_RANGE_SLOT_BYTES;
pub const MAPSTATS_REFERENCE_BYTES: usize = MAPSTATS_CORE_BYTES + MAPSTATS_RANGE_TAIL_BYTES;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DecodedLandlookMapstats {
    pub catalog: LandlookCatalogMetadata,
    pub profiles: Vec<TerrainProfile>,
    pub trailing_bytes: Vec<u8>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MapstatsCodecError {
    TooShort { expected: usize, actual: usize },
    WrongCustomLength { expected: usize, actual: usize },
    InvalidCustomLandlook { landlook: i8 },
    InvalidCustomCatalog { reason: String },
}

impl std::fmt::Display for MapstatsCodecError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::TooShort { expected, actual } => write!(
                formatter,
                "Map Stats source must contain at least {expected} bytes; found {actual}"
            ),
            Self::WrongCustomLength { expected, actual } => write!(
                formatter,
                "custom landlook source must contain exactly {expected} bytes; found {actual}"
            ),
            Self::InvalidCustomLandlook { landlook } => write!(
                formatter,
                "custom landlook must be 6, 7, or 8; found {landlook}"
            ),
            Self::InvalidCustomCatalog { reason } => {
                write!(formatter, "custom landlook catalog is invalid: {reason}")
            }
        }
    }
}

impl std::error::Error for MapstatsCodecError {}

pub fn standard_landlook_source_name(landlook: i8) -> Option<&'static str> {
    match landlook {
        0 => Some("Data P BD"),
        3 => Some("Data SUB BD"),
        4 => Some("Data Castle BD"),
        5 => Some("Data Desert BD"),
        9 => Some("Data Swamp BD"),
        10 => Some("Data Snow BD"),
        _ => None,
    }
}

pub fn custom_landlook_source_name(landlook: i8) -> Option<&'static str> {
    match landlook {
        6 => Some("Data Custom 1 BD"),
        7 => Some("Data Custom 2 BD"),
        8 => Some("Data Custom 3 BD"),
        _ => None,
    }
}

pub fn decode_landlook_mapstats(
    bytes: &[u8],
    landlook: i8,
    source: impl Into<String>,
    source_blob: BlobId,
) -> Result<DecodedLandlookMapstats, MapstatsCodecError> {
    if bytes.len() < MAPSTATS_CORE_BYTES {
        return Err(MapstatsCodecError::TooShort {
            expected: MAPSTATS_CORE_BYTES,
            actual: bytes.len(),
        });
    }

    let source = source.into();
    let profiles = (0..MAPSTATS_RECORDS)
        .map(|tile| {
            let start = tile * MAPSTATS_RECORD_BYTES;
            let solid_type = i16_be(bytes, start + 4);
            let boat_requirement = i16_be(bytes, start + 8);
            let fly_float = i16_be(bytes, start + 14) != 0;
            TerrainProfile {
                source: source.clone(),
                source_blob: Some(source_blob.clone()),
                tile: if landlook == -1 {
                    tile as i16 + 200
                } else {
                    tile as i16
                },
                landlook: Some(landlook),
                movement_sound_id: Some(i16_be(bytes, start)),
                movement_cost: i16_be(bytes, start + 2),
                solid_type,
                walkable: solid_type == 0 && boat_requirement == 0 && !fly_float,
                shore: i16_be(bytes, start + 6) != 0,
                boat_requirement,
                path: i16_be(bytes, start + 10) != 0,
                blocks_los: i16_be(bytes, start + 12) != 0,
                fly_float,
                forest_type: i16_be(bytes, start + 16),
                combat_build: [
                    [
                        i16_be(bytes, start + 20),
                        i16_be(bytes, start + 22),
                        i16_be(bytes, start + 24),
                    ],
                    [
                        i16_be(bytes, start + 26),
                        i16_be(bytes, start + 28),
                        i16_be(bytes, start + 30),
                    ],
                    [
                        i16_be(bytes, start + 32),
                        i16_be(bytes, start + 34),
                        i16_be(bytes, start + 36),
                    ],
                ],
            }
        })
        .collect();
    let base_offset = MAPSTATS_RECORD_BYTES * MAPSTATS_RECORDS;
    Ok(DecodedLandlookMapstats {
        catalog: LandlookCatalogMetadata {
            landlook,
            source,
            source_blob,
            byte_length: bytes.len() as u64,
            base_tile: i16_be(bytes, base_offset),
            base_scale: i16_be(bytes, base_offset + 2),
            range_slots: Vec::new(),
        },
        profiles,
        trailing_bytes: bytes[MAPSTATS_CORE_BYTES..].to_vec(),
    })
}

pub fn decode_custom_landlook_mapstats(
    bytes: &[u8],
    landlook: i8,
    source_blob: BlobId,
) -> Result<DecodedLandlookMapstats, MapstatsCodecError> {
    let source = custom_landlook_source_name(landlook)
        .ok_or(MapstatsCodecError::InvalidCustomLandlook { landlook })?;
    if bytes.len() != MAPSTATS_REFERENCE_BYTES {
        return Err(MapstatsCodecError::WrongCustomLength {
            expected: MAPSTATS_REFERENCE_BYTES,
            actual: bytes.len(),
        });
    }
    let mut decoded = decode_landlook_mapstats(bytes, landlook, source, source_blob)?;
    decoded.catalog.range_slots = decode_range_slots(bytes);
    Ok(decoded)
}

fn decode_range_slots(bytes: &[u8]) -> Vec<LandlookRangeSlot> {
    if bytes.len() < MAPSTATS_REFERENCE_BYTES {
        return Vec::new();
    }
    (0..MAPSTATS_RANGE_SLOTS)
        .map(|slot| {
            let start = MAPSTATS_CORE_BYTES + slot * MAPSTATS_RANGE_SLOT_BYTES;
            LandlookRangeSlot {
                slot: slot as u8,
                first_tile: i16_be(bytes, start),
                last_tile: i16_be(bytes, start + 2),
            }
        })
        .collect()
}

fn overlay_i16(
    output: &mut [u8],
    offset: usize,
    before: Option<i16>,
    after: Option<i16>,
) -> Result<(), MapstatsCodecError> {
    let before = before.ok_or_else(|| MapstatsCodecError::InvalidCustomCatalog {
        reason: format!("source field at byte {offset} has no signed-word value"),
    })?;
    let after = after.ok_or_else(|| MapstatsCodecError::InvalidCustomCatalog {
        reason: format!("terrain field at byte {offset} has no signed-word value"),
    })?;
    overlay_word(output, offset, before, after);
    Ok(())
}

fn overlay_word(output: &mut [u8], offset: usize, before: i16, after: i16) {
    if before != after {
        output[offset..offset + 2].copy_from_slice(&after.to_be_bytes());
    }
}

fn overlay_bool(output: &mut [u8], offset: usize, before: bool, after: bool) {
    if before != after {
        output[offset..offset + 2]
            .copy_from_slice(&(if after { 1_i16 } else { 0_i16 }).to_be_bytes());
    }
}

fn i16_be(bytes: &[u8], offset: usize) -> i16 {
    i16::from_be_bytes([bytes[offset], bytes[offset + 1]])
}

#[cfg(test)]
mod tests {
    use super::*;

    fn put_i16(bytes: &mut [u8], offset: usize, value: i16) {
        bytes[offset..offset + 2].copy_from_slice(&value.to_be_bytes());
    }

    #[test]
    fn decodes_the_runtime_consumed_201_record_core_and_keeps_the_tail_bounded() {
        let mut source = vec![0u8; MAPSTATS_CORE_BYTES];
        let row = 7 * MAPSTATS_RECORD_BYTES;
        for (offset, value) in [
            (0, 82),
            (2, -3),
            (4, 0),
            (6, 2),
            (8, 0),
            (10, -1),
            (12, 5),
            (14, 0),
            (16, 6),
            (18, 99),
            (20, 101),
            (22, 102),
            (24, 103),
            (26, 104),
            (28, 105),
            (30, 106),
            (32, 107),
            (34, 108),
            (36, 109),
            (38, 12),
        ] {
            put_i16(&mut source, row + offset, value);
        }
        let base_offset = MAPSTATS_RECORD_BYTES * MAPSTATS_RECORDS;
        put_i16(&mut source, base_offset, 156);
        put_i16(&mut source, base_offset + 2, 4);
        source.extend_from_slice(&[0xde, 0xad]);
        let blob = BlobId("a".repeat(64));

        let decoded = decode_landlook_mapstats(&source, 5, "Data Desert BD", blob.clone())
            .expect("decode controlled Map Stats");

        assert_eq!(decoded.profiles.len(), MAPSTATS_RECORDS);
        assert_eq!(decoded.trailing_bytes, [0xde, 0xad]);
        assert_eq!(decoded.catalog.landlook, 5);
        assert_eq!(decoded.catalog.source_blob, blob);
        assert_eq!(decoded.catalog.byte_length, source.len() as u64);
        assert_eq!(decoded.catalog.base_tile, 156);
        assert_eq!(decoded.catalog.base_scale, 4);
        assert!(decoded.catalog.range_slots.is_empty());
        let profile = &decoded.profiles[7];
        assert_eq!(profile.movement_sound_id, Some(82));
        assert_eq!(profile.movement_cost, -3);
        assert!(profile.walkable);
        assert!(profile.shore);
        assert!(profile.path);
        assert!(profile.blocks_los);
        assert!(!profile.fly_float);
        assert_eq!(profile.forest_type, 6);
        assert_eq!(
            profile.combat_build,
            [[101, 102, 103], [104, 105, 106], [107, 108, 109]]
        );
        assert_eq!(
            profile.source_blob.as_ref(),
            Some(&decoded.catalog.source_blob)
        );
    }

    #[test]
    fn classic_boolean_words_are_nonzero_truth_values() {
        let mut source = vec![0u8; MAPSTATS_CORE_BYTES];
        for offset in [6, 10, 12, 14] {
            put_i16(&mut source, offset, -7);
        }
        let decoded =
            decode_landlook_mapstats(&source, 0, "Data P BD", BlobId("b".repeat(64))).unwrap();
        let profile = &decoded.profiles[0];
        assert!(profile.shore);
        assert!(profile.path);
        assert!(profile.blocks_los);
        assert!(profile.fly_float);
        assert!(!profile.walkable);
    }

    #[test]
    fn combat_data_rows_project_to_the_classic_200_through_400_tile_domain() {
        let source = vec![0u8; MAPSTATS_CORE_BYTES];
        let decoded =
            decode_landlook_mapstats(&source, -1, "Combat Data BD", BlobId("d".repeat(64)))
                .unwrap();

        assert_eq!(decoded.profiles.first().unwrap().tile, 200);
        assert_eq!(decoded.profiles.last().unwrap().tile, 400);
        assert!(
            decoded
                .profiles
                .iter()
                .all(|profile| profile.landlook == Some(-1))
        );
    }

    #[test]
    fn rejects_a_truncated_runtime_core() {
        let error = decode_landlook_mapstats(
            &vec![0u8; MAPSTATS_CORE_BYTES - 1],
            0,
            "Data P BD",
            BlobId("c".repeat(64)),
        )
        .unwrap_err();
        assert_eq!(
            error,
            MapstatsCodecError::TooShort {
                expected: MAPSTATS_CORE_BYTES,
                actual: MAPSTATS_CORE_BYTES - 1,
            }
        );
    }

    #[test]
    fn standard_landlook_names_are_closed_and_source_backed() {
        assert_eq!(standard_landlook_source_name(0), Some("Data P BD"));
        assert_eq!(standard_landlook_source_name(10), Some("Data Snow BD"));
        assert_eq!(standard_landlook_source_name(6), None);
    }

    #[test]
    fn custom_landlook_no_edit_round_trip_preserves_unowned_and_noncanonical_bytes() {
        let mut source = vec![0u8; MAPSTATS_REFERENCE_BYTES];
        put_i16(&mut source, 6, -7);
        put_i16(&mut source, 18, 0x1234);
        put_i16(&mut source, 38, -99);
        put_i16(&mut source, MAPSTATS_CORE_BYTES, 62);
        put_i16(&mut source, MAPSTATS_CORE_BYTES + 2, 85);
        put_i16(&mut source, MAPSTATS_CORE_BYTES + 4, 0x4567);
        let blob = BlobId("e".repeat(64));
        let decoded = decode_custom_landlook_mapstats(&source, 6, blob).unwrap();

        let encoded =
            encode_custom_landlook_mapstats(&decoded.catalog, &decoded.profiles, &source).unwrap();

        assert_eq!(encoded, source);
        assert_eq!(decoded.catalog.range_slots.len(), MAPSTATS_RANGE_SLOTS);
        assert_eq!(decoded.catalog.range_slots[0].first_tile, 62);
        assert_eq!(decoded.catalog.range_slots[0].last_tile, 85);
    }

    #[test]
    fn custom_landlook_edits_only_declared_owned_words() {
        let mut source = vec![0u8; MAPSTATS_REFERENCE_BYTES];
        put_i16(&mut source, 18, 0x1234);
        put_i16(&mut source, MAPSTATS_CORE_BYTES + 4, 0x4567);
        let blob = BlobId("f".repeat(64));
        let mut decoded = decode_custom_landlook_mapstats(&source, 7, blob).unwrap();
        decoded.profiles[3].movement_cost = 9;
        decoded.profiles[3].blocks_los = true;
        decoded.profiles[3].combat_build[2][1] = -12;
        decoded.catalog.base_tile = 156;
        decoded.catalog.range_slots[4].first_tile = 101;
        decoded.catalog.range_slots[4].last_tile = 120;

        let encoded =
            encode_custom_landlook_mapstats(&decoded.catalog, &decoded.profiles, &source).unwrap();
        let changed = source
            .iter()
            .zip(&encoded)
            .enumerate()
            .filter_map(|(index, (before, after))| (before != after).then_some(index))
            .collect::<Vec<_>>();

        assert_eq!(
            changed,
            vec![
                3 * MAPSTATS_RECORD_BYTES + 3,
                3 * MAPSTATS_RECORD_BYTES + 13,
                3 * MAPSTATS_RECORD_BYTES + 34,
                3 * MAPSTATS_RECORD_BYTES + 35,
                MAPSTATS_RECORD_BYTES * MAPSTATS_RECORDS + 1,
                MAPSTATS_CORE_BYTES + 4 * MAPSTATS_RANGE_SLOT_BYTES + 1,
                MAPSTATS_CORE_BYTES + 4 * MAPSTATS_RANGE_SLOT_BYTES + 3,
            ]
        );
        assert_eq!(i16_be(&encoded, 18), 0x1234);
        assert_eq!(i16_be(&encoded, MAPSTATS_CORE_BYTES + 4), 0x4567);
    }

    #[test]
    fn custom_landlook_requires_one_exact_certified_source() {
        assert_eq!(custom_landlook_source_name(8), Some("Data Custom 3 BD"));
        assert_eq!(custom_landlook_source_name(5), None);
        assert_eq!(
            decode_custom_landlook_mapstats(
                &vec![0; MAPSTATS_REFERENCE_BYTES - 1],
                6,
                BlobId("g".repeat(64)),
            )
            .unwrap_err(),
            MapstatsCodecError::WrongCustomLength {
                expected: MAPSTATS_REFERENCE_BYTES,
                actual: MAPSTATS_REFERENCE_BYTES - 1,
            }
        );
    }
}

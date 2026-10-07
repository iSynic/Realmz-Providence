use std::collections::BTreeSet;

use crate::model::{LevelType, MapLevel, MapRuntimeMetadata, RandomRectangle, StableId};

use super::DecodedRecordFile;

pub const RANDOM_LEVEL_RECORD_BYTES: usize = 644;
pub const RANDOM_RECTANGLE_SLOTS: usize = 20;
pub const RANDOM_LEVEL_PADDING_OFFSET: usize = 563;

const RECTANGLES_OFFSET: usize = 0;
const CHANCES_OFFSET: usize = 160;
const BATTLE_RANGES_OFFSET: usize = 200;
const RANDOM_DOORS_OFFSET: usize = 280;
const RANDOM_DOOR_CHANCES_OFFSET: usize = 400;
pub const RANDOM_LEVEL_LANDLOOK_OFFSET: usize = 520;
const DARK_OFFSET: usize = 521;
const USES_LOS_OFFSET: usize = 522;
const ONLY_OFFSET: usize = 523;
const OPTION_OFFSET: usize = 543;
const SOUND_OFFSET: usize = 564;
const TEXT_OFFSET: usize = 604;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DecodedMapRuntimeRecord {
    pub level_type: LevelType,
    pub native_index: u32,
    pub runtime: MapRuntimeMetadata,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RandomLevelCodecError {
    DuplicateLevelIndex(u32),
    SparseLevelIndex { expected: u32, actual: u32 },
    MissingRuntimeMetadata(StableId),
    MissingLandlook(StableId),
    InvalidRectangleIdentity { map: StableId, rectangle: StableId },
    DuplicateRectangleSlot { map: StableId, slot: u8 },
    RectangleSlotOutOfRange { map: StableId, slot: u32 },
    OptionOutOfRange { rectangle: StableId, value: i16 },
}

impl std::fmt::Display for RandomLevelCodecError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::DuplicateLevelIndex(index) => {
                write!(formatter, "duplicate random-level index {index}")
            }
            Self::SparseLevelIndex { expected, actual } => write!(
                formatter,
                "random-level indices must be dense; expected {expected}, found {actual}"
            ),
            Self::MissingRuntimeMetadata(map) => {
                write!(formatter, "map '{}' lacks random-level metadata", map.0)
            }
            Self::MissingLandlook(map) => {
                write!(
                    formatter,
                    "map '{}' lacks its random-level landlook byte",
                    map.0
                )
            }
            Self::InvalidRectangleIdentity { map, rectangle } => write!(
                formatter,
                "random rectangle '{}' does not identify a slot owned by map '{}'",
                rectangle.0, map.0
            ),
            Self::DuplicateRectangleSlot { map, slot } => write!(
                formatter,
                "dungeon map '{}' has duplicate random rectangle slot {slot}",
                map.0
            ),
            Self::RectangleSlotOutOfRange { map, slot } => write!(
                formatter,
                "dungeon map '{}' random rectangle slot {slot} is outside 0 through 19",
                map.0
            ),
            Self::OptionOutOfRange { rectangle, value } => write!(
                formatter,
                "random rectangle '{}' option value {value} is outside the signed-byte range",
                rectangle.0
            ),
        }
    }
}

impl std::error::Error for RandomLevelCodecError {}

pub fn decode_dungeon_random_levels(bytes: &[u8]) -> DecodedRecordFile<DecodedMapRuntimeRecord> {
    decode_random_levels(bytes, LevelType::Dungeon, "Data RDD")
}

pub fn decode_land_random_levels(bytes: &[u8]) -> DecodedRecordFile<DecodedMapRuntimeRecord> {
    decode_random_levels(bytes, LevelType::Land, "Data RD")
}

fn decode_random_levels(
    bytes: &[u8],
    level_type: LevelType,
    source: &str,
) -> DecodedRecordFile<DecodedMapRuntimeRecord> {
    let complete_bytes = bytes.len() / RANDOM_LEVEL_RECORD_BYTES * RANDOM_LEVEL_RECORD_BYTES;
    let records = bytes[..complete_bytes]
        .chunks_exact(RANDOM_LEVEL_RECORD_BYTES)
        .enumerate()
        .map(|(level_index, record)| DecodedMapRuntimeRecord {
            level_type,
            native_index: level_index as u32,
            runtime: decode_runtime_record(record, level_index, level_type, source),
        })
        .collect();
    DecodedRecordFile {
        records,
        trailing_bytes: bytes[complete_bytes..].to_vec(),
    }
}

pub fn encode_dungeon_random_levels(
    maps: &[MapLevel],
    compatibility_source: Option<&[u8]>,
) -> Result<Vec<u8>, RandomLevelCodecError> {
    encode_random_levels(maps, LevelType::Dungeon, compatibility_source)
}

pub fn encode_land_random_levels(
    maps: &[MapLevel],
    compatibility_source: Option<&[u8]>,
) -> Result<Vec<u8>, RandomLevelCodecError> {
    encode_random_levels(maps, LevelType::Land, compatibility_source)
}

fn encode_random_levels(
    maps: &[MapLevel],
    level_type: LevelType,
    compatibility_source: Option<&[u8]>,
) -> Result<Vec<u8>, RandomLevelCodecError> {
    let mut selected = maps
        .iter()
        .filter(|map| map.level_type == level_type)
        .collect::<Vec<_>>();
    selected.sort_by_key(|map| map.native_index);
    for (expected, map) in selected.iter().enumerate() {
        if expected > 0 && selected[expected - 1].native_index == map.native_index {
            return Err(RandomLevelCodecError::DuplicateLevelIndex(map.native_index));
        }
        if map.native_index != expected as u32 {
            return Err(RandomLevelCodecError::SparseLevelIndex {
                expected: expected as u32,
                actual: map.native_index,
            });
        }
    }

    let source_body = compatibility_source
        .map(|source| source.len() / RANDOM_LEVEL_RECORD_BYTES * RANDOM_LEVEL_RECORD_BYTES)
        .unwrap_or_default();
    let decoded_source = compatibility_source.map(|source| {
        decode_random_levels(
            source,
            level_type,
            match level_type {
                LevelType::Land => "Data RD",
                LevelType::Dungeon => "Data RDD",
            },
        )
    });
    let mut output = Vec::with_capacity(selected.len() * RANDOM_LEVEL_RECORD_BYTES);
    for map in selected {
        let runtime = map
            .runtime
            .as_ref()
            .ok_or_else(|| RandomLevelCodecError::MissingRuntimeMetadata(map.identity.clone()))?;
        let source_record = compatibility_source.and_then(|source| {
            let start = map.native_index as usize * RANDOM_LEVEL_RECORD_BYTES;
            (start + RANDOM_LEVEL_RECORD_BYTES <= source_body)
                .then(|| &source[start..start + RANDOM_LEVEL_RECORD_BYTES])
        });
        let source_runtime = decoded_source.as_ref().and_then(|decoded| {
            decoded
                .records
                .get(map.native_index as usize)
                .map(|record| &record.runtime)
        });
        let mut record = [0u8; RANDOM_LEVEL_RECORD_BYTES];
        encode_runtime_record(&mut record, map, runtime)?;
        if let (Some(raw), Some(original)) = (source_record, source_runtime) {
            preserve_unchanged(&mut record, map, original, raw)?;
        }
        output.extend_from_slice(&record);
    }
    append_trailing_bytes(&mut output, compatibility_source, RANDOM_LEVEL_RECORD_BYTES);
    Ok(output)
}

fn preserve_unchanged(
    record: &mut [u8; RANDOM_LEVEL_RECORD_BYTES],
    map: &MapLevel,
    original: &MapRuntimeMetadata,
    raw: &[u8],
) -> Result<(), RandomLevelCodecError> {
    let mut original_values = [0u8; RANDOM_LEVEL_RECORD_BYTES];
    encode_runtime_record(&mut original_values, map, original)?;
    // Compare native slots, not collection order. Unchanged values retain their
    // exact imported representation, including noncanonical flags and residue.
    for offset in 0..RANDOM_LEVEL_RECORD_BYTES {
        if record[offset] == original_values[offset] {
            record[offset] = raw[offset];
        }
    }
    Ok(())
}

fn decode_runtime_record(
    record: &[u8],
    level_index: usize,
    level_type: LevelType,
    source: &str,
) -> MapRuntimeMetadata {
    let mut random_rectangles = Vec::new();
    for slot in 0..RANDOM_RECTANGLE_SLOTS {
        let rectangle = decode_rectangle(record, level_index, slot, level_type);
        if rectangle_has_semantics(&rectangle) {
            random_rectangles.push(rectangle);
        }
    }
    MapRuntimeMetadata {
        source: source.into(),
        source_blob: None,
        dark: record[DARK_OFFSET] != 0,
        uses_los: record[USES_LOS_OFFSET] != 0,
        landlook: Some(record[RANDOM_LEVEL_LANDLOOK_OFFSET] as i8),
        base_scale: None,
        tileset_id: match level_type {
            LevelType::Land => StableId(format!(
                "classic.landlook.{}",
                record[RANDOM_LEVEL_LANDLOOK_OFFSET] as i8
            )),
            LevelType::Dungeon => StableId("dungeon-top-down-302".into()),
        },
        base_tile: None,
        random_rectangles,
    }
}

fn decode_rectangle(
    record: &[u8],
    level_index: usize,
    slot: usize,
    level_type: LevelType,
) -> RandomRectangle {
    let rectangle_offset = RECTANGLES_OFFSET + slot * 8;
    RandomRectangle {
        identity: StableId(format!(
            "{}:{level_index}:rect:{slot}",
            match level_type {
                LevelType::Land => "land",
                LevelType::Dungeon => "dungeon",
            }
        )),
        top: read_i16(record, rectangle_offset),
        left: read_i16(record, rectangle_offset + 2),
        bottom: read_i16(record, rectangle_offset + 4),
        right: read_i16(record, rectangle_offset + 6),
        chance_ten_thousand: read_i16(record, CHANCES_OFFSET + slot * 2),
        battle_range: [
            read_i16(record, BATTLE_RANGES_OFFSET + slot * 4),
            read_i16(record, BATTLE_RANGES_OFFSET + slot * 4 + 2),
        ],
        random_doors: std::array::from_fn(|door| {
            read_i16(record, RANDOM_DOORS_OFFSET + slot * 6 + door * 2)
        }),
        random_door_percent: std::array::from_fn(|door| {
            read_i16(record, RANDOM_DOOR_CHANCES_OFFSET + slot * 6 + door * 2)
        }),
        only: record[ONLY_OFFSET + slot] != 0,
        option: i16::from(record[OPTION_OFFSET + slot] as i8),
        sound_id: read_i16(record, SOUND_OFFSET + slot * 2),
        text_id: read_i16(record, TEXT_OFFSET + slot * 2),
    }
}

fn encode_runtime_record(
    record: &mut [u8],
    map: &MapLevel,
    runtime: &MapRuntimeMetadata,
) -> Result<(), RandomLevelCodecError> {
    record[RANDOM_LEVEL_LANDLOOK_OFFSET] = runtime
        .landlook
        .ok_or_else(|| RandomLevelCodecError::MissingLandlook(map.identity.clone()))?
        as u8;
    record[DARK_OFFSET] = u8::from(runtime.dark);
    record[USES_LOS_OFFSET] = u8::from(runtime.uses_los);
    let mut slots = BTreeSet::new();
    for rectangle in &runtime.random_rectangles {
        let slot = rectangle_slot(&map.identity, &rectangle.identity)?;
        if slot >= RANDOM_RECTANGLE_SLOTS as u32 {
            return Err(RandomLevelCodecError::RectangleSlotOutOfRange {
                map: map.identity.clone(),
                slot,
            });
        }
        if !slots.insert(slot) {
            return Err(RandomLevelCodecError::DuplicateRectangleSlot {
                map: map.identity.clone(),
                slot: slot as u8,
            });
        }
        let option = i8::try_from(rectangle.option).map_err(|_| {
            RandomLevelCodecError::OptionOutOfRange {
                rectangle: rectangle.identity.clone(),
                value: rectangle.option,
            }
        })?;
        let slot = slot as usize;
        let rectangle_offset = RECTANGLES_OFFSET + slot * 8;
        write_i16(record, rectangle_offset, rectangle.top);
        write_i16(record, rectangle_offset + 2, rectangle.left);
        write_i16(record, rectangle_offset + 4, rectangle.bottom);
        write_i16(record, rectangle_offset + 6, rectangle.right);
        write_i16(
            record,
            CHANCES_OFFSET + slot * 2,
            rectangle.chance_ten_thousand,
        );
        write_i16(
            record,
            BATTLE_RANGES_OFFSET + slot * 4,
            rectangle.battle_range[0],
        );
        write_i16(
            record,
            BATTLE_RANGES_OFFSET + slot * 4 + 2,
            rectangle.battle_range[1],
        );
        for door in 0..3 {
            write_i16(
                record,
                RANDOM_DOORS_OFFSET + slot * 6 + door * 2,
                rectangle.random_doors[door],
            );
            write_i16(
                record,
                RANDOM_DOOR_CHANCES_OFFSET + slot * 6 + door * 2,
                rectangle.random_door_percent[door],
            );
        }
        record[ONLY_OFFSET + slot] = u8::from(rectangle.only);
        record[OPTION_OFFSET + slot] = option as u8;
        write_i16(record, SOUND_OFFSET + slot * 2, rectangle.sound_id);
        write_i16(record, TEXT_OFFSET + slot * 2, rectangle.text_id);
    }
    Ok(())
}

fn rectangle_slot(map: &StableId, rectangle: &StableId) -> Result<u32, RandomLevelCodecError> {
    rectangle
        .0
        .strip_prefix(&format!("{}:rect:", map.0))
        .and_then(|slot| slot.parse().ok())
        .ok_or_else(|| RandomLevelCodecError::InvalidRectangleIdentity {
            map: map.clone(),
            rectangle: rectangle.clone(),
        })
}

fn rectangle_has_semantics(rectangle: &RandomRectangle) -> bool {
    rectangle.top != 0
        || rectangle.left != 0
        || rectangle.bottom != 0
        || rectangle.right != 0
        || rectangle.chance_ten_thousand != 0
        || rectangle.battle_range != [0; 2]
        || rectangle.random_doors != [0; 3]
        || rectangle.random_door_percent != [0; 3]
        || rectangle.only
        || rectangle.option != 0
        || rectangle.sound_id != 0
        || rectangle.text_id != 0
}

fn read_i16(bytes: &[u8], offset: usize) -> i16 {
    i16::from_be_bytes([bytes[offset], bytes[offset + 1]])
}

fn write_i16(bytes: &mut [u8], offset: usize, value: i16) {
    bytes[offset..offset + 2].copy_from_slice(&value.to_be_bytes());
}

fn append_trailing_bytes(output: &mut Vec<u8>, source: Option<&[u8]>, row_bytes: usize) {
    if let Some(source) = source {
        let complete_bytes = source.len() / row_bytes * row_bytes;
        output.extend_from_slice(&source[complete_bytes..]);
    }
}

#[cfg(test)]
mod preservation_tests;
#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::CLASSIC_MAP_SIZE;

    pub(super) fn dungeon_map(runtime: MapRuntimeMetadata) -> MapLevel {
        MapLevel {
            identity: StableId("dungeon:0".into()),
            level_type: LevelType::Dungeon,
            native_index: 0,
            name: "Vault of Embers".into(),
            tiles: vec![0; CLASSIC_MAP_SIZE * CLASSIC_MAP_SIZE],
            runtime: Some(runtime),
        }
    }

    pub(super) fn land_map(runtime: MapRuntimeMetadata) -> MapLevel {
        MapLevel {
            identity: StableId("land:0".into()),
            level_type: LevelType::Land,
            native_index: 0,
            name: "Ashen Coast".into(),
            tiles: vec![0; CLASSIC_MAP_SIZE * CLASSIC_MAP_SIZE],
            runtime: Some(runtime),
        }
    }

    #[test]
    fn data_rd_uses_land_identity_and_preserves_exact_source_bytes() {
        let mut source = vec![0; RANDOM_LEVEL_RECORD_BYTES];
        write_i16(&mut source, 8, 3);
        write_i16(&mut source, 10, 4);
        write_i16(&mut source, 12, 8);
        write_i16(&mut source, 14, 9);
        write_i16(&mut source, 162, 200);
        source[RANDOM_LEVEL_LANDLOOK_OFFSET] = 5;
        source[DARK_OFFSET] = 0xa5;
        source[RANDOM_LEVEL_PADDING_OFFSET] = 0x5a;

        let decoded = decode_land_random_levels(&source);
        let runtime = &decoded.records[0].runtime;
        assert_eq!(decoded.records[0].level_type, LevelType::Land);
        assert_eq!(runtime.source, "Data RD");
        assert_eq!(runtime.tileset_id, StableId("classic.landlook.5".into()));
        assert_eq!(
            runtime.random_rectangles[0].identity,
            StableId("land:0:rect:1".into())
        );
        assert_eq!(
            encode_land_random_levels(&[land_map(runtime.clone())], Some(&source)).unwrap(),
            source
        );
    }

    #[test]
    fn data_rd_append_preserves_imported_rows_and_generates_the_new_row() {
        let mut source = vec![0xa5; RANDOM_LEVEL_RECORD_BYTES];
        source[RANDOM_LEVEL_LANDLOOK_OFFSET] = 5;
        source[RANDOM_LEVEL_PADDING_OFFSET] = 0x5a;
        source.extend_from_slice(&[0xde, 0xad]);
        let imported_runtime = decode_land_random_levels(&source).records[0]
            .runtime
            .clone();
        let authored_runtime = MapRuntimeMetadata {
            source: "Data RD".into(),
            source_blob: None,
            dark: false,
            uses_los: false,
            landlook: Some(0),
            base_scale: None,
            tileset_id: StableId("classic.landlook.0".into()),
            base_tile: Some(156),
            random_rectangles: Vec::new(),
        };
        let authored = MapLevel {
            identity: StableId("land:1".into()),
            level_type: LevelType::Land,
            native_index: 1,
            name: "New road".into(),
            tiles: vec![156; CLASSIC_MAP_SIZE * CLASSIC_MAP_SIZE],
            runtime: Some(authored_runtime),
        };

        let output =
            encode_land_random_levels(&[land_map(imported_runtime), authored], Some(&source))
                .expect("append one authored Data RD row");

        assert_eq!(
            &output[..RANDOM_LEVEL_RECORD_BYTES],
            &source[..RANDOM_LEVEL_RECORD_BYTES]
        );
        assert_eq!(output.len(), RANDOM_LEVEL_RECORD_BYTES * 2 + 2);
        assert_eq!(
            output[RANDOM_LEVEL_RECORD_BYTES + RANDOM_LEVEL_LANDLOOK_OFFSET],
            0
        );
        assert_eq!(
            output[RANDOM_LEVEL_RECORD_BYTES + RANDOM_LEVEL_PADDING_OFFSET],
            0
        );
        assert_eq!(&output[RANDOM_LEVEL_RECORD_BYTES * 2..], &[0xde, 0xad]);
    }

    #[test]
    fn data_rdd_no_edit_preserves_noncanonical_booleans_padding_and_tail() {
        let mut source = vec![0; RANDOM_LEVEL_RECORD_BYTES];
        write_i16(&mut source, 16, -3);
        write_i16(&mut source, 18, 4);
        write_i16(&mut source, 20, 8);
        write_i16(&mut source, 22, 9);
        write_i16(&mut source, 164, 75);
        write_i16(&mut source, 208, 10);
        write_i16(&mut source, 210, 12);
        write_i16(&mut source, 292, 41);
        write_i16(&mut source, 412, -50);
        source[RANDOM_LEVEL_LANDLOOK_OFFSET] = 0xff;
        source[DARK_OFFSET] = 0xa5;
        source[USES_LOS_OFFSET] = 0x80;
        source[ONLY_OFFSET + 2] = 0xfe;
        source[OPTION_OFFSET + 2] = 0xfe;
        source[RANDOM_LEVEL_PADDING_OFFSET] = 0x5a;
        write_i16(&mut source, 568, 17);
        write_i16(&mut source, 608, -23);
        source.extend_from_slice(&[0xde, 0xad]);

        let decoded = decode_dungeon_random_levels(&source);
        assert_eq!(decoded.trailing_bytes, [0xde, 0xad]);
        let runtime = &decoded.records[0].runtime;
        assert_eq!(runtime.landlook, Some(-1));
        assert!(runtime.dark);
        assert!(runtime.uses_los);
        assert_eq!(runtime.random_rectangles.len(), 1);
        assert_eq!(runtime.random_rectangles[0].top, -3);
        assert_eq!(runtime.random_rectangles[0].random_doors[0], 41);
        assert_eq!(runtime.random_rectangles[0].random_door_percent[0], -50);
        assert_eq!(runtime.random_rectangles[0].option, -2);
        assert_eq!(runtime.random_rectangles[0].text_id, -23);

        let map = dungeon_map(runtime.clone());
        assert_eq!(
            encode_dungeon_random_levels(&[map], Some(&source)).unwrap(),
            source
        );
    }

    #[test]
    fn edited_data_rdd_row_regenerates_owned_bytes_but_preserves_padding_and_tail() {
        let mut source = vec![0xa5; RANDOM_LEVEL_RECORD_BYTES];
        source[RANDOM_LEVEL_LANDLOOK_OFFSET] = 2;
        source[RANDOM_LEVEL_PADDING_OFFSET] = 0x5a;
        source.extend_from_slice(&[0xde, 0xad]);
        let mut runtime = decode_dungeon_random_levels(&source).records[0]
            .runtime
            .clone();
        runtime.random_rectangles[0].chance_ten_thousand = 400;
        let output = encode_dungeon_random_levels(&[dungeon_map(runtime)], Some(&source)).unwrap();

        assert_eq!(read_i16(&output, CHANCES_OFFSET), 400);
        assert_eq!(output[RANDOM_LEVEL_PADDING_OFFSET], 0x5a);
        assert_eq!(&output[RANDOM_LEVEL_RECORD_BYTES..], &[0xde, 0xad]);
        let changed = source
            .iter()
            .zip(&output)
            .enumerate()
            .filter_map(|(offset, (left, right))| (left != right).then_some(offset))
            .collect::<Vec<_>>();
        assert_eq!(changed, [CHANCES_OFFSET, CHANCES_OFFSET + 1]);
    }

    #[test]
    fn fresh_data_rdd_output_uses_exact_offsets_and_signed_fields() {
        let runtime = MapRuntimeMetadata {
            source: "authored".into(),
            source_blob: None,
            dark: true,
            uses_los: true,
            landlook: Some(-1),
            base_scale: None,
            tileset_id: StableId("dungeon-top-down-302".into()),
            base_tile: None,
            random_rectangles: vec![RandomRectangle {
                identity: StableId("dungeon:0:rect:2".into()),
                top: 3,
                left: 4,
                bottom: 8,
                right: 9,
                chance_ten_thousand: 75,
                battle_range: [10, 12],
                random_doors: [1, 2, 3],
                random_door_percent: [25, -50, 75],
                only: true,
                option: -2,
                sound_id: 17,
                text_id: 23,
            }],
        };

        let output = encode_dungeon_random_levels(&[dungeon_map(runtime)], None).unwrap();
        assert_eq!(output.len(), RANDOM_LEVEL_RECORD_BYTES);
        assert_eq!(output[RANDOM_LEVEL_LANDLOOK_OFFSET], 0xff);
        assert_eq!(output[DARK_OFFSET], 1);
        assert_eq!(output[USES_LOS_OFFSET], 1);
        assert_eq!(read_i16(&output, 16), 3);
        assert_eq!(read_i16(&output, 164), 75);
        assert_eq!(read_i16(&output, 208), 10);
        assert_eq!(read_i16(&output, 292), 1);
        assert_eq!(read_i16(&output, 412), 25);
        assert_eq!(output[ONLY_OFFSET + 2], 1);
        assert_eq!(output[OPTION_OFFSET + 2], 0xfe);
        assert_eq!(output[RANDOM_LEVEL_PADDING_OFFSET], 0);
        assert_eq!(read_i16(&output, 568), 17);
        assert_eq!(read_i16(&output, 608), 23);
        assert_eq!(output[643], 0);
        let decoded = decode_dungeon_random_levels(&output);
        assert_eq!(decoded.records[0].runtime.random_rectangles.len(), 1);
        assert_eq!(
            encode_dungeon_random_levels(
                &[dungeon_map(decoded.records[0].runtime.clone())],
                Some(&output)
            )
            .unwrap(),
            output
        );
    }
}

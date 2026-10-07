use super::bytes::{append_trailing_bytes, read_i16};
use super::types::{ClassicWorldCodecError, DecodedRecordFile, MAP_LEVEL_BYTES};
use crate::model::{CLASSIC_MAP_SIZE, LevelType, MapLevel, StableId};

pub fn decode_land_maps(bytes: &[u8]) -> DecodedRecordFile<MapLevel> {
    let complete_bytes = bytes.len() / MAP_LEVEL_BYTES * MAP_LEVEL_BYTES;
    let records = bytes[..complete_bytes]
        .chunks_exact(MAP_LEVEL_BYTES)
        .enumerate()
        .map(|(index, record)| {
            let mut tiles = vec![0; CLASSIC_MAP_SIZE * CLASSIC_MAP_SIZE];
            for x in 0..CLASSIC_MAP_SIZE {
                for y in 0..CLASSIC_MAP_SIZE {
                    let native = native_land_cell_index(x, y) * 2;
                    tiles[canonical_land_cell_index(x, y)] = read_i16(&record[native..native + 2]);
                }
            }
            MapLevel {
                identity: StableId(format!("land:{index}")),
                level_type: LevelType::Land,
                native_index: index as u32,
                name: format!("Land level {index}"),
                tiles,
                runtime: None,
            }
        })
        .collect();
    DecodedRecordFile {
        records,
        trailing_bytes: bytes[complete_bytes..].to_vec(),
    }
}

pub fn encode_land_maps(
    maps: &[MapLevel],
    compatibility_source: Option<&[u8]>,
) -> Result<Vec<u8>, ClassicWorldCodecError> {
    let mut selected = maps
        .iter()
        .filter(|map| map.level_type == LevelType::Land)
        .collect::<Vec<_>>();
    selected.sort_by_key(|map| map.native_index);
    for (expected, map) in selected.iter().enumerate() {
        if expected > 0 && selected[expected - 1].native_index == map.native_index {
            return Err(ClassicWorldCodecError::DuplicateMapIndex(map.native_index));
        }
        if map.native_index != expected as u32 {
            return Err(ClassicWorldCodecError::SparseMapIndex {
                expected: expected as u32,
                actual: map.native_index,
            });
        }
        if map.tiles.len() != CLASSIC_MAP_SIZE * CLASSIC_MAP_SIZE {
            return Err(ClassicWorldCodecError::InvalidMapCellCount {
                identity: map.identity.clone(),
                actual: map.tiles.len(),
            });
        }
    }

    let mut output = Vec::with_capacity(selected.len() * MAP_LEVEL_BYTES);
    for map in selected {
        let mut record = vec![0; MAP_LEVEL_BYTES];
        for x in 0..CLASSIC_MAP_SIZE {
            for y in 0..CLASSIC_MAP_SIZE {
                let native = native_land_cell_index(x, y) * 2;
                record[native..native + 2]
                    .copy_from_slice(&map.tiles[canonical_land_cell_index(x, y)].to_be_bytes());
            }
        }
        output.extend_from_slice(&record);
    }
    append_trailing_bytes(&mut output, compatibility_source, MAP_LEVEL_BYTES);
    Ok(output)
}

pub fn decode_dungeon_maps(bytes: &[u8]) -> DecodedRecordFile<MapLevel> {
    let complete_bytes = bytes.len() / MAP_LEVEL_BYTES * MAP_LEVEL_BYTES;
    let records = bytes[..complete_bytes]
        .chunks_exact(MAP_LEVEL_BYTES)
        .enumerate()
        .map(|(index, record)| MapLevel {
            identity: StableId(format!("dungeon:{index}")),
            level_type: LevelType::Dungeon,
            native_index: index as u32,
            name: format!("Dungeon level {index}"),
            tiles: record.chunks_exact(2).map(read_i16).collect(),
            runtime: None,
        })
        .collect();
    DecodedRecordFile {
        records,
        trailing_bytes: bytes[complete_bytes..].to_vec(),
    }
}

pub fn encode_dungeon_maps(
    maps: &[MapLevel],
    compatibility_source: Option<&[u8]>,
) -> Result<Vec<u8>, ClassicWorldCodecError> {
    let mut selected = maps
        .iter()
        .filter(|map| map.level_type == LevelType::Dungeon)
        .collect::<Vec<_>>();
    selected.sort_by_key(|map| map.native_index);
    for (expected, map) in selected.iter().enumerate() {
        if expected > 0 && selected[expected - 1].native_index == map.native_index {
            return Err(ClassicWorldCodecError::DuplicateMapIndex(map.native_index));
        }
        if map.native_index != expected as u32 {
            return Err(ClassicWorldCodecError::SparseMapIndex {
                expected: expected as u32,
                actual: map.native_index,
            });
        }
        if map.tiles.len() != CLASSIC_MAP_SIZE * CLASSIC_MAP_SIZE {
            return Err(ClassicWorldCodecError::InvalidMapCellCount {
                identity: map.identity.clone(),
                actual: map.tiles.len(),
            });
        }
    }

    let mut output = Vec::with_capacity(selected.len() * MAP_LEVEL_BYTES);
    for map in selected {
        for value in &map.tiles {
            output.extend_from_slice(&value.to_be_bytes());
        }
    }
    append_trailing_bytes(&mut output, compatibility_source, MAP_LEVEL_BYTES);
    Ok(output)
}

pub(super) fn native_land_cell_index(x: usize, y: usize) -> usize {
    x * CLASSIC_MAP_SIZE + y
}

pub(super) fn canonical_land_cell_index(x: usize, y: usize) -> usize {
    y * CLASSIC_MAP_SIZE + x
}

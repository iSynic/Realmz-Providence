use super::actions::{decode_action_words, encode_action_words};
use super::bytes::{append_trailing_bytes, read_i32};
use super::types::{
    ACTION_POINT_LEVEL_BYTES, ACTION_POINT_RECORD_BYTES, ACTION_POINTS_PER_LEVEL,
    ClassicWorldCodecError, DecodedRecordFile,
};
use crate::model::{ActionPoint, CLASSIC_MAP_SIZE, LevelType, MapCoordinate, StableId};
use std::collections::BTreeSet;

pub fn decode_land_action_points(bytes: &[u8]) -> DecodedRecordFile<ActionPoint> {
    decode_action_points(bytes, LevelType::Land, "land")
}

pub fn decode_dungeon_action_points(bytes: &[u8]) -> DecodedRecordFile<ActionPoint> {
    decode_action_points(bytes, LevelType::Dungeon, "dungeon")
}

fn decode_action_points(
    bytes: &[u8],
    level_type: LevelType,
    identity_segment: &str,
) -> DecodedRecordFile<ActionPoint> {
    let complete_bytes = bytes.len() / ACTION_POINT_LEVEL_BYTES * ACTION_POINT_LEVEL_BYTES;
    let mut records = Vec::with_capacity(complete_bytes / ACTION_POINT_RECORD_BYTES);
    for (absolute_index, record) in bytes[..complete_bytes]
        .chunks_exact(ACTION_POINT_RECORD_BYTES)
        .enumerate()
    {
        let level_index = absolute_index / ACTION_POINTS_PER_LEVEL;
        let record_index = absolute_index % ACTION_POINTS_PER_LEVEL;
        let classic_door_id = read_i32(&record[0..4]);
        let coordinate = decode_coordinate(classic_door_id, level_index as u32);
        records.push(ActionPoint {
            identity: StableId(format!(
                "action-point:{identity_segment}:{level_index}:{record_index}"
            )),
            level_type,
            level_index: level_index as u32,
            record_index: record_index as u8,
            classic_door_id,
            coordinate,
            post_action_level: record[4],
            post_action_x: record[5],
            post_action_y: record[6],
            chance_percent: record[7] as i8,
            actions: decode_action_words(record),
        });
    }
    DecodedRecordFile {
        records,
        trailing_bytes: bytes[complete_bytes..].to_vec(),
    }
}

pub fn encode_land_action_points(
    action_points: &[ActionPoint],
    minimum_level_count: usize,
    compatibility_source: Option<&[u8]>,
) -> Result<Vec<u8>, ClassicWorldCodecError> {
    encode_action_points(
        action_points,
        LevelType::Land,
        minimum_level_count,
        compatibility_source,
    )
}

pub fn encode_dungeon_action_points(
    action_points: &[ActionPoint],
    minimum_level_count: usize,
    compatibility_source: Option<&[u8]>,
) -> Result<Vec<u8>, ClassicWorldCodecError> {
    encode_action_points(
        action_points,
        LevelType::Dungeon,
        minimum_level_count,
        compatibility_source,
    )
}

fn encode_action_points(
    action_points: &[ActionPoint],
    level_type: LevelType,
    minimum_level_count: usize,
    compatibility_source: Option<&[u8]>,
) -> Result<Vec<u8>, ClassicWorldCodecError> {
    let selected = action_points
        .iter()
        .filter(|action_point| action_point.level_type == level_type)
        .collect::<Vec<_>>();
    let level_count = selected
        .iter()
        .map(|action_point| action_point.level_index as usize + 1)
        .max()
        .unwrap_or(0)
        .max(minimum_level_count);
    let source_body = compatibility_source
        .map(|source| source.len() / ACTION_POINT_LEVEL_BYTES * ACTION_POINT_LEVEL_BYTES)
        .unwrap_or(0);
    let mut output = compatibility_source
        .map(|source| source[..source_body.min(level_count * ACTION_POINT_LEVEL_BYTES)].to_vec())
        .unwrap_or_default();
    output.resize(level_count * ACTION_POINT_LEVEL_BYTES, 0);
    let mut keys = BTreeSet::new();
    for action_point in selected {
        if action_point.record_index as usize >= ACTION_POINTS_PER_LEVEL {
            return Err(ClassicWorldCodecError::ActionPointRecordOutOfRange {
                identity: action_point.identity.clone(),
                record_index: action_point.record_index,
            });
        }
        if !keys.insert((action_point.level_index, action_point.record_index)) {
            return Err(ClassicWorldCodecError::DuplicateActionPoint {
                level_index: action_point.level_index,
                record_index: action_point.record_index,
            });
        }
        let start = action_point.level_index as usize * ACTION_POINT_LEVEL_BYTES
            + action_point.record_index as usize * ACTION_POINT_RECORD_BYTES;
        encode_action_point_record(
            &mut output[start..start + ACTION_POINT_RECORD_BYTES],
            action_point,
        )?;
    }
    append_trailing_bytes(&mut output, compatibility_source, ACTION_POINT_LEVEL_BYTES);
    Ok(output)
}

fn encode_action_point_record(
    record: &mut [u8],
    action_point: &ActionPoint,
) -> Result<(), ClassicWorldCodecError> {
    record.fill(0);
    record[0..4].copy_from_slice(&action_point.classic_door_id.to_be_bytes());
    record[4] = action_point.post_action_level;
    record[5] = action_point.post_action_x;
    record[6] = action_point.post_action_y;
    record[7] = action_point.chance_percent as u8;
    encode_action_words(record, &action_point.identity, &action_point.actions, 8)
}

fn decode_coordinate(classic_door_id: i32, expected_level: u32) -> Option<MapCoordinate> {
    if classic_door_id <= 0 || classic_door_id as u32 / 10_000 != expected_level {
        return None;
    }
    let position = classic_door_id as u32 % 10_000;
    let x = position % 100;
    let y = position / 100;
    (x < CLASSIC_MAP_SIZE as u32 && y < CLASSIC_MAP_SIZE as u32).then_some(MapCoordinate {
        x: x as u8,
        y: y as u8,
    })
}

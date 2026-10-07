use super::actions::{decode_action_words, encode_action_words};
use super::bytes::{append_trailing_bytes, read_i32};
use super::record_extents::certified_extra_action_point_extent;
use super::types::{ClassicWorldCodecError, DecodedRecordFile, EXTRA_ACTION_POINT_RECORD_BYTES};
use crate::model::{ExtraActionPoint, NativeRecordId, StableId};

pub fn decode_extra_action_points(bytes: &[u8]) -> DecodedRecordFile<ExtraActionPoint> {
    let physical_bytes =
        bytes.len() / EXTRA_ACTION_POINT_RECORD_BYTES * EXTRA_ACTION_POINT_RECORD_BYTES;
    let authored_bytes = certified_extra_action_point_extent(bytes)
        .map(|extent| extent.authored_records * EXTRA_ACTION_POINT_RECORD_BYTES)
        .unwrap_or(physical_bytes);
    let records = bytes[..authored_bytes]
        .chunks_exact(EXTRA_ACTION_POINT_RECORD_BYTES)
        .enumerate()
        .map(|(id, record)| ExtraActionPoint {
            identity: StableId(format!("extra-action-point:{id}")),
            native_id: NativeRecordId(id as u32),
            classic_door_id: read_i32(&record[0..4]),
            post_action_level: record[4],
            post_action_x: record[5],
            post_action_y: record[6],
            chance_percent: record[7] as i8,
            actions: decode_action_words(record),
        })
        .collect();
    DecodedRecordFile {
        records,
        trailing_bytes: bytes[authored_bytes..].to_vec(),
    }
}

pub fn encode_extra_action_points(
    extra_action_points: &[ExtraActionPoint],
    compatibility_source: Option<&[u8]>,
) -> Result<Vec<u8>, ClassicWorldCodecError> {
    let mut selected = extra_action_points.iter().collect::<Vec<_>>();
    selected.sort_by_key(|row| row.native_id);
    for pair in selected.windows(2) {
        if pair[0].native_id == pair[1].native_id {
            return Err(ClassicWorldCodecError::DuplicateExtraActionPointId(
                pair[0].native_id,
            ));
        }
    }
    if let Some(extent) = compatibility_source.and_then(certified_extra_action_point_extent)
        && let Some(row) = selected
            .iter()
            .find(|row| row.native_id.0 as usize >= extent.authored_records)
    {
        return Err(
            ClassicWorldCodecError::ExtraActionPointOverlapsCertifiedTail {
                native_id: row.native_id,
                authored_records: extent.authored_records,
            },
        );
    }
    let source_body = compatibility_source
        .map(|source| {
            source.len() / EXTRA_ACTION_POINT_RECORD_BYTES * EXTRA_ACTION_POINT_RECORD_BYTES
        })
        .unwrap_or(0);
    let required = selected
        .last()
        .map(|row| (row.native_id.0 as usize + 1) * EXTRA_ACTION_POINT_RECORD_BYTES)
        .unwrap_or(0);
    let mut output = compatibility_source
        .map(|source| source[..source_body].to_vec())
        .unwrap_or_default();
    output.resize(output.len().max(required), 0);
    for row in selected {
        let start = row.native_id.0 as usize * EXTRA_ACTION_POINT_RECORD_BYTES;
        encode_extra_action_point_record(
            &mut output[start..start + EXTRA_ACTION_POINT_RECORD_BYTES],
            row,
        )?;
    }
    append_trailing_bytes(
        &mut output,
        compatibility_source,
        EXTRA_ACTION_POINT_RECORD_BYTES,
    );
    Ok(output)
}

fn encode_extra_action_point_record(
    record: &mut [u8],
    row: &ExtraActionPoint,
) -> Result<(), ClassicWorldCodecError> {
    record.fill(0);
    record[0..4].copy_from_slice(&row.classic_door_id.to_be_bytes());
    record[4] = row.post_action_level;
    record[5] = row.post_action_x;
    record[6] = row.post_action_y;
    record[7] = row.chance_percent as u8;
    encode_action_words(record, &row.identity, &row.actions, 8)
}

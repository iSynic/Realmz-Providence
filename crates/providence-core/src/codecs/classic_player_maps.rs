use super::classic_text_resources::{decode_mac_roman_text, encode_mac_roman_text};
use crate::model::{NativeRecordId, PlayerMapMarker, PlayerMapRecord, PlayerMapRect, StableId};

pub const PLAYER_MAP_MARKER_SLOTS: usize = 10;
pub const PLAYER_MAP_RECORD_BYTES: usize = 340;
pub const PLAYER_MAP_SPARE_OFFSET: usize = 74;
pub const PLAYER_MAP_NOTE_OFFSET: usize = 84;
pub const PLAYER_MAP_NOTE_BYTES: usize = 256;

pub fn player_map_text_byte_length(text: &str) -> Option<usize> {
    encode_mac_roman_text(text).map(|bytes| bytes.len())
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DecodedPlayerMapFile {
    pub records: Vec<PlayerMapRecord>,
    pub trailing_bytes: Vec<u8>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PlayerMapCodecError {
    DuplicateNativeId(NativeRecordId),
    MissingCompatibilitySource(NativeRecordId),
    UnencodableNote(NativeRecordId),
    InvalidMarkerSlotCount {
        native_id: NativeRecordId,
        actual: usize,
    },
    NoteTooLong {
        native_id: NativeRecordId,
        bytes: usize,
    },
}

impl std::fmt::Display for PlayerMapCodecError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::UnencodableNote(id) => write!(
                formatter,
                "player map {} note contains text that MacRoman cannot represent",
                id.0
            ),
            Self::DuplicateNativeId(id) => {
                write!(formatter, "duplicate Data MD2 player-map id {}", id.0)
            }
            Self::MissingCompatibilitySource(id) => write!(
                formatter,
                "imported player map {} requires its Data MD2 compatibility source",
                id.0
            ),
            Self::InvalidMarkerSlotCount { native_id, actual } => write!(
                formatter,
                "player map {} has {actual} marker slots; expected {PLAYER_MAP_MARKER_SLOTS}",
                native_id.0
            ),
            Self::NoteTooLong { native_id, bytes } => write!(
                formatter,
                "player map {} note encodes to {bytes} bytes; Classic maximum is 255",
                native_id.0
            ),
        }
    }
}

impl std::error::Error for PlayerMapCodecError {}

pub fn decode_player_maps(bytes: &[u8]) -> DecodedPlayerMapFile {
    let complete_bytes = bytes.len() / PLAYER_MAP_RECORD_BYTES * PLAYER_MAP_RECORD_BYTES;
    let records = bytes[..complete_bytes]
        .chunks_exact(PLAYER_MAP_RECORD_BYTES)
        .enumerate()
        .map(|(index, row)| decode_row(row, index as u32))
        .collect();
    DecodedPlayerMapFile {
        records,
        trailing_bytes: bytes[complete_bytes..].to_vec(),
    }
}

pub fn encode_player_maps(
    records: &[PlayerMapRecord],
    compatibility_source: Option<&[u8]>,
) -> Result<Vec<u8>, PlayerMapCodecError> {
    let mut selected = records.iter().collect::<Vec<_>>();
    selected.sort_by_key(|record| record.native_id);
    for pair in selected.windows(2) {
        if pair[0].native_id == pair[1].native_id {
            return Err(PlayerMapCodecError::DuplicateNativeId(pair[0].native_id));
        }
    }
    let source_body_bytes = compatibility_source
        .map(|source| source.len() / PLAYER_MAP_RECORD_BYTES * PLAYER_MAP_RECORD_BYTES)
        .unwrap_or(0);
    let required_bytes = selected
        .last()
        .map(|record| (record.native_id.0 as usize + 1) * PLAYER_MAP_RECORD_BYTES)
        .unwrap_or(0);
    let mut output = compatibility_source
        .map(|source| source[..source_body_bytes].to_vec())
        .unwrap_or_default();
    output.resize(output.len().max(required_bytes), 0);

    for record in selected {
        validate_player_map_record_shape(record)?;
        let start = record.native_id.0 as usize * PLAYER_MAP_RECORD_BYTES;
        let end = start + PLAYER_MAP_RECORD_BYTES;
        if !record.authored {
            if end <= source_body_bytes {
                continue;
            }
            return Err(PlayerMapCodecError::MissingCompatibilitySource(
                record.native_id,
            ));
        }
        encode_row(record, &mut output[start..end])?;
    }
    if let Some(source) = compatibility_source {
        output.extend_from_slice(&source[source_body_bytes..]);
    }
    Ok(output)
}

pub fn validate_player_map_record_shape(
    record: &PlayerMapRecord,
) -> Result<(), PlayerMapCodecError> {
    if record.markers.len() != PLAYER_MAP_MARKER_SLOTS {
        return Err(PlayerMapCodecError::InvalidMarkerSlotCount {
            native_id: record.native_id,
            actual: record.markers.len(),
        });
    }
    let note_bytes = encode_note(record)?;
    if note_bytes.len() > 255 {
        return Err(PlayerMapCodecError::NoteTooLong {
            native_id: record.native_id,
            bytes: note_bytes.len(),
        });
    }
    Ok(())
}

pub fn player_map_record_has_semantics(record: &PlayerMapRecord) -> bool {
    record.authored
        || !record.note.trim().is_empty()
        || record.start_x != 0
        || record.start_y != 0
        || record.level != 0
        || record.picture_id != 0
        || record.show != 0
        || record
            .markers
            .iter()
            .any(|marker| marker.icon_id != 0 || marker.x != 0 || marker.y != 0)
}

fn decode_row(row: &[u8], native_id: u32) -> PlayerMapRecord {
    PlayerMapRecord {
        identity: StableId(format!("player-map:{native_id}")),
        native_id: NativeRecordId(native_id),
        markers: (0..PLAYER_MAP_MARKER_SLOTS)
            .map(|slot| PlayerMapMarker {
                icon_id: read_i16(row, slot * 6),
                x: read_i16(row, slot * 6 + 2),
                y: read_i16(row, slot * 6 + 4),
            })
            .collect(),
        start_x: read_i16(row, 60),
        start_y: read_i16(row, 62),
        level: read_i16(row, 64),
        picture_id: read_i16(row, 66),
        icon_size: read_i16(row, 68),
        show: read_i16(row, 70),
        is_dungeon: read_i16(row, 72) != 0,
        picture_rect: PlayerMapRect {
            top: read_i16(row, 76),
            left: read_i16(row, 78),
            bottom: read_i16(row, 80),
            right: read_i16(row, 82),
        },
        note: decode_pascal_text(&row[PLAYER_MAP_NOTE_OFFSET..]),
        authored: false,
    }
}

fn encode_row(record: &PlayerMapRecord, row: &mut [u8]) -> Result<(), PlayerMapCodecError> {
    let spare = [
        row[PLAYER_MAP_SPARE_OFFSET],
        row[PLAYER_MAP_SPARE_OFFSET + 1],
    ];
    row.fill(0);
    row[PLAYER_MAP_SPARE_OFFSET..PLAYER_MAP_SPARE_OFFSET + 2].copy_from_slice(&spare);
    for (slot, marker) in record.markers.iter().enumerate() {
        write_i16(row, slot * 6, marker.icon_id);
        write_i16(row, slot * 6 + 2, marker.x);
        write_i16(row, slot * 6 + 4, marker.y);
    }
    for (offset, value) in [
        (60, record.start_x),
        (62, record.start_y),
        (64, record.level),
        (66, record.picture_id),
        (68, record.icon_size),
        (70, record.show),
        (72, if record.is_dungeon { 1 } else { 0 }),
        (76, record.picture_rect.top),
        (78, record.picture_rect.left),
        (80, record.picture_rect.bottom),
        (82, record.picture_rect.right),
    ] {
        write_i16(row, offset, value);
    }
    let note = encode_note(record)?;
    if note.len() > 255 {
        return Err(PlayerMapCodecError::NoteTooLong {
            native_id: record.native_id,
            bytes: note.len(),
        });
    }
    row[PLAYER_MAP_NOTE_OFFSET] = note.len() as u8;
    row[PLAYER_MAP_NOTE_OFFSET + 1..PLAYER_MAP_NOTE_OFFSET + 1 + note.len()].copy_from_slice(&note);
    Ok(())
}

fn read_i16(row: &[u8], offset: usize) -> i16 {
    i16::from_be_bytes([row[offset], row[offset + 1]])
}

fn write_i16(row: &mut [u8], offset: usize, value: i16) {
    row[offset..offset + 2].copy_from_slice(&value.to_be_bytes());
}

fn decode_pascal_text(row: &[u8]) -> String {
    let length = usize::from(row[0]).min(255);
    decode_mac_roman_text(&row[1..1 + length])
}

fn encode_note(record: &PlayerMapRecord) -> Result<Vec<u8>, PlayerMapCodecError> {
    encode_mac_roman_text(&record.note)
        .ok_or(PlayerMapCodecError::UnencodableNote(record.native_id))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn authored(native_id: u32) -> PlayerMapRecord {
        let mut markers = vec![
            PlayerMapMarker {
                icon_id: 0,
                x: 0,
                y: 0
            };
            10
        ];
        markers[0] = PlayerMapMarker {
            icon_id: 143,
            x: 12,
            y: -4,
        };
        PlayerMapRecord {
            identity: StableId(format!("player-map:{native_id}")),
            native_id: NativeRecordId(native_id),
            markers,
            start_x: 8,
            start_y: 9,
            level: 2,
            picture_id: 0,
            icon_size: 16,
            show: 0,
            is_dungeon: false,
            picture_rect: PlayerMapRect {
                top: 1,
                left: 2,
                bottom: 40,
                right: 50,
            },
            note: "North road and old watchtower".into(),
            authored: true,
        }
    }

    #[test]
    fn semantic_round_trip_covers_every_authored_field() {
        let expected = authored(0);
        let bytes = encode_player_maps(std::slice::from_ref(&expected), None).unwrap();
        assert_eq!(bytes.len(), PLAYER_MAP_RECORD_BYTES);
        let mut decoded = decode_player_maps(&bytes).records.remove(0);
        decoded.authored = true;
        assert_eq!(decoded, expected);
    }

    #[test]
    fn no_edit_preserves_noncanonical_boolean_pascal_slack_spare_and_tail() {
        let mut source = encode_player_maps(&[authored(0)], None).unwrap();
        source[72..74].copy_from_slice(&(-7_i16).to_be_bytes());
        source[74..76].copy_from_slice(&[0xca, 0xfe]);
        source[PLAYER_MAP_NOTE_OFFSET + 80] = 0xa5;
        source.extend_from_slice(&[0xde, 0xad]);
        let decoded = decode_player_maps(&source);
        assert!(decoded.records[0].is_dungeon);
        assert_eq!(
            encode_player_maps(&decoded.records, Some(&source)).unwrap(),
            source
        );
    }

    #[test]
    fn edit_regenerates_owned_bytes_but_preserves_spare_and_other_rows() {
        let mut source = encode_player_maps(&[authored(0), authored(1)], None).unwrap();
        source[74..76].copy_from_slice(&[0xca, 0xfe]);
        source[72..74].copy_from_slice(&(-9_i16).to_be_bytes());
        source[PLAYER_MAP_NOTE_OFFSET + 100] = 0xa5;
        source.extend_from_slice(&[0xef]);
        let mut records = decode_player_maps(&source).records;
        records[0].authored = true;
        records[0].note = "Edited".into();
        let output = encode_player_maps(&records, Some(&source)).unwrap();
        assert_eq!(&output[74..76], &[0xca, 0xfe]);
        assert_eq!(&output[72..74], &1_i16.to_be_bytes());
        assert_eq!(output[PLAYER_MAP_NOTE_OFFSET + 100], 0);
        assert_eq!(
            &output[PLAYER_MAP_RECORD_BYTES..2 * PLAYER_MAP_RECORD_BYTES],
            &source[PLAYER_MAP_RECORD_BYTES..2 * PLAYER_MAP_RECORD_BYTES]
        );
        assert_eq!(output.last(), Some(&0xef));
    }

    #[test]
    fn physical_rows_beyond_the_twenty_slot_runtime_menu_are_preserved() {
        let source = encode_player_maps(&(0..24).map(authored).collect::<Vec<_>>(), None).unwrap();
        let decoded = decode_player_maps(&source);
        assert_eq!(decoded.records.len(), 24);
        assert_eq!(
            encode_player_maps(&decoded.records, Some(&source)).unwrap(),
            source
        );
    }
    #[test]
    fn marker_edit_preserves_macroman_note_controls_spare_and_tail() {
        let mut record = authored(0);
        record.note = "Caf\u{e9}\n\u{7}  ".into();
        let mut source = encode_player_maps(&[record], None).unwrap();
        source[74..76].copy_from_slice(&[0xca, 0xfe]);
        source.extend_from_slice(&[0xef, 0x80]);
        let mut rows = decode_player_maps(&source).records;
        assert_eq!(rows[0].note, "Caf\u{e9}\n\u{7}  ");
        rows[0].authored = true;
        rows[0].markers[9].x = 15;
        let encoded = encode_player_maps(&rows, Some(&source)).unwrap();
        assert_eq!(&encoded[84..340], &source[84..340]);
        assert_eq!(&encoded[74..76], &[0xca, 0xfe]);
        assert_eq!(&encoded[340..], &[0xef, 0x80]);
        rows[0].note = "\u{1f409}".into();
        assert!(matches!(
            encode_player_maps(&rows, Some(&source)),
            Err(PlayerMapCodecError::UnencodableNote(_))
        ));
    }
}

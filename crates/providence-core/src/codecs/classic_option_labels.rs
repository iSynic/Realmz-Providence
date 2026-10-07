use crate::model::{NativeRecordId, OptionLabelRecord, StableId};

use super::classic_text_feedback::encode_classic_text_with_replacements;
use super::classic_text_resources::decode_mac_roman_text;

pub const OPTION_LABEL_RECORD_BYTES: usize = 25;
pub const OPTION_LABEL_TEXT_BYTES: usize = OPTION_LABEL_RECORD_BYTES - 1;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DecodedOptionLabelFile {
    pub records: Vec<OptionLabelRecord>,
    pub trailing_bytes: Vec<u8>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum OptionLabelCodecError {
    DuplicateNativeId(NativeRecordId),
    MissingCompatibilitySource(NativeRecordId),
    TextTooLong {
        native_id: NativeRecordId,
        bytes: usize,
    },
}

impl std::fmt::Display for OptionLabelCodecError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::DuplicateNativeId(id) => {
                write!(formatter, "duplicate Data OD option-label id {}", id.0)
            }
            Self::MissingCompatibilitySource(id) => write!(
                formatter,
                "imported option label {} requires its Data OD compatibility source",
                id.0
            ),
            Self::TextTooLong { native_id, bytes } => write!(
                formatter,
                "option label {} encodes to {bytes} bytes; Classic maximum is {OPTION_LABEL_TEXT_BYTES}",
                native_id.0
            ),
        }
    }
}

impl std::error::Error for OptionLabelCodecError {}

pub fn decode_option_labels(bytes: &[u8]) -> DecodedOptionLabelFile {
    let complete_bytes = bytes.len() / OPTION_LABEL_RECORD_BYTES * OPTION_LABEL_RECORD_BYTES;
    let records = bytes[..complete_bytes]
        .chunks_exact(OPTION_LABEL_RECORD_BYTES)
        .enumerate()
        .map(|(index, row)| OptionLabelRecord {
            identity: StableId(format!("option-label:{index}")),
            native_id: NativeRecordId(index as u32),
            text: decode_text(row),
            authored: false,
        })
        .collect();
    DecodedOptionLabelFile {
        records,
        trailing_bytes: bytes[complete_bytes..].to_vec(),
    }
}

pub fn encode_option_labels(
    records: &[OptionLabelRecord],
    compatibility_source: Option<&[u8]>,
) -> Result<Vec<u8>, OptionLabelCodecError> {
    let mut selected = records.iter().collect::<Vec<_>>();
    selected.sort_by_key(|record| record.native_id);
    for pair in selected.windows(2) {
        if pair[0].native_id == pair[1].native_id {
            return Err(OptionLabelCodecError::DuplicateNativeId(pair[0].native_id));
        }
    }
    let source_body_bytes = compatibility_source
        .map(|source| source.len() / OPTION_LABEL_RECORD_BYTES * OPTION_LABEL_RECORD_BYTES)
        .unwrap_or(0);
    let required_bytes = selected
        .last()
        .map(|record| (record.native_id.0 as usize + 1) * OPTION_LABEL_RECORD_BYTES)
        .unwrap_or(0);
    let mut output = compatibility_source
        .map(|source| source[..source_body_bytes].to_vec())
        .unwrap_or_default();
    output.resize(output.len().max(required_bytes), 0);

    for record in selected {
        let start = record.native_id.0 as usize * OPTION_LABEL_RECORD_BYTES;
        let end = start + OPTION_LABEL_RECORD_BYTES;
        if !record.authored {
            if end <= source_body_bytes {
                continue;
            }
            return Err(OptionLabelCodecError::MissingCompatibilitySource(
                record.native_id,
            ));
        }
        encode_text(record, &mut output[start..end])?;
    }
    if let Some(source) = compatibility_source {
        output.extend_from_slice(&source[source_body_bytes..]);
    }
    Ok(output)
}

fn decode_text(row: &[u8]) -> String {
    let length = usize::from(row[0]).min(OPTION_LABEL_TEXT_BYTES);
    decode_mac_roman_text(&row[1..1 + length])
}

fn encode_text(record: &OptionLabelRecord, row: &mut [u8]) -> Result<(), OptionLabelCodecError> {
    let bytes = encode_classic_text_with_replacements(&record.text);
    if bytes.len() > OPTION_LABEL_TEXT_BYTES {
        return Err(OptionLabelCodecError::TextTooLong {
            native_id: record.native_id,
            bytes: bytes.len(),
        });
    }
    row.fill(0);
    row[0] = bytes.len() as u8;
    row[1..1 + bytes.len()].copy_from_slice(&bytes);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn authored(native_id: u32, text: &str) -> OptionLabelRecord {
        OptionLabelRecord {
            identity: StableId(format!("option-label:{native_id}")),
            native_id: NativeRecordId(native_id),
            text: text.into(),
            authored: true,
        }
    }

    #[test]
    fn semantic_round_trip_covers_the_complete_owned_row() {
        let expected = authored(0, "Proceed");
        let bytes = encode_option_labels(std::slice::from_ref(&expected), None).unwrap();
        assert_eq!(bytes.len(), OPTION_LABEL_RECORD_BYTES);
        assert_eq!(&bytes[..8], b"\x07Proceed");
        let mut decoded = decode_option_labels(&bytes).records.remove(0);
        decoded.authored = true;
        assert_eq!(decoded, expected);
    }

    #[test]
    fn no_edit_preserves_complete_rows_and_malformed_tail() {
        let mut source = vec![b' '; OPTION_LABEL_RECORD_BYTES];
        source[0] = 2;
        source[1..3].copy_from_slice(b"Go");
        source.extend_from_slice(&[0xde, 0xad]);
        let decoded = decode_option_labels(&source);
        assert_eq!(
            encode_option_labels(&decoded.records, Some(&source)).unwrap(),
            source
        );
    }

    #[test]
    fn edit_regenerates_only_the_selected_row() {
        let mut source =
            encode_option_labels(&[authored(0, "One"), authored(1, "Two")], None).unwrap();
        source.extend_from_slice(&[0xef]);
        let mut records = decode_option_labels(&source).records;
        records[1].authored = true;
        records[1].text = "Changed".into();
        let output = encode_option_labels(&records, Some(&source)).unwrap();
        assert_eq!(
            &output[..OPTION_LABEL_RECORD_BYTES],
            &source[..OPTION_LABEL_RECORD_BYTES]
        );
        assert_eq!(&output[2 * OPTION_LABEL_RECORD_BYTES..], &[0xef]);
        assert_eq!(decode_option_labels(&output).records[1].text, "Changed");
    }

    #[test]
    fn text_longer_than_twenty_four_bytes_is_rejected() {
        assert!(matches!(
            encode_option_labels(&[authored(0, &"x".repeat(25))], None),
            Err(OptionLabelCodecError::TextTooLong { bytes: 25, .. })
        ));
    }
}

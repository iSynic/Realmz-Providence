use crate::model::{ExtraCodeRow, NativeRecordId};

pub const EXTRA_CODE_RECORD_BYTES: usize = 10;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DecodedExtraCodeFile {
    pub rows: Vec<ExtraCodeRow>,
    pub trailing_bytes: Vec<u8>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ExtraCodeCodecError {
    DuplicateNativeId(NativeRecordId),
}

impl std::fmt::Display for ExtraCodeCodecError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::DuplicateNativeId(native_id) => {
                write!(formatter, "duplicate Data EDCD row {}", native_id.0)
            }
        }
    }
}

impl std::error::Error for ExtraCodeCodecError {}

pub fn decode_extra_codes(bytes: &[u8]) -> DecodedExtraCodeFile {
    let complete_bytes = bytes.len() / EXTRA_CODE_RECORD_BYTES * EXTRA_CODE_RECORD_BYTES;
    let rows = bytes[..complete_bytes]
        .chunks_exact(EXTRA_CODE_RECORD_BYTES)
        .enumerate()
        .map(|(native_id, record)| ExtraCodeRow {
            native_id: NativeRecordId(native_id as u32),
            values: std::array::from_fn(|index| {
                i16::from_be_bytes([record[index * 2], record[index * 2 + 1]])
            }),
        })
        .collect();
    DecodedExtraCodeFile {
        rows,
        trailing_bytes: bytes[complete_bytes..].to_vec(),
    }
}

pub fn encode_extra_codes(
    rows: &[ExtraCodeRow],
    compatibility_source: Option<&[u8]>,
) -> Result<Vec<u8>, ExtraCodeCodecError> {
    let mut selected = rows.iter().collect::<Vec<_>>();
    selected.sort_by_key(|row| row.native_id);
    for pair in selected.windows(2) {
        if pair[0].native_id == pair[1].native_id {
            return Err(ExtraCodeCodecError::DuplicateNativeId(pair[0].native_id));
        }
    }
    let required_bytes = selected
        .last()
        .map(|row| (row.native_id.0 as usize + 1) * EXTRA_CODE_RECORD_BYTES)
        .unwrap_or(0);
    let source_body_bytes = compatibility_source
        .map(|source| source.len() / EXTRA_CODE_RECORD_BYTES * EXTRA_CODE_RECORD_BYTES)
        .unwrap_or(0);
    let mut output = compatibility_source
        .map(|source| source[..source_body_bytes].to_vec())
        .unwrap_or_default();
    output.resize(output.len().max(required_bytes), 0);
    for row in selected {
        let start = row.native_id.0 as usize * EXTRA_CODE_RECORD_BYTES;
        for (index, value) in row.values.iter().enumerate() {
            output[start + index * 2..start + index * 2 + 2].copy_from_slice(&value.to_be_bytes());
        }
    }
    if let Some(source) = compatibility_source {
        output.extend_from_slice(&source[source_body_bytes..]);
    }
    Ok(output)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::BTreeMap;

    #[test]
    fn no_edit_round_trip_preserves_all_signed_values_and_trailing_bytes() {
        let mut source = Vec::new();
        for value in [-32768_i16, -4, 0, 999, 32767, 1, 2, 3, 4, 5] {
            source.extend_from_slice(&value.to_be_bytes());
        }
        source.extend_from_slice(&[0xde, 0xad]);

        let decoded = decode_extra_codes(&source);
        let encoded = encode_extra_codes(&decoded.rows, Some(&source)).expect("encode");

        assert_eq!(decoded.rows[0].values, [-32768, -4, 0, 999, 32767]);
        assert_eq!(decoded.trailing_bytes, [0xde, 0xad]);
        assert_eq!(encoded, source);
    }

    #[test]
    fn one_field_edit_changes_only_its_owned_big_endian_short() {
        let source = vec![0xa5; EXTRA_CODE_RECORD_BYTES * 2];
        let mut decoded = decode_extra_codes(&source);
        decoded.rows[1].values[3] = 0x0304;

        let encoded = encode_extra_codes(&decoded.rows, Some(&source)).expect("encode");
        let changed = source
            .iter()
            .zip(&encoded)
            .enumerate()
            .filter_map(|(index, (before, after))| (before != after).then_some(index))
            .collect::<Vec<_>>();

        assert_eq!(changed, vec![16, 17]);
    }

    #[test]
    fn every_semantic_form_uses_the_certified_five_word_geometry() {
        let source_values = [-300, -200, -100, 100, 200];
        let source = source_values
            .iter()
            .flat_map(|value| i16::to_be_bytes(*value))
            .collect::<Vec<_>>();
        for form in crate::action_authoring::catalog().forms {
            let mut typed = BTreeMap::new();
            for field in form.fields.iter().filter(|field| !field.preserved) {
                typed.insert(
                    field.name.clone(),
                    field
                        .choices
                        .first()
                        .map(|choice| choice.value)
                        .unwrap_or(i16::from(field.index) * 37 - 70),
                );
            }
            let values = crate::action_authoring::encode_form_values(
                &form.identity,
                &typed,
                Some(source_values),
            )
            .unwrap_or_else(|error| panic!("{}: {error}", form.identity));
            let encoded = encode_extra_codes(
                &[ExtraCodeRow {
                    native_id: NativeRecordId(0),
                    values,
                }],
                Some(&source),
            )
            .unwrap();
            assert_eq!(encoded.len(), EXTRA_CODE_RECORD_BYTES, "{}", form.identity);
            let decoded = decode_extra_codes(&encoded);
            assert_eq!(decoded.rows[0].values, values, "{}", form.identity);
            for field in form.fields.iter().filter(|field| field.preserved) {
                assert_eq!(
                    decoded.rows[0].values[usize::from(field.index)],
                    source_values[usize::from(field.index)],
                    "{} preserves {}",
                    form.identity,
                    field.name
                );
            }
        }
    }
}

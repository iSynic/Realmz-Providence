use crate::error::{ProvidenceError, Result};
use crate::project::{
    BattleRecord, ComplexEncounterRecord, Confidence, MessageRecord, MonsterDescriptionRecord,
    MonsterRecord, OptionLabelRecord, Provenance, ScenarioItemRecord, ShopRecord,
    SimpleEncounterRecord, ThiefEncounterRecord, TimedEncounterRecord, TreasureRecord,
};

pub(super) fn parse_fixed_records(
    buffer: &[u8],
    record_bytes: usize,
) -> impl Iterator<Item = (usize, usize, &[u8])> {
    (0..buffer.len() / record_bytes).map(move |id| {
        let start = id * record_bytes;
        (id, start, &buffer[start..start + record_bytes])
    })
}

pub(super) fn write_fixed_records<T>(
    records: &[T],
    record_bytes: usize,
    mut writer: impl FnMut(&T, &mut [u8]) -> Result<()>,
) -> Result<Vec<u8>>
where
    T: IndexedRecord,
{
    let mut selected: Vec<&T> = records.iter().collect();
    selected.sort_by_key(|record| record.record_id());
    let count = selected
        .last()
        .map(|record| record.record_id() + 1)
        .unwrap_or(0);
    let mut output = vec![0u8; count * record_bytes];
    for record in selected {
        let start = record.record_id() * record_bytes;
        writer(record, &mut output[start..start + record_bytes])?;
    }
    Ok(output)
}

pub(super) trait IndexedRecord {
    fn record_id(&self) -> usize;
}

macro_rules! indexed_record {
    ($($record:ty),+ $(,)?) => {
        $(
            impl IndexedRecord for $record {
                fn record_id(&self) -> usize {
                    self.id
                }
            }
        )+
    };
}

indexed_record!(
    MessageRecord,
    OptionLabelRecord,
    BattleRecord,
    MonsterRecord,
    MonsterDescriptionRecord,
    ScenarioItemRecord,
    TreasureRecord,
    ShopRecord,
    SimpleEncounterRecord,
    ComplexEncounterRecord,
    ThiefEncounterRecord,
    TimedEncounterRecord,
);

pub(super) fn signed_bytes(buffer: &[u8]) -> Vec<i8> {
    buffer.iter().map(|value| *value as i8).collect()
}

pub(super) fn fallback_i8(value: i8, values: &[u8], index: usize) -> i8 {
    if value != 0 {
        value
    } else {
        values.get(index).copied().unwrap_or(0) as i8
    }
}

pub(super) fn read_i16_array(buffer: &[u8], offset: usize, count: usize) -> Vec<i16> {
    (0..count)
        .map(|index| i16_be(buffer, offset + index * 2))
        .collect()
}

pub(super) fn write_i8_array(buffer: &mut [u8], offset: usize, values: &[i8], count: usize) {
    for index in 0..count {
        buffer[offset + index] = values.get(index).copied().unwrap_or(0) as u8;
    }
}

pub(super) fn write_i16_array(buffer: &mut [u8], offset: usize, values: &[i16], count: usize) {
    for index in 0..count {
        write_i16_be(buffer, offset + index * 2, *values.get(index).unwrap_or(&0));
    }
}

pub(super) fn copy_raw(buffer: &mut [u8], raw: &[u8]) {
    let length = buffer.len().min(raw.len());
    buffer[..length].copy_from_slice(&raw[..length]);
}

pub(super) fn preserve_raw(authored: bool, raw: &[u8], record_bytes: usize) -> bool {
    !authored && raw.len() == record_bytes
}

pub(super) fn provenance(
    source_file: &str,
    record_index: usize,
    byte_offset: usize,
    byte_length: usize,
) -> Provenance {
    Provenance {
        source_file: source_file.to_string(),
        record_index,
        byte_offset,
        byte_length,
        confidence: Confidence::SourceBacked,
    }
}

pub(super) fn decode_pascal_text(bytes: &[u8]) -> String {
    let length = bytes.first().copied().unwrap_or(0) as usize;
    let end = (1 + length).min(bytes.len());
    decode_fixed_text(&bytes[1..end])
}

pub(super) fn decode_fixed_text(bytes: &[u8]) -> String {
    let end = bytes
        .iter()
        .position(|byte| *byte == 0)
        .unwrap_or(bytes.len());
    bytes[..end]
        .iter()
        .map(|byte| {
            if (32..=126).contains(byte) {
                *byte as char
            } else {
                ' '
            }
        })
        .collect::<String>()
        .trim_end()
        .to_string()
}

pub(super) fn encode_pascal_text(buffer: &mut [u8], text: &str) -> Result<()> {
    if buffer.is_empty() {
        return Ok(());
    }
    let bytes = classic_text_bytes(text);
    if bytes.len() > buffer.len() - 1 || bytes.len() > u8::MAX as usize {
        return Err(ProvidenceError::message(format!(
            "Classic Pascal text is {} byte(s); maximum is {}",
            bytes.len(),
            buffer.len() - 1
        )));
    }
    buffer.fill(0);
    buffer[0] = bytes.len() as u8;
    buffer[1..1 + bytes.len()].copy_from_slice(&bytes);
    Ok(())
}

pub(super) fn encode_fixed_text(buffer: &mut [u8], text: &str) -> Result<()> {
    let bytes = classic_text_bytes(text);
    if bytes.len() > buffer.len() {
        return Err(ProvidenceError::message(format!(
            "Classic fixed text is {} byte(s); maximum is {}",
            bytes.len(),
            buffer.len()
        )));
    }
    buffer.fill(0);
    buffer[..bytes.len()].copy_from_slice(&bytes);
    Ok(())
}

pub(super) fn pascal_record_string(buffer: &[u8], slot: usize) -> String {
    let start = slot * 256;
    let end = (start + 256).min(buffer.len());
    if start >= end {
        return String::new();
    }
    decode_pascal_text(&buffer[start..end])
}

pub(super) fn copy_fixed_bytes(dest: &mut [u8], source: &[u8]) {
    dest.fill(0);
    let len = dest.len().min(source.len());
    dest[..len].copy_from_slice(&source[..len]);
}

pub(super) fn read_i16_vec(buffer: &[u8], offset: usize, count: usize) -> Vec<i16> {
    (0..count)
        .map(|index| i16_be(buffer, offset + index * 2))
        .collect()
}

pub(super) fn write_i16_vec(buffer: &mut [u8], offset: usize, values: &[i16], count: usize) {
    for index in 0..count {
        write_i16_be(buffer, offset + index * 2, *values.get(index).unwrap_or(&0));
    }
}

pub(super) fn read_i32_vec(buffer: &[u8], offset: usize, count: usize) -> Vec<i32> {
    (0..count)
        .map(|index| i32_be(buffer, offset + index * 4))
        .collect()
}

pub(super) fn write_i32_vec(buffer: &mut [u8], offset: usize, values: &[i32], count: usize) {
    for index in 0..count {
        write_i32_be(buffer, offset + index * 4, *values.get(index).unwrap_or(&0));
    }
}

fn classic_text_bytes(text: &str) -> Vec<u8> {
    text.chars()
        .map(|ch| if ch.is_ascii() { ch as u8 } else { b'?' })
        .collect()
}

pub fn i16_be(buffer: &[u8], offset: usize) -> i16 {
    i16::from_be_bytes([buffer[offset], buffer[offset + 1]])
}

pub(super) fn i32_be(buffer: &[u8], offset: usize) -> i32 {
    i32::from_be_bytes([
        buffer[offset],
        buffer[offset + 1],
        buffer[offset + 2],
        buffer[offset + 3],
    ])
}

pub fn write_i16_be(buffer: &mut [u8], offset: usize, value: i16) {
    buffer[offset..offset + 2].copy_from_slice(&value.to_be_bytes());
}

pub(super) fn write_i32_be(buffer: &mut [u8], offset: usize, value: i32) {
    buffer[offset..offset + 4].copy_from_slice(&value.to_be_bytes());
}

#[cfg(test)]
mod tests {
    use super::*;

    struct IndexedByte {
        id: usize,
        value: u8,
    }

    impl IndexedRecord for IndexedByte {
        fn record_id(&self) -> usize {
            self.id
        }
    }

    #[test]
    fn fixed_record_writer_orders_ids_and_leaves_sparse_records_zeroed() {
        let records = [
            IndexedByte { id: 2, value: 9 },
            IndexedByte { id: 0, value: 4 },
        ];
        let output = write_fixed_records(&records, 2, |record, buffer| {
            buffer[0] = record.value;
            Ok(())
        })
        .unwrap();

        assert_eq!(output, vec![4, 0, 0, 0, 9, 0]);
    }

    #[test]
    fn classic_text_helpers_preserve_ascii_limits() {
        let mut pascal = [0u8; 6];
        encode_pascal_text(&mut pascal, "Bell").unwrap();
        assert_eq!(decode_pascal_text(&pascal), "Bell");
        assert!(encode_pascal_text(&mut pascal, "Drowned").is_err());

        let mut fixed = [0u8; 4];
        encode_fixed_text(&mut fixed, "Ruin").unwrap();
        assert_eq!(decode_fixed_text(&fixed), "Ruin");
    }

    #[test]
    fn endian_helpers_round_trip_signed_values() {
        let mut bytes = [0u8; 6];
        write_i16_be(&mut bytes, 0, -1234);
        write_i32_be(&mut bytes, 2, 0x01020304);

        assert_eq!(i16_be(&bytes, 0), -1234);
        assert_eq!(i32_be(&bytes, 2), 0x01020304);
    }
}

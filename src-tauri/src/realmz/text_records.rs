use crate::error::Result;
use crate::project::{MessageRecord, OptionLabelRecord};

use super::record_bytes::{
    copy_raw, decode_pascal_text, encode_pascal_text, parse_fixed_records, preserve_raw,
    provenance, write_fixed_records,
};

pub const MESSAGE_BYTES: usize = 256;
pub const OPTION_LABEL_BYTES: usize = 25;

pub fn parse_messages(buffer: &[u8]) -> Vec<MessageRecord> {
    parse_fixed_records(buffer, MESSAGE_BYTES)
        .map(|(id, start, record)| MessageRecord {
            id,
            text: decode_pascal_text(record),
            raw_bytes: record.to_vec(),
            authored: false,
            provenance: provenance("Data SD2", id, start, MESSAGE_BYTES),
        })
        .collect()
}

pub fn write_messages(records: &[MessageRecord]) -> Result<Vec<u8>> {
    write_fixed_records(records, MESSAGE_BYTES, |record, buffer| {
        copy_raw(buffer, &record.raw_bytes);
        if preserve_raw(record.authored, &record.raw_bytes, MESSAGE_BYTES) {
            return Ok(());
        }
        encode_pascal_text(buffer, &record.text)?;
        Ok(())
    })
}

pub fn parse_option_labels(buffer: &[u8]) -> Vec<OptionLabelRecord> {
    parse_fixed_records(buffer, OPTION_LABEL_BYTES)
        .map(|(id, start, record)| OptionLabelRecord {
            id,
            text: decode_pascal_text(record),
            raw_bytes: record.to_vec(),
            authored: false,
            provenance: provenance("Data OD", id, start, OPTION_LABEL_BYTES),
        })
        .collect()
}

pub fn write_option_labels(records: &[OptionLabelRecord]) -> Result<Vec<u8>> {
    write_fixed_records(records, OPTION_LABEL_BYTES, |record, buffer| {
        copy_raw(buffer, &record.raw_bytes);
        if preserve_raw(record.authored, &record.raw_bytes, OPTION_LABEL_BYTES) {
            return Ok(());
        }
        encode_pascal_text(buffer, &record.text)?;
        Ok(())
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn changed_offsets(before: &[u8], after: &[u8]) -> Vec<usize> {
        before
            .iter()
            .zip(after.iter())
            .enumerate()
            .filter_map(|(offset, (left, right))| (left != right).then_some(offset))
            .collect()
    }

    #[test]
    fn fixed_record_text_writers_mutate_only_owned_pascal_bytes() {
        let mut message_input = vec![0u8; MESSAGE_BYTES * 2];
        message_input[0] = 1;
        message_input[1] = b'Z';
        let message_start = MESSAGE_BYTES;
        let mut messages = parse_messages(&message_input);
        messages[1].authored = true;
        messages[1].text = "Go".to_string();
        let message_output = write_messages(&messages).unwrap();
        assert_eq!(message_output.len(), message_input.len());
        assert_eq!(
            changed_offsets(&message_input, &message_output),
            vec![message_start, message_start + 1, message_start + 2]
        );

        let mut option_input = vec![0u8; OPTION_LABEL_BYTES * 3];
        option_input[1] = 1;
        option_input[2] = b'Q';
        let option_start = OPTION_LABEL_BYTES * 2;
        let mut option_labels = parse_option_labels(&option_input);
        option_labels[2].authored = true;
        option_labels[2].text = "On".to_string();
        let option_output = write_option_labels(&option_labels).unwrap();
        assert_eq!(option_output.len(), option_input.len());
        assert_eq!(
            changed_offsets(&option_input, &option_output),
            vec![option_start, option_start + 1, option_start + 2]
        );
    }
}

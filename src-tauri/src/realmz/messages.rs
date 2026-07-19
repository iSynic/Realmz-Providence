use crate::error::{ProvidenceError, Result};
use crate::project::MessageRecord;

use super::record_bytes::{
    decode_pascal_text, encode_pascal_text, parse_fixed_records, provenance, write_fixed_records,
};

pub const MESSAGE_BYTES: usize = 256;

pub fn parse_messages(buffer: &[u8]) -> Vec<MessageRecord> {
    parse_fixed_records(buffer, MESSAGE_BYTES)
        .map(|(id, start, record)| MessageRecord {
            id,
            text: decode_pascal_text(record),
            raw_bytes: record.to_vec(),
            authored: false,
            provenance: Some(provenance("Data SD2", id, start, MESSAGE_BYTES)),
        })
        .collect()
}

pub fn write_messages(records: &[MessageRecord]) -> Result<Vec<u8>> {
    write_fixed_records(records, MESSAGE_BYTES, |record, buffer| {
        if !record.raw_bytes.is_empty() && record.raw_bytes.len() != MESSAGE_BYTES {
            return Err(ProvidenceError::message(format!(
                "Message {} has invalid compatibility byte storage",
                record.id
            )));
        }
        encode_pascal_text(buffer, &record.text)
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fresh_message_compiles_complete_semantic_row() {
        let mut message = parse_messages(&vec![0; MESSAGE_BYTES])
            .into_iter()
            .next()
            .expect("message");
        message.raw_bytes.clear();
        message.text = "Providence".to_string();

        let output = write_messages(&[message]).unwrap();

        assert_eq!(output.len(), MESSAGE_BYTES);
        assert_eq!(&output[..11], b"\nProvidence");
        assert!(output[11..].iter().all(|byte| *byte == 0));
    }

    #[test]
    fn imported_message_compiles_without_record_byte_identity() {
        let mut input = vec![0xa5; MESSAGE_BYTES];
        input[0] = 2;
        input[1..3].copy_from_slice(b"Go");
        let mut messages = parse_messages(&input);
        messages[0].raw_bytes.fill(0x5a);

        let output = write_messages(&messages).unwrap();

        assert_ne!(output, input);
        assert_eq!(&output[..3], b"\x02Go");
        assert!(output[3..].iter().all(|byte| *byte == 0));
    }

    #[test]
    fn message_writer_rejects_malformed_compatibility_storage() {
        let mut message = parse_messages(&vec![0; MESSAGE_BYTES])
            .into_iter()
            .next()
            .expect("message");
        message.raw_bytes = vec![1];

        assert!(write_messages(&[message])
            .unwrap_err()
            .to_string()
            .contains("invalid compatibility byte storage"));
    }
}

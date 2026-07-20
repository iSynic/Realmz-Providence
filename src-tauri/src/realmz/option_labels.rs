use crate::error::Result;
use crate::project::OptionLabelRecord;

use super::record_bytes::{
    decode_pascal_text, encode_pascal_text, parse_fixed_records, provenance, write_fixed_records,
};

pub const OPTION_LABEL_BYTES: usize = 25;

pub fn parse_option_labels(buffer: &[u8]) -> Vec<OptionLabelRecord> {
    parse_fixed_records(buffer, OPTION_LABEL_BYTES)
        .map(|(id, start, record)| OptionLabelRecord {
            id,
            text: decode_pascal_text(record),
            authored: false,
            provenance: Some(provenance("Data OD", id, start, OPTION_LABEL_BYTES)),
        })
        .collect()
}

pub fn write_option_labels(records: &[OptionLabelRecord]) -> Result<Vec<u8>> {
    write_fixed_records(records, OPTION_LABEL_BYTES, |record, buffer| {
        encode_pascal_text(buffer, &record.text)
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fresh_option_label_compiles_complete_semantic_row() {
        let mut option = parse_option_labels(&vec![0; OPTION_LABEL_BYTES])
            .into_iter()
            .next()
            .expect("option label");
        option.text = "Proceed".to_string();

        let output = write_option_labels(&[option]).unwrap();

        assert_eq!(output.len(), OPTION_LABEL_BYTES);
        assert_eq!(&output[..8], b"\x07Proceed");
        assert!(output[8..].iter().all(|byte| *byte == 0));
    }

    #[test]
    fn imported_option_label_compiles_without_record_byte_identity() {
        let mut input = vec![b' '; OPTION_LABEL_BYTES];
        input[0] = 2;
        input[1..3].copy_from_slice(b"Go");
        let options = parse_option_labels(&input);

        let output = write_option_labels(&options).unwrap();

        assert_ne!(output, input);
        assert_eq!(&output[..3], b"\x02Go");
        assert!(output[3..].iter().all(|byte| *byte == 0));
    }

    #[test]
    fn option_label_writer_rejects_text_that_exceeds_the_native_slot() {
        let mut option = parse_option_labels(&vec![0; OPTION_LABEL_BYTES])
            .into_iter()
            .next()
            .expect("option label");
        option.text = "x".repeat(25);

        assert!(write_option_labels(&[option])
            .unwrap_err()
            .to_string()
            .contains("maximum is 24"));
    }
}

use crate::project::{AlignmentStatus, RecordAlignment};

pub(super) fn alignment_for(
    name: &str,
    buffer: Option<&Vec<u8>>,
    record_bytes: usize,
) -> RecordAlignment {
    let Some(buffer) = buffer else {
        return RecordAlignment {
            source: name.to_string(),
            record_bytes,
            count: 0,
            trailing_bytes: 0,
            status: AlignmentStatus::Missing,
        };
    };
    let count = buffer.len() / record_bytes;
    let trailing_bytes = buffer.len() % record_bytes;
    RecordAlignment {
        source: name.to_string(),
        record_bytes,
        count,
        trailing_bytes,
        status: if trailing_bytes == 0 {
            AlignmentStatus::Aligned
        } else {
            AlignmentStatus::HasTrailingBytes
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reports_missing_aligned_and_trailing_sources() {
        let missing = alignment_for("Data Test", None, 100);
        assert!(matches!(missing.status, AlignmentStatus::Missing));
        assert_eq!(missing.count, 0);
        assert_eq!(missing.trailing_bytes, 0);

        let aligned_bytes = vec![0; 200];
        let aligned = alignment_for("Data Test", Some(&aligned_bytes), 100);
        assert!(matches!(aligned.status, AlignmentStatus::Aligned));
        assert_eq!(aligned.count, 2);
        assert_eq!(aligned.trailing_bytes, 0);

        let trailing_bytes = vec![0; 103];
        let trailing = alignment_for("Data Test", Some(&trailing_bytes), 100);
        assert!(matches!(trailing.status, AlignmentStatus::HasTrailingBytes));
        assert_eq!(trailing.count, 1);
        assert_eq!(trailing.trailing_bytes, 3);
    }
}

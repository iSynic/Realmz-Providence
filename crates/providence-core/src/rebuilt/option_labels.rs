use serde::{Deserialize, Serialize};

use crate::codecs::{OPTION_LABEL_RECORD_BYTES, OPTION_LABEL_TEXT_BYTES};
use crate::model::ProjectSnapshot;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RebuiltV3OptionLabel {
    pub id: u32,
    pub text: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RebuiltV3OptionLabelError {
    DuplicateId(u32),
    NativeCodec(String),
    MissingSourceRow(u32),
}

impl std::fmt::Display for RebuiltV3OptionLabelError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::DuplicateId(id) => write!(formatter, "duplicate option-label ID {id}"),
            Self::NativeCodec(error) => {
                write!(formatter, "native option-label projection: {error}")
            }
            Self::MissingSourceRow(id) => write!(
                formatter,
                "option-label {id} has no effective native source row"
            ),
        }
    }
}

impl std::error::Error for RebuiltV3OptionLabelError {}

pub fn project_rebuilt_v3_option_labels(
    snapshot: &ProjectSnapshot,
) -> Result<Vec<RebuiltV3OptionLabel>, RebuiltV3OptionLabelError> {
    let mut labels = snapshot.option_labels.iter().collect::<Vec<_>>();
    labels.sort_by_key(|label| label.native_id);
    for pair in labels.windows(2) {
        if pair[0].native_id == pair[1].native_id {
            return Err(RebuiltV3OptionLabelError::DuplicateId(pair[0].native_id.0));
        }
    }
    Ok(labels
        .into_iter()
        .map(|label| RebuiltV3OptionLabel {
            id: label.native_id.0,
            text: caption(&label.text),
        })
        .collect())
}

/// The editor normalizes NUL to space, so its text cannot recover a source C boundary.
/// Final imported publication uses native-writer bytes, including any authored edits.
pub fn project_rebuilt_v3_native_option_labels(
    snapshot: &ProjectSnapshot,
    original: &[u8],
) -> Result<Vec<RebuiltV3OptionLabel>, RebuiltV3OptionLabelError> {
    let mut labels = project_rebuilt_v3_option_labels(snapshot)?;
    let effective = crate::codecs::encode_option_labels(&snapshot.option_labels, Some(original))
        .map_err(|error| RebuiltV3OptionLabelError::NativeCodec(error.to_string()))?;
    let decoded = crate::codecs::decode_option_labels(&effective);
    for label in &mut labels {
        let index = label.id as usize;
        let row = effective
            .get(index * OPTION_LABEL_RECORD_BYTES..(index + 1) * OPTION_LABEL_RECORD_BYTES)
            .ok_or(RebuiltV3OptionLabelError::MissingSourceRow(label.id))?;
        let payload = &row[1..1 + usize::from(row[0]).min(OPTION_LABEL_TEXT_BYTES)];
        let length = payload
            .iter()
            .position(|byte| *byte == 0)
            .unwrap_or(payload.len());
        label.text = decoded.records[index]
            .text
            .chars()
            .take(length)
            .collect::<String>()
            .trim_end_matches(' ')
            .to_owned();
    }
    Ok(labels)
}

fn caption(text: &str) -> String {
    text.split('\0')
        .next()
        .unwrap_or_default()
        .trim_end_matches(' ')
        .to_owned()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{NativeRecordId, OptionLabelRecord, StableId};

    #[test]
    fn projection_uses_exact_runtime_shape_and_native_order() {
        let mut snapshot = ProjectSnapshot::new_authored(StableId("options".into()));
        snapshot.option_labels = vec![
            OptionLabelRecord {
                identity: StableId("option-label:2".into()),
                native_id: NativeRecordId(2),
                text: "Withdraw".into(),
                authored: true,
            },
            OptionLabelRecord {
                identity: StableId("option-label:1".into()),
                native_id: NativeRecordId(1),
                text: "Proceed".into(),
                authored: true,
            },
        ];
        let labels = project_rebuilt_v3_option_labels(&snapshot).unwrap();
        assert_eq!(
            serde_json::to_value(labels).unwrap(),
            serde_json::json!([
                {"id": 1, "text": "Proceed"},
                {"id": 2, "text": "Withdraw"}
            ])
        );
    }

    #[test]
    fn duplicate_native_ids_are_rejected() {
        let mut snapshot = ProjectSnapshot::new_authored(StableId("duplicate-options".into()));
        snapshot.option_labels = vec![
            OptionLabelRecord {
                identity: StableId("option-label:first".into()),
                native_id: NativeRecordId(2),
                text: "First".into(),
                authored: true,
            },
            OptionLabelRecord {
                identity: StableId("option-label:second".into()),
                native_id: NativeRecordId(2),
                text: "Second".into(),
                authored: true,
            },
        ];
        assert_eq!(
            project_rebuilt_v3_option_labels(&snapshot),
            Err(RebuiltV3OptionLabelError::DuplicateId(2))
        );
    }

    #[test]
    fn native_editor_payload_and_runtime_c_caption_have_separate_boundaries() {
        let mut source = vec![0; OPTION_LABEL_RECORD_BYTES];
        source[0] = 24;
        source[1..13].copy_from_slice(b"Go   \0hidden");
        source.extend_from_slice(&[0xde, 0xad]);
        let mut snapshot = ProjectSnapshot::new_authored(StableId("caption-source".into()));
        snapshot.option_labels = crate::codecs::decode_option_labels(&source).records;
        assert_eq!(
            snapshot.option_labels[0].text,
            format!("Go    hidden{}", " ".repeat(12))
        );
        let labels = project_rebuilt_v3_native_option_labels(&snapshot, &source).unwrap();
        assert_eq!(labels[0].text, "Go");
        assert_eq!(
            crate::codecs::encode_option_labels(&snapshot.option_labels, Some(&source)).unwrap(),
            source
        );
        snapshot.option_labels[0].authored = true;
        snapshot.option_labels[0].text = "Café “Q”\n\t ".into();
        assert_eq!(
            project_rebuilt_v3_native_option_labels(&snapshot, &source).unwrap()[0].text,
            "Café “Q”\n\t"
        );
        assert_eq!(snapshot.option_labels[0].text, "Café “Q”\n\t ");
        assert_eq!(&source[25..], &[0xde, 0xad]);
    }
}

use serde::{Deserialize, Serialize};

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
}

impl std::fmt::Display for RebuiltV3OptionLabelError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::DuplicateId(id) => write!(formatter, "duplicate option-label ID {id}"),
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
            text: label.text.clone(),
        })
        .collect())
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
}

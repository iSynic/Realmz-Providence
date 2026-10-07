use crate::codecs::inspect_classic_text;
use crate::model::{OptionLabelRecord, StableId};
use crate::session::{EditorSession, SessionError};
use crate::text_authoring::{StringDraft, StringFamily, option_labels_present};

impl EditorSession {
    pub(super) fn apply_string_draft(
        &mut self,
        draft: StringDraft,
    ) -> Result<Vec<StableId>, SessionError> {
        validate_string_draft(&draft)?;
        let invalid = |reason: &str| SessionError::InvalidMessageDraft(reason.into());
        match draft.family {
            StringFamily::Message => {
                let current = self
                    .snapshot
                    .messages
                    .iter()
                    .find(|row| row.native_id == draft.native_id);
                if current.map(|row| &row.text) != draft.expected_text.as_ref() {
                    return Err(invalid(
                        "the string changed or its allocation is occupied; reload before applying",
                    ));
                }
                match current {
                    Some(row) => self.update_message_text(row.identity.clone(), draft.text),
                    None => self.create_message(draft.native_id, draft.text),
                }
            }
            StringFamily::OptionLabel => {
                if !option_labels_present(&self.snapshot) {
                    return Err(invalid("this scenario does not contain Option Labels"));
                }
                let current = self
                    .snapshot
                    .option_labels
                    .iter()
                    .find(|row| row.native_id == draft.native_id);
                if current.map(|row| &row.text) != draft.expected_text.as_ref() {
                    return Err(invalid(
                        "the option label changed or its allocation is occupied; reload before applying",
                    ));
                }
                if let Some(row) = current {
                    let mut label = row.clone();
                    label.text = draft.text;
                    self.update_option_label(label)
                } else {
                    let identity = StableId(format!("option-label:{}", draft.native_id.0));
                    self.snapshot.option_labels.push(OptionLabelRecord {
                        identity: identity.clone(),
                        native_id: draft.native_id,
                        text: draft.text,
                        authored: true,
                    });
                    self.snapshot.normalize();
                    Ok(vec![identity])
                }
            }
        }
    }
}

fn validate_string_draft(draft: &StringDraft) -> Result<(), SessionError> {
    let limit = match draft.family {
        StringFamily::Message => 255,
        StringFamily::OptionLabel => 24,
    };
    if draft.native_id.0 > i16::MAX as u32 || !inspect_classic_text(&draft.text, Some(limit)).valid
    {
        return Err(SessionError::InvalidMessageDraft(
            "the string must have an addressable ID and representable text within its Classic limit".into(),
        ));
    }
    Ok(())
}

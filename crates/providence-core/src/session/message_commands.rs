use crate::model::NativeRecordId;
use crate::model::ScenarioMessage;
use crate::model::StableId;
use crate::session::EditorSession;
use crate::session::errors::SessionError;

impl EditorSession {
    pub(super) fn apply_message_text_changes(
        &mut self,
        changes: Vec<crate::text_authoring::MessageTextChange>,
    ) -> Result<Vec<StableId>, SessionError> {
        use crate::text_authoring::{MAX_STRING_IMPORT_RECORDS, message_draft_feedback};
        if changes.is_empty() || changes.len() > MAX_STRING_IMPORT_RECORDS {
            return Err(SessionError::InvalidMessageDraft(
                "the reviewed change set is empty or exceeds the bounded import limit".into(),
            ));
        }
        let mut identities = std::collections::BTreeSet::new();
        for change in &changes {
            if !identities.insert(change.identity.clone()) {
                return Err(SessionError::InvalidMessageDraft(
                    "the reviewed change set repeats an identity".into(),
                ));
            }
            let current = self
                .snapshot
                .messages
                .iter()
                .find(|row| row.identity == change.identity)
                .ok_or_else(|| SessionError::MessageNotFound(change.identity.clone()))?;
            if current.native_id != change.native_id || current.text != change.expected_text {
                return Err(SessionError::InvalidMessageDraft(format!(
                    "String {} changed since review",
                    change.native_id.0
                )));
            }
            if !message_draft_feedback(&change.text).valid {
                return Err(SessionError::InvalidMessageDraft(format!(
                    "String {} is too long or contains a character outside MacRoman",
                    change.native_id.0
                )));
            }
        }
        for change in changes {
            self.update_message_text(change.identity, change.text)?;
        }
        Ok(identities.into_iter().collect())
    }

    pub(super) fn update_message_text(
        &mut self,
        identity: StableId,
        text: String,
    ) -> Result<Vec<StableId>, SessionError> {
        let message = self
            .snapshot
            .messages
            .iter_mut()
            .find(|message| message.identity == identity)
            .ok_or_else(|| SessionError::MessageNotFound(identity.clone()))?;
        message.text = text;
        message.authored = true;
        Ok(vec![identity])
    }

    pub(super) fn create_message(
        &mut self,
        native_id: NativeRecordId,
        text: String,
    ) -> Result<Vec<StableId>, SessionError> {
        if self
            .snapshot
            .messages
            .iter()
            .any(|message| message.native_id == native_id)
        {
            return Err(SessionError::DuplicateMessageId(native_id));
        }
        let identity = StableId(format!("message:{}", native_id.0));
        self.snapshot.messages.push(ScenarioMessage {
            identity: identity.clone(),
            native_id,
            text,
            authored: true,
        });
        self.snapshot.normalize();
        Ok(vec![identity])
    }

    pub(super) fn retarget_message_reference(
        &mut self,
        source: StableId,
        field: String,
        target_native_id: NativeRecordId,
    ) -> Result<Vec<StableId>, SessionError> {
        let reference = self
            .snapshot
            .message_references
            .iter_mut()
            .find(|reference| reference.source == source && reference.field == field)
            .ok_or_else(|| SessionError::ReferenceNotFound {
                source: source.clone(),
                field: field.clone(),
            })?;
        reference.target_native_id = target_native_id;
        Ok(vec![source])
    }
}

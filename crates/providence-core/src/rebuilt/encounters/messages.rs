use super::RebuiltV3Message;
use crate::model::ProjectSnapshot;
use crate::rebuilt::scenario::RebuiltV3ScenarioError;
use std::collections::BTreeSet;

pub fn project_rebuilt_v3_messages(
    snapshot: &ProjectSnapshot,
) -> Result<Vec<RebuiltV3Message>, RebuiltV3ScenarioError> {
    let mut messages = snapshot.messages.iter().collect::<Vec<_>>();
    messages.sort_by_key(|message| message.native_id);
    let mut ids = BTreeSet::new();
    messages
        .into_iter()
        .map(|message| {
            if !ids.insert(message.native_id.0) {
                return Err(RebuiltV3ScenarioError::DuplicateMessageId(
                    message.native_id.0,
                ));
            }
            if message.identity.0 != format!("message:{}", message.native_id.0) {
                return Err(RebuiltV3ScenarioError::InvalidMessageIdentity {
                    message: message.identity.clone(),
                    native_id: message.native_id.0,
                });
            }
            Ok(RebuiltV3Message {
                id: message.native_id.0,
                text: message.text.clone(),
            })
        })
        .collect()
}

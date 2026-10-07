use super::{
    RebuiltV3Message, RebuiltV3ReachableMessageError, RebuiltV3ReachableMessageSelection,
    RebuiltV3RuntimeMessageReference,
};
use crate::model::{ProjectOrigin, ProjectSnapshot, ScenarioMessage, StableId};
use std::collections::{BTreeMap, BTreeSet};

pub(super) fn resolve(
    snapshot: &ProjectSnapshot,
    references: Vec<RebuiltV3RuntimeMessageReference>,
) -> Result<RebuiltV3ReachableMessageSelection, RebuiltV3ReachableMessageError> {
    let reachable_message_ids = references
        .iter()
        .map(|r| r.message_native_id)
        .collect::<BTreeSet<_>>();
    let candidates = candidates(snapshot, &reachable_message_ids);
    let mut first_reference = BTreeMap::new();
    for reference in &references {
        first_reference
            .entry(reference.message_native_id)
            .or_insert(reference);
    }
    let allow_deferred = matches!(snapshot.origin, ProjectOrigin::Imported { .. });
    let mut emitted_message_ids = Vec::with_capacity(reachable_message_ids.len());
    let mut missing_references = Vec::new();
    let mut messages = Vec::with_capacity(reachable_message_ids.len());
    for message_id in &reachable_message_ids {
        let reference = first_reference
            .get(message_id)
            .expect("every selected message ID has a causal reference");
        let matching = candidates.get(message_id).map(Vec::as_slice).unwrap_or(&[]);
        if let Some(message) = resolve_one(*message_id, reference, matching, allow_deferred)? {
            messages.push(message);
            emitted_message_ids.push(*message_id);
        } else {
            missing_references.push((*reference).clone());
        }
    }
    Ok(RebuiltV3ReachableMessageSelection {
        reachable_message_ids: emitted_message_ids,
        references,
        missing_references,
        messages,
    })
}

fn candidates<'a>(
    snapshot: &'a ProjectSnapshot,
    selected: &BTreeSet<u32>,
) -> BTreeMap<u32, Vec<&'a ScenarioMessage>> {
    let mut candidates = BTreeMap::<u32, Vec<_>>::new();
    for message in &snapshot.messages {
        if selected.contains(&message.native_id.0) {
            candidates
                .entry(message.native_id.0)
                .or_default()
                .push(message);
        }
    }
    candidates
}

fn resolve_one(
    message_id: u32,
    reference: &RebuiltV3RuntimeMessageReference,
    matching: &[&ScenarioMessage],
    allow_deferred: bool,
) -> Result<Option<RebuiltV3Message>, RebuiltV3ReachableMessageError> {
    let [message] = matching else {
        if matching.is_empty() && allow_deferred {
            return Ok(None);
        }
        return if matching.is_empty() {
            Err(RebuiltV3ReachableMessageError::MissingMessage(
                reference.clone(),
            ))
        } else {
            Err(RebuiltV3ReachableMessageError::DuplicateMessageId {
                message_id,
                source: reference.clone(),
            })
        };
    };
    let expected = StableId(format!("message:{message_id}"));
    if message.identity != expected {
        return Err(RebuiltV3ReachableMessageError::InvalidMessageIdentity {
            expected,
            actual: message.identity.clone(),
            source: reference.clone(),
        });
    }
    Ok(Some(RebuiltV3Message {
        id: message_id,
        text: message.text.clone(),
    }))
}

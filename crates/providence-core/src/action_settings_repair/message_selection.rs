use std::collections::BTreeSet;

use serde::Serialize;

use super::{
    Choice, ChoicePage, RandomMessageInput, RepairDraft, change, random_message::MessageIndex,
};
use crate::model::{ProjectSnapshot, StableId};

/// Includes unavailable identities for inspection without authorizing substitution.
pub fn message_choices(
    snapshot: &ProjectSnapshot,
    query: &str,
    offset: usize,
    limit: usize,
) -> ChoicePage {
    let query = query.to_lowercase();
    let index = MessageIndex::new(snapshot);
    let ids: BTreeSet<_> = snapshot
        .messages
        .iter()
        .map(|message| message.native_id.0)
        .collect();
    let matching_text: BTreeSet<_> = snapshot
        .messages
        .iter()
        .filter(|message| message.text.to_lowercase().contains(&query))
        .map(|message| message.native_id.0)
        .collect();
    let mut matching = ids
        .into_iter()
        .filter(|id| id.to_string().contains(&query) || matching_text.contains(id))
        .map(|id| {
            let resolved = index.resolve(id);
            Choice {
                identity: StableId(format!("message:{id}")),
                label: format!("Message {id}"),
                detail: resolved.as_ref().map_or_else(
                    |status| format!("Unavailable: {status:?}"),
                    |message| {
                        message
                            .text
                            .chars()
                            .take(120)
                            .map(|c| if c.is_whitespace() { ' ' } else { c })
                            .collect()
                    },
                ),
                selectable: (1..=32768).contains(&id) && resolved.is_ok(),
            }
        });
    let limit = limit.clamp(1, 128);
    let mut items = Vec::new();
    let mut total = 0;
    for item in &mut matching {
        if total >= offset && items.len() < limit {
            items.push(item);
        }
        total += 1;
    }
    ChoicePage {
        items,
        offset,
        limit,
        total,
    }
}

fn native_id(identity: &StableId) -> Result<u32, String> {
    let id: u32 = identity
        .0
        .strip_prefix("message:")
        .and_then(|value| value.parse().ok())
        .ok_or("Choose an exact message identity.")?;
    if identity.0 != format!("message:{id}") || !(1..=32768).contains(&id) {
        return Err("This message cannot be selected in a signed Classic range.".into());
    }
    Ok(id)
}

pub fn choose_message(
    snapshot: &ProjectSnapshot,
    draft: &mut RepairDraft<RandomMessageInput>,
    field: &str,
    identity: Option<&StableId>,
    waits_for_click: Option<bool>,
) -> Result<(), String> {
    let current = match field {
        "firstMessage" => &draft.input.first_message,
        "lastMessage" => &draft.input.last_message,
        _ => return Err("Choose the first or last message.".into()),
    };
    let Some(identity) = identity else {
        return change(snapshot, draft, field, "0");
    };
    let id = native_id(identity)?;
    MessageIndex::new(snapshot)
        .resolve(id)
        .map_err(|_| "The selected message is missing or ambiguous.")?;
    let waits = waits_for_click.unwrap_or_else(|| {
        current
            .trim()
            .parse::<i16>()
            .ok()
            .is_none_or(|value| value >= 0)
    });
    let signed = if waits {
        i32::try_from(id).unwrap()
    } else {
        -(id as i32)
    };
    let value = i16::try_from(signed)
        .map_err(|_| "Message 32768 is available only without waiting for a click.")?;
    change(snapshot, draft, field, &value.to_string())
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MessageTextPeek {
    pub identity: StableId,
    pub label: String,
    pub text: String,
}

pub fn peek_message(
    snapshot: &ProjectSnapshot,
    identity: &StableId,
) -> Result<MessageTextPeek, String> {
    let id = native_id(identity)?;
    let index = MessageIndex::new(snapshot);
    let message = index
        .resolve(id)
        .map_err(|_| "The exact message is missing or ambiguous.")?;
    Ok(MessageTextPeek {
        identity: identity.clone(),
        label: format!("Message {id}"),
        text: message.text.clone(),
    })
}

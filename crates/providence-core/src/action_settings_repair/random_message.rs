use std::collections::{BTreeMap, BTreeSet};

use serde::{Deserialize, Serialize};

use super::{FieldError, SettingsValues, context};
use crate::classic_random::signed_range_values;
use crate::model::{ClassicAction, NativeRecordId, ProjectSnapshot, ScenarioMessage, StableId};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RandomMessageInput {
    pub first_message: String,
    pub last_message: String,
    pub retained: [i16; 3],
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum MessageRangeStatus {
    Ready,
    NoMessage,
    Missing,
    Ambiguous,
    InvalidIdentity,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum MessageWaitMode {
    Always,
    Never,
    Mixed,
    NoMessage,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MessageRangeEntry {
    pub value: i16,
    pub native_id: Option<NativeRecordId>,
    pub identity: Option<StableId>,
    pub text_preview: String,
    pub status: MessageRangeStatus,
    pub waits_for_click: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MessageRangePage {
    pub entries: Vec<MessageRangeEntry>,
    pub offset: usize,
    pub limit: usize,
    pub total: usize,
    pub unique_messages: usize,
    pub unresolved_messages: usize,
    pub includes_no_message: bool,
    pub wait_mode: MessageWaitMode,
    pub errors: Vec<FieldError>,
}

pub(super) fn initial(snapshot: &ProjectSnapshot, action: &ClassicAction) -> RandomMessageInput {
    let words = u32::try_from(action.target_native_id)
        .map(|id| context::words(snapshot, id).0)
        .unwrap_or([None; 5]);
    RandomMessageInput {
        first_message: words[0].map(|value| value.to_string()).unwrap_or_default(),
        last_message: words[1].map(|value| value.to_string()).unwrap_or_default(),
        retained: std::array::from_fn(|index| words[index + 2].unwrap_or(0)),
    }
}

pub(super) fn change(
    input: &mut RandomMessageInput,
    field: &str,
    value: &str,
) -> Result<(), String> {
    if value.len() > 512 {
        return Err("The field value is too long.".into());
    }
    match field {
        "firstMessage" => input.first_message = value.into(),
        "lastMessage" => input.last_message = value.into(),
        _ => return Err("This repair field cannot be changed.".into()),
    }
    Ok(())
}

fn bounds(input: &RandomMessageInput) -> Result<[i16; 2], Vec<FieldError>> {
    let mut values = [0; 2];
    let mut errors = Vec::new();
    for (index, (field, label, text)) in [
        ("firstMessage", "First message", &input.first_message),
        ("lastMessage", "Last message", &input.last_message),
    ]
    .into_iter()
    .enumerate()
    {
        match text.trim().parse::<i16>() {
            Ok(value) => values[index] = value,
            Err(_) => errors.push(FieldError {
                field: field.into(),
                message: format!("{label}: enter a whole number from -32768 to 32767."),
            }),
        }
    }
    if errors.is_empty() {
        Ok(values)
    } else {
        Err(errors)
    }
}

struct MessageIndex<'a> {
    by_number: BTreeMap<u32, Vec<&'a ScenarioMessage>>,
    identity_counts: BTreeMap<&'a StableId, usize>,
}

impl<'a> MessageIndex<'a> {
    fn new(snapshot: &'a ProjectSnapshot) -> Self {
        let mut by_number = BTreeMap::<_, Vec<_>>::new();
        let mut identity_counts = BTreeMap::new();
        for message in &snapshot.messages {
            by_number
                .entry(message.native_id.0)
                .or_default()
                .push(message);
            *identity_counts.entry(&message.identity).or_default() += 1;
        }
        Self {
            by_number,
            identity_counts,
        }
    }

    fn resolve(&self, id: u32) -> Result<&'a ScenarioMessage, MessageRangeStatus> {
        let matching = self.by_number.get(&id).map(Vec::as_slice).unwrap_or(&[]);
        let [message] = matching else {
            return Err(if matching.is_empty() {
                MessageRangeStatus::Missing
            } else {
                MessageRangeStatus::Ambiguous
            });
        };
        if message.identity != StableId(format!("message:{id}"))
            || self.identity_counts.get(&message.identity) != Some(&1)
        {
            return Err(MessageRangeStatus::InvalidIdentity);
        }
        Ok(message)
    }

    fn entry(&self, value: i16) -> MessageRangeEntry {
        if value == 0 {
            return MessageRangeEntry {
                value,
                native_id: None,
                identity: None,
                text_preview: String::new(),
                status: MessageRangeStatus::NoMessage,
                waits_for_click: false,
            };
        }
        let id = u32::from(value.unsigned_abs());
        let resolved = self.resolve(id);
        MessageRangeEntry {
            value,
            native_id: Some(NativeRecordId(id)),
            identity: resolved
                .as_ref()
                .ok()
                .map(|message| message.identity.clone()),
            text_preview: resolved.as_ref().ok().map_or_else(String::new, |message| {
                message
                    .text
                    .chars()
                    .take(120)
                    .map(|character| {
                        if character.is_whitespace() {
                            ' '
                        } else {
                            character
                        }
                    })
                    .collect()
            }),
            status: resolved.err().unwrap_or(MessageRangeStatus::Ready),
            waits_for_click: value > 0,
        }
    }
}

pub fn message_range(
    snapshot: &ProjectSnapshot,
    input: &RandomMessageInput,
    offset: usize,
    limit: usize,
) -> Result<MessageRangePage, Vec<FieldError>> {
    let [low, high] = bounds(input)?;
    let values = signed_range_values(low, high);
    let index = MessageIndex::new(snapshot);
    let unique: BTreeSet<_> = values
        .iter()
        .filter(|value| **value != 0)
        .map(|value| u32::from(value.unsigned_abs()))
        .collect();
    let unresolved: Vec<_> = unique
        .iter()
        .filter(|id| index.resolve(**id).is_err())
        .collect();
    let errors = unresolved.first().map_or_else(Vec::new, |first| {
        vec![FieldError {
            field: "messageRange".into(),
            message: format!(
                "Cannot resolve {} message targets in this range. Check Message {} first.",
                unresolved.len(),
                first
            ),
        }]
    });
    let limit = limit.clamp(1, 128);
    let wait_mode = match (
        values.iter().any(|value| *value > 0),
        values.iter().any(|value| *value < 0),
    ) {
        (true, true) => MessageWaitMode::Mixed,
        (true, false) => MessageWaitMode::Always,
        (false, true) => MessageWaitMode::Never,
        (false, false) => MessageWaitMode::NoMessage,
    };
    Ok(MessageRangePage {
        entries: values
            .iter()
            .skip(offset)
            .take(limit)
            .map(|value| index.entry(*value))
            .collect(),
        offset,
        limit,
        total: values.len(),
        unique_messages: unique.len(),
        unresolved_messages: unresolved.len(),
        includes_no_message: values.contains(&0),
        wait_mode,
        errors,
    })
}

pub(super) fn validate(
    snapshot: &ProjectSnapshot,
    input: &RandomMessageInput,
) -> Result<SettingsValues, Vec<FieldError>> {
    let [low, high] = bounds(input)?;
    let range = message_range(snapshot, input, 0, 1)?;
    if !range.errors.is_empty() {
        return Err(range.errors);
    }
    Ok(SettingsValues {
        primary: [
            low,
            high,
            input.retained[0],
            input.retained[1],
            input.retained[2],
        ],
        companion: None,
    })
}

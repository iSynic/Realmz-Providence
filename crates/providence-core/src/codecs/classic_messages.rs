use super::SCENARIO_MESSAGE_CODEC;
use super::classic_text_feedback::encode_classic_text_with_replacements;
use super::classic_text_resources::{decode_mac_roman_text, encode_mac_roman_character};
use crate::model::{NativeRecordId, ScenarioMessage, StableId};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DecodedMessageFile {
    pub messages: Vec<ScenarioMessage>,
    pub trailing_bytes: Vec<u8>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MessageCodecError {
    TextTooLong {
        native_id: NativeRecordId,
        bytes: usize,
    },
    MissingCompatibilitySource {
        native_id: NativeRecordId,
    },
    DuplicateNativeId(NativeRecordId),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct MessageEncodingInspection {
    pub encoded_bytes: usize,
    pub replacement_characters: usize,
}

pub fn inspect_message_text_encoding(value: &str) -> MessageEncodingInspection {
    MessageEncodingInspection {
        encoded_bytes: value.chars().count(),
        replacement_characters: value
            .chars()
            .filter(|character| encode_mac_roman_character(*character).is_none())
            .count(),
    }
}

impl std::fmt::Display for MessageCodecError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::TextTooLong { native_id, bytes } => write!(
                formatter,
                "message {} encodes to {bytes} bytes; Classic maximum is 255",
                native_id.0
            ),
            Self::MissingCompatibilitySource { native_id } => write!(
                formatter,
                "imported message {} requires its Data SD2 compatibility source",
                native_id.0
            ),
            Self::DuplicateNativeId(native_id) => {
                write!(formatter, "duplicate Data SD2 message id {}", native_id.0)
            }
        }
    }
}

impl std::error::Error for MessageCodecError {}

pub fn decode_messages(bytes: &[u8]) -> DecodedMessageFile {
    let complete_bytes =
        bytes.len() / SCENARIO_MESSAGE_CODEC.record_bytes * SCENARIO_MESSAGE_CODEC.record_bytes;
    let messages = bytes[..complete_bytes]
        .chunks_exact(SCENARIO_MESSAGE_CODEC.record_bytes)
        .enumerate()
        .map(|(id, row)| ScenarioMessage {
            identity: StableId(format!("message:{id}")),
            native_id: NativeRecordId(id as u32),
            text: decode_pascal_text(row),
            authored: false,
        })
        .collect();
    DecodedMessageFile {
        messages,
        trailing_bytes: bytes[complete_bytes..].to_vec(),
    }
}

pub fn encode_messages(
    messages: &[ScenarioMessage],
    compatibility_source: Option<&[u8]>,
) -> Result<Vec<u8>, MessageCodecError> {
    let mut selected = messages.iter().collect::<Vec<_>>();
    selected.sort_by_key(|message| message.native_id);
    for pair in selected.windows(2) {
        if pair[0].native_id == pair[1].native_id {
            return Err(MessageCodecError::DuplicateNativeId(pair[0].native_id));
        }
    }

    let source_body_bytes = compatibility_source
        .map(|source| {
            source.len() / SCENARIO_MESSAGE_CODEC.record_bytes * SCENARIO_MESSAGE_CODEC.record_bytes
        })
        .unwrap_or(0);
    let required_bytes = selected
        .last()
        .map(|message| (message.native_id.0 as usize + 1) * SCENARIO_MESSAGE_CODEC.record_bytes)
        .unwrap_or(0);
    let mut output = compatibility_source
        .map(|source| source[..source_body_bytes].to_vec())
        .unwrap_or_default();
    output.resize(output.len().max(required_bytes), 0);

    for message in selected {
        let start = message.native_id.0 as usize * SCENARIO_MESSAGE_CODEC.record_bytes;
        let end = start + SCENARIO_MESSAGE_CODEC.record_bytes;
        if !message.authored {
            if compatibility_source.is_some_and(|source| end <= source_body_bytes.min(source.len()))
            {
                continue;
            }
            return Err(MessageCodecError::MissingCompatibilitySource {
                native_id: message.native_id,
            });
        }
        encode_pascal_text(&mut output[start..end], message)?;
    }

    if let Some(source) = compatibility_source {
        output.extend_from_slice(&source[source_body_bytes..]);
    }
    Ok(output)
}

fn decode_pascal_text(row: &[u8]) -> String {
    let length = row.first().copied().unwrap_or(0) as usize;
    let end = (length + 1).min(row.len());
    decode_mac_roman_text(row.get(1..end).unwrap_or_default())
}

fn encode_pascal_text(row: &mut [u8], message: &ScenarioMessage) -> Result<(), MessageCodecError> {
    let bytes = encode_classic_text_with_replacements(&message.text);
    if bytes.len() > 255 {
        return Err(MessageCodecError::TextTooLong {
            native_id: message.native_id,
            bytes: bytes.len(),
        });
    }
    row.fill(0);
    row[0] = bytes.len() as u8;
    row[1..1 + bytes.len()].copy_from_slice(&bytes);
    Ok(())
}

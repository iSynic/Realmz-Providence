use serde::Serialize;

use super::classic_text_resources::encode_mac_roman_character;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClassicTextCharacterIssue {
    pub character: char,
    pub character_index: usize,
    pub line: usize,
    pub column: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClassicTextFeedback {
    pub encoded_bytes: usize,
    pub representable_bytes: usize,
    pub replacement_characters: usize,
    pub limit: Option<usize>,
    pub too_long: bool,
    pub valid: bool,
    pub issues: Vec<ClassicTextCharacterIssue>,
    pub issues_truncated: bool,
}

pub fn inspect_classic_text(value: &str, limit: Option<usize>) -> ClassicTextFeedback {
    let mut issues = Vec::new();
    let (mut encoded_bytes, mut replacements, mut line, mut column) = (0, 0, 1, 1);
    for (character_index, character) in value.chars().enumerate() {
        encoded_bytes += 1;
        if encode_mac_roman_character(character).is_none() {
            replacements += 1;
            if issues.len() < 128 {
                issues.push(ClassicTextCharacterIssue {
                    character,
                    character_index,
                    line,
                    column,
                });
            }
        }
        if character == '\n' {
            line += 1;
            column = 1;
        } else {
            column += 1;
        }
    }
    let too_long = limit.is_some_and(|limit| encoded_bytes > limit);
    ClassicTextFeedback {
        encoded_bytes,
        representable_bytes: encoded_bytes - replacements,
        replacement_characters: replacements,
        limit,
        too_long,
        valid: replacements == 0 && !too_long,
        issues_truncated: replacements > issues.len(),
        issues,
    }
}

// Fixed-record compilation retains its explicit replacement policy. Authoring
// refuses a draft with replacement risks; inspection never rewrites its text.
pub(super) fn encode_classic_text_with_replacements(value: &str) -> Vec<u8> {
    value
        .chars()
        .map(|character| encode_mac_roman_character(character).unwrap_or(b'?'))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::codecs::{
        decode_messages, decode_option_labels, encode_messages, encode_option_labels,
    };
    use crate::model::{NativeRecordId, OptionLabelRecord, ScenarioMessage, StableId};

    #[test]
    fn both_fixed_families_preserve_mac_roman_and_exact_payload_whitespace() {
        let text = "Café “Q”\n\t ";
        let messages = [ScenarioMessage {
            identity: StableId("message:0".into()),
            native_id: NativeRecordId(0),
            text: text.into(),
            authored: true,
        }];
        let labels = [OptionLabelRecord {
            identity: StableId("option-label:0".into()),
            native_id: NativeRecordId(0),
            text: text.into(),
            authored: true,
        }];
        let message_bytes = encode_messages(&messages, None).unwrap();
        let label_bytes = encode_option_labels(&labels, None).unwrap();
        assert_eq!(
            &message_bytes[..12],
            &[
                11, b'C', b'a', b'f', 0x8e, b' ', 0xd2, b'Q', 0xd3, 13, 9, 32
            ]
        );
        assert_eq!(&label_bytes[..12], &message_bytes[..12]);
        assert_eq!(decode_messages(&message_bytes).messages[0].text, text);
        assert_eq!(decode_option_labels(&label_bytes).records[0].text, text);
    }

    #[test]
    fn feedback_reports_character_locations_without_counting_replacements_as_success() {
        let feedback = inspect_classic_text("The guard blocks your way. 🐉\nCafé\0", Some(255));
        assert_eq!(feedback.replacement_characters, 2);
        assert_eq!(feedback.issues[0].character_index, 27);
        assert_eq!(
            (feedback.issues[0].line, feedback.issues[0].column),
            (1, 28)
        );
        assert_eq!((feedback.issues[1].line, feedback.issues[1].column), (2, 5));
        assert!(!feedback.valid);
        assert_eq!(feedback.representable_bytes + 2, feedback.encoded_bytes);
        assert!(inspect_classic_text(&"é".repeat(25), Some(24)).too_long);
        assert!(inspect_classic_text(&"é".repeat(255), Some(255)).valid);
    }

    #[test]
    fn issue_projection_is_bounded_and_no_edit_keeps_nul_high_bytes_and_tail() {
        let feedback = inspect_classic_text(&"🐉".repeat(129), None);
        assert_eq!(feedback.issues.len(), 128);
        assert!(feedback.issues_truncated);
        let mut source = vec![0xa5; 256];
        source[..5].copy_from_slice(&[4, 0, 0x8e, 13, 32]);
        source.extend_from_slice(&[0xab, 0xcd]);
        let decoded = decode_messages(&source);
        assert_eq!(decoded.messages[0].text, " é\n ");
        assert_eq!(
            encode_messages(&decoded.messages, Some(&source)).unwrap(),
            source
        );
    }
}

use crate::codecs::{ClassicTextFeedback, inspect_classic_text};
use crate::model::{NativeRecordId, ScenarioMessage, StableId};
use serde::{Deserialize, Serialize};
mod search;
pub use search::{TextOccurrence, TextOccurrenceSearch, find_text_occurrence};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum StringFamily {
    Message,
    OptionLabel,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StringDraft {
    pub family: StringFamily,
    pub native_id: NativeRecordId,
    pub expected_text: Option<String>,
    pub text: String,
}

pub fn next_string_id(
    snapshot: &crate::model::ProjectSnapshot,
    family: &StringFamily,
) -> Option<NativeRecordId> {
    let used = match family {
        StringFamily::Message => snapshot
            .messages
            .iter()
            .map(|row| row.native_id)
            .collect::<std::collections::BTreeSet<_>>(),
        StringFamily::OptionLabel => snapshot
            .option_labels
            .iter()
            .map(|row| row.native_id)
            .collect(),
    };
    (0..=i16::MAX as u32)
        .map(NativeRecordId)
        .find(|id| !used.contains(id))
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "operation", rename_all = "kebab-case")]
pub enum StringEdit {
    Draft { draft: StringDraft },
    Import { changes: Vec<MessageTextChange> },
}

pub fn linked_message_sounds(
    references: &[crate::references::ReferenceDescriptor],
    native_id: u32,
) -> impl Iterator<Item = &crate::references::ReferenceDescriptor> {
    use crate::references::TargetKind;
    let callers = references
        .iter()
        .filter(|row| {
            row.target_kind == TargetKind::Message && row.target_id == native_id.to_string()
        })
        .filter_map(|row| {
            action_context(&row.field.0).map(|context| (row.source.clone(), context.to_string()))
        })
        .collect::<std::collections::BTreeSet<_>>();
    references.iter().filter(move |row| {
        row.target_kind == TargetKind::Sound
            && action_context(&row.field.0)
                .is_some_and(|context| callers.contains(&(row.source.clone(), context.to_string())))
    })
}

fn action_context(field: &str) -> Option<&str> {
    if field.starts_with("actions[") {
        Some("")
    } else {
        field.find(".actions[").map(|index| &field[..index])
    }
}

pub const DIVINITY_TEXT_SEPARATOR: &str = "                    \u{f8ff}                    ";
pub const MAX_STRING_IMPORT_RECORDS: usize = 32_768;

pub fn option_labels_present(snapshot: &crate::model::ProjectSnapshot) -> bool {
    !snapshot.option_labels.is_empty()
        || snapshot
            .classic_sources
            .iter()
            .any(|source| source.native_path == "Data OD")
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MessageTextChange {
    pub identity: StableId,
    pub native_id: NativeRecordId,
    pub expected_text: String,
    pub text: String,
}

pub fn export_divinity_text(messages: &[ScenarioMessage]) -> Result<String, String> {
    let selected = ordered_messages(messages)?;
    Ok(selected
        .iter()
        .map(|message| message.text.as_str())
        .collect::<Vec<_>>()
        .join(DIVINITY_TEXT_SEPARATOR))
}

pub fn review_divinity_text(
    messages: &[ScenarioMessage],
    content: &str,
) -> Result<Vec<MessageTextChange>, String> {
    let selected = ordered_messages(messages)?;
    let parts = if selected.is_empty() && content.is_empty() {
        Vec::new()
    } else {
        content.split(DIVINITY_TEXT_SEPARATOR).collect::<Vec<_>>()
    };
    if parts.len() != selected.len() {
        return Err(format!(
            "Import contains {} segments; this scenario has {} strings. Nothing was changed.",
            parts.len(),
            selected.len()
        ));
    }
    if parts.iter().any(|part| part.chars().count() > 65_536) {
        return Err("An imported string exceeds the 65,536-character inspection bound. Nothing was changed.".into());
    }
    Ok(selected
        .into_iter()
        .zip(parts)
        .filter_map(|(message, part)| {
            let text = part.replace("\r\n", "\n").replace('\r', "\n");
            (message.text != text).then(|| MessageTextChange {
                identity: message.identity.clone(),
                native_id: message.native_id,
                expected_text: message.text.clone(),
                text,
            })
        })
        .collect())
}

fn ordered_messages(messages: &[ScenarioMessage]) -> Result<Vec<&ScenarioMessage>, String> {
    if messages.len() > MAX_STRING_IMPORT_RECORDS {
        return Err(format!(
            "Text interchange supports at most {MAX_STRING_IMPORT_RECORDS} strings per reviewed operation."
        ));
    }
    if messages
        .iter()
        .any(|message| message.text.contains(DIVINITY_TEXT_SEPARATOR))
    {
        return Err("A string contains the complete Divinity separator. Interchange would be ambiguous; edit that string before exporting or importing.".into());
    }
    let mut selected = messages.iter().collect::<Vec<_>>();
    selected.sort_by_key(|message| message.native_id);
    if selected
        .windows(2)
        .any(|pair| pair[0].native_id == pair[1].native_id)
    {
        return Err("Duplicate string identities make text interchange ambiguous.".into());
    }
    Ok(selected)
}

pub fn message_draft_feedback(text: &str) -> ClassicTextFeedback {
    inspect_classic_text(text, Some(255))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn message(id: u32, text: &str) -> ScenarioMessage {
        ScenarioMessage {
            identity: StableId(format!("message:{id}")),
            native_id: NativeRecordId(id),
            text: text.into(),
            authored: false,
        }
    }

    #[test]
    fn sparse_interchange_uses_original_ids_and_normalizes_only_line_endings() {
        let messages = [message(9, "Last"), message(1, "First\nline  ")];
        assert_eq!(
            export_divinity_text(&messages).unwrap(),
            format!("First\nline  {DIVINITY_TEXT_SEPARATOR}Last")
        );
        let changes = review_divinity_text(
            &messages,
            &format!("First\r\nline  {DIVINITY_TEXT_SEPARATOR}Café “Last”"),
        )
        .unwrap();
        assert_eq!(changes.len(), 1);
        assert_eq!(changes[0].native_id, NativeRecordId(9));
        assert_eq!(changes[0].expected_text, "Last");
        assert!(message_draft_feedback(&changes[0].text).valid);
    }

    #[test]
    fn absent_segments_and_ambiguous_existing_separator_cannot_shift_allocations() {
        assert!(review_divinity_text(&[message(1, "One"), message(9, "Two")], "One").is_err());
        assert!(export_divinity_text(&[message(1, DIVINITY_TEXT_SEPARATOR)]).is_err());
        assert!(
            review_divinity_text(&[message(1, DIVINITY_TEXT_SEPARATOR)], "replacement").is_err()
        );
        assert!(export_divinity_text(&[message(1, "One"), message(1, "Two")]).is_err());
        assert!(review_divinity_text(&[], "").unwrap().is_empty());
    }
    #[test]
    fn linked_sounds_name_the_exact_caller_result_without_inventing_a_message_attachment() {
        use crate::references::{FieldPath, ReferenceDescriptor, ResolutionState, TargetKind};
        let reference = |field: &str, kind, id: &str| ReferenceDescriptor {
            source: StableId("complex-encounter:3".into()),
            field: FieldPath(field.into()),
            target_kind: kind,
            target_id: id.into(),
            required: true,
            stock_fallback: None,
            resolution: ResolutionState::Resolved,
            repair_actions: Vec::new(),
            byte_provenance: None,
        };
        let rows = [
            reference("results[0].actions[0].target", TargetKind::Message, "449"),
            reference("results[0].actions[3].target", TargetKind::Sound, "36"),
            reference("results[1].actions[3].target", TargetKind::Sound, "40"),
        ];
        let found = linked_message_sounds(&rows, 449).collect::<Vec<_>>();
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].field.0, "results[0].actions[3].target");
        assert_eq!(found[0].target_id, "36");
    }
}

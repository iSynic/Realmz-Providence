//! Local destinations share the same active-word semantics as authoring controls.
use super::target_rules::{FieldMeaning, primary_meaning};

pub(crate) struct ExecutionTargetField {
    pub key: String,
    pub family: &'static str,
    pub result: i16,
    pub code_position: Option<i16>,
}

pub(crate) fn execution_target_fields(opcode: i16, words: [i16; 5]) -> Vec<ExecutionTargetField> {
    let Some(entry) = super::semantic_inventory::semantic_entry(opcode) else {
        return Vec::new();
    };
    let position = (primary_meaning(opcode, 4, words, false) == FieldMeaning::CodePosition)
        .then_some(words[4]);
    entry
        .fields
        .iter()
        .filter_map(|field| {
            let family = match primary_meaning(opcode, field.index, words, false) {
                FieldMeaning::SimpleResult => "simple-encounter",
                FieldMeaning::ComplexResult => "complex-encounter",
                _ => return None,
            };
            Some(ExecutionTargetField {
                key: field.internal_name.clone(),
                family,
                result: words[usize::from(field.index)],
                code_position: position,
            })
        })
        .collect()
}

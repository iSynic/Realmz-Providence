use super::{ActionAuthoringProjection, ActionFieldRole, DescribedActionField};
use std::collections::BTreeSet;

pub(super) fn summarize(
    opcode: i16,
    fields: &[DescribedActionField],
    authoring: &ActionAuthoringProjection,
) -> String {
    if opcode == 3 {
        return choice_summary(fields, authoring);
    }
    if opcode == 50 {
        return character_selection_summary(fields, authoring);
    }
    if fields.len() == 1 && fields[0].target_kind.is_some() {
        return String::new();
    }
    let mut inserted_controls = BTreeSet::new();
    fields
        .iter()
        .filter_map(|field| {
            if let Some((index, control)) = authoring
                .controls
                .iter()
                .enumerate()
                .find(|(_, control)| control.member_fields.contains(&field.key))
            {
                return inserted_controls
                    .insert(index)
                    .then(|| summarize_control(control, fields));
            }
            (field.editable && !field.preserved).then(|| summarize_field(field))
        })
        .take(5)
        .collect::<Vec<_>>()
        .join(" · ")
}

fn summarize_control(
    control: &super::AuthoringModeControl,
    fields: &[DescribedActionField],
) -> String {
    let value = match control.active_fields.as_slice() {
        [key] => {
            let field = field(fields, key);
            return format!(
                "{}: {}",
                field.map_or(control.label.as_str(), |field| field.label.as_str()),
                result(field)
            );
        }
        active if !active.is_empty() => active
            .iter()
            .map(|key| result(field(fields, key)))
            .collect::<Vec<_>>()
            .join(" / "),
        _ => control
            .choices
            .iter()
            .find(|choice| choice.value == control.value)
            .map(|choice| choice.label.clone())
            .or_else(|| (!control.display.is_empty()).then(|| control.display.clone()))
            .unwrap_or_else(|| format!("Imported value ({})", control.value)),
    };
    format!("{}: {value}", control.label)
}

fn summarize_field(field: &DescribedActionField) -> String {
    if field.uses.len() > 1 {
        return field
            .uses
            .iter()
            .map(|usage| {
                let value = usage
                    .preview
                    .as_ref()
                    .map(|preview| preview.label.clone())
                    .unwrap_or_else(|| field.value.to_string());
                let value = if usage.role == ActionFieldRole::Inactive {
                    "None".into()
                } else {
                    value
                };
                format!("{}: {value}", usage.label)
            })
            .collect::<Vec<_>>()
            .join(" · ");
    }
    format!("{}: {}", field.label, result(Some(field)))
}

fn character_selection_summary(
    fields: &[DescribedActionField],
    authoring: &ActionAuthoringProjection,
) -> String {
    let Some(control) = authoring
        .controls
        .iter()
        .find(|control| control.key == "characterProperty")
    else {
        return "Imported character-selection mode is not understood".into();
    };
    let property = control
        .choices
        .iter()
        .find(|choice| choice.value == control.value)
        .map(|choice| choice.label.as_str())
        .unwrap_or("Imported property");
    let selected = control
        .active_fields
        .first()
        .and_then(|key| field(fields, key));
    format!(
        "Replace selection with {} · {property}: {}",
        result(field(fields, "livingOnly")),
        result(selected)
    )
}

fn choice_summary(
    fields: &[DescribedActionField],
    authoring: &ActionAuthoringProjection,
) -> String {
    let text = if authoring
        .controls
        .first()
        .is_some_and(|control| control.value == 0)
    {
        "Left: Yes · Right: No".into()
    } else {
        format!(
            "Left: {} · Right: {}",
            result(field(fields, "promptA")),
            result(field(fields, "promptB"))
        )
    };
    let destination = field(fields, "branchTarget");
    format!(
        "{text} · {} · Otherwise {}{}",
        result(field(fields, "replyPolarity")),
        result(field(fields, "branchMode")),
        if destination.is_some_and(|field| field.editable) {
            format!(": {}", result(destination))
        } else {
            String::new()
        }
    )
}

fn field<'a>(fields: &'a [DescribedActionField], key: &str) -> Option<&'a DescribedActionField> {
    fields.iter().find(|field| field.key == key)
}

fn result(field: Option<&DescribedActionField>) -> String {
    let Some(field) = field else {
        return "Unresolved".into();
    };
    if field
        .uses
        .iter()
        .any(|usage| usage.role == ActionFieldRole::ContextualReference)
    {
        return "Caller-dependent".into();
    }
    if let Some(choice) = field
        .choices
        .iter()
        .find(|choice| choice.value == field.value)
    {
        return choice.label.clone();
    }
    if let Some(special) = field
        .special_values
        .iter()
        .find(|special| special.value == field.value)
    {
        return special.meaning.clone();
    }
    if let Some(preview) = &field.preview {
        if matches!(
            preview.kind,
            super::ActionTargetKind::Message | super::ActionTargetKind::OptionLabel
        ) {
            let mut text: String = preview.detail.chars().take(70).collect();
            if preview.detail.chars().count() > 70 {
                text.push('…');
            }
            return format!("“{text}”");
        }
        return preview.label.clone();
    }
    if field.target_kind.is_some() && field.availability_reason.is_some() {
        return "Select content".into();
    }
    format!(
        "{}{}",
        field.value,
        field
            .units
            .as_ref()
            .map(|units| format!(" {units}"))
            .unwrap_or_default()
    )
}

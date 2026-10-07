use super::target_rules::{FieldMeaning, direct_meaning, primary_meanings, primary_references};
use super::{
    ActionFieldRole, ActionFieldUse, ActionFormDescribeQuery, ActionTargetKind,
    DescribedActionField, FormControl, FormRow,
};
use crate::model::ProjectSnapshot;
use crate::rebuilt::ApplicationMediaCatalog;

pub(super) fn describe(
    snapshot: &ProjectSnapshot,
    application: Option<&ApplicationMediaCatalog>,
    query: &ActionFormDescribeQuery,
    opcode: i16,
    fields: &mut [DescribedActionField],
) {
    let mut words = [0; 5];
    for field in fields.iter().filter(|field| field.row == FormRow::Primary) {
        if let Some(index) = field.index {
            words[usize::from(index)] = field.value;
        }
    }
    let options = super::authoring_controls::option_labels_present(snapshot);
    for field in fields {
        let meanings = match field.row {
            FormRow::Primary => primary_meanings(opcode, field.index.unwrap(), words, options),
            FormRow::Action => vec![direct_meaning(opcode)],
            FormRow::Secondary => vec![if field.preserved {
                FieldMeaning::Preserved
            } else {
                FieldMeaning::Value
            }],
        };
        let references = if field.row == FormRow::Primary {
            primary_references(opcode, field.index.unwrap(), words, options)
        } else {
            field.target_kind.into_iter().collect()
        };
        field.uses = meanings
            .into_iter()
            .map(|meaning| usage(snapshot, application, query, field, meaning, &references))
            .collect();
        if field
            .target_kind
            .is_some_and(|kind| !references.contains(&kind))
        {
            field.preview = None;
        }
        if field.uses.len() > 1 {
            field.special_values.clear();
            if field
                .uses
                .iter()
                .any(|usage| usage.role == ActionFieldRole::Quantity)
            {
                field.control = FormControl::Integer;
                field.target_kind = None;
                field.preview = None;
            }
        }
    }
}

fn usage(
    snapshot: &ProjectSnapshot,
    application: Option<&ApplicationMediaCatalog>,
    query: &ActionFormDescribeQuery,
    field: &DescribedActionField,
    meaning: FieldMeaning,
    references: &[ActionTargetKind],
) -> ActionFieldUse {
    let role = role_for(field, meaning, references);
    let target_kind = if role == ActionFieldRole::Reference {
        if let FieldMeaning::Record(kind) = meaning {
            Some(kind)
        } else {
            None
        }
    } else {
        None
    };
    let label = match (query.action_identity.as_str(), field.index, meaning) {
        ("realmz.action.2", Some(2), FieldMeaning::Record(ActionTargetKind::Sound)) => {
            "Sound before combat".into()
        }
        ("realmz.action.2", Some(2), FieldMeaning::Record(ActionTargetKind::ExtraActionPoint)) => {
            "Extra Action Point after combat".into()
        }
        ("realmz.action.74", Some(1), FieldMeaning::Value) => "Spell-point roll low".into(),
        ("realmz.action.74", Some(1), FieldMeaning::Record(ActionTargetKind::Sound)) => {
            "Sound with the same number".into()
        }
        _ => field.label.clone(),
    };
    let mut contextual = query.clone();
    contextual.context.target_context = field.target_context.clone();
    let preview = target_kind.and_then(|kind| {
        super::form_description::preview(snapshot, application, &contextual, kind, field.value)
    });
    ActionFieldUse {
        role,
        label,
        target_kind,
        preview,
    }
}

fn role_for(
    field: &DescribedActionField,
    meaning: FieldMeaning,
    references: &[ActionTargetKind],
) -> ActionFieldRole {
    if meaning == FieldMeaning::Unresolved {
        ActionFieldRole::Unresolved
    } else if !field.editable && !field.preserved {
        ActionFieldRole::Inactive
    } else {
        match meaning {
            FieldMeaning::Record(kind) if references.contains(&kind) => ActionFieldRole::Reference,
            FieldMeaning::Record(_) => ActionFieldRole::Inactive,
            FieldMeaning::Value if !field.choices.is_empty() => ActionFieldRole::Choice,
            FieldMeaning::Value => ActionFieldRole::Quantity,
            FieldMeaning::CurrentShop => ActionFieldRole::ContextualReference,
            FieldMeaning::SimpleResult
            | FieldMeaning::ComplexResult
            | FieldMeaning::CodePosition
            | FieldMeaning::MonsterTag => ActionFieldRole::ContextualPosition,
            FieldMeaning::Preserved => ActionFieldRole::Preserved,
            FieldMeaning::Unresolved => ActionFieldRole::Unresolved,
        }
    }
}

//! Context-resolved authoring controls. Storage field names never cross this boundary as labels.

use super::action_units::{direct_units, field_units};
use super::form_presentation::{
    direct_choices, direct_context, direct_special_values, field_choices, field_special_values,
    resolved_explanation, resolved_field_presentation,
};
use super::semantic_inventory::{donor_paths, semantic_entry};
use super::target_rules::{FieldMeaning, direct_meaning, direct_target_kind, field_target_kind};
use super::targets::target_preview_with_application;
use super::{
    ActionAuthoringProjection, ActionDefinition, ActionFormDescribeQuery, ActionFormDescription,
    ActionSemanticCoverage, ActionSemanticInventoryEntry, ActionSemanticInventoryField,
    ActionStorage, ActionTargetKind, ActionValuePreview, DescribedActionField, FormChoice,
    FormControl, FormRow, SemanticEvidence, SemanticEvidenceKind, SettingsTargetField,
    action_definition, catalog, form_definition,
};
use crate::{model::ProjectSnapshot, rebuilt::ApplicationMediaCatalog};
use std::collections::BTreeMap;

pub fn describe_action_form(
    snapshot: &ProjectSnapshot,
    query: &ActionFormDescribeQuery,
) -> Result<ActionFormDescription, String> {
    describe_action_form_with_application(snapshot, None, query)
}

pub fn describe_action_form_with_application(
    snapshot: &ProjectSnapshot,
    application: Option<&ApplicationMediaCatalog>,
    query: &ActionFormDescribeQuery,
) -> Result<ActionFormDescription, String> {
    let action = action_definition(&query.action_identity)
        .filter(|definition| definition.selectable)
        .ok_or_else(|| "the selected action is not authorable".to_owned())?;
    let entry = semantic_entry(action.opcode)
        .ok_or_else(|| format!("action {} has no semantic inventory", action.opcode))?;
    let evidence = evidence(entry);
    let authoring =
        super::authoring_controls::resolve(snapshot, application, query, action.opcode)?;
    let mut resolved = query.clone();
    resolved.values = authoring.resolved_values.clone();
    let query = &resolved;
    let option_storage = option_prompt_storage(snapshot, action.opcode);
    let mut fields = described_fields(
        snapshot,
        application,
        query,
        entry,
        &action,
        &option_storage,
    );
    fields.extend(companion_fields(action.opcode, query, entry));
    let availability_reason = query
        .context
        .script_kind
        .as_deref()
        .and_then(|kind| action_availability_reason(action.opcode, kind));
    decorate_fields(
        snapshot,
        application,
        query,
        &authoring,
        &action,
        &mut fields,
    );
    apply_availability(action.opcode, &mut fields, availability_reason.as_ref());
    let unresolved_field_count = fields
        .iter()
        .filter(|field| field.evidence.kind == SemanticEvidenceKind::Unresolved)
        .count();
    let editable_field_count = fields.iter().filter(|field| field.editable).count();
    let summary = super::action_summary::summarize(action.opcode, &fields, &authoring);
    Ok(ActionFormDescription {
        title: super::authoring_flow::title(action.opcode, entry.form_id.as_deref(), &action.label),
        action,
        available: availability_reason.is_none(),
        availability_reason,
        fields,
        evidence,
        unresolved_field_count,
        editable_field_count,
        option_prompt_storage: option_storage,
        authoring,
        summary,
    })
}

fn decorate_fields(
    snapshot: &ProjectSnapshot,
    application: Option<&ApplicationMediaCatalog>,
    query: &ActionFormDescribeQuery,
    authoring: &ActionAuthoringProjection,
    action: &ActionDefinition,
    fields: &mut [DescribedActionField],
) {
    super::authoring_controls::decorate_fields(snapshot, application, query, authoring, fields);
    super::monster_name_tag_control::decorate(snapshot, action.opcode, fields);
    super::map_tile_control::decorate(snapshot, application, query, action.opcode, fields);
    super::field_uses::describe(snapshot, application, query, action.opcode, fields);
}

fn companion_fields(
    opcode: i16,
    query: &ActionFormDescribeQuery,
    entry: &ActionSemanticInventoryEntry,
) -> Vec<DescribedActionField> {
    if opcode == 92 {
        super::companion_description::fields(query, entry)
    } else {
        Vec::new()
    }
}

fn option_prompt_storage(snapshot: &ProjectSnapshot, opcode: i16) -> Option<String> {
    (opcode == 3).then(|| {
        if super::authoring_controls::option_labels_present(snapshot) {
            "option-labels".to_owned()
        } else {
            "messages".to_owned()
        }
    })
}

fn described_fields(
    snapshot: &ProjectSnapshot,
    application: Option<&ApplicationMediaCatalog>,
    query: &ActionFormDescribeQuery,
    entry: &ActionSemanticInventoryEntry,
    action: &ActionDefinition,
    option_storage: &Option<String>,
) -> Vec<DescribedActionField> {
    if action.form_id.is_some() {
        described_settings_fields(
            snapshot,
            application,
            query,
            entry,
            option_storage.as_deref(),
        )
    } else {
        described_direct_field(snapshot, application, query, entry, action.storage)
            .into_iter()
            .collect()
    }
}

pub(crate) fn settings_target_fields(
    opcode: i16,
    words: [i16; 5],
    option_labels_present: bool,
) -> Vec<SettingsTargetField> {
    let Some(action) = super::action_definition_for_opcode(opcode) else {
        return Vec::new();
    };
    let Some(_) = action.form_id else {
        return Vec::new();
    };
    let Some(entry) = semantic_entry(opcode) else {
        return Vec::new();
    };
    entry
        .fields
        .iter()
        .flat_map(|field| {
            super::target_rules::primary_references(
                opcode,
                field.index,
                words,
                option_labels_present,
            )
            .into_iter()
            .map(|kind| SettingsTargetField {
                key: if field.internal_name == "unused" {
                    format!("word{}", field.index)
                } else {
                    field.internal_name.clone()
                },
                index: field.index,
                kind,
                value: words[usize::from(field.index)],
            })
            .collect::<Vec<_>>()
        })
        .collect()
}

fn apply_availability(opcode: i16, fields: &mut [DescribedActionField], reason: Option<&String>) {
    super::authoring_flow::order(opcode, fields);
    if let Some(reason) = reason {
        for field in fields {
            field.editable = false;
            field.availability_reason = Some(reason.clone());
        }
    }
}

pub fn action_availability_reason(opcode: i16, script_kind: &str) -> Option<String> {
    if !matches!(script_kind, "action-point" | "extra-action-point") {
        return None;
    }
    match (script_kind, opcode) {
        (_, 34) => Some("Exit Encounter is only meaningful inside an encounter script.".into()),
        ("action-point", 100 | 105 | 119 | 120..=127) => Some(
            "This combat-only action belongs in a battle or monster macro, not an Action Point program."
                .into(),
        ),
        _ => None,
    }
}

pub fn action_semantic_coverage(snapshot: &ProjectSnapshot) -> ActionSemanticCoverage {
    let catalog = catalog();
    let mut editable = 0;
    let mut preserved = 0;
    let mut unresolved = 0;
    let mut total = 0;
    for action in &catalog.actions {
        let query = ActionFormDescribeQuery {
            action_identity: action.identity.clone(),
            target_native_id: 0,
            values: zero_values(action.form_id.as_deref()),
            secondary_values: zero_values(
                action
                    .form_id
                    .as_deref()
                    .and_then(form_definition)
                    .and_then(|form| form.companion_form_id)
                    .as_deref(),
            ),
            context: Default::default(),
        };
        if let Ok(description) = describe_action_form(snapshot, &query) {
            total += description.fields.len();
            editable += description
                .fields
                .iter()
                .filter(|field| field.editable)
                .count();
            preserved += description
                .fields
                .iter()
                .filter(|field| field.preserved)
                .count();
            unresolved += description.unresolved_field_count;
        }
    }
    ActionSemanticCoverage {
        cataloged_actions: catalog.actions.len(),
        inventory_actions: super::semantic_inventory().len(),
        settings_actions: catalog
            .actions
            .iter()
            .filter(|action| action.form_id.is_some())
            .count(),
        settings_layouts: catalog.forms.len().saturating_sub(1),
        inventoried_fields: total,
        editable_fields: editable,
        preserved_fields: preserved,
        unresolved_fields: unresolved,
    }
}

fn zero_values(form_id: Option<&str>) -> BTreeMap<String, i16> {
    form_id
        .and_then(form_definition)
        .map(|form| {
            form.fields
                .iter()
                .map(|field| (super::canonical_field_key(&form.fields, field), 0))
                .collect()
        })
        .unwrap_or_default()
}

fn described_settings_fields(
    snapshot: &ProjectSnapshot,
    application: Option<&ApplicationMediaCatalog>,
    query: &ActionFormDescribeQuery,
    entry: &ActionSemanticInventoryEntry,
    option_storage: Option<&str>,
) -> Vec<DescribedActionField> {
    let mut fields: Vec<_> = entry
        .fields
        .iter()
        .map(|field| {
            let key = super::semantic_field_key(
                entry.form_id.as_deref().unwrap_or_default(),
                &field.internal_name,
                field.index,
            );
            described_field(
                snapshot,
                application,
                query,
                entry,
                field,
                &key,
                option_storage,
            )
        })
        .collect();
    super::action_bounds::apply(entry.opcode, &query.values, &mut fields);
    fields
}

fn described_field(
    snapshot: &ProjectSnapshot,
    application: Option<&ApplicationMediaCatalog>,
    query: &ActionFormDescribeQuery,
    entry: &ActionSemanticInventoryEntry,
    field: &ActionSemanticInventoryField,
    key: &str,
    option_storage: Option<&str>,
) -> DescribedActionField {
    let value = query.values.get(key).copied().unwrap_or(0);
    let (label, mut explanation, meaning, preserved) =
        resolved_field_presentation(entry, field, &query.values, option_storage);
    let choices = field_choices(entry.opcode, field.index, value);
    let target_kind = field_target_kind(entry, field, &query.values, option_storage);
    let resolved_query = contextual_query(snapshot, query, entry, target_kind);
    let units = field_units(entry.opcode, field.index, &query.values);
    let special_values = field_special_values(
        entry.opcode,
        field.index,
        super::target_rules::field_words(entry, &query.values),
    );
    explanation = resolved_explanation(
        &label,
        &explanation,
        &choices,
        target_kind,
        units.as_deref(),
        &special_values,
    );
    let (conditional, unresolved, editable) = super::described_field_builder::state(
        entry,
        field,
        &query.values,
        meaning,
        &label,
        &explanation,
        preserved,
    );
    let preview =
        target_kind.and_then(|kind| preview(snapshot, application, &resolved_query, kind, value));
    super::described_field_builder::build(
        key,
        field.index,
        label,
        explanation,
        choices,
        target_kind,
        value,
        units,
        special_values,
        editable,
        &resolved_query,
        conditional,
        unresolved,
        preserved,
        preview,
        entry,
    )
}

pub(super) fn field_evidence(
    entry: &ActionSemanticInventoryEntry,
    unresolved: bool,
) -> SemanticEvidence {
    SemanticEvidence {
        kind: semantic_evidence_kind(unresolved),
        status: entry.evidence_status.clone(),
        sources: donor_paths().to_vec(),
        note: "Pinned donor field metadata reconciled with the audited action consumer.".into(),
    }
}

fn contextual_query(
    snapshot: &ProjectSnapshot,
    query: &ActionFormDescribeQuery,
    entry: &ActionSemanticInventoryEntry,
    kind: Option<ActionTargetKind>,
) -> ActionFormDescribeQuery {
    let mut resolved = query.clone();
    resolved.context.target_context =
        super::target_context::field_context(snapshot, query, entry, kind);
    resolved
}

fn described_direct_field(
    snapshot: &ProjectSnapshot,
    application: Option<&ApplicationMediaCatalog>,
    query: &ActionFormDescribeQuery,
    entry: &ActionSemanticInventoryEntry,
    storage: ActionStorage,
) -> Option<DescribedActionField> {
    if direct_meaning(entry.opcode) == FieldMeaning::Preserved
        || matches!(storage, ActionStorage::Empty | ActionStorage::StepOnly)
    {
        return None;
    }
    let choices = direct_choices(entry.opcode);
    let target_kind = direct_target_kind(entry.opcode);
    let (label, raw_explanation) = direct_presentation(entry, target_kind);
    let units = direct_units(entry.opcode);
    let special_values = direct_special_values(entry.opcode);
    let explanation = resolved_explanation(
        &label,
        &raw_explanation,
        &choices,
        target_kind,
        units.as_deref(),
        &special_values,
    );
    let unresolved = direct_meaning(entry.opcode) == FieldMeaning::Unresolved
        || label.trim().is_empty()
        || explanation.trim().is_empty();
    let (minimum, maximum) = super::action_bounds::direct(entry.opcode);
    Some(DescribedActionField {
        key: "targetNativeId".into(),
        index: None,
        row: FormRow::Action,
        label,
        explanation,
        control: control(false, &choices, target_kind),
        value: query.target_native_id,
        minimum,
        maximum,
        units,
        choices,
        special_values,
        target_kind,
        value_picker_kind: None,
        value_picker_preview: None,
        visible: true,
        editable: !unresolved,
        target_context: query.context.target_context.clone(),
        availability_reason: unresolved
            .then(|| "The argument meaning is unresolved and is preserved read-only.".into()),
        preserved: false,
        applicable_context: direct_context(entry.opcode),
        preservation_policy: "The signed Classic argument is changed only by this control.".into(),
        preview: target_kind
            .and_then(|kind| preview(snapshot, application, query, kind, query.target_native_id)),
        evidence: field_evidence(entry, unresolved),
        uses: Vec::new(),
    })
}

fn semantic_evidence_kind(unresolved: bool) -> SemanticEvidenceKind {
    if unresolved {
        SemanticEvidenceKind::Unresolved
    } else {
        SemanticEvidenceKind::SourceSupported
    }
}

pub(super) fn preview(
    snapshot: &ProjectSnapshot,
    application: Option<&ApplicationMediaCatalog>,
    query: &ActionFormDescribeQuery,
    kind: ActionTargetKind,
    value: i16,
) -> Option<ActionValuePreview> {
    let lookup_value =
        if kind == ActionTargetKind::Caste && query.action_identity == "realmz.action.86" {
            value.checked_abs()?
        } else {
            value
        };
    target_preview_with_application(
        snapshot,
        application,
        kind,
        lookup_value,
        &query.context.target_context,
    )
    .map(|target| ActionValuePreview {
        kind,
        identity: target.identity.clone(),
        value,
        label: target.label,
        detail: if kind == ActionTargetKind::Message {
            snapshot
                .messages
                .iter()
                .find(|row| row.identity == target.identity)
                .map(|row| row.text.clone())
                .unwrap_or(target.detail)
        } else if target
            .preview
            .as_deref()
            .is_some_and(|text| !text.is_empty())
        {
            target.preview.unwrap_or_default()
        } else {
            target.detail
        },
        status: target.status,
    })
}

fn evidence(entry: &ActionSemanticInventoryEntry) -> SemanticEvidence {
    SemanticEvidence {
        kind: SemanticEvidenceKind::SourceSupported,
        status: entry.evidence_status.clone(),
        sources: donor_paths().to_vec(),
        note: "Action identity and storage family are pinned to the donor source audit.".into(),
    }
}

pub(super) fn control(
    preserved: bool,
    choices: &[FormChoice],
    target: Option<ActionTargetKind>,
) -> FormControl {
    if preserved {
        FormControl::Preserved
    } else if !choices.is_empty() {
        FormControl::Choice
    } else if target.is_some() {
        FormControl::Target
    } else {
        FormControl::Integer
    }
}

pub(super) fn availability_reason(
    preserved: bool,
    conditional: Option<String>,
    unresolved: bool,
) -> Option<String> {
    if preserved {
        Some("Imported compatibility value; this consumer does not use it.".into())
    } else if unresolved {
        Some("The behavior is unresolved, so the imported value is read-only.".into())
    } else {
        conditional
    }
}

pub(super) fn preservation_policy(preserved: bool) -> String {
    if preserved {
        "Retain the imported word byte-for-byte during ordinary edits.".into()
    } else {
        "Encode this field only when the record draft is applied.".into()
    }
}

fn direct_presentation(
    entry: &ActionSemanticInventoryEntry,
    target: Option<ActionTargetKind>,
) -> (String, String) {
    if let Some(presentation) = direct_meaning(entry.opcode).contextual_presentation() {
        return presentation;
    }
    let label = match (entry.opcode, target) {
        (-14 | 14, _) => "Characters To Pick".into(),
        (9, Some(ActionTargetKind::Sound)) => "Sound To Play".into(),
        (10, Some(ActionTargetKind::Treasure)) => "Treasure To Give".into(),
        (29, Some(ActionTargetKind::PlayerMap)) => "Map To Give Or Display".into(),
        (47, Some(ActionTargetKind::Quest)) => "Quest Flag".into(),
        (88, Some(ActionTargetKind::Monster)) => "Special Character To Remove".into(),
        (89, Some(ActionTargetKind::Monster)) => "Special Character To Add".into(),
        (104, _) => "Random Encounters".into(),
        (35 | 44, _) => "Choice To Eliminate".into(),
        (36, _) => "Equipment Operation".into(),
        (66, _) => "Camping Availability".into(),
        (71, _) => "Coordinate Display".into(),
        (105, _) => "Allied Combatants".into(),
        (_, Some(_)) if entry.id_label == "ID" => "Destination".into(),
        _ => entry.id_label.clone(),
    };
    let explanation = match entry.opcode {
        -14 | 14 => "Pick this many characters. A negative count enables fast selection; Pick Opposite then inverts the selected set.".into(),
        28 => "This action redraws the screen; Classic does not read its ID word.".into(),
        35 => "Choose the one-based Simple Encounter choice to eliminate.".into(),
        36 => "Capture the party's equipment and wealth, or restore the captured state.".into(),
        44 => "Choose the one-based Complex Encounter choice to eliminate.".into(),
        66 => "Choose whether camping is currently allowed on this map.".into(),
        71 => "Choose whether the on-screen X/Y coordinate display is visible.".into(),
        104 => "Choose whether random encounters are allowed.".into(),
        105 => "Suspend or reactivate allied combatants.".into(),
        _ => entry.id_help.clone(),
    };
    (label, explanation)
}

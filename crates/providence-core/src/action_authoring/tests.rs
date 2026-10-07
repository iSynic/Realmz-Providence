use super::authoring_flow_tests::named;
use super::*;
use crate::model::{NativeRecordId, OptionLabelRecord, ProjectSnapshot, ScenarioMessage, StableId};
use std::collections::{BTreeMap, BTreeSet};

#[test]
fn battle_feedback_names_both_sound_and_after_combat_script() {
    let snapshot = ProjectSnapshot::new_authored(StableId("battle".into()));
    let describe = |outcome| {
        describe_action_form(
            &snapshot,
            &ActionFormDescribeQuery {
                action_identity: "realmz.action.2".into(),
                target_native_id: 0,
                values: BTreeMap::from([
                    ("battleLow".into(), 1),
                    ("battleHigh".into(), 0),
                    ("soundOrReviveLossMacro".into(), 8),
                    ("message".into(), 0),
                    ("revivePartyFlag".into(), outcome),
                ]),
                secondary_values: BTreeMap::new(),
                context: Default::default(),
            },
        )
        .unwrap()
    };
    let normal = describe(0);
    assert_eq!(
        named(&normal, "battleLow").label,
        "Battle Number / Range Low"
    );
    assert_eq!(
        named(&normal, "soundOrReviveLossMacro").label,
        "Sound To Play Before Battle"
    );
    assert_eq!(
        named(&normal, "soundOrReviveLossMacro").target_kind,
        Some(ActionTargetKind::Sound)
    );
    assert_eq!(named(&normal, "revivePartyFlag").label, "Battle Outcome");
    let revived = describe(10);
    assert_eq!(
        named(&revived, "soundOrReviveLossMacro").label,
        "Before-battle Sound / After-battle Script"
    );
    assert_eq!(
        named(&revived, "soundOrReviveLossMacro").target_kind,
        Some(ActionTargetKind::ExtraActionPoint)
    );
    assert_eq!(
        named(&revived, "soundOrReviveLossMacro")
            .uses
            .iter()
            .map(|usage| usage.target_kind)
            .collect::<Vec<_>>(),
        vec![
            Some(ActionTargetKind::Sound),
            Some(ActionTargetKind::ExtraActionPoint)
        ]
    );
    assert!(revived.summary.contains("Sound before combat"));
    assert!(revived.summary.contains("Extra Action Point after combat"));
}

#[test]
fn catalog_owns_the_documented_action_and_form_denominators() {
    let catalog = catalog();
    assert_eq!(catalog.actions.len(), 120);
    assert_eq!(
        catalog
            .actions
            .iter()
            .filter(|action| action.form_id.is_some())
            .count(),
        70
    );
    let primary_forms = catalog
        .actions
        .iter()
        .filter_map(|action| action.form_id.as_deref())
        .collect::<BTreeSet<_>>();
    assert_eq!(primary_forms.len(), 61);
    assert_eq!(catalog.forms.len(), 62);
    assert!(catalog.forms.iter().any(|form| {
        form.identity == "random-region-shape-details" && form.required_rows == [FormRow::Secondary]
    }));
}

#[test]
fn branch_forms_only_treat_destination_words_as_links() {
    let fields = settings_target_fields(38, [923, 1, 0, 17, 4], false);
    assert_eq!(fields.len(), 2);
    assert_eq!(fields[0].kind, ActionTargetKind::Item);
    assert_eq!(fields[1].key, "target");
    assert_eq!(fields[1].index, 3);
    assert_eq!(fields[1].kind, ActionTargetKind::ExtraActionPoint);
    assert_eq!(fields[1].value, 17);

    let encounter = settings_target_fields(38, [923, 1, 1, 2, 4], false);
    assert_eq!(encounter.len(), 1);
    assert_eq!(encounter[0].kind, ActionTargetKind::Item);
}

#[test]
fn every_action_and_form_has_complete_deterministic_metadata() {
    let first_catalog = catalog();
    let identities = first_catalog
        .actions
        .iter()
        .map(|action| action.identity.as_str())
        .collect::<BTreeSet<_>>();
    assert_eq!(identities.len(), first_catalog.actions.len());
    let opcodes = first_catalog
        .actions
        .iter()
        .map(|action| action.opcode)
        .collect::<BTreeSet<_>>();
    assert_eq!(opcodes.len(), first_catalog.actions.len());
    for action in &first_catalog.actions {
        assert!(!action.label.trim().is_empty());
        assert!(!action.category.trim().is_empty());
        assert!(!action.description.trim().is_empty());
        if let Some(form) = &action.form_id {
            assert!(
                first_catalog
                    .forms
                    .iter()
                    .any(|candidate| &candidate.identity == form)
            );
        }
    }
    for form in &first_catalog.forms {
        assert_eq!(form.fields.len(), 5);
        assert_eq!(form.provenance.donor_commit, DONOR_COMMIT);
        assert_eq!(form.provenance.native_family, "Data EDCD");
        for (index, field) in form.fields.iter().enumerate() {
            assert_eq!(usize::from(field.index), index);
            assert_eq!(field.byte_offset, field.index * 2);
            assert_eq!(field.byte_length, 2);
            assert!(!field.name.is_empty());
            assert!(!field.label.is_empty());
            assert!(!field.help.is_empty());
            assert!(field.minimum <= field.maximum);
        }
        let keys = form
            .fields
            .iter()
            .map(|field| canonical_field_key(&form.fields, field))
            .collect::<std::collections::BTreeSet<_>>();
        assert_eq!(keys.len(), 5, "typed keys collapsed for {}", form.identity);
    }
    assert_eq!(
        serde_json::to_vec(&first_catalog).unwrap(),
        serde_json::to_vec(&catalog()).unwrap()
    );
}

#[test]
fn layouts_preserve_donor_geometry_with_explicit_classic_field_corrections() {
    let fixture: serde_json::Value = serde_json::from_str(include_str!(
        "fixtures/providence-56ac232c-action-forms.json"
    ))
    .unwrap();
    assert_eq!(fixture["schemaVersion"], 1);
    assert_eq!(fixture["donorCommit"], DONOR_COMMIT);
    assert_eq!(
        fixture["sources"]["src/editor/realmzEdcd.ts"],
        "9f9c32902016a5854591c155e037a5744cf6eeb8276047551b00482d2be60bc3"
    );
    assert_eq!(
        fixture["sources"]["src/editor/generated/opcodeEdcdCrosswalk.json"],
        "0d9eb20f807d97feb6003f1c94da9d20c37c41b962fbf391c7b7f673f5eca0cb"
    );

    let catalog = catalog();
    let layouts = fixture["layouts"].as_object().unwrap();
    assert_eq!(layouts.len(), catalog.forms.len());
    for form in &catalog.forms {
        let expected = &layouts[&form.identity];
        let mut expected_fields = expected["fields"]
            .as_array()
            .unwrap()
            .iter()
            .map(|value| value.as_str().unwrap())
            .collect::<Vec<_>>();
        if form.identity == "gold" {
            assert_eq!(&expected_fields[2..], &["unused", "unused", "unused"]);
            expected_fields[2..].copy_from_slice(&["branchMode", "target", "slot"]);
        }
        assert_eq!(
            form.fields
                .iter()
                .map(|field| field.name.as_str())
                .collect::<Vec<_>>(),
            expected_fields,
            "field geometry drifted for {}",
            form.identity
        );
        let mut actual_opcodes = catalog
            .actions
            .iter()
            .filter(|action| action.form_id.as_deref() == Some(form.identity.as_str()))
            .map(|action| action.opcode)
            .collect::<Vec<_>>();
        actual_opcodes.sort_unstable();
        let expected_opcodes = expected["opcodes"]
            .as_array()
            .unwrap()
            .iter()
            .map(|value| value.as_i64().unwrap() as i16)
            .collect::<Vec<_>>();
        assert_eq!(
            actual_opcodes, expected_opcodes,
            "opcode drifted for {}",
            form.identity
        );
    }
}

#[test]
fn typed_rows_round_trip_signed_values_and_retain_preserved_words() {
    for form in catalog().forms {
        let mut typed = BTreeMap::new();
        for field in form.fields.iter().filter(|field| !field.preserved) {
            let value = field
                .choices
                .first()
                .map(|choice| choice.value)
                .unwrap_or_else(|| if field.index % 2 == 0 { -123 } else { 234 });
            typed.insert(field.name.clone(), value);
        }
        let base = [-9, -8, -7, -6, -5];
        let encoded = encode_form_values(&form.identity, &typed, Some(base)).unwrap();
        let decoded = decode_form_values(&form.identity, encoded).unwrap();
        for field in &form.fields {
            if field.preserved {
                assert_eq!(
                    encoded[usize::from(field.index)],
                    base[usize::from(field.index)]
                );
            } else {
                assert_eq!(decoded[&field.name], typed[&field.name]);
            }
        }
    }
}

#[test]
fn target_queries_are_searchable_and_cursor_bounded() {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("project".into()));
    for id in 0..5 {
        snapshot.messages.push(ScenarioMessage {
            identity: StableId(format!("message:{id}")),
            native_id: NativeRecordId(id),
            text: format!("Road warning {id}"),
            authored: true,
        });
    }
    let first = list_targets(
        &snapshot,
        &ActionTargetQuery {
            kind: ActionTargetKind::Message,
            search: "road".into(),
            cursor: None,
            limit: 2,
            context: ActionTargetContext::default(),
        },
    )
    .unwrap();
    assert_eq!(first.items.len(), 2);
    assert_eq!(first.total, 5);
    assert_eq!(first.next_cursor.as_deref(), Some("2"));
}

#[test]
fn direct_actions_expose_source_backed_choices_signs_and_targets() {
    let snapshot = ProjectSnapshot::new_authored(StableId("direct-actions".into()));
    let describe = |opcode, value| {
        describe_action_form(
            &snapshot,
            &ActionFormDescribeQuery {
                action_identity: format!("realmz.action.{opcode}"),
                target_native_id: value,
                values: BTreeMap::new(),
                secondary_values: BTreeMap::new(),
                context: Default::default(),
            },
        )
        .unwrap()
    };

    let simple_choice = describe(35, 1);
    assert_eq!(simple_choice.fields[0].label, "Choice To Eliminate");
    assert_eq!(simple_choice.fields[0].target_kind, None);
    assert_eq!(simple_choice.fields[0].choices.len(), 4);

    let complex_choice = describe(44, 4);
    assert_eq!(complex_choice.fields[0].choices[3].label, "Choice 4");
    let equipment = describe(36, 1);
    assert_eq!(equipment.fields[0].choices[1].label, "Capture equipment");
    let coordinates = describe(71, 0);
    assert_eq!(coordinates.fields[0].choices[0].label, "Show coordinates");
    let encounters = describe(104, 0);
    assert_eq!(encounters.fields[0].target_kind, None);
    assert_eq!(
        encounters.fields[0].choices[0].label,
        "Disable random encounters"
    );

    let quest = describe(47, -11);
    assert_eq!(quest.fields[0].target_kind, Some(ActionTargetKind::Quest));
    assert_eq!(quest.fields[0].preview.as_ref().unwrap().value, -11);
    assert!(quest.fields[0].special_values[0].meaning.contains("clear"));

    assert_eq!(
        action_definition("realmz.action.49").unwrap().label,
        "Offer Banking"
    );
    assert!(describe(49, 0).fields.is_empty());
}

#[test]
fn semantic_inventory_covers_every_action_and_never_exposes_storage_names() {
    let snapshot = ProjectSnapshot::new_authored(StableId("semantic-coverage".into()));
    let coverage = action_semantic_coverage(&snapshot);
    assert_eq!(coverage.cataloged_actions, 120);
    assert_eq!(coverage.inventory_actions, 120);
    assert_eq!(coverage.settings_actions, 70);
    assert_eq!(coverage.settings_layouts, 61);
    assert_eq!(
        semantic_inventory()
            .iter()
            .map(|entry| entry.opcode)
            .collect::<BTreeSet<_>>()
            .len(),
        120
    );
    let unresolved: Vec<_> = catalog()
        .actions
        .into_iter()
        .flat_map(|action| {
            let description = describe_action_form(
                &snapshot,
                &ActionFormDescribeQuery {
                    action_identity: action.identity,
                    target_native_id: 0,
                    values: BTreeMap::new(),
                    secondary_values: BTreeMap::new(),
                    context: Default::default(),
                },
            )
            .unwrap();
            description
                .fields
                .into_iter()
                .filter(|field| field.evidence.kind == SemanticEvidenceKind::Unresolved)
                .map(move |field| (action.opcode, field.key))
                .collect::<Vec<_>>()
        })
        .collect();
    assert_eq!(coverage.unresolved_fields, 0, "{unresolved:?}");
    assert_eq!(coverage.inventoried_fields, 382);
    assert_eq!(coverage.editable_fields, 297);
    assert_eq!(coverage.preserved_fields, 64);

    assert_all_semantic_fields(&snapshot);
}

#[test]
fn gosub_metadata_matches_classic_branch_dispatch() {
    let expected = BTreeSet::from([
        3, 21, 31, 40, 46, 55, 56, 64, 67, 72, 75, 76, 77, 78, 81, 85, 86, 87,
    ]);
    let actual = catalog()
        .actions
        .into_iter()
        .filter(|action| action.gosub_applicable)
        .map(|action| action.opcode)
        .collect::<BTreeSet<_>>();
    assert_eq!(actual, expected);
    assert!(
        !action_definition("realmz.action.1")
            .unwrap()
            .gosub_applicable
    );
    assert!(
        !action_definition("realmz.action.9")
            .unwrap()
            .gosub_applicable
    );
}

fn assert_all_semantic_fields(snapshot: &ProjectSnapshot) {
    for action in catalog().actions {
        let values = action
            .form_id
            .as_deref()
            .and_then(form_definition)
            .map(|form| {
                form.fields
                    .into_iter()
                    .map(|field| (field.name, 0))
                    .collect()
            })
            .unwrap_or_default();
        let description = describe_action_form(
            snapshot,
            &ActionFormDescribeQuery {
                action_identity: action.identity,
                target_native_id: 0,
                values,
                secondary_values: BTreeMap::new(),
                context: Default::default(),
            },
        )
        .unwrap();
        for field in description.fields.iter().filter(|field| field.editable) {
            assert!(!field.label.trim().is_empty());
            assert!(!field.explanation.trim().is_empty());
            assert_ne!(
                field.label, field.key,
                "storage name leaked for opcode {}",
                action.opcode
            );
            assert_ne!(
                field.label, "Value",
                "generic Value leaked for opcode {}",
                action.opcode
            );
            assert_ne!(
                field.label, "Mode",
                "generic Mode leaked for opcode {}",
                action.opcode
            );
            assert_eq!(field.evidence.kind, SemanticEvidenceKind::SourceSupported);
        }
        for field in description
            .fields
            .iter()
            .filter(|field| field.evidence.kind == SemanticEvidenceKind::Unresolved)
        {
            assert!(!field.editable);
            assert!(field.availability_reason.is_some());
        }
    }
}

#[test]
fn choice_dialog_resolves_author_controls_targets_and_prompt_previews() {
    let snapshot = choice_snapshot();
    let description = describe_action_form(&snapshot, &choice_query(1)).unwrap();
    assert_choice_description(&description);

    let continued = describe_action_form(&snapshot, &choice_query(-1)).unwrap();
    assert!(!named(&continued, "branchTarget").editable);
    assert!(
        named(&continued, "branchTarget")
            .availability_reason
            .as_deref()
            .unwrap()
            .contains("does not use")
    );
}

fn choice_snapshot() -> ProjectSnapshot {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("choice".into()));
    snapshot.option_labels.push(OptionLabelRecord {
        identity: StableId("option-label:12".into()),
        native_id: NativeRecordId(12),
        text: "Take the mountain road".into(),
        authored: true,
    });
    snapshot
}

fn choice_query(branch_mode: i16) -> ActionFormDescribeQuery {
    ActionFormDescribeQuery {
        action_identity: "realmz.action.3".into(),
        target_native_id: 4,
        values: BTreeMap::from([
            ("replyPolarity".into(), if branch_mode == 1 { 1 } else { 0 }),
            ("branchMode".into(), branch_mode),
            ("branchTarget".into(), if branch_mode == 1 { 4 } else { 99 }),
            ("promptA".into(), 12),
            ("promptB".into(), 0),
        ]),
        secondary_values: BTreeMap::new(),
        context: Default::default(),
    }
}

fn assert_choice_description(description: &ActionFormDescription) {
    assert_eq!(description.title, "Choice Dialog");
    assert_eq!(
        description.option_prompt_storage.as_deref(),
        Some("option-labels")
    );
    assert_eq!(
        description
            .fields
            .iter()
            .map(|field| field.label.as_str())
            .collect::<Vec<_>>(),
        [
            "Left Option",
            "Right Option",
            "Continue When",
            "Otherwise",
            "Otherwise Destination"
        ]
    );
    assert_eq!(
        named(description, "branchTarget").target_kind,
        Some(ActionTargetKind::ExtraActionPoint)
    );
    assert!(named(description, "branchTarget").editable);
    assert_eq!(
        named(description, "promptA")
            .preview
            .as_ref()
            .map(|preview| preview.detail.as_str()),
        Some("Take the mountain road")
    );
    assert_eq!(
        named(description, "promptA")
            .preview
            .as_ref()
            .map(|preview| preview.identity.0.as_str()),
        Some("option-label:12")
    );
    assert!(named(description, "promptB").special_values.is_empty());
    assert_eq!(
        named(description, "promptB").target_kind,
        Some(ActionTargetKind::OptionLabel)
    );
}

#[test]
fn ap_context_reports_combat_only_actions_as_unavailable() {
    let snapshot = ProjectSnapshot::new_authored(StableId("availability".into()));
    let description = describe_action_form(
        &snapshot,
        &ActionFormDescribeQuery {
            action_identity: "realmz.action.120".into(),
            target_native_id: 0,
            values: BTreeMap::new(),
            secondary_values: BTreeMap::new(),
            context: ActionFormContext {
                script_kind: Some("action-point".into()),
                ..Default::default()
            },
        },
    )
    .unwrap();

    assert!(!description.available);
    assert!(
        description
            .availability_reason
            .as_deref()
            .unwrap()
            .contains("battle or monster macro")
    );
    assert!(description.fields.iter().all(|field| !field.editable));
}

use super::*;
use crate::model::*;
use crate::session::{EditorCommand, EditorSession, ExpectedRevisionCommand, Revision};

fn imported(selection: u16) -> (ProjectSnapshot, RebuiltV3RuleCatalog) {
    let mut snapshot = super::super::rules::tests::complete_rule_snapshot();
    let application = project_rebuilt_v3_rule_catalog(&snapshot).unwrap();
    let blob = BlobId(format!("sha256:{}", "a".repeat(64)));
    snapshot.origin = ProjectOrigin::Imported {
        compatibility_annex: blob.clone(),
    };
    snapshot.classic_sources = ["Data Race", "Data Caste"]
        .iter()
        .map(|path| ClassicSourceBlob {
            native_path: (*path).into(),
            blob: blob.clone(),
            byte_length: if *path == "Data Race" {
                (30 * crate::codecs::RACE_RECORD_BYTES) as u64
            } else {
                12
            },
        })
        .collect();
    for row in &mut snapshot.race_rules {
        row.source_blob = Some(blob.clone());
        row.definition.name.clear();
    }
    for row in &mut snapshot.caste_rules {
        row.source_blob = Some(blob.clone());
        row.definition.name.clear();
    }
    snapshot.classic_rule_selection = Some(ClassicRuleSelectionContextV1 {
        record_version: 1,
        project_id: snapshot.project_id.clone(),
        captured_source_set_sha256: classic_source_set_sha256(&snapshot).unwrap(),
        native_menu_selection: selection,
        evidence_origin: ClassicRuleSelectionEvidence::OwnerConfigured,
    });
    (snapshot, application)
}

fn names() -> ClassicRuleNameOverrides {
    ClassicRuleNameOverrides {
        races: None,
        castes: None,
    }
}

#[test]
fn authored_rule_rows_with_retained_source_blobs_materialize_scenario_families() {
    let (mut snapshot, application) = imported(20);
    snapshot.classic_sources.clear();
    snapshot.race_rules[0].source = "Scenario Data Race record 0".into();
    snapshot.race_rules[0].definition.base_movement = 37;
    snapshot.caste_rules[0].source = "Scenario Data Caste record 0".into();
    snapshot.caste_rules[0].definition.movement_bonus = 19;
    snapshot
        .classic_rule_selection
        .as_mut()
        .unwrap()
        .captured_source_set_sha256 = classic_source_set_sha256(&snapshot).unwrap();
    let resolved = resolve_classic_rules(&snapshot, &application, &names()).unwrap();
    assert_eq!(
        (resolved.race_source, resolved.caste_source),
        ("scenario", "scenario")
    );
    assert_eq!(
        resolved.effective_snapshot.race_rules[0]
            .definition
            .base_movement,
        37
    );
    assert_eq!(
        resolved.effective_snapshot.caste_rules[0]
            .definition
            .movement_bonus,
        19
    );
}

#[test]
fn identical_native_inputs_have_distinct_effective_policies_without_source_edits() {
    let (mut snapshot, application) = imported(10);
    snapshot.race_rules[0].definition.base_movement = 37;
    snapshot.caste_rules[0].definition.movement_bonus = 19;
    let original = snapshot.clone();
    let inherited = resolve_classic_rules(&snapshot, &application, &names()).unwrap();
    assert_eq!(
        inherited.effective_snapshot.race_rules[0]
            .definition
            .base_movement,
        12
    );
    assert!(inherited.runtime_overrides.races.is_empty());
    assert!(inherited.runtime_overrides.castes.is_empty());
    assert_eq!(snapshot, original);
    snapshot
        .classic_rule_selection
        .as_mut()
        .unwrap()
        .native_menu_selection = 20;
    let local = resolve_classic_rules(&snapshot, &application, &names()).unwrap();
    assert_eq!(
        local.effective_snapshot.race_rules[0]
            .definition
            .base_movement,
        37
    );
    assert_eq!(
        local.effective_snapshot.caste_rules[0]
            .definition
            .movement_bonus,
        19
    );
    assert_eq!(local.runtime_overrides.races.len(), 30);
    assert_eq!(local.runtime_overrides.castes.len(), 30);
    assert_eq!(snapshot.classic_sources, original.classic_sources);
}

#[test]
fn absent_families_inherit_independently_and_eligibility_uses_active_races() {
    for absent in ["Data Race", "Data Caste"] {
        let (mut snapshot, application) = imported(20);
        snapshot
            .classic_sources
            .retain(|source| source.native_path != absent);
        snapshot
            .classic_rule_selection
            .as_mut()
            .unwrap()
            .captured_source_set_sha256 = classic_source_set_sha256(&snapshot).unwrap();
        snapshot.race_rules[0].definition.base_movement = 37;
        snapshot.caste_rules[0].definition.movement_bonus = 19;
        snapshot.race_rules[0].definition.eligible_caste_ids.clear();
        let resolved = resolve_classic_rules(&snapshot, &application, &names()).unwrap();
        assert_eq!(
            resolved.race_source,
            if absent == "Data Race" {
                "application"
            } else {
                "scenario"
            }
        );
        assert_eq!(
            resolved.caste_source,
            if absent == "Data Caste" {
                "application"
            } else {
                "scenario"
            }
        );
        let human = StableId("classic.race.1".into());
        assert_eq!(
            resolved.effective_snapshot.caste_rules[0]
                .definition
                .eligible_race_ids
                .contains(&human),
            absent == "Data Race"
        );
    }
}

#[test]
fn inactive_zero_table_is_preserved_but_present_active_zero_table_never_falls_back() {
    let (mut snapshot, application) = imported(10);
    snapshot.race_rules = crate::codecs::decode_race_rules(
        &vec![0; 30 * 408],
        Some(snapshot.classic_sources[0].blob.clone()),
    )
    .rules;
    let original = snapshot.race_rules.clone();
    assert!(resolve_classic_rules(&snapshot, &application, &names()).is_ok());
    assert_eq!(snapshot.race_rules, original);
    snapshot
        .classic_rule_selection
        .as_mut()
        .unwrap()
        .native_menu_selection = 20;
    assert!(resolve_classic_rules(&snapshot, &application, &names()).is_err());
}

#[test]
fn scenario_names_make_only_affected_inherited_ids_override_application() {
    let (snapshot, application) = imported(10);
    let mut race_names = application
        .races
        .iter()
        .map(|row| row.name.clone())
        .collect::<Vec<_>>();
    race_names[0] = "Swordlander".into();
    let selected = resolve_classic_rules(
        &snapshot,
        &application,
        &ClassicRuleNameOverrides {
            races: Some(race_names),
            castes: None,
        },
    )
    .unwrap();
    assert_eq!(selected.runtime_overrides.races.len(), 1);
    assert_eq!(selected.runtime_overrides.races[0].name, "Swordlander");
    assert_eq!(
        selected.runtime_overrides.races[0].base_movement,
        application.races[0].base_movement
    );
    assert!(selected.runtime_overrides.castes.is_empty());
    assert!(
        resolve_classic_rules(
            &snapshot,
            &application,
            &ClassicRuleNameOverrides {
                races: Some(vec![]),
                castes: None
            }
        )
        .is_err()
    );
}

#[test]
fn unknown_active_targets_stale_sources_project_mismatch_and_capture_claims_reject() {
    let (mut snapshot, application) = imported(20);
    snapshot.race_rules[0].definition.eligible_caste_ids =
        vec![StableId("classic.caste.31".into())];
    assert!(resolve_classic_rules(&snapshot, &application, &names()).is_err());
    let (mut snapshot, application) = imported(10);
    snapshot.classic_sources[0].byte_length += 1;
    assert!(resolve_classic_rules(&snapshot, &application, &names()).is_err());
    let (mut snapshot, _) = imported(10);
    snapshot.project_id.0.push_str("-copy-with-new-identity");
    assert!(resolve_classic_rules(&snapshot, &application, &names()).is_err());
    let (mut snapshot, _) = imported(10);
    snapshot
        .classic_rule_selection
        .as_mut()
        .unwrap()
        .evidence_origin = ClassicRuleSelectionEvidence::CapturedNativeSelection {
        selection_receipt_blob: snapshot.classic_sources[0].blob.clone(),
        menu_payload_blob: snapshot.classic_sources[0].blob.clone(),
        menu_payload_bytes: 10,
        resource_fork_sha256: "b".repeat(64),
    };
    assert!(resolve_classic_rules(&snapshot, &application, &names()).is_err());
}

#[test]
fn guarded_selection_clear_undo_redo_and_snapshot_migration_preserve_intent() {
    let (mut snapshot, _) = imported(10);
    let context = snapshot.classic_rule_selection.take().unwrap();
    let mut session = EditorSession::new(snapshot.clone());
    let command =
        EditorCommand::ClassicRuleSelection(crate::session::ClassicRuleSelectionCommand::Set {
            context: context.clone(),
            expected_previous_identity: None,
            expected_source_set_sha256: context.captured_source_set_sha256.clone(),
        });
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: command.clone(),
        })
        .unwrap();
    assert!(
        session
            .execute(ExpectedRevisionCommand {
                expected_revision: Revision(0),
                command: command.clone()
            })
            .is_err()
    );
    assert!(
        session
            .execute(ExpectedRevisionCommand {
                expected_revision: session.revision(),
                command
            })
            .is_err()
    );
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: session.revision(),
            command: EditorCommand::ClassicRuleSelection(
                crate::session::ClassicRuleSelectionCommand::Clear {
                    expected_previous_identity: Some(context.identity()),
                    expected_source_set_sha256: context.captured_source_set_sha256.clone(),
                },
            ),
        })
        .unwrap();
    assert!(session.snapshot().classic_rule_selection.is_none());
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: session.revision(),
            command: EditorCommand::Undo,
        })
        .unwrap();
    assert_eq!(session.snapshot().classic_rule_selection, Some(context));
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: session.revision(),
            command: EditorCommand::Redo,
        })
        .unwrap();
    assert!(session.snapshot().classic_rule_selection.is_none());
}

#[test]
fn version_thirty_five_migrates_unresolved_and_future_versions_reject() {
    let (snapshot, _) = imported(10);
    let mut value = serde_json::to_value(snapshot).unwrap();
    value["formatVersion"] = serde_json::json!(35);
    value
        .as_object_mut()
        .unwrap()
        .remove("classicRuleSelection");
    let migrated = crate::snapshot::from_json(&value.to_string()).unwrap();
    assert_eq!(
        migrated.format_version,
        crate::model::SNAPSHOT_FORMAT_VERSION
    );
    assert!(migrated.classic_rule_selection.is_none());
    value["formatVersion"] = serde_json::json!(crate::model::SNAPSHOT_FORMAT_VERSION + 1);
    assert!(crate::snapshot::from_json(&value.to_string()).is_err());
}

#[test]
fn present_empty_family_blocks_only_when_selected_and_never_inherits() {
    for race in [true, false] {
        let (mut snapshot, application) = imported(10);
        if race {
            snapshot.race_rules.clear();
        } else {
            snapshot.caste_rules.clear();
        }
        assert!(resolve_classic_rules(&snapshot, &application, &names()).is_ok());
        snapshot
            .classic_rule_selection
            .as_mut()
            .unwrap()
            .native_menu_selection = 20;
        assert!(resolve_classic_rules(&snapshot, &application, &names()).is_err());
    }
}

#[test]
fn a_quarantined_race_table_cannot_become_scenario_mechanics_through_fallback_rows() {
    let (mut snapshot, application) = imported(19);
    snapshot.classic_sources[0].byte_length = 872;
    snapshot
        .classic_rule_selection
        .as_mut()
        .unwrap()
        .captured_source_set_sha256 = classic_source_set_sha256(&snapshot).unwrap();
    assert!(resolve_classic_rules(&snapshot, &application, &names()).is_ok());
    snapshot
        .classic_rule_selection
        .as_mut()
        .unwrap()
        .native_menu_selection = 20;
    assert!(
        resolve_classic_rules(&snapshot, &application, &names())
            .err()
            .unwrap()
            .contains("quarantined")
    );
    assert_eq!(snapshot.classic_sources[0].byte_length, 872);
}

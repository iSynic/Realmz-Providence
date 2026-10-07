use super::*;
use crate::model::{
    ActionPoint, ComplexEncounter, ExtraActionPoint, ExtraCodeRow, LevelType, NativeRecordId,
    SimpleEncounter,
};
use crate::session::{EditorCommand, EditorSession, ExpectedRevisionCommand, Revision};

fn snapshot() -> ProjectSnapshot {
    ProjectSnapshot::new_authored(StableId("settings-test".into()))
}

fn action(raw_opcode: i16, target_native_id: i16) -> ClassicAction {
    ClassicAction {
        slot: 0,
        raw_opcode,
        target_native_id,
    }
}

fn extra(id: u32, raw_opcode: i16, row: i16) -> ExtraActionPoint {
    ExtraActionPoint {
        identity: StableId(format!("extra-action-point:{id}")),
        native_id: NativeRecordId(id),
        classic_door_id: 0,
        post_action_level: 0,
        post_action_x: 0,
        post_action_y: 0,
        chance_percent: 100,
        actions: vec![action(raw_opcode, row)],
    }
}

fn row(id: u32) -> ExtraCodeRow {
    ExtraCodeRow {
        native_id: NativeRecordId(id),
        values: [0; 5],
    }
}

fn apply(session: &mut EditorSession, command: EditorCommand) -> crate::session::ChangeProjection {
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: session.revision(),
            command,
        })
        .unwrap()
}

#[test]
fn pinned_opcode_denominator_and_shared_layout_groups_are_exact() {
    let expected = [
        -23, 2, 3, 7, 12, 13, 15, 16, 17, 18, 19, 20, 21, 22, 23, 30, 31, 33, 37, 38, 40, 41, 42,
        43, 45, 46, 48, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 63, 64, 65, 67, 68, 69, 70,
        72, 73, 74, 75, 76, 77, 78, 81, 85, 86, 87, 90, 92, 103, 106, 107, 108, 120, 121, 122, 123,
        124, 125, 126,
    ];
    let actual = (i16::MIN..=i16::MAX)
        .filter(|opcode| shape(*opcode).is_some())
        .collect::<Vec<_>>();
    assert_eq!(actual, expected);
    for code in i16::MIN..=i16::MAX {
        let normalized = action(code, 0).opcode();
        assert_eq!(shape(normalized).is_some(), expected.contains(&normalized));
    }
    let groups = [
        &[-23, 23][..],
        &[15, 16],
        &[17, 18],
        &[20, 45],
        &[38, 46, 58, 59],
        &[72, 75],
        &[77, 78],
    ];
    for left in expected {
        for right in expected {
            let compatible = left == right
                || groups
                    .iter()
                    .any(|group| group.contains(&left) && group.contains(&right));
            assert_eq!(
                shape(left) == shape(right),
                compatible,
                "layouts {left} and {right}"
            );
        }
    }
}

#[test]
fn statuses_preserve_missing_precedence_and_leave_compatible_or_unused_rows_quiet() {
    let mut project = snapshot();
    project.extra_codes = vec![row(5), row(6), row(7), row(9)];
    project.extra_action_points = vec![
        extra(1, 15, 5),
        extra(2, 15, 6),
        extra(3, -16, 6),
        extra(4, 15, 7),
        extra(5, 17, 7),
        extra(6, 15, 8),
        extra(7, 17, 8),
    ];
    let before = project.clone();
    let usage = usages(&project);
    assert_eq!(
        usage
            .iter()
            .map(|usage| (usage.row_id, usage.status))
            .collect::<Vec<_>>(),
        [
            (5, UsageStatus::InUse),
            (6, UsageStatus::Shared),
            (7, UsageStatus::Shared),
            (8, UsageStatus::Missing),
            (9, UsageStatus::Unused)
        ]
    );
    let found = diagnostics(&project);
    assert_eq!(found.len(), 2);
    assert!(
        found
            .iter()
            .all(|finding| finding.severity == Severity::Warning)
    );
    assert_eq!(
        found
            .iter()
            .filter(|finding| finding.code == "action-settings.conflict")
            .count(),
        0
    );
    assert_eq!(
        found
            .iter()
            .filter(|finding| finding.code == "action-settings.missing")
            .count(),
        2
    );
    assert!(
        found
            .iter()
            .all(|finding| finding.field == Some(FieldPath("actions[0].extraCode".into())))
    );
    assert_eq!(project, before);
    project.extra_action_points.reverse();
    project.extra_codes.reverse();
    assert_eq!(usages(&project), usage);
    assert_eq!(diagnostics(&project), found);
}

#[test]
fn negative_ids_never_alias_zero_or_create_a_fake_companion() {
    let mut project = snapshot();
    project.extra_codes = vec![row(0), row(1), row(u32::MAX)];
    project.extra_action_points = vec![extra(1, -92, -1), extra(2, 15, i16::MIN)];
    let usage = usages(&project);
    assert_eq!(
        usage
            .iter()
            .filter(|usage| usage.status == UsageStatus::Missing)
            .map(|usage| usage.row_id)
            .collect::<Vec<_>>(),
        [i64::from(i16::MIN), -1]
    );
    assert!(
        usage
            .iter()
            .filter(|usage| usage.row_id >= 0)
            .all(|usage| usage.status == UsageStatus::Unused)
    );
    let found = diagnostics(&project);
    assert_eq!(found.len(), 2);
    assert_eq!(found[1].code, "extra-code.opcode-92.primary-missing");
    assert_eq!(found[1].severity, Severity::Error);
}

#[test]
fn consecutive_random_area_settings_participate_in_missing_shared_and_conflict_checks() {
    let mut project = snapshot();
    project.extra_codes = vec![row(32767)];
    project.extra_action_points = vec![extra(1, -92, 32767)];
    let found = diagnostics(&project);
    assert_eq!(found.len(), 1);
    assert_eq!(found[0].code, "extra-code.opcode-92.secondary-missing");
    project.extra_codes.push(row(32768));
    project.extra_action_points.push(extra(2, 92, 32767));
    assert!(
        usages(&project)
            .iter()
            .all(|usage| usage.status == UsageStatus::Shared)
    );
    assert!(diagnostics(&project).is_empty());
    project.extra_codes = vec![row(4), row(5)];
    project.extra_action_points = vec![extra(1, 92, 4), extra(2, 15, 5)];
    let usage = usages(&project);
    assert_eq!(usage[0].status, UsageStatus::InUse);
    assert_eq!(usage[1].status, UsageStatus::Shared);
    assert!(usage[1].callers[0].secondary);
    assert!(diagnostics(&project).is_empty());
    project.extra_codes.clear();
    let found = diagnostics(&project);
    assert_eq!(
        found
            .iter()
            .filter(|finding| finding.code.starts_with("extra-code.opcode-92."))
            .count(),
        2
    );
    assert!(
        !found
            .iter()
            .any(|finding| finding.code == "action-settings.conflict")
    );
}

#[test]
fn all_action_owners_are_included_but_imported_simple_encounter_padding_is_not() {
    let mut project = snapshot();
    for (index, level_type) in [LevelType::Land, LevelType::Dungeon]
        .into_iter()
        .enumerate()
    {
        project.world.action_points.push(ActionPoint {
            identity: StableId(format!("placed:{index}")),
            level_type,
            level_index: 0,
            record_index: 0,
            classic_door_id: 0,
            coordinate: None,
            post_action_level: 0,
            post_action_x: 0,
            post_action_y: 0,
            chance_percent: 0,
            actions: vec![action(15, 4)],
        });
    }
    project.extra_action_points.push(extra(1, 15, 4));
    let encounter = SimpleEncounter {
        identity: StableId("simple:1".into()),
        native_id: NativeRecordId(1),
        actions: vec![action(15, 4)],
        choice_results: [0; 4],
        can_back_out: true,
        max_times: 0,
        caste_success: 0,
        prompt_message_native_id: 0,
        texts: std::array::from_fn(|_| String::new()),
        authored: true,
    };
    project.simple_encounters.push(encounter.clone());
    project.simple_encounters.push(SimpleEncounter {
        identity: StableId("simple:padding".into()),
        native_id: NativeRecordId(2),
        authored: false,
        actions: vec![action(92, 99)],
        ..encounter
    });
    project.complex_encounters.push(ComplexEncounter {
        identity: StableId("complex:1".into()),
        native_id: NativeRecordId(1),
        actions: vec![action(15, 4)],
        action_result: 0,
        word_result: 0,
        groups: [0; 8],
        spell_ids: [0; 10],
        spell_results: [0; 10],
        item_ids: [0; 5],
        item_results: [0; 5],
        can_back_out: true,
        thief: false,
        max_times: 0,
        caste_success: 0,
        thief_success: 0,
        thief_fail: 0,
        prompt_message_native_id: 0,
        texts: std::array::from_fn(|_| String::new()),
        authored: true,
    });
    let usage = usages(&project);
    assert_eq!(usage.len(), 1);
    assert_eq!(usage[0].callers.len(), 5);
    assert_eq!(diagnostics(&project).len(), 5);
    assert!(
        !diagnostics(&project)
            .iter()
            .any(|finding| finding.entity == Some(StableId("simple:padding".into())))
    );
    project.simple_encounters[1].texts[2] = "Open the gate".into();
    project.simple_encounters[1].choice_results[2] = 4;
    assert_eq!(usages(&project).len(), 3);
}

#[test]
fn opcode_repair_and_undo_redo_invalidate_every_shared_caller() {
    let mut project = snapshot();
    project.extra_codes = vec![row(4)];
    project.extra_action_points = vec![extra(1, 15, 4), extra(2, 17, 4), extra(3, 15, 5)];
    let mut session = EditorSession::new(project);
    let repaired = apply(
        &mut session,
        EditorCommand::SetActionOpcode {
            source: StableId("extra-action-point:2".into()),
            slot: 0,
            raw_opcode: -16,
        },
    );
    let callers = vec![
        StableId("extra-action-point:1".into()),
        StableId("extra-action-point:2".into()),
    ];
    assert_eq!(repaired.changed_entities, [callers[1].clone()]);
    assert_eq!(repaired.affected_entities, callers);
    assert!(repaired.affected_diagnostics.is_empty());
    assert_eq!(
        session
            .diagnostics()
            .iter()
            .filter(|finding| finding.code == "action-settings.missing")
            .count(),
        1
    );
    let undone = apply(&mut session, EditorCommand::Undo);
    assert_eq!(undone.affected_entities, callers);
    assert!(undone.affected_diagnostics.is_empty());
    let redone = apply(&mut session, EditorCommand::Redo);
    assert_eq!(redone.affected_entities, callers);
    assert!(redone.affected_diagnostics.is_empty());
    let before = session.snapshot().clone();
    assert!(
        session
            .execute(ExpectedRevisionCommand {
                expected_revision: Revision(0),
                command: EditorCommand::Undo,
            })
            .is_err()
    );
    assert_eq!(session.snapshot(), &before);
    assert_eq!(session.revision(), Revision(3));
}

#[test]
fn retargeting_a_caller_clears_the_warning_on_its_former_peer() {
    let mut project = snapshot();
    project.extra_codes = vec![row(4), row(5)];
    project.extra_action_points = vec![extra(1, 15, 4), extra(2, 17, 4)];
    let mut session = EditorSession::new(project);
    let change = apply(
        &mut session,
        EditorCommand::RetargetActionReference {
            source: StableId("extra-action-point:2".into()),
            slot: 0,
            target_native_id: 5,
        },
    );
    assert_eq!(change.affected_entities_total, 2);
    assert!(change.affected_diagnostics.is_empty());
    assert!(session.diagnostics().is_empty());
    assert_eq!(
        apply(&mut session, EditorCommand::Undo).affected_diagnostics_total,
        0
    );
}

#[test]
fn settings_creation_and_undo_preserve_full_denominators_in_bounded_replies() {
    let mut project = snapshot();
    project.extra_action_points = (0..260).map(|id| extra(id, 15, 4)).collect();
    let mut session = EditorSession::new(project);
    assert_eq!(session.diagnostics().len(), 260);
    let change = apply(&mut session, EditorCommand::UpsertExtraCode { row: row(4) });
    assert_eq!(change.changed_entities, [StableId("extra-code:4".into())]);
    assert_eq!(change.affected_entities_total, 261);
    assert_eq!(change.affected_entities.len(), 128);
    assert_eq!(change.affected_diagnostics_total, 0);
    assert!(change.truncated);
    assert!(session.diagnostics().is_empty());
    let undo = apply(&mut session, EditorCommand::Undo);
    assert_eq!(undo.affected_entities_total, 261);
    assert_eq!(undo.affected_diagnostics_total, 260);
    assert_eq!(undo.affected_diagnostics.len(), 128);
    assert!(undo.truncated);
    assert_eq!(
        apply(&mut session, EditorCommand::Redo).affected_diagnostics_total,
        0
    );
}

#[test]
fn companion_creation_refreshes_its_callers_and_nonsettings_edits_stay_local() {
    let mut project = snapshot();
    project.extra_codes = vec![row(4)];
    project.extra_action_points = vec![extra(1, 92, 4), extra(2, 15, 8)];
    let mut session = EditorSession::new(project);
    let change = apply(&mut session, EditorCommand::UpsertExtraCode { row: row(5) });
    assert!(
        change
            .affected_entities
            .contains(&StableId("extra-action-point:1".into()))
    );
    assert!(
        !change
            .affected_entities
            .contains(&StableId("extra-action-point:2".into()))
    );
    assert!(
        !change
            .affected_diagnostics
            .iter()
            .any(|finding| finding.code.starts_with("extra-code.opcode-92."))
    );
    let change = apply(
        &mut session,
        EditorCommand::UpsertExtraCode { row: row(99) },
    );
    assert_eq!(change.affected_entities, [StableId("extra-code:99".into())]);
    assert!(change.affected_diagnostics.is_empty());
}

use super::*;
use crate::model::{ExtraActionPoint, StableId};

mod divinity_fixture;

fn row(id: u32, values: [i16; 5]) -> ExtraCodeRow {
    ExtraCodeRow {
        native_id: NativeRecordId(id),
        values,
    }
}

fn project() -> ProjectSnapshot {
    let mut project = ProjectSnapshot::new_authored(StableId("effects-test".into()));
    project.extra_codes = vec![row(2, [1, 0, 0, 0, 0])];
    for (id, opcode) in [(0, 3), (1, 2), (2, 19), (3, 121)] {
        project.extra_action_points.push(ExtraActionPoint {
            identity: StableId(format!("extra-action-point:{id}")),
            native_id: NativeRecordId(id),
            classic_door_id: 0,
            post_action_level: 0,
            post_action_x: 0,
            post_action_y: 0,
            chance_percent: 100,
            actions: vec![ClassicAction {
                slot: 0,
                raw_opcode: opcode,
                target_native_id: 2,
            }],
        });
    }
    project
}

fn selected(id: u32) -> BTreeSet<ActionSettingsCallerConfirmation> {
    BTreeSet::from([ActionSettingsCallerConfirmation {
        source: StableId(format!("extra-action-point:{id}")),
        slot: 0,
    }])
}

#[test]
fn prompt_edit_reaches_battle_but_not_unused_random_message_words() {
    let project = project();
    let writes = [row(2, [1, 0, 0, 240, 0])];
    assert_eq!(
        impacted_callers(&project, &writes, &selected(0)).unwrap(),
        selected(1).into_iter().collect::<Vec<_>>()
    );
}

#[test]
fn unchanged_apply_has_no_effect_even_with_different_layouts() {
    let project = project();
    let writes = merge_writes(&project, std::slice::from_ref(&project.extra_codes)).unwrap();
    assert!(writes.is_empty());
    assert!(
        impacted_callers(&project, &project.extra_codes, &selected(0))
            .unwrap()
            .is_empty()
    );
}

#[test]
fn unchanged_copies_do_not_overwrite_a_changed_word_in_the_same_draft() {
    let project = project();
    let expected = vec![row(2, [1, 0, 0, 240, 0])];
    for requests in [
        vec![project.extra_codes.clone(), expected.clone()],
        vec![expected.clone(), project.extra_codes.clone()],
    ] {
        assert_eq!(merge_writes(&project, &requests).unwrap(), expected);
    }
}

#[test]
fn disjoint_word_edits_merge_and_conflicting_words_reject_without_mutation() {
    let project = project();
    let before = project.clone();
    assert_eq!(
        merge_writes(
            &project,
            &[
                vec![row(2, [1, 0, 0, 240, 0])],
                vec![row(2, [1, 0, 0, 0, 241])],
            ]
        )
        .unwrap(),
        vec![row(2, [1, 0, 0, 240, 241])]
    );
    assert!(
        merge_writes(
            &project,
            &[
                vec![row(2, [1, 0, 0, 240, 0])],
                vec![row(2, [1, 0, 0, 241, 0])],
            ]
        )
        .unwrap_err()
        .contains("conflicting edits")
    );
    assert_eq!(project, before);
}

#[test]
fn companion_impact_uses_execution_mode_instead_of_form_name() {
    let mut project = project();
    project.extra_action_points.truncate(1);
    project.extra_action_points[0].actions[0] = ClassicAction {
        slot: 0,
        raw_opcode: -92,
        target_native_id: 2,
    };
    project.extra_codes = vec![row(2, [0, 1, 0, 0, 1]), row(3, [0, 0, 1, 1, 0])];
    let writes = [row(3, [0, 0, 0, 1, 0])];
    assert!(
        impacted_callers(&project, &writes, &BTreeSet::new())
            .unwrap()
            .is_empty()
    );
    project.extra_codes[0].values[4] = 0;
    assert_eq!(
        impacted_callers(&project, &writes, &BTreeSet::new()).unwrap(),
        selected(0).into_iter().collect::<Vec<_>>()
    );
}

#[test]
fn overlapping_pair_requests_detect_the_same_physical_word() {
    let mut project = project();
    project.extra_codes.push(row(3, [0; 5]));
    assert!(
        merge_writes(
            &project,
            &[
                vec![row(2, [1, 0, 0, 0, 0]), row(3, [2, 0, 0, 0, 0])],
                vec![row(3, [3, 0, 0, 0, 0])],
            ]
        )
        .is_err()
    );
}

#[test]
fn companion_impact_includes_a_mode_change_from_another_draft_step() {
    let mut project = project();
    project.extra_action_points.truncate(1);
    project.extra_action_points[0].actions[0].raw_opcode = 92;
    project.extra_codes = vec![row(2, [0, 1, 0, 0, 3]), row(3, [0, 0, 1, 1, 0])];
    let companion = vec![row(3, [0, 0, 0, 1, 0])];
    let transaction = vec![row(2, [0, 1, 0, 0, 0]), companion[0].clone()];
    assert!(
        impacted_callers(&project, &companion, &BTreeSet::new())
            .unwrap()
            .is_empty()
    );
    assert_eq!(
        impacted_callers_in_transaction(&project, &companion, &transaction, &BTreeSet::new())
            .unwrap(),
        selected(0).into_iter().collect::<Vec<_>>()
    );
}

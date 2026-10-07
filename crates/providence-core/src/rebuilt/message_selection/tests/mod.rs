mod field_contracts;
mod fixtures;
mod guards;
use super::{RebuiltV3ReachableMessageError, project_rebuilt_v3_reachable_messages};
use crate::classic_random::signed_range_values as classic_signed_range_values;
use crate::model::{NativeRecordId, OptionLabelRecord, StableId};
use fixtures::{all_family_selection, instruction};

#[test]
fn classic_random_message_bounds_preserve_wrapped_and_degenerate_ranges() {
    assert_eq!(classic_signed_range_values(4, 6), [4, 5, 6]);
    assert_eq!(classic_signed_range_values(147, 145), [147]);
    assert_eq!(classic_signed_range_values(-3, -1), [-3, -2, -1]);
    assert_eq!(classic_signed_range_values(i16::MIN, i16::MAX), [i16::MIN]);
}

#[test]
fn selection_is_exact_causal_and_ignores_unreachable_invalid_messages() {
    let (snapshot, scenario, simple, complex, rogue, combat) = all_family_selection();
    let first = project_rebuilt_v3_reachable_messages(
        &snapshot, &scenario, &simple, &complex, &rogue, &combat,
    )
    .expect("reachable messages");
    let second = project_rebuilt_v3_reachable_messages(
        &snapshot, &scenario, &simple, &complex, &rogue, &combat,
    )
    .expect("repeat selection");

    assert_eq!(first, second);
    assert_eq!(first.reachable_message_ids, (1..=20).collect::<Vec<_>>());
    assert_eq!(first.messages.len(), 20);
    assert_eq!(first.references.len(), 20);
    assert!(
        first
            .references
            .iter()
            .any(|reference| reference.source.0 == "xap:1"
                && reference.field_path == "actions[1].extraCode[0..=1]"
                && reference.raw_native_id == -3
                && reference.message_native_id == 3)
    );
    assert!(
        first
            .references
            .iter()
            .any(|reference| reference.source.0 == "map:land:0:rect:0"
                && reference.field_path == "textId"
                && reference.message_native_id == 20)
    );
    assert!(first.messages.iter().all(|message| message.id != 99));
}

#[test]
fn legacy_battle_sound_row_does_not_require_an_out_of_file_message() {
    let (snapshot, mut scenario, simple, complex, rogue, combat) = all_family_selection();
    scenario.programs[0].instructions = vec![instruction(0, 2, 354, Some([238, 0, -1, 30_002, 0]))];
    let selected = project_rebuilt_v3_reachable_messages(
        &snapshot, &scenario, &simple, &complex, &rogue, &combat,
    )
    .expect("legacy application sound row");
    assert!(!selected.reachable_message_ids.contains(&30_002));
    assert!(!selected.references.iter().any(|reference| {
        reference.source.0 == "xap:1" && reference.field_path == "actions[0].extraCode[3]"
    }));

    for (opcode, values) in [
        (2, [238, 1, -1, 30_002, 0]),
        (2, [238, 0, 0, 30_002, 0]),
        (2, [238, 0, -1, 30_006, 0]),
        (2, [23, 0, -1, 10_090, 0]),
        (48, [238, 0, -1, 30_002, 0]),
    ] {
        scenario.programs[0].instructions = vec![instruction(0, opcode, 354, Some(values))];
        let error = project_rebuilt_v3_reachable_messages(
            &snapshot, &scenario, &simple, &complex, &rogue, &combat,
        )
        .expect_err("unapproved row still needs a scenario message");
        assert!(
            matches!(error, RebuiltV3ReachableMessageError::MissingMessage(reference)
            if reference.source.0 == "xap:1"
                && reference.field_path == "actions[0].extraCode[3]")
        );
    }
}

#[test]
fn opcode_three_uses_data_sd2_only_when_option_labels_are_absent() {
    let (mut snapshot, mut scenario, _, _, _, mut combat) = all_family_selection();
    scenario.programs[0].instructions = vec![instruction(0, 3, 10, Some([0, 0, 0, -2, 3]))];
    snapshot.world.maps.clear();
    combat.reachable_battle_ids.clear();
    combat.battles.clear();
    let fallback =
        project_rebuilt_v3_reachable_messages(&snapshot, &scenario, &[], &[], &[], &combat)
            .expect("message-backed labels");
    assert_eq!(fallback.reachable_message_ids, [2, 3]);
    assert!(fallback.references.iter().all(|reference| {
        reference.runtime_opcode == Some(3)
            && reference.field_path.starts_with("actions[0].extraCode[")
    }));

    snapshot.option_labels.push(OptionLabelRecord {
        identity: StableId("option-label:1".into()),
        native_id: NativeRecordId(1),
        text: "Proceed".into(),
        authored: true,
    });
    let native_labels =
        project_rebuilt_v3_reachable_messages(&snapshot, &scenario, &[], &[], &[], &combat)
            .expect("dedicated labels");
    assert!(native_labels.messages.is_empty());
    assert!(native_labels.references.is_empty());
}

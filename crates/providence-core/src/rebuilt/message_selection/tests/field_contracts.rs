use super::fixtures::{all_family_selection, instruction};
use crate::model::{BlobId, NativeRecordId, ProjectOrigin, ScenarioMessage, StableId};
use crate::rebuilt::{RebuiltV3ReachableMessageError, project_rebuilt_v3_reachable_messages};

#[test]
fn required_zero_is_a_message_while_optional_zero_is_a_sentinel() {
    let (mut snapshot, mut scenario, _, _, _, mut combat) = all_family_selection();
    snapshot.world.maps.clear();
    combat.battles.clear();
    snapshot.messages.push(ScenarioMessage {
        identity: StableId("message:0".into()),
        native_id: NativeRecordId(0),
        text: String::new(),
        authored: true,
    });
    scenario.programs[0].instructions = vec![
        instruction(0, 1, 0, None),
        instruction(1, 21, 2, Some([0, 0, 2, 0, 0])),
        instruction(2, 2, 3, Some([0; 5])),
        instruction(3, 122, 4, Some([0; 5])),
    ];
    let selected =
        project_rebuilt_v3_reachable_messages(&snapshot, &scenario, &[], &[], &[], &combat)
            .unwrap();
    assert_eq!(selected.reachable_message_ids, [0]);
    assert_eq!(selected.references.len(), 2);
    assert_eq!(
        selected.references[0].field_path,
        "actions[0].targetNativeId"
    );
    assert_eq!(selected.references[1].field_path, "actions[1].extraCode[4]");
    assert_eq!(selected.messages[0].text, "");
}

#[test]
fn imported_missing_messages_keep_all_callers_and_one_causal_missing_reference() {
    let (mut snapshot, mut scenario, simple, complex, rogue, combat) = all_family_selection();
    snapshot.origin = ProjectOrigin::Imported {
        compatibility_annex: BlobId(format!("sha256:{}", "a".repeat(64))),
    };
    snapshot.messages.retain(|m| m.native_id.0 != 11);
    let mut second = scenario.programs[0].clone();
    second.id = StableId("xap:0".into());
    second.instructions = vec![instruction(0, 1, -11, None)];
    scenario.programs.push(second);
    let selected = project_rebuilt_v3_reachable_messages(
        &snapshot, &scenario, &simple, &complex, &rogue, &combat,
    )
    .unwrap();
    assert_eq!(selected.messages.len(), 19);
    assert_eq!(
        selected
            .references
            .iter()
            .filter(|r| r.message_native_id == 11)
            .count(),
        2
    );
    assert_eq!(selected.missing_references.len(), 1);
    assert_eq!(selected.missing_references[0].source.0, "xap:0");
    assert_eq!(selected.missing_references[0].raw_native_id, -11);
}

#[test]
fn present_short_extra_code_is_not_treated_as_an_absent_imported_row() {
    let (mut snapshot, mut scenario, simple, complex, rogue, combat) = all_family_selection();
    for imported in [false, true] {
        if imported {
            snapshot.origin = ProjectOrigin::Imported {
                compatibility_annex: BlobId(format!("sha256:{}", "a".repeat(64))),
            };
        }
        for opcode in [19, 3] {
            let mut short = instruction(4, opcode, 77, None);
            short.extra_code = Some(vec![0]);
            scenario.programs[0].instructions = vec![short];
            let error = project_rebuilt_v3_reachable_messages(
                &snapshot, &scenario, &simple, &complex, &rogue, &combat,
            )
            .unwrap_err();
            assert!(
                matches!(error, RebuiltV3ReachableMessageError::MissingExtraCode { slot: 4, native_id: 77, opcode: actual, .. } if actual == opcode)
            );
        }
    }
}

#[test]
fn native_message_order_selects_missing_before_a_later_duplicate() {
    let (mut snapshot, mut scenario, simple, complex, rogue, combat) = all_family_selection();
    snapshot.messages.retain(|m| m.native_id.0 != 2);
    snapshot.messages.push(
        snapshot
            .messages
            .iter()
            .find(|m| m.native_id.0 == 11)
            .unwrap()
            .clone(),
    );
    scenario.programs[0].instructions.reverse();
    let error = project_rebuilt_v3_reachable_messages(
        &snapshot, &scenario, &simple, &complex, &rogue, &combat,
    )
    .unwrap_err();
    assert!(
        matches!(error, RebuiltV3ReachableMessageError::MissingMessage(r) if r.message_native_id == 2 && r.raw_native_id == -2)
    );
}

#[test]
fn populated_wrong_identity_is_not_deferred_for_imported_projects() {
    let (mut snapshot, scenario, simple, complex, rogue, combat) = all_family_selection();
    snapshot
        .messages
        .iter_mut()
        .find(|m| m.native_id.0 == 11)
        .unwrap()
        .identity = StableId("wrong-id".into());
    for imported in [false, true] {
        if imported {
            snapshot.origin = ProjectOrigin::Imported {
                compatibility_annex: BlobId(format!("sha256:{}", "a".repeat(64))),
            };
        }
        let error = project_rebuilt_v3_reachable_messages(
            &snapshot, &scenario, &simple, &complex, &rogue, &combat,
        )
        .unwrap_err();
        assert!(
            matches!(error, RebuiltV3ReachableMessageError::InvalidMessageIdentity { expected, actual, source }
            if expected.0 == "message:11" && actual.0 == "wrong-id" && source.message_native_id == 11)
        );
    }
}

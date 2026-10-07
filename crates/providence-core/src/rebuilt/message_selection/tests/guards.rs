use super::fixtures::{all_family_selection, instruction};
use crate::model::{NativeRecordId, ProjectOrigin, ProjectSnapshot, ScenarioMessage, StableId};
use crate::rebuilt::{
    RebuiltV3ReachableMessageError, RebuiltV3RuntimeMessageReference,
    project_rebuilt_v3_reachable_messages,
};

#[test]
fn missing_message_names_the_causal_field() {
    let (mut snapshot, scenario, simple, complex, rogue, combat) = all_family_selection();
    snapshot
        .messages
        .retain(|message| message.native_id.0 != 11);
    let error = project_rebuilt_v3_reachable_messages(
        &snapshot, &scenario, &simple, &complex, &rogue, &combat,
    )
    .expect_err("missing selected message");
    assert_eq!(
        error,
        RebuiltV3ReachableMessageError::MissingMessage(RebuiltV3RuntimeMessageReference {
            source: StableId("xap:1".into()),
            runtime_opcode: Some(87),
            field_path: "actions[9].extraCode[4]".into(),
            raw_native_id: -11,
            message_native_id: 11,
        })
    );
}

#[test]
fn duplicate_message_is_rejected() {
    let (mut snapshot, scenario, simple, complex, rogue, combat) = all_family_selection();
    duplicate_eleven(&mut snapshot);
    assert!(matches!(
        project_rebuilt_v3_reachable_messages(
            &snapshot, &scenario, &simple, &complex, &rogue, &combat
        ),
        Err(RebuiltV3ReachableMessageError::DuplicateMessageId { message_id: 11, .. })
    ));
}

#[test]
fn missing_extra_code_precedes_ambiguous_message_resolution() {
    let (mut snapshot, scenario, simple, complex, rogue, combat) = all_family_selection();
    duplicate_eleven(&mut snapshot);
    let mut missing_extra_code = scenario;
    missing_extra_code.programs[0].instructions = vec![instruction(4, 19, 77, None)];
    assert_eq!(
        project_rebuilt_v3_reachable_messages(
            &snapshot,
            &missing_extra_code,
            &simple,
            &complex,
            &rogue,
            &combat
        ),
        Err(RebuiltV3ReachableMessageError::MissingExtraCode {
            program: StableId("xap:1".into()),
            slot: 4,
            opcode: 19,
            native_id: 77,
        })
    );
}

#[test]
fn imported_absent_extra_code_retains_the_caller_without_invented_messages() {
    let (mut snapshot, scenario, simple, complex, rogue, combat) = all_family_selection();
    let mut missing_extra_code = scenario;
    missing_extra_code.programs[0].instructions = vec![instruction(4, 19, 77, None)];
    snapshot.origin = ProjectOrigin::Imported {
        compatibility_annex: crate::model::BlobId(format!("sha256:{}", "a".repeat(64))),
    };
    snapshot
        .messages
        .retain(|message| message.native_id.0 != 11);
    let selected = project_rebuilt_v3_reachable_messages(
        &snapshot,
        &missing_extra_code,
        &simple,
        &complex,
        &rogue,
        &combat,
    )
    .expect("an imported missing row retains its caller without invented message references");
    assert!(
        selected
            .references
            .iter()
            .all(|reference| reference.source.0 != "xap:1")
    );
    assert_eq!(missing_extra_code.programs[0].instructions[0].id, 77);
    assert!(
        missing_extra_code.programs[0].instructions[0]
            .extra_code
            .is_none()
    );
}

fn duplicate_eleven(snapshot: &mut ProjectSnapshot) {
    snapshot
        .messages
        .retain(|message| message.native_id.0 != 11);
    snapshot.messages.push(ScenarioMessage {
        identity: StableId("message:11".into()),
        native_id: NativeRecordId(11),
        text: "First".into(),
        authored: true,
    });
    snapshot.messages.push(ScenarioMessage {
        identity: StableId("duplicate-message:11".into()),
        native_id: NativeRecordId(11),
        text: "Second".into(),
        authored: true,
    });
}

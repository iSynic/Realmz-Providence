use super::super::*;
use super::fixtures::simple_snapshot;
use crate::model::{
    ClassicAction, NativeRecordId, ProjectOrigin, ProjectSnapshot, ScenarioMessage,
    SimpleEncounter, StableId,
};
use crate::rebuilt::scenario::RebuiltV3ScenarioError;

#[test]
fn simple_projection_emits_exact_messages_responses_and_four_result_programs() {
    let snapshot = simple_snapshot();

    let projection = project_rebuilt_v3_simple_encounters(&snapshot).expect("projection");
    assert_eq!(projection.messages[0].id, 2);
    assert_eq!(projection.messages[1].id, 47);
    assert_eq!(projection.simple_encounters.len(), 1);
    assert_eq!(projection.excluded_native_ids, [8]);
    assert_eq!(projection.simple_encounters[0].responses.len(), 2);
    assert_eq!(
        projection.simple_encounters[0].responses[0].id.0,
        "simple:7:choice:0"
    );
    assert_eq!(
        projection.simple_encounters[0].responses[0]
            .result_program_id
            .0,
        "simple:7:result:2"
    );
    assert_eq!(projection.programs.len(), 4);
    assert_eq!(projection.programs[0].instructions[0].slot, 0);
    assert_eq!(projection.programs[2].instructions[0].slot, 1);
    assert_eq!(
        projection.programs[2].instructions[0].extra_code,
        Some(vec![1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    );
    let value = serde_json::to_value(&projection).expect("JSON");
    assert_eq!(value["simpleEncounters"][0]["promptMessageId"], -47);
    assert_eq!(value["simpleEncounters"][0]["canBackOut"], true);
    assert_eq!(value["programs"][2]["ownerKind"], "simple-encounter-result");
    let reopened: RebuiltV3SimpleEncounterProjection =
        serde_json::from_value(value).expect("reimport");
    assert_eq!(reopened, projection);
}

#[test]
fn simple_projection_rejects_missing_messages_empty_choices_and_invalid_results() {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("simple-errors".into()));
    snapshot.simple_encounters.push(SimpleEncounter {
        identity: StableId("simple-encounter:0".into()),
        native_id: NativeRecordId(0),
        actions: Vec::new(),
        choice_results: [0; 4],
        can_back_out: false,
        max_times: 0,
        caste_success: 0,
        prompt_message_native_id: 7,
        texts: std::array::from_fn(|_| String::new()),
        authored: true,
    });
    assert!(matches!(
        project_rebuilt_v3_simple_encounters(&snapshot),
        Err(RebuiltV3ScenarioError::MissingSimpleEncounterMessage { message_id: 7, .. })
    ));

    snapshot.messages.push(ScenarioMessage {
        identity: StableId("message:7".into()),
        native_id: NativeRecordId(7),
        text: "Prompt".into(),
        authored: true,
    });
    assert!(matches!(
        project_rebuilt_v3_simple_encounters(&snapshot),
        Err(RebuiltV3ScenarioError::MissingSimpleEncounterResponse(_))
    ));
    snapshot.simple_encounters[0].texts[0] = "Continue".into();
    assert!(matches!(
        project_rebuilt_v3_simple_encounters(&snapshot),
        Err(RebuiltV3ScenarioError::InvalidSimpleEncounterResult {
            choice: 0,
            result: 0,
            ..
        })
    ));
}

#[test]
fn imported_simple_choices_preserve_zero_and_invalid_native_results() {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("imported-simple-results".into()));
    snapshot.origin = ProjectOrigin::Imported {
        compatibility_annex: crate::model::BlobId(format!("sha256:{}", "a".repeat(64))),
    };
    snapshot.simple_encounters.push(SimpleEncounter {
        identity: StableId("simple-encounter:0".into()),
        native_id: NativeRecordId(0),
        actions: vec![],
        choice_results: [1, 0, 0, 0],
        can_back_out: true,
        max_times: 1,
        caste_success: 0,
        prompt_message_native_id: 0,
        texts: [
            "Continue".into(),
            "Eliminated".into(),
            "Unfinished".into(),
            String::new(),
        ],
        authored: false,
    });
    let projection = project_rebuilt_v3_simple_encounters(&snapshot)
        .expect("preserve imported result identities");
    let responses = &projection.simple_encounters[0].responses;
    assert_eq!(responses.len(), 3);
    assert_eq!(responses[1].label, "Eliminated");
    assert_eq!(responses[1].result_program_id.0, "simple:0:result:-1");
    assert_eq!(responses[2].result_program_id.0, "simple:0:result:-1");

    snapshot.simple_encounters[0].authored = true;
    snapshot.simple_encounters[0].choice_results[2] = 127;
    let defined = project_rebuilt_v3_simple_encounters(&snapshot)
        .expect("preserve a defined imported row's unavailable result");
    assert_eq!(
        defined.simple_encounters[0].responses[2]
            .result_program_id
            .0,
        "simple:0:result:126"
    );
}

#[test]
fn simple_projection_rejects_duplicate_messages_and_out_of_range_actions() {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("simple-structure".into()));
    let message = ScenarioMessage {
        identity: StableId("message:1".into()),
        native_id: NativeRecordId(1),
        text: "Prompt".into(),
        authored: true,
    };
    snapshot.messages = vec![message.clone(), message];
    assert_eq!(
        project_rebuilt_v3_simple_encounters(&snapshot),
        Err(RebuiltV3ScenarioError::DuplicateMessageId(1))
    );

    snapshot.messages.pop();
    snapshot.simple_encounters.push(SimpleEncounter {
        identity: StableId("simple-encounter:1".into()),
        native_id: NativeRecordId(1),
        actions: vec![ClassicAction {
            slot: 32,
            raw_opcode: 1,
            target_native_id: 1,
        }],
        choice_results: [1, 0, 0, 0],
        can_back_out: false,
        max_times: 0,
        caste_success: 0,
        prompt_message_native_id: 1,
        texts: [
            "Continue".into(),
            String::new(),
            String::new(),
            String::new(),
        ],
        authored: true,
    });
    assert!(matches!(
        project_rebuilt_v3_simple_encounters(&snapshot),
        Err(RebuiltV3ScenarioError::SimpleEncounterActionSlotOutOfRange { slot: 32, .. })
    ));
}

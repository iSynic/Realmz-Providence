use super::super::*;
use super::fixtures::snapshot;
use crate::rebuilt::scenario::RebuiltV3ScenarioError;

#[test]
fn projection_matches_schema_fields_and_emits_four_result_programs() {
    let snapshot = snapshot();
    let projection = project_rebuilt_v3_complex_encounters(&snapshot).expect("projection");
    let encoded = serde_json::to_string(&projection).expect("serialize");
    assert_eq!(
        encoded,
        serde_json::to_string(&project_rebuilt_v3_complex_encounters(&snapshot).unwrap()).unwrap()
    );
    let value = serde_json::to_value(&projection).expect("JSON");
    assert_eq!(value["complexEncounters"][0]["promptMessageId"], -47);
    assert_eq!(value["complexEncounters"][0]["spellIds"][1], 1201);
    assert_eq!(value["complexEncounters"][0]["itemIds"][2], -800);
    assert_eq!(value["complexEncounters"][0]["texts"][8], "moonstone");
    assert_eq!(projection.programs.len(), 4);
    assert_eq!(projection.programs[0].id.0, "complex:0:result:0");
    assert_eq!(projection.programs[0].instructions[0].opcode, 1);
    assert!(projection.programs[0].instructions[0].gosub);
    assert_eq!(projection.programs[2].id.0, "complex:0:result:2");
    assert_eq!(projection.programs[2].instructions[0].slot, 1);
    assert_eq!(
        projection.programs[2].instructions[0].extra_code,
        Some(vec![1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    );
    let reopened: RebuiltV3ComplexEncounterProjection =
        serde_json::from_str(&encoded).expect("reimport");
    assert_eq!(reopened, projection);
}

#[test]
fn projection_rejects_missing_prompt_rogue_and_duplicate_ids() {
    let mut missing_message = snapshot();
    missing_message.messages.clear();
    assert!(matches!(
        project_rebuilt_v3_complex_encounters(&missing_message),
        Err(RebuiltV3ScenarioError::MissingComplexEncounterMessage {
            message_id: -47,
            ..
        })
    ));

    let mut missing_snapshot = snapshot();
    missing_snapshot.rogue_encounters.clear();
    assert!(matches!(
        project_rebuilt_v3_complex_encounters(&missing_snapshot),
        Err(RebuiltV3ScenarioError::MissingRogueEncounter { rogue_id: 6, .. })
    ));

    let mut signed_snapshot = snapshot();
    signed_snapshot.complex_encounters[0].thief_success = -6;
    assert!(matches!(
        project_rebuilt_v3_complex_encounters(&signed_snapshot),
        Err(RebuiltV3ScenarioError::MissingRogueEncounter { rogue_id: -6, .. })
    ));

    let mut duplicate_snapshot = snapshot();
    duplicate_snapshot
        .complex_encounters
        .push(duplicate_snapshot.complex_encounters[0].clone());
    assert_eq!(
        project_rebuilt_v3_complex_encounters(&duplicate_snapshot),
        Err(RebuiltV3ScenarioError::DuplicateComplexEncounterId(0))
    );
}

use super::super::*;
use crate::model::{ProjectSnapshot, StableId};

#[test]
fn rogue_projection_matches_exact_schema_fields_and_is_deterministic() {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("rogue-projection".into()));
    let mut source = vec![0; crate::codecs::ROGUE_ENCOUNTER_RECORD_BYTES * 2];
    source[crate::codecs::ROGUE_ENCOUNTER_RECORD_BYTES] = 1;
    let mut records = crate::codecs::decode_rogue_encounters(&source).records;
    let mut selected = records.remove(1);
    selected.modifiers = [-1, 2, -3, 4, -5, 6, -7, 8];
    selected.success_codes = [1, 2, 3, 4, -1, -2, -3, -4];
    selected.failure_codes = [-4, -3, -2, -1, 4, 3, 2, 1];
    selected.success_text[2] = -47;
    selected.failure_text[3] = 48;
    selected.success_sounds[4] = 205;
    selected.failure_sounds[5] = -206;
    selected.spell = 1201;
    selected.low_damage = -3;
    selected.high_damage = 17;
    selected.tumblers = 9;
    selected.prompts = [-51, 52, 53];
    selected.prompt_sounds = [601, 602, -603];
    snapshot.rogue_encounters.push(selected);

    let projection = project_rebuilt_v3_rogue_encounters(&snapshot).expect("projection");
    let encoded = serde_json::to_string(&projection).expect("serialize");
    assert_eq!(
        encoded,
        serde_json::to_string(&project_rebuilt_v3_rogue_encounters(&snapshot).unwrap()).unwrap()
    );
    let value = serde_json::to_value(&projection).expect("JSON");
    assert_eq!(value[0]["id"], 1);
    assert_eq!(value[0]["typeFlags"][0], true);
    assert_eq!(value[0]["successText"][2], -47);
    assert_eq!(value[0]["failureSounds"][5], -206);
    assert_eq!(value[0]["spellId"], 1201);
    assert_eq!(value[0]["prompts"][0], -51);
    let reopened: Vec<RebuiltV3RogueEncounter> = serde_json::from_str(&encoded).expect("reimport");
    assert_eq!(reopened, projection);
}

#[test]
fn rogue_projection_rejects_invalid_identity_and_duplicate_id() {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("rogue-errors".into()));
    let mut encounter =
        crate::codecs::decode_rogue_encounters(&[0; crate::codecs::ROGUE_ENCOUNTER_RECORD_BYTES])
            .records
            .remove(0);
    encounter.identity = StableId("rogue-encounter:wrong".into());
    snapshot.rogue_encounters.push(encounter);
    assert!(matches!(
        project_rebuilt_v3_rogue_encounters(&snapshot),
        Err(RebuiltV3RogueEncounterError::InvalidRecord { .. })
    ));

    snapshot.rogue_encounters[0].identity = StableId("rogue-encounter:0".into());
    snapshot
        .rogue_encounters
        .push(snapshot.rogue_encounters[0].clone());
    assert_eq!(
        project_rebuilt_v3_rogue_encounters(&snapshot),
        Err(RebuiltV3RogueEncounterError::DuplicateId(0))
    );
}

use super::super::*;
use crate::model::{NativeRecordId, ProjectSnapshot, StableId, TimedEncounterLocationKind};
use std::collections::BTreeSet;

#[test]
fn timed_projection_matches_schema_and_names_excluded_runtime_rows() {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("timed-projection".into()));
    snapshot
        .extra_action_points
        .push(crate::model::ExtraActionPoint {
            identity: StableId("extra-action-point:7".into()),
            native_id: NativeRecordId(7),
            classic_door_id: 0,
            post_action_level: 0,
            post_action_x: 0,
            post_action_y: 0,
            chance_percent: 100,
            actions: Vec::new(),
        });
    let mut records = crate::codecs::decode_timed_encounters(
        &[0; crate::codecs::TIMED_ENCOUNTER_RECORD_BYTES * 3],
    )
    .records;
    records[0].day = 5;
    records[0].increment = 3;
    records[0].percent = 75;
    records[0].door = 7;
    records[0].required_level = 2;
    records[0].required_random_rect = -1;
    records[0].required_x = 17;
    records[0].required_y = 18;
    records[0].required_item = 801;
    records[0].required_quest = 9;
    records[0].location_kind = TimedEncounterLocationKind::Land;
    records[1].day = 0;
    records[2].day = 12;
    snapshot.timed_encounters = records;

    let projection = project_rebuilt_v3_timed_encounters(&snapshot).expect("projection");
    assert_eq!(projection.excluded_native_ids, [1, 2]);
    assert_eq!(projection.timed_encounters.len(), 1);
    let value = serde_json::to_value(&projection).expect("JSON");
    assert_eq!(value["timedEncounters"][0]["chancePercent"], 75);
    assert_eq!(value["timedEncounters"][0]["classicMacroId"], 7);
    assert_eq!(value["timedEncounters"][0]["programId"], "xap:7");
    assert_eq!(value["timedEncounters"][0]["requiredItemId"], 801);
    assert_eq!(value["timedEncounters"][0]["locationKind"], "land");
    let encoded = serde_json::to_string(&projection).expect("serialize");
    let reopened: RebuiltV3TimedEncounterProjection =
        serde_json::from_str(&encoded).expect("reimport");
    assert_eq!(reopened, projection);
}

#[test]
fn timed_projection_rejects_invalid_macro_and_duplicate_identity() {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("timed-errors".into()));
    let mut encounter =
        crate::codecs::decode_timed_encounters(&[0; crate::codecs::TIMED_ENCOUNTER_RECORD_BYTES])
            .records
            .remove(0);
    encounter.day = 1;
    encounter.door = -4;
    snapshot.timed_encounters.push(encounter);
    assert!(matches!(
        project_rebuilt_v3_timed_encounters(&snapshot),
        Err(RebuiltV3TimedEncounterError::NegativeMacro { macro_id: -4, .. })
    ));

    snapshot.timed_encounters[0].door = 4;
    assert!(matches!(
        project_rebuilt_v3_timed_encounters(&snapshot),
        Err(RebuiltV3TimedEncounterError::MissingMacro { macro_id: 4, .. })
    ));

    snapshot
        .extra_action_points
        .push(crate::model::ExtraActionPoint {
            identity: StableId("extra-action-point:4".into()),
            native_id: NativeRecordId(4),
            classic_door_id: 0,
            post_action_level: 0,
            post_action_x: 0,
            post_action_y: 0,
            chance_percent: 100,
            actions: Vec::new(),
        });
    snapshot
        .timed_encounters
        .push(snapshot.timed_encounters[0].clone());
    assert_eq!(
        project_rebuilt_v3_timed_encounters(&snapshot),
        Err(RebuiltV3TimedEncounterError::DuplicateId(0))
    );
}

#[test]
fn timed_projection_reports_rows_beyond_the_classic_runtime_ceiling() {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("timed-ceiling".into()));
    snapshot.timed_encounters = crate::codecs::decode_timed_encounters(&vec![
        0;
        crate::codecs::TIMED_ENCOUNTER_RECORD_BYTES
            * 153
    ])
    .records;
    for encounter in &mut snapshot.timed_encounters {
        encounter.day = 1;
        encounter.door = encounter.native_id.0 as i16;
    }
    snapshot.extra_action_points = (0..151)
        .map(|native_id| crate::model::ExtraActionPoint {
            identity: StableId(format!("extra-action-point:{native_id}")),
            native_id: NativeRecordId(native_id),
            classic_door_id: 0,
            post_action_level: 0,
            post_action_x: 0,
            post_action_y: 0,
            chance_percent: 100,
            actions: Vec::new(),
        })
        .collect();

    let projection = project_rebuilt_v3_timed_encounters(&snapshot).expect("projection");
    assert_eq!(projection.timed_encounters.len(), 151);
    assert_eq!(projection.excluded_native_ids, [151, 152]);
}

#[test]
fn selected_timed_projection_requires_emitted_programs_and_ignores_excluded_invalid_rows() {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("timed-selected".into()));
    let mut records = crate::codecs::decode_timed_encounters(
        &[0; crate::codecs::TIMED_ENCOUNTER_RECORD_BYTES * 2],
    )
    .records;
    records[0].day = 1;
    records[0].door = 7;
    records[1].day = 0;
    records[1].identity = StableId("invalid-excluded-timed-row".into());
    snapshot.timed_encounters = records;

    assert!(matches!(
        project_rebuilt_v3_selected_timed_encounters(&snapshot, &BTreeSet::new()),
        Err(RebuiltV3TimedEncounterError::MissingMacro { macro_id: 7, .. })
    ));
    let projection = project_rebuilt_v3_selected_timed_encounters(
        &snapshot,
        &BTreeSet::from([StableId("xap:7".into())]),
    )
    .expect("selected timed encounters");
    assert_eq!(projection.timed_encounters.len(), 1);
    assert_eq!(projection.excluded_native_ids, [1]);
}

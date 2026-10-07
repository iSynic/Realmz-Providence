use std::collections::BTreeSet;

use super::{
    RebuiltV3TimedEncounter, RebuiltV3TimedEncounterError, RebuiltV3TimedEncounterLocationKind,
    RebuiltV3TimedEncounterProjection,
};
use crate::codecs::validate_timed_encounter_shape;
use crate::model::{
    ProjectOrigin, ProjectSnapshot, StableId, TimedEncounter, TimedEncounterLocationKind,
};
use crate::rebuilt::scenario::extra_action_point_program_id;

pub fn project_rebuilt_v3_timed_encounters(
    snapshot: &ProjectSnapshot,
) -> Result<RebuiltV3TimedEncounterProjection, RebuiltV3TimedEncounterError> {
    project_rebuilt_v3_timed_encounters_filtered(snapshot, None)
}

pub(crate) fn project_rebuilt_v3_selected_timed_encounters(
    snapshot: &ProjectSnapshot,
    program_ids: &BTreeSet<StableId>,
) -> Result<RebuiltV3TimedEncounterProjection, RebuiltV3TimedEncounterError> {
    project_rebuilt_v3_timed_encounters_filtered(snapshot, Some(program_ids))
}

pub(crate) fn runtime_timed_encounter_ids(snapshot: &ProjectSnapshot) -> BTreeSet<u32> {
    let mut rescheduled = BTreeSet::new();
    let actions = snapshot
        .world
        .action_points
        .iter()
        .map(|owner| owner.actions.as_slice())
        .chain(
            snapshot
                .extra_action_points
                .iter()
                .map(|owner| owner.actions.as_slice()),
        )
        .chain(
            snapshot
                .simple_encounters
                .iter()
                .filter(|owner| owner.has_semantics())
                .map(|owner| owner.actions.as_slice()),
        )
        .chain(
            snapshot
                .complex_encounters
                .iter()
                .map(|owner| owner.actions.as_slice()),
        );
    for action in actions.flatten().filter(|action| action.opcode() == 54) {
        let Ok(extra_id) = u32::try_from(action.target_native_id) else {
            continue;
        };
        if let Some(extra) = snapshot
            .extra_codes
            .iter()
            .find(|row| row.native_id.0 == extra_id)
            && let Ok(timed_id) = u32::try_from(extra.values[0])
        {
            rescheduled.insert(timed_id);
        }
    }

    let mut records = snapshot.timed_encounters.iter().collect::<Vec<_>>();
    records.sort_by_key(|encounter| encounter.native_id);
    let runtime_end = records
        .iter()
        .position(|encounter| encounter.day == 0 && !rescheduled.contains(&encounter.native_id.0))
        .unwrap_or(records.len())
        .min(151);
    records[..runtime_end]
        .iter()
        .filter(|encounter| encounter.day > 0 || rescheduled.contains(&encounter.native_id.0))
        .map(|encounter| encounter.native_id.0)
        .collect()
}

fn project_rebuilt_v3_timed_encounters_filtered(
    snapshot: &ProjectSnapshot,
    program_ids: Option<&BTreeSet<StableId>>,
) -> Result<RebuiltV3TimedEncounterProjection, RebuiltV3TimedEncounterError> {
    let mut records = snapshot.timed_encounters.iter().collect::<Vec<_>>();
    records.sort_by_key(|encounter| encounter.native_id);
    let runtime_ids = runtime_timed_encounter_ids(snapshot);
    let tolerate_invalid =
        program_ids.is_some() && matches!(snapshot.origin, ProjectOrigin::Imported { .. });
    let mut quarantined_native_ids = validate_timed_records(
        &records,
        &runtime_ids,
        program_ids.is_some(),
        tolerate_invalid,
    )?;

    let excluded_native_ids = records
        .iter()
        .filter(|encounter| !runtime_ids.contains(&encounter.native_id.0))
        .map(|encounter| encounter.native_id.0)
        .collect();
    let extra_action_point_ids = snapshot
        .extra_action_points
        .iter()
        .map(|row| row.native_id.0)
        .collect::<BTreeSet<_>>();
    let mut timed_encounters = Vec::new();
    for encounter in &records {
        if !runtime_ids.contains(&encounter.native_id.0)
            || quarantined_native_ids.contains(&encounter.native_id.0)
        {
            continue;
        }
        match project_timed_record(encounter, program_ids, &extra_action_point_ids) {
            Ok(projected) => timed_encounters.push(projected),
            Err(_) if tolerate_invalid => {
                quarantined_native_ids.insert(encounter.native_id.0);
            }
            Err(error) => return Err(error),
        }
    }
    Ok(RebuiltV3TimedEncounterProjection {
        timed_encounters,
        excluded_native_ids,
        quarantined_native_ids: quarantined_native_ids.into_iter().collect(),
    })
}

fn validate_timed_records(
    records: &[&TimedEncounter],
    runtime_ids: &BTreeSet<u32>,
    selected: bool,
    tolerate_invalid: bool,
) -> Result<BTreeSet<u32>, RebuiltV3TimedEncounterError> {
    let validation_count = if selected {
        records
            .iter()
            .rposition(|encounter| runtime_ids.contains(&encounter.native_id.0))
            .map_or(0, |index| index + 1)
    } else {
        records.len()
    };
    let mut ids = BTreeSet::new();
    let mut quarantined = BTreeSet::new();
    for encounter in &records[..validation_count] {
        if !ids.insert(encounter.native_id.0) {
            return Err(RebuiltV3TimedEncounterError::DuplicateId(
                encounter.native_id.0,
            ));
        }
        if let Err(error) = validate_timed_encounter_shape(encounter) {
            if tolerate_invalid {
                quarantined.insert(encounter.native_id.0);
                continue;
            }
            return Err(RebuiltV3TimedEncounterError::InvalidRecord {
                encounter: encounter.identity.clone(),
                reason: error.to_string(),
            });
        }
    }
    Ok(quarantined)
}

fn project_timed_record(
    encounter: &TimedEncounter,
    program_ids: Option<&BTreeSet<StableId>>,
    extra_action_point_ids: &BTreeSet<u32>,
) -> Result<RebuiltV3TimedEncounter, RebuiltV3TimedEncounterError> {
    let macro_id =
        u32::try_from(encounter.door).map_err(|_| RebuiltV3TimedEncounterError::NegativeMacro {
            encounter: encounter.identity.clone(),
            macro_id: encounter.door,
        })?;
    let emitted = program_ids.map_or_else(
        || extra_action_point_ids.contains(&macro_id),
        |ids| ids.contains(&extra_action_point_program_id(macro_id)),
    );
    if !emitted {
        return Err(RebuiltV3TimedEncounterError::MissingMacro {
            encounter: encounter.identity.clone(),
            macro_id,
        });
    }
    Ok(RebuiltV3TimedEncounter {
        id: encounter.native_id.0,
        day: encounter.day,
        increment: encounter.increment,
        chance_percent: encounter.percent,
        classic_macro_id: encounter.door,
        program_id: extra_action_point_program_id(macro_id),
        required_level: encounter.required_level,
        required_random_rectangle: encounter.required_random_rect,
        required_x: encounter.required_x,
        required_y: encounter.required_y,
        required_item_id: encounter.required_item,
        required_quest_id: encounter.required_quest,
        location_kind: match encounter.location_kind {
            TimedEncounterLocationKind::Any => RebuiltV3TimedEncounterLocationKind::Any,
            TimedEncounterLocationKind::Land => RebuiltV3TimedEncounterLocationKind::Land,
            TimedEncounterLocationKind::Dungeon => RebuiltV3TimedEncounterLocationKind::Dungeon,
        },
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{ClassicAction, ExtraCodeRow, NativeRecordId};

    fn timed_dormancy_snapshot() -> ProjectSnapshot {
        let mut snapshot = ProjectSnapshot::new_authored(StableId("timed-dormancy".into()));
        let mut records = crate::codecs::decode_timed_encounters(
            &[0; crate::codecs::TIMED_ENCOUNTER_RECORD_BYTES * 4],
        )
        .records;
        records[0].day = -1;
        records[0].door = -1;
        records[1].day = 2;
        records[1].door = 7;
        records[2].day = -1;
        records[2].door = 8;
        records[3].day = 0;
        snapshot.timed_encounters = records;
        snapshot.extra_codes.push(ExtraCodeRow {
            native_id: NativeRecordId(12),
            values: [2, 100, 0, 1, 0],
        });
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
                actions: vec![ClassicAction {
                    slot: 0,
                    raw_opcode: 54,
                    target_native_id: 12,
                }],
            });
        snapshot
    }

    #[test]
    fn timed_projection_omits_unscheduled_rows_but_retains_rescheduled_rows() {
        let mut snapshot = timed_dormancy_snapshot();
        let emitted = BTreeSet::from([StableId("xap:7".into()), StableId("xap:8".into())]);
        let projection = project_rebuilt_v3_selected_timed_encounters(&snapshot, &emitted)
            .expect("scheduled and rescheduled rows");
        assert_eq!(
            projection
                .timed_encounters
                .iter()
                .map(|row| row.id)
                .collect::<Vec<_>>(),
            [1, 2]
        );
        assert_eq!(projection.excluded_native_ids, [0, 3]);

        snapshot.extra_action_points[0].actions.clear();
        let projection = project_rebuilt_v3_selected_timed_encounters(&snapshot, &emitted)
            .expect("dormant row excluded");
        assert_eq!(
            projection
                .timed_encounters
                .iter()
                .map(|row| row.id)
                .collect::<Vec<_>>(),
            [1]
        );
        assert_eq!(projection.excluded_native_ids, [0, 2, 3]);

        snapshot.extra_action_points[0].actions.push(ClassicAction {
            slot: 0,
            raw_opcode: 54,
            target_native_id: 12,
        });
        snapshot.timed_encounters[2].door = -1;
        assert!(matches!(
            project_rebuilt_v3_selected_timed_encounters(&snapshot, &emitted),
            Err(RebuiltV3TimedEncounterError::NegativeMacro { macro_id: -1, .. })
        ));
    }
}

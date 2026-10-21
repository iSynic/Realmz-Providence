use super::{
    PlayerMapPolicy, RebuiltV3PlayerMap, RebuiltV3WorldError, player_maps::project_player_map,
};
use crate::{
    codecs::player_map_record_has_semantics,
    model::{PlayerMapRecord, ProjectSnapshot},
    rebuilt::{ApplicationMediaCatalog, RebuiltV3ScenarioProgram},
};
use std::collections::BTreeMap;
pub(super) fn project(
    snapshot: &ProjectSnapshot,
    programs: &[&RebuiltV3ScenarioProgram],
    application_media: Option<&ApplicationMediaCatalog>,
    policy: PlayerMapPolicy,
) -> Result<Vec<RebuiltV3PlayerMap>, RebuiltV3WorldError> {
    let mut records_by_id = BTreeMap::new();
    for record in &snapshot.world.player_maps {
        if records_by_id.insert(record.native_id.0, record).is_some() {
            return Err(RebuiltV3WorldError::DuplicatePlayerMapId(
                record.native_id.0,
            ));
        }
    }
    match policy {
        PlayerMapPolicy::NativeRecords => {
            project_native(snapshot, &records_by_id, application_media)
        }
        PlayerMapPolicy::Reachable => {
            project_reachable(snapshot, &records_by_id, programs, application_media)
        }
    }
}

fn project_native(
    snapshot: &ProjectSnapshot,
    records: &BTreeMap<u32, &PlayerMapRecord>,
    application_media: Option<&ApplicationMediaCatalog>,
) -> Result<Vec<RebuiltV3PlayerMap>, RebuiltV3WorldError> {
    records
        .values()
        .copied()
        .filter(|record| record.native_id.0 < 20)
        // Text exits before image arithmetic or map indexing in Castle. Unsafe
        // image records remain in native facts; all other projection errors propagate.
        .filter(|record| {
            record.show < 0
                || (record.icon_size > 0 && (record.picture_id != 0 || record.level >= 0))
        })
        .map(|record| {
            project_player_map(
                snapshot,
                record,
                application_media,
                PlayerMapPolicy::NativeRecords,
            )
        })
        .collect()
}

fn project_reachable(
    snapshot: &ProjectSnapshot,
    records_by_id: &BTreeMap<u32, &PlayerMapRecord>,
    programs: &[&RebuiltV3ScenarioProgram],
    application_media: Option<&ApplicationMediaCatalog>,
) -> Result<Vec<RebuiltV3PlayerMap>, RebuiltV3WorldError> {
    let mut reachable = BTreeMap::new();
    for program in programs {
        for instruction in program
            .instructions
            .iter()
            .filter(|action| action.opcode == 29)
        {
            let native_id = u32::from(instruction.id.unsigned_abs());
            if native_id >= 20 {
                return Err(RebuiltV3WorldError::PlayerMapIdOutOfRange {
                    program: program.id.clone(),
                    native_id: instruction.id,
                });
            }
            reachable
                .entry(native_id)
                .or_insert_with(|| program.id.clone());
        }
    }

    reachable
        .into_iter()
        .map(|(native_id, program)| {
            let record = records_by_id
                .get(&native_id)
                .copied()
                .filter(|record| player_map_record_has_semantics(record))
                .ok_or(RebuiltV3WorldError::MissingPlayerMap { program, native_id })?;
            project_player_map(
                snapshot,
                record,
                application_media,
                PlayerMapPolicy::Reachable,
            )
        })
        .collect()
}

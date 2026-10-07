use super::{RebuiltV3PlayerMap, RebuiltV3WorldError, player_maps::project_player_map};
use crate::{
    codecs::player_map_record_has_semantics,
    model::ProjectSnapshot,
    rebuilt::{ApplicationMediaCatalog, RebuiltV3ScenarioProgram},
};
use std::collections::BTreeMap;
pub(super) fn project(
    snapshot: &ProjectSnapshot,
    programs: &[&RebuiltV3ScenarioProgram],
    application_media: Option<&ApplicationMediaCatalog>,
) -> Result<Vec<RebuiltV3PlayerMap>, RebuiltV3WorldError> {
    let mut records_by_id = BTreeMap::new();
    for record in &snapshot.world.player_maps {
        if records_by_id.insert(record.native_id.0, record).is_some() {
            return Err(RebuiltV3WorldError::DuplicatePlayerMapId(
                record.native_id.0,
            ));
        }
    }
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
            project_player_map(snapshot, record, application_media)
        })
        .collect()
}

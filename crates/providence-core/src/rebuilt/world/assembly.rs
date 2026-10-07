use super::{
    RebuiltV3WorldDocument, RebuiltV3WorldError, layout, maps, player_selection, programs,
};
use crate::{
    model::{ProjectSnapshot, StableId},
    rebuilt::{
        ApplicationMediaCatalog, RebuiltV3ReachableRuntimeSelection, project_rebuilt_v3_map_inputs,
        project_rebuilt_v3_topologies,
    },
};
use std::collections::{BTreeMap, BTreeSet};

pub(super) fn project(
    snapshot: &ProjectSnapshot,
    special_land_assets: &BTreeMap<i16, StableId>,
    application_media: Option<&ApplicationMediaCatalog>,
    runtime: Option<&RebuiltV3ReachableRuntimeSelection>,
) -> Result<RebuiltV3WorldDocument, RebuiltV3WorldError> {
    validate_map_identities(snapshot)?;
    let (transitions, land_layout) = layout::project(snapshot)?;
    let inputs =
        project_rebuilt_v3_map_inputs(snapshot).ok_or(RebuiltV3WorldError::MapInputsUnavailable)?;
    let topologies = project_rebuilt_v3_topologies(snapshot, special_land_assets)
        .map_err(RebuiltV3WorldError::Topology)?;
    let programs = programs::project(snapshot, runtime)?;
    let program_refs = programs.programs.iter().collect::<Vec<_>>();
    let player_maps = player_selection::project(snapshot, &program_refs, application_media)?;
    let maps = maps::project(snapshot, inputs.maps, topologies, &programs.programs)?;
    Ok(RebuiltV3WorldDocument {
        kind: "realmz2.world".into(),
        schema_version: 3,
        battle_terrain_sets: inputs.battle_terrain_sets,
        maps,
        player_maps,
        triggers: programs.triggers,
        transitions,
        land_layout,
        timed_encounters: programs.timed_encounters,
    })
}

fn validate_map_identities(snapshot: &ProjectSnapshot) -> Result<(), RebuiltV3WorldError> {
    if snapshot.world.maps.is_empty() {
        return Err(RebuiltV3WorldError::EmptyMaps);
    }
    let mut ids = BTreeSet::new();
    for map in &snapshot.world.maps {
        if !ids.insert(map.identity.clone()) {
            return Err(RebuiltV3WorldError::DuplicateMapId(map.identity.clone()));
        }
    }
    Ok(())
}

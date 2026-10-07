use super::{RebuiltV3WorldError, RebuiltV3WorldMap};
use crate::{
    model::{CLASSIC_MAP_SIZE, MapLevel, ProjectSnapshot, StableId},
    rebuilt::{
        RebuiltV3MapCompilerInput, RebuiltV3RandomRectangle, RebuiltV3ScenarioProgram,
        RebuiltV3Topology, scenario::projectable_opcode_92_random_rectangle_targets,
    },
};
use std::collections::{BTreeMap, BTreeSet};

pub(super) fn project(
    snapshot: &ProjectSnapshot,
    inputs: Vec<RebuiltV3MapCompilerInput>,
    topologies: Vec<RebuiltV3Topology>,
    programs: &[RebuiltV3ScenarioProgram],
) -> Result<Vec<RebuiltV3WorldMap>, RebuiltV3WorldError> {
    let mut inputs = inputs
        .into_iter()
        .map(|m| (m.id.clone(), m))
        .collect::<BTreeMap<_, _>>();
    let mut topologies = topologies
        .into_iter()
        .map(|m| (m.id.clone(), m))
        .collect::<BTreeMap<_, _>>();
    let targets = projectable_opcode_92_random_rectangle_targets(snapshot, programs.iter());
    let mut sources = snapshot.world.maps.iter().collect::<Vec<_>>();
    sources.sort_by_key(|m| m.identity.clone());
    let mut maps = Vec::with_capacity(sources.len());
    for map in sources {
        let mut input = inputs
            .remove(&map.identity)
            .ok_or_else(|| RebuiltV3WorldError::MissingMapInput(map.identity.clone()))?;
        let topology = topologies
            .remove(&map.identity)
            .ok_or_else(|| RebuiltV3WorldError::MissingTopology(map.identity.clone()))?;
        if let Some(slots) = targets.get(&map.identity) {
            retain_target_slots(&mut input, map, slots);
        }
        maps.push(project_map(map, input, topology));
    }
    Ok(maps)
}

fn retain_target_slots(
    input: &mut RebuiltV3MapCompilerInput,
    map: &MapLevel,
    slots: &BTreeSet<usize>,
) {
    for slot in slots {
        let identity = StableId(format!("{}:rect:{slot}", map.identity.0));
        if input.random_rectangles.iter().any(|r| r.id == identity) {
            continue;
        }
        // A referenced empty physical slot needs an identity, never active cell membership.
        input.random_rectangles.push(RebuiltV3RandomRectangle {
            id: identity,
            top: 0,
            left: 0,
            bottom: 0,
            right: 0,
            chance_ten_thousand: 0,
            battle_range: [0; 2],
            random_doors: [0; 3],
            random_door_percent: [0; 3],
            only: false,
            option: 0,
            sound_id: 0,
            text_id: 0,
        });
    }
    input.random_rectangles.sort_by_key(|r| {
        r.id.0
            .rsplit(':')
            .next()
            .and_then(|slot| slot.parse::<usize>().ok())
            .unwrap_or(usize::MAX)
    });
}

fn project_map(
    map: &MapLevel,
    input: RebuiltV3MapCompilerInput,
    topology: RebuiltV3Topology,
) -> RebuiltV3WorldMap {
    RebuiltV3WorldMap {
        id: map.identity.clone(),
        name: map.name.clone(),
        level_type: map.level_type,
        level_index: map.native_index,
        width: CLASSIC_MAP_SIZE as u16,
        height: CLASSIC_MAP_SIZE as u16,
        metadata: input.metadata,
        topology_format: topology.topology_format,
        cells: topology.cells,
        boat_replacement_profiles: topology.boat_replacement_profiles,
        random_rectangles: input.random_rectangles,
    }
}

use super::instructions::{extra_code_index, instructions_projection_with_policy};
use super::{
    RebuiltV3ProgramOwnerKind, RebuiltV3ScenarioError, RebuiltV3ScenarioProgram, RebuiltV3Trigger,
    RebuiltV3TriggerDestination, RebuiltV3TriggerPrograms,
};
use crate::model::{
    ActionPoint, CLASSIC_MAP_SIZE, ExtraActionPoint, LevelType, MapCoordinate, ProjectSnapshot,
    StableId,
};
use crate::rebuilt::runtime_ids::{
    action_point_id, action_point_program_id, extra_action_point_owner_id,
};
use std::collections::{BTreeMap, BTreeSet};

pub fn project_rebuilt_v3_trigger_programs(
    snapshot: &ProjectSnapshot,
) -> Result<RebuiltV3TriggerPrograms, RebuiltV3ScenarioError> {
    project_rebuilt_v3_trigger_programs_filtered(snapshot, None)
}

pub(crate) fn project_rebuilt_v3_selected_trigger_programs(
    snapshot: &ProjectSnapshot,
    program_ids: &BTreeSet<StableId>,
) -> Result<RebuiltV3TriggerPrograms, RebuiltV3ScenarioError> {
    project_rebuilt_v3_trigger_programs_filtered(snapshot, Some(program_ids))
}

fn project_rebuilt_v3_trigger_programs_filtered(
    snapshot: &ProjectSnapshot,
    program_ids: Option<&BTreeSet<StableId>>,
) -> Result<RebuiltV3TriggerPrograms, RebuiltV3ScenarioError> {
    let allow_deferred = program_ids.is_some()
        && matches!(
            snapshot.origin,
            crate::model::ProjectOrigin::Imported { .. }
        );
    let extra_codes = extra_code_index(&snapshot.extra_codes)?;
    let selected = selected_triggers(snapshot, program_ids);
    let mut index = PlacementIndex::default();
    let mut triggers = Vec::with_capacity(selected.len());
    let mut programs = Vec::with_capacity(selected.len());
    for trigger in selected {
        let (placed, program) =
            project_placed_trigger(snapshot, trigger, &extra_codes, allow_deferred, &mut index)?;
        triggers.push(placed);
        programs.push(program);
    }
    project_extra_action_points(
        snapshot,
        program_ids,
        &extra_codes,
        allow_deferred,
        &mut index,
        &mut programs,
    )?;
    programs.sort_by_key(|program| program.id.clone());
    Ok(RebuiltV3TriggerPrograms { triggers, programs })
}

fn selected_triggers<'a>(
    snapshot: &'a ProjectSnapshot,
    program_ids: Option<&BTreeSet<StableId>>,
) -> Vec<&'a ActionPoint> {
    let mut selected = snapshot
        .world
        .action_points
        .iter()
        .filter(|trigger| placed_trigger_is_defined(trigger))
        .filter(|trigger| {
            program_ids
                .is_none_or(|program_ids| program_ids.contains(&action_point_program_id(trigger)))
        })
        .collect::<Vec<_>>();
    selected.sort_by_key(|trigger| {
        (
            trigger.level_type as u8,
            trigger.level_index,
            trigger.record_index,
            trigger.identity.clone(),
        )
    });

    selected
}

#[derive(Default)]
struct PlacementIndex {
    trigger_ids: BTreeSet<StableId>,
    placed_records: BTreeSet<(StableId, u8)>,
}

impl PlacementIndex {
    fn source<'a>(
        &mut self,
        snapshot: &'a ProjectSnapshot,
        trigger: &ActionPoint,
    ) -> Result<(&'a crate::model::MapLevel, MapCoordinate), RebuiltV3ScenarioError> {
        let trigger_id = action_point_id(trigger);
        validate_identifier(&trigger_id)?;
        if !self.trigger_ids.insert(trigger_id.clone()) {
            return Err(RebuiltV3ScenarioError::DuplicateTriggerId(trigger_id));
        }
        let source_map = snapshot
            .world
            .maps
            .iter()
            .find(|map| {
                map.level_type == trigger.level_type && map.native_index == trigger.level_index
            })
            .ok_or_else(|| RebuiltV3ScenarioError::MissingSourceMap(trigger.identity.clone()))?;
        let coordinate = trigger
            .coordinate
            .ok_or_else(|| RebuiltV3ScenarioError::MissingCoordinate(trigger.identity.clone()))?;
        if usize::from(coordinate.x) >= CLASSIC_MAP_SIZE
            || usize::from(coordinate.y) >= CLASSIC_MAP_SIZE
        {
            return Err(RebuiltV3ScenarioError::CoordinateOutsideMap(
                trigger.identity.clone(),
                coordinate,
            ));
        }
        if !self
            .placed_records
            .insert((source_map.identity.clone(), trigger.record_index))
        {
            return Err(RebuiltV3ScenarioError::DuplicatePlacedRecord {
                map: source_map.identity.clone(),
                record_index: trigger.record_index,
            });
        }
        Ok((source_map, coordinate))
    }
}

fn destination<'a>(
    snapshot: &'a ProjectSnapshot,
    trigger: &ActionPoint,
    allow_deferred: bool,
) -> Result<(Option<&'a crate::model::MapLevel>, MapCoordinate), RebuiltV3ScenarioError> {
    let destination_map = snapshot.world.maps.iter().find(|map| {
        map.level_type == trigger.level_type
            && map.native_index == u32::from(trigger.post_action_level)
    });
    if destination_map.is_none() && !allow_deferred {
        return Err(RebuiltV3ScenarioError::MissingDestinationMap(
            trigger.identity.clone(),
            trigger.post_action_level,
        ));
    }
    let destination_coordinate = MapCoordinate {
        x: trigger.post_action_x,
        y: trigger.post_action_y,
    };
    if usize::from(destination_coordinate.x) >= CLASSIC_MAP_SIZE
        || usize::from(destination_coordinate.y) >= CLASSIC_MAP_SIZE
    {
        return Err(RebuiltV3ScenarioError::DestinationOutsideMap(
            trigger.identity.clone(),
            destination_coordinate,
        ));
    }
    Ok((destination_map, destination_coordinate))
}

fn project_placed_trigger(
    snapshot: &ProjectSnapshot,
    trigger: &ActionPoint,
    extra_codes: &BTreeMap<u32, [i16; 5]>,
    allow_deferred: bool,
    index: &mut PlacementIndex,
) -> Result<(RebuiltV3Trigger, RebuiltV3ScenarioProgram), RebuiltV3ScenarioError> {
    let (source_map, coordinate) = index.source(snapshot, trigger)?;
    let (destination_map, destination_coordinate) = destination(snapshot, trigger, allow_deferred)?;
    let program_id = action_point_program_id(trigger);
    validate_identifier(&program_id)?;
    let program = program_projection(trigger, program_id.clone(), extra_codes, allow_deferred)?;
    let projected = RebuiltV3Trigger {
        id: action_point_id(trigger),
        program_id,
        classic_record_index: u32::from(trigger.record_index),
        map_id: Some(source_map.identity.clone()),
        coordinate: Some(coordinate),
        active: trigger.chance_percent > 0,
        chance_percent: trigger.chance_percent,
        post_action_location: Some(RebuiltV3TriggerDestination {
            map_id: destination_map.map_or_else(
                || {
                    StableId(format!(
                        "{}:{}",
                        match trigger.level_type {
                            LevelType::Land => "land",
                            LevelType::Dungeon => "dungeon",
                        },
                        trigger.post_action_level
                    ))
                },
                |map| map.identity.clone(),
            ),
            coordinate: destination_coordinate,
        }),
    };
    Ok((projected, program))
}

fn project_extra_action_points(
    snapshot: &ProjectSnapshot,
    program_ids: Option<&BTreeSet<StableId>>,
    extra_codes: &BTreeMap<u32, [i16; 5]>,
    allow_deferred: bool,
    index: &mut PlacementIndex,
    programs: &mut Vec<RebuiltV3ScenarioProgram>,
) -> Result<(), RebuiltV3ScenarioError> {
    let mut extra_action_points = snapshot.extra_action_points.iter().collect::<Vec<_>>();
    extra_action_points.sort_by_key(|row| (row.native_id, row.identity.clone()));
    for row in extra_action_points.into_iter().filter(|row| {
        program_ids.is_none_or(|program_ids| {
            program_ids.contains(&extra_action_point_program_id(row.native_id.0))
        })
    }) {
        let owner_id = extra_action_point_owner_id(row.native_id.0);
        validate_identifier(&owner_id)?;
        if !index.trigger_ids.insert(owner_id.clone()) {
            return Err(RebuiltV3ScenarioError::DuplicateTriggerId(owner_id));
        }
        programs.push(extra_action_point_program_projection(
            row,
            extra_codes,
            allow_deferred,
        )?);
    }
    Ok(())
}

pub(crate) fn placed_trigger_is_defined(trigger: &ActionPoint) -> bool {
    trigger.coordinate.is_some() && (!trigger.actions.is_empty() || trigger.classic_door_id != 0)
}

fn program_projection(
    trigger: &ActionPoint,
    program_id: StableId,
    extra_codes: &BTreeMap<u32, [i16; 5]>,
    allow_deferred: bool,
) -> Result<RebuiltV3ScenarioProgram, RebuiltV3ScenarioError> {
    let instructions = instructions_projection_with_policy(
        &trigger.identity,
        &trigger.actions,
        extra_codes,
        allow_deferred,
    )?;
    Ok(RebuiltV3ScenarioProgram {
        id: program_id,
        owner_kind: RebuiltV3ProgramOwnerKind::Trigger,
        owner_id: action_point_id(trigger),
        instructions,
    })
}

fn extra_action_point_program_projection(
    row: &ExtraActionPoint,
    extra_codes: &BTreeMap<u32, [i16; 5]>,
    allow_deferred: bool,
) -> Result<RebuiltV3ScenarioProgram, RebuiltV3ScenarioError> {
    let instructions = instructions_projection_with_policy(
        &row.identity,
        &row.actions,
        extra_codes,
        allow_deferred,
    )?;
    Ok(RebuiltV3ScenarioProgram {
        id: extra_action_point_program_id(row.native_id.0),
        owner_kind: RebuiltV3ProgramOwnerKind::ExtraActionPoint,
        owner_id: extra_action_point_owner_id(row.native_id.0),
        instructions,
    })
}

pub(crate) fn extra_action_point_program_id(native_id: u32) -> StableId {
    StableId(format!("xap:{native_id}"))
}

fn validate_identifier(id: &StableId) -> Result<(), RebuiltV3ScenarioError> {
    if id.0.is_empty() || id.0.len() > 255 {
        return Err(RebuiltV3ScenarioError::InvalidIdentifier(id.clone()));
    }
    Ok(())
}

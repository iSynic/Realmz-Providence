use super::{RebuiltV3ApplicationHooks, RebuiltV3ScenarioError};
use crate::model::{ProjectSnapshot, ScenarioApplicationHooks, StableId};
use crate::rebuilt::runtime_ids::application_program_id;
use std::collections::BTreeSet;

pub(super) fn project_application_hooks(
    snapshot: &ProjectSnapshot,
    hooks: &ScenarioApplicationHooks,
    program_ids: &BTreeSet<StableId>,
    allow_deferred: bool,
) -> Result<RebuiltV3ApplicationHooks, RebuiltV3ScenarioError> {
    let mut projected = Vec::with_capacity(5);
    for (hook, program) in [
        ("startGame", &hooks.start_game),
        ("partyDeath", &hooks.party_death),
        ("endAdventure", &hooks.end_adventure),
        ("shop", &hooks.shop),
        ("temple", &hooks.temple),
    ] {
        let Some(program) = program else {
            projected.push(None);
            continue;
        };
        if program.0.is_empty() || program.0.len() > 255 {
            return Err(RebuiltV3ScenarioError::InvalidApplicationHook {
                hook: hook.into(),
                program: program.clone(),
            });
        }
        let runtime_program = application_program_id(snapshot, program);
        if !allow_deferred && !program_ids.contains(&runtime_program) {
            return Err(RebuiltV3ScenarioError::MissingApplicationHookProgram {
                hook: hook.into(),
                program: runtime_program,
            });
        }
        projected.push(Some(runtime_program));
    }
    Ok(RebuiltV3ApplicationHooks {
        start_game: projected[0].clone(),
        party_death: projected[1].clone(),
        end_adventure: projected[2].clone(),
        shop: projected[3].clone(),
        temple: projected[4].clone(),
    })
}

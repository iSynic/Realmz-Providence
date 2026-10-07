use crate::request_params::{required_u64, required_value};
use providence_core::{
    model::*,
    session::{EditorSession, ExpectedRevisionCommand, Revision},
};
use serde_json::{Value, json};

pub(super) fn validate(
    session: &EditorSession,
    method: &str,
    params: &Value,
) -> Result<Value, String> {
    if required_u64(params, "expectedRevision")? != session.revision().0 {
        return Err("Scenario changed. Reload before continuing.".into());
    }
    let command = match method {
        "scenario-startup.validate" => providence_core::session::ScenarioAuthoringEdit::Startup {
            draft: serde_json::from_value(required_value(params, "startup")?.clone())
                .map_err(|error| error.to_string())?,
        }
        .into(),
        "scenario-restrictions.validate" => {
            providence_core::session::ScenarioAuthoringEdit::Restrictions {
                restrictions: serde_json::from_value(
                    required_value(params, "restrictions")?.clone(),
                )
                .map_err(|error| error.to_string())?,
            }
            .into()
        }
        "scenario-contact.validate" => {
            let draft = serde_json::from_value(required_value(params, "contact")?.clone())
                .map_err(|error| error.to_string())?;
            providence_core::session::ScenarioAuthoringEdit::Contact { draft }.into()
        }
        _ => return Err(format!("unknown validation method {method}")),
    };
    // A bounded section-only scratch session runs the canonical authoring validator.
    // Retained descriptors constrain ownership; source payloads and history stay outside the scratch session.
    let mut snapshot = ProjectSnapshot::new_authored(session.snapshot().project_id.clone());
    snapshot.campaign = session.snapshot().campaign.clone();
    snapshot.start_location = session.snapshot().start_location.clone();
    snapshot.startup_authoring = session.snapshot().startup_authoring.clone();
    snapshot.origin = session.snapshot().origin.clone();
    snapshot.classic_sources = session.snapshot().classic_sources.clone();
    snapshot.world.maps = validation_maps(session);
    let mut scratch = EditorSession::new(snapshot);
    let error = scratch
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command,
        })
        .err()
        .map(|error| error.to_string());
    Ok(json!({ "revision": session.revision(), "valid": error.is_none(), "error": error }))
}

fn validation_maps(session: &EditorSession) -> Vec<MapLevel> {
    session
        .snapshot()
        .world
        .maps
        .iter()
        .map(|map| MapLevel {
            identity: map.identity.clone(),
            level_type: map.level_type,
            native_index: map.native_index,
            name: map.name.clone(),
            tiles: Vec::new(),
            runtime: None,
        })
        .collect()
}

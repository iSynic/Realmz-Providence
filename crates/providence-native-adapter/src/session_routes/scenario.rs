//! Native scenario requests; decoding and bounded projections stay with this feature.
use providence_core::session::ScenarioContactDraft;

use crate::execute;
use crate::request_params::required_value;
use providence_core::model::CampaignMetadata;
use providence_core::model::ScenarioApplicationContract;
use providence_core::model::StartLocation;
use providence_core::session::EditorCommand;
use providence_core::session::EditorSession;
use serde_json::Value;

pub(super) fn dispatch(
    session: &mut EditorSession,
    method: &str,
    params: Value,
) -> Result<Value, String> {
    match method {
        "scenario-startup.validate"
        | "scenario-restrictions.validate"
        | "scenario-contact.validate" => {
            super::scenario_validation::validate(session, method, &params)
        }
        "scenario-startup.update" => {
            let draft = serde_json::from_value(required_value(&params, "startup")?.clone())
                .map_err(|error| format!("invalid startup draft: {error}"))?;
            execute(
                session,
                &params,
                providence_core::session::ScenarioAuthoringEdit::Startup { draft }.into(),
            )
        }
        "scenario-restrictions.update" => {
            let restrictions =
                serde_json::from_value(required_value(&params, "restrictions")?.clone())
                    .map_err(|error| format!("invalid restriction draft: {error}"))?;
            execute(
                session,
                &params,
                providence_core::session::ScenarioAuthoringEdit::Restrictions { restrictions }
                    .into(),
            )
        }
        "campaign.set" => campaign_set(session, params),
        "scenario-contact.update" => scenario_contact_update(session, params),
        "start-location.set" => start_location_set(session, params),
        "scenario-application.set" => scenario_application_set(session, params),
        _ => Err(format!("unknown method {method}")),
    }
}

fn campaign_set(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    let metadata = required_value(&params, "metadata")?;
    let metadata: CampaignMetadata = serde_json::from_value(metadata.clone())
        .map_err(|error| format!("invalid campaign metadata: {error}"))?;
    execute(
        session,
        &params,
        EditorCommand::SetCampaignMetadata {
            metadata: Box::new(metadata),
        },
    )
}

fn scenario_contact_update(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    let contact: ScenarioContactDraft =
        serde_json::from_value(required_value(&params, "contact")?.clone())
            .map_err(|error| format!("invalid scenario contact information: {error}"))?;
    execute(
        session,
        &params,
        providence_core::session::ScenarioAuthoringEdit::Contact { draft: contact }.into(),
    )
}

fn start_location_set(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    let location = required_value(&params, "location")?;
    let location: StartLocation = serde_json::from_value(location.clone())
        .map_err(|error| format!("invalid start location: {error}"))?;
    execute(
        session,
        &params,
        EditorCommand::SetStartLocation { location },
    )
}

fn scenario_application_set(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    let contract = required_value(&params, "contract")?;
    let contract: ScenarioApplicationContract = serde_json::from_value(contract.clone())
        .map_err(|error| format!("invalid scenario application contract: {error}"))?;
    execute(
        session,
        &params,
        EditorCommand::SetScenarioApplication { contract },
    )
}

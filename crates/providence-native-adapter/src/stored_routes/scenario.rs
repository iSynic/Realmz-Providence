use crate::scenario_metadata::read_scenario_contact;
use crate::scenario_metadata::read_scenario_restrictions;
use crate::scenario_metadata::read_scenario_security;
use crate::scenario_metadata::read_scenario_startup;
use providence_core::session::EditorSession;
use providence_storage::ProjectStore;
use serde_json::Value;

pub(super) fn dispatch(
    session: &mut EditorSession,
    store: Option<&ProjectStore>,
    method: &str,
    params: Value,
) -> Result<Value, String> {
    match method {
        "scenario-contact.open" => read_scenario_contact(session, store),
        "scenario-startup.open" => read_scenario_startup(session),
        "scenario-restrictions.open" => read_scenario_restrictions(session),
        "scenario-security.open" => read_scenario_security(session, store),
        "scenario-security.update"
        | "scenario-security.validate"
        | "scenario-security.repair-preview"
        | "scenario-security.source-preview"
        | "scenario-security.source-list"
        | "scenario-registration.generate" => {
            crate::scenario_security::dispatch(session, store, method, &params)
        }
        _ => crate::session_routes::dispatch(session, method, params),
    }
}

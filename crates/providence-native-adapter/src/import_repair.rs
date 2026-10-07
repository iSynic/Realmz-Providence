mod projection;
mod retained;

use providence_core::{
    import_repair::{self, RepairAssessment},
    session::{EditorCommand, EditorSession},
};
use providence_storage::ProjectStore;
use serde_json::{Value, json};

pub(crate) fn dispatch(
    session: &mut EditorSession,
    store: Option<&ProjectStore>,
    method: &str,
    params: &Value,
) -> Result<Value, String> {
    let store = store
        .ok_or("Imported-content repair requires a stored project with retained source bytes.")?;
    let files = retained::read(session.snapshot(), store)?;
    let assessment = import_repair::assess(session.snapshot(), &files)?;
    match method {
        "project.import-repair.assess" => projection::page(session, &assessment, params),
        "project.import-repair.apply" => apply_reviewed(session, assessment, params),
        _ => Err(format!("Unknown repair operation {method}.")),
    }
}

fn apply_reviewed(
    session: &mut EditorSession,
    assessment: RepairAssessment,
    params: &Value,
) -> Result<Value, String> {
    if crate::request_params::required_string(params, "expectedProjectId")?
        != session.snapshot().project_id.0
        || crate::request_params::required_string(params, "expectedSourceIdentity")?
            != assessment.source_identity
        || crate::request_params::required_u64(params, "expectedInterpretationVersion")?
            != u64::from(assessment.previous_version)
    {
        return Err(
            "Repair belongs to an older project or source interpretation; review it again.".into(),
        );
    }
    if !assessment.source_requirements.is_empty() {
        return Err(assessment.source_requirements.join("\n"));
    }
    let selections: Vec<String> = serde_json::from_value(
        params
            .get("replaceConflicts")
            .cloned()
            .unwrap_or_else(|| json!([])),
    )
    .map_err(|_| "replaceConflicts must list reviewed repair keys.")?;
    let mut result = crate::execute(
        session,
        params,
        EditorCommand::RepairImportedContent(assessment.reviewed_command(&selections)?),
    )?;
    result["refreshRequired"] = json!(true);
    Ok(result)
}

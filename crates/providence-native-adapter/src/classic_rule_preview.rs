use crate::{catalogs::CatalogViews, classic_rule_selection, request_params::required_value};
use providence_core::model::{
    ClassicRuleSelectionContextV1, ClassicRuleSelectionEvidence, ProjectOrigin,
    classic_source_set_sha256,
};
use providence_core::session::EditorSession;
use providence_storage::ProjectStore;
use serde_json::{Value, json};

pub(crate) fn preview(
    session: &EditorSession,
    store: Option<&ProjectStore>,
    catalogs: CatalogViews<'_>,
    params: &Value,
) -> Result<Value, String> {
    classic_rule_selection::guard_destination(session, params)?;
    let store = store.ok_or("Classic rule preview requires a durable project")?;
    if !matches!(session.snapshot().origin, ProjectOrigin::Imported { .. }) {
        return Err("Classic rule selection belongs only to imported projects".into());
    }
    let value = required_value(params, "nativeMenuSelection")?;
    if value.is_null() {
        return Ok(
            json!({"revision":session.revision(), "projectId":session.snapshot().project_id,
            "validChoice":true, "ready":false, "raceSource":"unresolved", "casteSource":"unresolved",
            "message":"Rebuilt export requires a configured Classic rule choice."}),
        );
    }
    let slot = value
        .as_u64()
        .and_then(|value| u16::try_from(value).ok())
        .ok_or("nativeMenuSelection must be a positive native menu integer")?;
    let mut draft = session.snapshot().clone();
    let context = ClassicRuleSelectionContextV1 {
        record_version: 1,
        project_id: draft.project_id.clone(),
        captured_source_set_sha256: classic_source_set_sha256(&draft)?,
        native_menu_selection: slot,
        evidence_origin: ClassicRuleSelectionEvidence::OwnerConfigured,
    };
    context.validate_binding(&draft)?;
    draft.classic_rule_selection = Some(context);
    let (race_source, caste_source) =
        providence_core::rebuilt::selected_classic_rule_sources(&draft)?;
    let options = classic_rule_selection::options(params)?;
    crate::rebuilt_packages::with_package_application_media(
        None,
        catalogs.application_media,
        options.as_ref(),
        |media| {
            let result =
                classic_rule_selection::prepare_snapshot(&draft, store, media, options.as_ref());
            Ok(match result {
                Ok(Some(selected)) => {
                    json!({"revision":session.revision(), "projectId":draft.project_id,
                "validChoice":true, "ready":true, "raceSource":selected.race_source, "casteSource":selected.caste_source,
                "raceCount":selected.effective_snapshot.race_rules.len(), "casteCount":selected.effective_snapshot.caste_rules.len(),
                "message":"Scenario Race/Caste names are preserved independently."})
                }
                Err(message) => json!({"revision":session.revision(), "projectId":draft.project_id,
                "validChoice":true, "ready":false, "raceSource":race_source, "casteSource":caste_source, "message":message}),
                Ok(None) => unreachable!("A configured draft must resolve or report its blocker"),
            })
        },
    )
}

use crate::catalogs::CatalogViews;
use crate::readiness::inspect_classic_readiness;
use crate::request_params::required_string;
use crate::session_summary::user_visible_path;
use providence_core::model::CLASSIC_MAP_SIZE;
use providence_core::session::EditorSession;
use providence_storage::ProjectStore;
use serde_json::Value;
use serde_json::json;
use std::path::PathBuf;
use std::time::Instant;

pub(super) fn dispatch(
    session: &mut EditorSession,
    store: Option<&ProjectStore>,
    catalogs: CatalogViews<'_>,
    method: &str,
    params: Value,
) -> Result<Value, String> {
    let application_media = catalogs.application_media;
    if method.starts_with("project.import-repair.") {
        return crate::import_repair::dispatch(session, store, method, &params);
    }
    if method.starts_with("project.import-classic-")
        || method == "project.inspect-classic-scenario-import"
    {
        return super::imports::dispatch(session, store, method, params);
    }
    if method.starts_with("project.inspect-classic-")
        && method != "project.inspect-classic-readiness"
        || matches!(
            method,
            "project.compile-data-ni"
                | "project.compile-data-spell"
                | "project.compile-classic-slice"
                | "project.compile-classic-stuffit"
        )
    {
        return super::classic::dispatch(session, store, catalogs, method, params);
    }
    if method.starts_with("project.inspect-rebuilt-") || method == "project.compile-rebuilt-package"
    {
        return super::rebuilt::dispatch(session, store, catalogs, method, params);
    }
    match method {
        "project.benchmark" => benchmark(session),
        "project.inspect-classic-readiness" => {
            inspect_classic_readiness(session, application_media, &params)
        }
        "project.save" if params.get("path").is_none() => save(session, store),
        "project.save-as" => save_as(session, store, params),
        _ => crate::session_routes::dispatch(session, method, params),
    }
}

fn benchmark(session: &mut EditorSession) -> Result<Value, String> {
    let validation_started = Instant::now();
    let diagnostics = session.diagnostics();
    let validation_micros = validation_started.elapsed().as_micros();
    let references = session.references();
    let errors = diagnostics
        .iter()
        .filter(|diagnostic| {
            matches!(
                diagnostic.severity,
                providence_core::validation::Severity::Error
            )
        })
        .count();
    let warnings = diagnostics.len().saturating_sub(errors);
    Ok(json!({
        "revision": session.revision(),
        "ok": errors == 0,
        "counts": {
            "maps": session.snapshot().world.maps.len(),
            "mapTiles": session.snapshot().world.maps.len().saturating_mul(CLASSIC_MAP_SIZE).saturating_mul(CLASSIC_MAP_SIZE),
            "actionPoints": session.snapshot().world.action_points.len(),
            "extraActionPoints": session.snapshot().extra_action_points.len(),
            "extraCodes": session.snapshot().extra_codes.len(),
            "references": references.len(),
            "diagnostics": diagnostics.len(),
            "errors": errors,
            "warnings": warnings,
        },
        "timing": {
            "validationMicros": validation_micros,
            "validationMs": validation_micros / 1000,
        },
    }))
}

fn save(session: &mut EditorSession, store: Option<&ProjectStore>) -> Result<Value, String> {
    let store = store.ok_or_else(|| {
        "project.save without a path requires a persistent project session".to_string()
    })?;
    let outcome = store
        .checkpoint_session(session, &json!({"method": "project.save"}))
        .map_err(|error| error.to_string())?;
    Ok(json!({
        "revision": session.revision(),
        "path": store.snapshot_path(),
        "snapshotSha256": outcome.snapshot_sha256,
        "canUndo": session.can_undo(),
        "canRedo": session.can_redo(),
        "infrastructureWarning": outcome.infrastructure_warning,
    }))
}

fn save_as(
    session: &mut EditorSession,
    store: Option<&ProjectStore>,
    params: Value,
) -> Result<Value, String> {
    let store =
        store.ok_or_else(|| "project.save-as requires a persistent project session".to_string())?;
    let path = PathBuf::from(required_string(&params, "path")?);
    let outcome = store
        .save_session_as(session, &path)
        .map_err(|error| error.to_string())?;
    let project_path = user_visible_path(path.canonicalize().map_err(|error| {
        format!(
            "could not resolve saved project {}: {error}",
            path.display()
        )
    })?);
    Ok(json!({
        "revision": session.revision(),
        "projectPath": project_path,
        "path": project_path.join("project.providence.json"),
        "snapshotSha256": outcome.snapshot_sha256,
        "canUndo": session.can_undo(),
        "canRedo": session.can_redo(),
        "infrastructureWarning": outcome.infrastructure_warning,
    }))
}

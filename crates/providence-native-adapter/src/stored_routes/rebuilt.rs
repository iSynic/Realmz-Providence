use crate::catalogs::CatalogViews;
use crate::media_problems::inspect_rebuilt_media_projection;
use crate::rebuilt_packages::inspect_rebuilt_world_projection;
use crate::rebuilt_packages::{compile_rebuilt_package, inspect_rebuilt_package};
use providence_core::rebuilt::ApplicationMediaCatalog;
use providence_core::rebuilt::project_rebuilt_v3_reachable_runtime;
use providence_core::session::EditorSession;
use providence_storage::ProjectStore;
use serde_json::Value;
use std::path::Path;

pub(super) fn dispatch(
    session: &mut EditorSession,
    store: Option<&ProjectStore>,
    catalogs: CatalogViews<'_>,
    method: &str,
    params: Value,
) -> Result<Value, String> {
    let application_media = catalogs.application_media;
    if store.is_none() && session.snapshot().classic_rule_selection.is_some() {
        return Err(
            "Selected Classic rules require serve-project and its durable source store".into(),
        );
    }
    match method {
        "project.inspect-rebuilt-package" => {
            inspect_package(session, store, params, application_media)
        }
        "project.compile-rebuilt-package" => {
            compile_package(session, store, params, application_media)
        }
        "project.inspect-rebuilt-world" => {
            inspect_rebuilt_world(session, store, params, application_media)
        }
        "project.inspect-rebuilt-readiness" => {
            inspect_readiness(session, store, params, application_media)
        }
        "project.inspect-rebuilt-media" => {
            inspect_rebuilt_media(session, store, params, application_media)
        }
        _ => crate::session_routes::dispatch(session, method, params),
    }
}

fn inspect_package(
    session: &mut EditorSession,
    store: Option<&ProjectStore>,
    params: Value,
    application_media: Option<&ApplicationMediaCatalog>,
) -> Result<Value, String> {
    let store = store.ok_or_else(|| {
        "project.inspect-rebuilt-package requires serve-project so declared media can be read from the durable blob store".to_string()
    })?;
    inspect_rebuilt_package(session, store, application_media, params)
}

fn compile_package(
    session: &mut EditorSession,
    store: Option<&ProjectStore>,
    params: Value,
    application_media: Option<&ApplicationMediaCatalog>,
) -> Result<Value, String> {
    let store = store.ok_or_else(|| {
        "project.compile-rebuilt-package requires serve-project so declared media can be read from the durable blob store".to_string()
    })?;
    compile_rebuilt_package(session, store, application_media, params)
}

fn inspect_rebuilt_world(
    session: &mut EditorSession,
    store: Option<&ProjectStore>,
    params: Value,
    application_media: Option<&ApplicationMediaCatalog>,
) -> Result<Value, String> {
    let root = params
        .get("applicationLibraryRoot")
        .and_then(Value::as_str)
        .map(Path::new);
    let options = crate::classic_rule_selection::options(&params)?;
    crate::rebuilt_packages::with_package_application_media(
        root,
        application_media,
        options.as_ref(),
        |media| {
            let selection = store
                .map(|store| {
                    crate::classic_rule_selection::prepare(session, store, media, options.as_ref())
                })
                .transpose()?
                .flatten();
            let snapshot = selection
                .as_ref()
                .map_or(session.snapshot(), |value| &value.effective_snapshot);
            inspect_rebuilt_world_projection(snapshot, media)
        },
    )
}

pub(crate) fn inspect_readiness(
    session: &mut EditorSession,
    store: Option<&ProjectStore>,
    params: Value,
    application_media: Option<&ApplicationMediaCatalog>,
) -> Result<Value, String> {
    readiness_data(session, store, &params, application_media)?.project(session.revision(), &params)
}

pub(crate) fn readiness_data(
    session: &EditorSession,
    store: Option<&ProjectStore>,
    params: &Value,
    application_media: Option<&ApplicationMediaCatalog>,
) -> Result<crate::readiness::ReadinessData, String> {
    let options = crate::classic_rule_selection::options(params)?;
    let root = params
        .get("applicationLibraryRoot")
        .and_then(Value::as_str)
        .map(Path::new);
    crate::rebuilt_packages::with_package_application_media(
        root,
        application_media,
        options.as_ref(),
        |media| {
            let selection = store
                .map(|store| {
                    crate::classic_rule_selection::prepare(session, store, media, options.as_ref())
                })
                .transpose();
            match selection {
                Err(message) => Ok(crate::readiness::ReadinessData {
                    readiness: crate::classic_rule_selection::blocked(session.snapshot(), message),
                    problems: Vec::new(),
                    problem_count: 0,
                }),
                Ok(Some(Some(selection))) => {
                    crate::readiness::collect_rebuilt(session, &selection.effective_snapshot, media)
                }
                _ => crate::readiness::collect_rebuilt(session, session.snapshot(), media),
            }
        },
    )
}

fn inspect_rebuilt_media(
    session: &mut EditorSession,
    store: Option<&ProjectStore>,
    params: Value,
    application_media: Option<&ApplicationMediaCatalog>,
) -> Result<Value, String> {
    let root = params
        .get("applicationLibraryRoot")
        .and_then(Value::as_str)
        .map(Path::new);
    let options = crate::classic_rule_selection::options(&params)?;
    crate::rebuilt_packages::with_package_application_media(
        root,
        application_media,
        options.as_ref(),
        |media| {
            let selection = store
                .map(|store| {
                    crate::classic_rule_selection::prepare(session, store, media, options.as_ref())
                })
                .transpose()?
                .flatten();
            let snapshot = selection
                .as_ref()
                .map_or(session.snapshot(), |value| &value.effective_snapshot);
            let runtime = project_rebuilt_v3_reachable_runtime(snapshot)
                .map_err(|error| error.to_string())?;
            inspect_rebuilt_media_projection(snapshot, session.revision(), &runtime, media, &params)
        },
    )
}

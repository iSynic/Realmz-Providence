use crate::catalogs::CatalogViews;
use crate::classic_compilation::ClassicManifestOperation;
use crate::classic_compilation::compile_project_classic_slice_with_application;
use crate::item_spell_compilation::compile_data_spell;
use crate::item_spell_compilation::compile_scenario_items;
use providence_core::rebuilt::ApplicationMediaCatalog;
use providence_core::session::EditorSession;
use providence_storage::ProjectStore;
use serde_json::Value;

pub(super) fn dispatch(
    session: &mut EditorSession,
    store: Option<&ProjectStore>,
    catalogs: CatalogViews<'_>,
    method: &str,
    params: Value,
) -> Result<Value, String> {
    let application_media = catalogs.application_media;
    match method {
        "project.compile-data-ni" => compile_scenario_items(session, store, params),
        "project.compile-data-spell" => compile_data_spell(session, store, params),
        "project.inspect-classic-no-edit" => {
            inspect_classic_no_edit(session, store, params, application_media)
        }
        "project.inspect-classic-owned-edit" => {
            inspect_classic_owned_edit(session, store, params, application_media)
        }
        "project.inspect-classic-plan" => {
            inspect_classic_plan(session, store, params, application_media)
        }
        "project.compile-classic-slice" => {
            if let Some(store) = store {
                compile_project_classic_slice_with_application(
                    session,
                    store,
                    application_media,
                    params,
                    ClassicManifestOperation::Publish,
                )
            } else {
                crate::session_routes::dispatch(session, method, params)
            }
        }
        "project.inspect-classic-stuffit" | "project.compile-classic-stuffit" => {
            let store = store.ok_or("StuffIt export requires a persistent project so retained sources and media can be read")?;
            let operation = if method == "project.inspect-classic-stuffit" {
                ClassicManifestOperation::InspectStuffIt
            } else {
                ClassicManifestOperation::PublishStuffIt
            };
            compile_project_classic_slice_with_application(
                session,
                store,
                application_media,
                params,
                operation,
            )
        }
        _ => crate::session_routes::dispatch(session, method, params),
    }
}

fn inspect_classic_no_edit(
    session: &mut EditorSession,
    store: Option<&ProjectStore>,
    params: Value,
    application_media: Option<&ApplicationMediaCatalog>,
) -> Result<Value, String> {
    let store = store.ok_or_else(|| {
        "project.inspect-classic-no-edit requires serve-project so retained sources can be verified"
            .to_string()
    })?;
    compile_project_classic_slice_with_application(
        session,
        store,
        application_media,
        params,
        ClassicManifestOperation::InspectNoEdit,
    )
}

fn inspect_classic_owned_edit(
    session: &mut EditorSession,
    store: Option<&ProjectStore>,
    params: Value,
    application_media: Option<&ApplicationMediaCatalog>,
) -> Result<Value, String> {
    let store = store.ok_or_else(|| {
        "project.inspect-classic-owned-edit requires serve-project so retained sources can be verified"
            .to_string()
    })?;
    compile_project_classic_slice_with_application(
        session,
        store,
        application_media,
        params,
        ClassicManifestOperation::InspectOwnedEdit,
    )
}

fn inspect_classic_plan(
    session: &mut EditorSession,
    store: Option<&ProjectStore>,
    params: Value,
    application_media: Option<&ApplicationMediaCatalog>,
) -> Result<Value, String> {
    let store = store.ok_or_else(|| {
        "project.inspect-classic-plan requires serve-project so retained sources and media can be read".to_string()
    })?;
    compile_project_classic_slice_with_application(
        session,
        store,
        application_media,
        params,
        ClassicManifestOperation::InspectPlan,
    )
}

use crate::{
    Request, Response,
    catalogs::{CatalogViews, OpenMonsterLibrary},
    stored_routes::dispatch as dispatch_result_with_catalogs,
    validation_jobs,
};
use providence_core::session::EditorSession;
use providence_storage::ProjectStore;

pub(crate) fn dispatch(
    session: &mut EditorSession,
    store: Option<&ProjectStore>,
    catalogs: CatalogViews<'_>,
    monster_library: Option<&mut OpenMonsterLibrary>,
    validation_jobs: &mut validation_jobs::Jobs,
    request: Request,
) -> Response {
    let result = if request.method == "build.identity" {
        serde_json::to_value(providence_core::build_identity::current(
            "providence-native-adapter",
        ))
        .map_err(|error| error.to_string())
    } else {
        validation_jobs
            .dispatch(
                session,
                store,
                catalogs.application_media,
                &request.method,
                &request.params,
            )
            .unwrap_or_else(|| {
                dispatch_result_with_catalogs(
                    session,
                    store,
                    catalogs,
                    monster_library,
                    &request.method,
                    request.params,
                )
            })
    };
    match result {
        Ok(result) => Response {
            id: request.id,
            outcome_unknown: None,
            ok: true,
            result: Some(result),
            error: None,
        },
        Err(error) => Response {
            id: request.id,
            outcome_unknown: error
                .starts_with("Publication outcome unknown:")
                .then_some(true),
            ok: false,
            result: None,
            error: Some(error),
        },
    }
}

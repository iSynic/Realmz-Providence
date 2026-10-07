use crate::catalogs::CatalogViews;
use providence_core::build_identity;
use providence_core::compatibility::classify_targets;
use providence_core::compatibility::classify_targets_with_application;
use providence_core::rebuilt::ApplicationMediaCatalog;
use providence_core::session::EditorSession;
use serde_json::Value;

pub(super) fn dispatch(
    session: &mut EditorSession,
    store: Option<&providence_storage::ProjectStore>,
    catalogs: CatalogViews<'_>,
    method: &str,
    params: Value,
) -> Result<Value, String> {
    let application_media = catalogs.application_media;
    match method {
        "compiler.describe" => {
            serde_json::to_value(build_identity::current("providence-native-adapter"))
                .map_err(|error| error.to_string())
        }
        "compatibility.classify" => classify(session, store, application_media, &params),
        _ => crate::session_routes::dispatch(session, method, params),
    }
}

fn classify(
    session: &mut EditorSession,
    store: Option<&providence_storage::ProjectStore>,
    application_media: Option<&ApplicationMediaCatalog>,
    params: &Value,
) -> Result<Value, String> {
    let mut classifications = application_media.map_or_else(
        || classify_targets(session.snapshot()),
        |application_media| {
            classify_targets_with_application(session.snapshot(), application_media)
        },
    );
    if let Some(store) = store {
        let options = crate::classic_rule_selection::options(params)?;
        let selected = crate::rebuilt_packages::with_package_application_media(
            None,
            application_media,
            options.as_ref(),
            |media| match crate::classic_rule_selection::prepare(
                session,
                store,
                media,
                options.as_ref(),
            ) {
                Ok(Some(selection)) => Ok(media.map_or_else(
                    || {
                        providence_core::compatibility::classify_rebuilt_v3(
                            &selection.effective_snapshot,
                        )
                    },
                    |media| {
                        providence_core::compatibility::classify_rebuilt_v3_with_application(
                            &selection.effective_snapshot,
                            media,
                        )
                    },
                )),
                Ok(None) => Ok(classifications[1].clone()),
                Err(message) => Ok(crate::classic_rule_selection::blocked(
                    session.snapshot(),
                    message,
                )),
            },
        )?;
        classifications[1] = selected;
    }
    serde_json::to_value(classifications).map_err(|error| error.to_string())
}

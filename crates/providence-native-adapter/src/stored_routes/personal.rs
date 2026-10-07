use crate::catalogs::CatalogViews;
use crate::personal_library;
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
        "personal-library.apply-item-artwork" => personal_library::apply_item_artwork(
            session,
            store,
            catalogs.personal_library,
            application_media,
            &params,
        ),
        "personal-library.copy-icon" => personal_library::copy_icon(
            session,
            store,
            catalogs.personal_library,
            application_media,
            &params,
        ),
        _ => crate::personal_library::dispatch(catalogs.personal_library, method, &params),
    }
}

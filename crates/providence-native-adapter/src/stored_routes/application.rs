use crate::application_media_import::import_classic_application_media;
use crate::catalogs::CatalogViews;
use crate::document_catalogs::application_media_list;
use crate::document_catalogs::application_media_open;
use crate::document_catalogs::application_media_preview;
use crate::map_rendering::application_landlook_atlas_coverage;
use providence_core::rebuilt::ApplicationMediaCatalog;
use providence_core::session::EditorSession;
use serde_json::Value;
use serde_json::json;

pub(super) fn dispatch(
    session: &mut EditorSession,
    catalogs: CatalogViews<'_>,
    method: &str,
    params: Value,
) -> Result<Value, String> {
    let application_media = catalogs.application_media;
    let application_media_store = catalogs.application_media_store;
    match method {
        "application-media.describe" => describe(application_media),
        "application-media.list" => application_media_list(application_media, &params),
        "application-media.open" => application_media_open(application_media, &params),
        "application-media.preview" => {
            application_media_preview(application_media, application_media_store, &params)
        }
        "application-media.import-classic-library" => import_classic_application_media(params),
        _ => crate::session_routes::dispatch(session, method, params),
    }
}

fn describe(application_media: Option<&ApplicationMediaCatalog>) -> Result<Value, String> {
    Ok(application_media.map_or_else(
        || json!({"configured": false}),
        |catalog| {
            let (available_landlooks, missing_landlooks, dungeon_atlas) =
                application_landlook_atlas_coverage(catalog);
            json!({
                "configured": true,
                "libraryId": catalog.library_id,
                "sources": catalog.sources.len(),
                "assets": catalog.assets.len(),
                "ambiguities": catalog.ambiguous_resources.len(),
                "failures": catalog.failures.len(),
                "landlookAtlases": {
                    "available": available_landlooks,
                    "missing": missing_landlooks,
                    "dungeon": dungeon_atlas,
                },
            })
        },
    ))
}

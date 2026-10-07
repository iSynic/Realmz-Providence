use crate::artwork_conflict;
use crate::catalogs::CatalogViews;
use crate::reference_catalog;
use crate::reference_catalog::import_divinity_reference_catalog;
use crate::reference_catalog::reference_catalog_describe;
use crate::reference_catalog::reference_catalog_list;
use crate::reference_catalog::reference_catalog_open;
use crate::reference_catalog::reference_catalog_preview;
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
        "reference-catalog.describe" => Ok(reference_catalog_describe(catalogs.reference_catalog)),
        "scenario-item.apply-library-artwork" => reference_catalog::apply_item_artwork(
            session,
            store,
            catalogs.reference_catalog,
            catalogs.reference_catalog_store,
            &params,
        ),
        "artwork.check-copy-number" => {
            artwork_conflict::check(session, store, application_media, &params)
        }
        "artwork.item-uses" => artwork_conflict::item_uses(session, &params),
        "reference-catalog.copy-icon" => reference_catalog::copy_artwork(
            session,
            store,
            catalogs.reference_catalog,
            catalogs.reference_catalog_store,
            application_media,
            &params,
        ),
        "scenario-item.use-scenario-artwork" => {
            reference_catalog::apply_scenario_item_artwork(session, store, &params)
        }
        "scenario-item.use-stock-artwork" => {
            reference_catalog::apply_stock_item_artwork(session, store, application_media, &params)
        }
        "reference-catalog.list" => reference_catalog_list(catalogs.reference_catalog, &params),
        "reference-catalog.open" => reference_catalog_open(
            catalogs.reference_catalog,
            catalogs.reference_catalog_store,
            &params,
        ),
        "reference-catalog.preview" => reference_catalog_preview(
            catalogs.reference_catalog,
            catalogs.reference_catalog_store,
            &params,
        ),
        "reference-catalog.import-divinity" => import_divinity_reference_catalog(params),
        _ => crate::session_routes::dispatch(session, method, params),
    }
}

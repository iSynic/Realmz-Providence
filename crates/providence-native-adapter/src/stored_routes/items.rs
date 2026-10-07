//! Item catalog, draft and artwork requests with explicit external inputs.
use super::reference;
use crate::catalogs::CatalogViews;
use providence_core::session::EditorSession;
use providence_storage::ProjectStore;
use serde_json::Value;

pub(super) enum Request {
    Catalog,
    References,
    Artwork,
    Draft,
    ScenarioArtwork,
}

pub(super) fn resolve(method: &str) -> Option<Request> {
    Some(match method {
        "item.list" | "item.open" | "item.recovery.read" => Request::Catalog,
        "item-reference.list" => Request::References,
        "item-artwork.resolve" => Request::Artwork,
        "item.allocation.review"
        | "item.clear.review"
        | "item.draft.prepare"
        | "item.draft.apply" => Request::Draft,
        "scenario-item.apply-library-artwork"
        | "scenario-item.use-scenario-artwork"
        | "scenario-item.use-stock-artwork" => Request::ScenarioArtwork,
        _ => return None,
    })
}

impl Request {
    pub(super) fn dispatch(
        self,
        session: &mut EditorSession,
        store: Option<&ProjectStore>,
        catalogs: CatalogViews<'_>,
        method: &str,
        params: Value,
    ) -> Result<Value, String> {
        match self {
            Self::Catalog => {
                crate::item_catalog::dispatch(session, catalogs.stock_items, method, params)
            }
            Self::References => crate::item_references::list(session, catalogs, &params),
            Self::Artwork => crate::item_references::artwork(session, catalogs, &params),
            Self::Draft => {
                crate::item_drafts::dispatch(session, store, catalogs.stock_items, method, params)
            }
            Self::ScenarioArtwork => reference::dispatch(session, store, catalogs, method, params),
        }
    }
}

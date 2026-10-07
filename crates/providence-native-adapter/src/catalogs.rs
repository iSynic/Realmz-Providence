use providence_core::{
    monster_library::MonsterLibrarySession, rebuilt::ApplicationMediaCatalog,
    reference_library::ReferenceCatalog,
};
use providence_storage::{MonsterLibraryStore, ReferenceCatalogStore, ReferenceLibraryStore};

#[derive(Debug)]
pub(crate) struct OpenApplicationMedia {
    pub(crate) store: ReferenceLibraryStore,
    pub(crate) catalog: ApplicationMediaCatalog,
}

#[derive(Debug)]
pub(crate) struct OpenMonsterLibrary {
    pub(crate) store: MonsterLibraryStore,
    pub(crate) session: MonsterLibrarySession,
}

#[derive(Debug)]
pub(crate) struct OpenReferenceCatalog {
    pub(crate) store: ReferenceCatalogStore,
    pub(crate) catalog: ReferenceCatalog,
}

#[derive(Debug, Default)]
pub(crate) struct OpenLibraries {
    pub(crate) application_terrain: Option<crate::application_terrain::ApplicationTerrain>,
    pub(crate) stock_items: Option<crate::stock_items::StockItems>,
    pub(crate) stock_spells: Option<crate::stock_spells::StockSpells>,
    pub(crate) stock_rules: Option<crate::stock_rules::StockRules>,
    pub(crate) personal_library: Option<providence_storage::PersonalLibraryStore>,
    pub(crate) application_media: Option<OpenApplicationMedia>,
    pub(crate) monster_library: Option<OpenMonsterLibrary>,
    pub(crate) reference_catalog: Option<OpenReferenceCatalog>,
}

#[derive(Clone, Copy, Default)]
// Borrowed external resources for one request; the project session remains the authoring authority.
pub(crate) struct CatalogViews<'a> {
    pub(crate) application_terrain: Option<&'a crate::application_terrain::ApplicationTerrain>,
    pub(crate) stock_items: Option<&'a crate::stock_items::StockItems>,
    pub(crate) stock_spells: Option<&'a crate::stock_spells::StockSpells>,
    pub(crate) stock_rules: Option<&'a crate::stock_rules::StockRules>,
    pub(crate) personal_library: Option<&'a providence_storage::PersonalLibraryStore>,
    pub(crate) application_media: Option<&'a ApplicationMediaCatalog>,
    pub(crate) application_media_store: Option<&'a ReferenceLibraryStore>,
    pub(crate) reference_catalog: Option<&'a ReferenceCatalog>,
    pub(crate) reference_catalog_store: Option<&'a ReferenceCatalogStore>,
}

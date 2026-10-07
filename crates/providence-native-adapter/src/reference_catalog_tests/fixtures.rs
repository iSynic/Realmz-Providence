use crate::reference_catalog::import_divinity_reference_catalog;
use providence_core::codecs::{ResourceEntry, encode_scenario_icon_cicn, write_resource_fork};
use providence_core::reference_library::ReferenceCatalog;
use providence_storage::ReferenceCatalogStore;
use serde_json::json;
use std::fs;

pub(super) fn controlled_catalog() -> (tempfile::TempDir, ReferenceCatalog, usize) {
    controlled_catalog_with_id(-164)
}

pub(super) fn controlled_catalog_with_id(
    resource_id: i16,
) -> (tempfile::TempDir, ReferenceCatalog, usize) {
    let temporary = tempfile::tempdir().unwrap();
    let sources = temporary.path().join("sources");
    fs::create_dir(&sources).unwrap();
    let icon = encode_scenario_icon_cicn(&vec![255; 32 * 32 * 4], 32, 32).unwrap();
    for name in ["Bag of Holding.rsrc", "Vault of Arcana.rsrc"] {
        let fork = write_resource_fork(&[ResourceEntry {
            resource_type: *b"cicn",
            id: resource_id,
            name: name.into(),
            attributes: 0,
            data: icon.clone(),
        }])
        .unwrap();
        fs::write(sources.join(name), fork).unwrap();
    }
    let root = temporary.path().join("catalog");
    import_divinity_reference_catalog(json!({"sourceDirectory": sources, "libraryRoot": root}))
        .unwrap();
    let (_, catalog) = ReferenceCatalogStore::open(root).unwrap();
    (temporary, catalog, icon.len())
}

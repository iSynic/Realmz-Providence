use super::*;
use providence_core::rebuilt::{ApplicationMediaCatalog, ApplicationMediaSource};

#[test]
fn structural_stock_open_never_weakens_payload_or_complete_verification() {
    let root = tempfile::tempdir().unwrap();
    let store = ReferenceLibraryStore::create(root.path()).unwrap();
    let blob = store.put_blob(b"stock source").unwrap();
    let mut catalog = ApplicationMediaCatalog::empty(StableId("stock".into()));
    catalog.sources.push(ApplicationMediaSource {
        identity: StableId("source".into()),
        native_name: "The Family Jewels.rsrc".into(),
        priority: 0,
        blob: blob.clone(),
        byte_length: 12,
    });
    store.save_catalog(&catalog).unwrap();
    fs::write(
        root.path()
            .join("blobs/sha256")
            .join(blob.0.strip_prefix("sha256:").unwrap()),
        b"corrupt data",
    )
    .unwrap();
    let (opened, captured) = ReferenceLibraryStore::open_structural(root.path()).unwrap();
    assert_eq!(captured, catalog);
    assert!(opened.read_blob(&blob).is_err());
    assert!(opened.load_catalog().is_err());
    assert!(ReferenceLibraryStore::open(root.path()).is_err());
    catalog.sources.push(catalog.sources[0].clone());
    assert!(opened.validate_catalog_structure(&catalog).is_err());
}

#[test]
fn staging_blob_adoption_checks_existing_and_source_bytes_without_overwrite() {
    let root = tempfile::tempdir().unwrap();
    let snapshot = ProjectSnapshot::new_authored(StableId("adoption".into()));
    let source = ProjectStore::create_new(root.path().join("source"), &snapshot).unwrap();
    let target = ProjectStore::create_new(root.path().join("target"), &snapshot).unwrap();
    let id = source.put_blob(b"durable staged payload").unwrap();
    target.adopt_blob(&source, &id).unwrap();
    assert_eq!(target.read_blob(&id).unwrap(), b"durable staged payload");
    target.adopt_blob(&source, &id).unwrap();
    fs::write(target.blob_path(&id).unwrap(), b"corrupt").unwrap();
    assert!(target.adopt_blob(&source, &id).is_err());
    assert_eq!(
        fs::read(target.blob_path(&id).unwrap()).unwrap(),
        b"corrupt"
    );
}

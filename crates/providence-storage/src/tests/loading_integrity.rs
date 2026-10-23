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
fn packed_stock_library_reads_verified_blobs_from_one_deterministic_archive() {
    let roots = [tempfile::tempdir().unwrap(), tempfile::tempdir().unwrap()];
    let mut archives = Vec::new();
    for root in &roots {
        let store = ReferenceLibraryStore::create(root.path()).unwrap();
        let blob = store.put_blob(b"stock source").unwrap();
        store.put_blob(b"decoded stock asset").unwrap();
        let mut catalog = ApplicationMediaCatalog::empty(StableId("stock".into()));
        catalog.sources.push(ApplicationMediaSource {
            identity: StableId("source".into()),
            native_name: "The Family Jewels.rsrc".into(),
            priority: 0,
            blob: blob.clone(),
            byte_length: 12,
        });
        store.save_catalog(&catalog).unwrap();
        assert_eq!(crate::pack_reference_library(root.path()).unwrap(), 2);
        assert!(!root.path().join("blobs").exists());
        let (packed, opened) = ReferenceLibraryStore::open(root.path()).unwrap();
        assert!(packed.is_packed());
        assert_eq!(opened, catalog);
        assert_eq!(packed.read_blob(&blob).unwrap(), b"stock source");
        assert!(packed.put_blob(b"new").is_err());
        assert!(ReferenceLibraryStore::create(root.path()).is_err());
        assert!(crate::pack_reference_library(root.path()).is_err());
        archives.push(fs::read(root.path().join(crate::PACKED_BLOBS_FILE)).unwrap());
    }
    assert_eq!(archives[0], archives[1]);
    // A tampered entry fails its digest; loose and packed blobs together are ambiguous.
    let root = roots[0].path();
    let mut tampered = archives[0].clone();
    let at = tampered
        .windows(12)
        .position(|window| window == b"stock source")
        .unwrap();
    tampered[at + 11] = b'X';
    fs::write(root.join(crate::PACKED_BLOBS_FILE), tampered).unwrap();
    let error = ReferenceLibraryStore::open(root).unwrap_err().to_string();
    assert!(error.contains("checksum"), "{error}");
    fs::write(root.join(crate::PACKED_BLOBS_FILE), &archives[0]).unwrap();
    fs::create_dir_all(root.join("blobs/sha256")).unwrap();
    assert!(ReferenceLibraryStore::open(root).is_err());
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

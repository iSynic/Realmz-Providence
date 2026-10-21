//! Hold writer ownership through initial snapshot and index publication.
use crate::{ProjectStore, ProjectWriterLock, StoreError};
use providence_core::model::{BlobId, ProjectSnapshot};
use std::collections::BTreeMap;
use std::{
    fs,
    path::{Path, PathBuf},
    sync::Arc,
};

impl ProjectStore {
    pub fn create_new(
        root: impl Into<PathBuf>,
        snapshot: &ProjectSnapshot,
    ) -> Result<Self, StoreError> {
        let root = root.into();
        inspect_empty(&root)?;
        initialize(root, snapshot, true, BTreeMap::new())
    }

    pub fn create(
        root: impl Into<PathBuf>,
        snapshot: &ProjectSnapshot,
    ) -> Result<Self, StoreError> {
        initialize(root.into(), snapshot, false, BTreeMap::new())
    }

    pub(super) fn create_seeded(
        root: impl Into<PathBuf>,
        snapshot: &ProjectSnapshot,
        blobs: BTreeMap<BlobId, Vec<u8>>,
    ) -> Result<Self, StoreError> {
        let root = root.into();
        inspect_empty(&root)?;
        initialize(root, snapshot, true, blobs)
    }
}

fn inspect_empty(root: &Path) -> Result<(), StoreError> {
    if root.try_exists()? && (!root.is_dir() || fs::read_dir(root)?.next().is_some()) {
        return Err(StoreError::ProjectDirectoryNotEmpty(root.into()));
    }
    Ok(())
}

fn initialize(
    root: PathBuf,
    snapshot: &ProjectSnapshot,
    fresh: bool,
    blobs: BTreeMap<BlobId, Vec<u8>>,
) -> Result<ProjectStore, StoreError> {
    let mut store = ProjectStore::at_root(root);
    store.writer = Some(Arc::new(ProjectWriterLock::acquire(&store.root)?));
    // Another creator can publish after our first inspection. Check again under
    // ownership, allowing only the writer infrastructure just established here.
    if fresh && !only_writer_infrastructure(&store.root)? {
        return Err(StoreError::ProjectDirectoryNotEmpty(store.root));
    }
    for (expected, bytes) in blobs {
        if store.put_blob(&bytes)? != expected {
            return Err(StoreError::InvalidPortableSnapshot(
                "Stored new-project support identity changed.".into(),
            ));
        }
    }
    store.save_snapshot(snapshot)?;
    store.rebuild_index(snapshot)?;
    store.writer = None;
    Ok(store)
}

fn only_writer_infrastructure(root: &Path) -> Result<bool, std::io::Error> {
    for entry in fs::read_dir(root)? {
        if entry?.file_name() != ".providence" {
            return Ok(false);
        }
    }
    for entry in fs::read_dir(root.join(".providence"))? {
        if entry?.file_name() != "writer.lock" {
            return Ok(false);
        }
    }
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;
    use providence_core::model::StableId;

    #[test]
    fn failed_support_seeding_does_not_publish_an_empty_project_snapshot() {
        let root = tempfile::tempdir().unwrap();
        let snapshot = ProjectSnapshot::new_authored(StableId("seeded".into()));
        let blobs = BTreeMap::from([(
            BlobId(format!("sha256:{}", "0".repeat(64))),
            b"support".to_vec(),
        )]);
        assert!(ProjectStore::create_seeded(root.path(), &snapshot, blobs).is_err());
        assert!(!root.path().join(crate::SNAPSHOT_FILE).exists());
        assert!(matches!(
            ProjectStore::open(root.path()),
            Err(StoreError::MissingSnapshot(_))
        ));
    }

    #[test]
    fn a_late_creator_cannot_overwrite_a_project_after_an_earlier_empty_inspection() {
        let root = tempfile::tempdir().unwrap();
        let first = ProjectSnapshot::new_authored(StableId("first".into()));
        let later = ProjectSnapshot::new_authored(StableId("later".into()));
        inspect_empty(root.path()).unwrap();
        inspect_empty(root.path()).unwrap();
        let owner = initialize(root.path().into(), &first, true, BTreeMap::new()).unwrap();
        let original = fs::read(owner.snapshot_path()).unwrap();
        let error = initialize(root.path().into(), &later, true, BTreeMap::new()).unwrap_err();
        assert!(matches!(error, StoreError::ProjectDirectoryNotEmpty(_)));
        assert_eq!(fs::read(owner.snapshot_path()).unwrap(), original);
        assert_eq!(
            ProjectStore::open(root.path()).unwrap().1.project_id,
            first.project_id
        );
    }

    #[test]
    fn creation_cannot_replace_a_live_session_or_write_inside_an_occupied_destination() {
        let root = tempfile::tempdir().unwrap();
        fs::write(root.path().join("owner-data"), b"preserve").unwrap();
        let snapshot = ProjectSnapshot::new_authored(StableId("owner".into()));
        assert!(ProjectStore::create_new(root.path(), &snapshot).is_err());
        assert!(!root.path().join(".providence").exists());
        let project = root.path().join("project");
        let created = ProjectStore::create_new(&project, &snapshot).unwrap();
        let original = fs::read(created.snapshot_path()).unwrap();
        let (_store, _session) = ProjectStore::open_session(&project).unwrap();
        assert!(ProjectStore::create(&project, &snapshot).is_err());
        assert_eq!(fs::read(created.snapshot_path()).unwrap(), original);
    }
}

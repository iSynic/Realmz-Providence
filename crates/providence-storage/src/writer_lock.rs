//! A host holds this OS lock until the canonical session has shut down.
use std::{
    fs::{self, File, OpenOptions},
    io,
    path::Path,
};

#[derive(Debug)]
pub struct ProjectWriterLock {
    _file: File,
}

impl crate::ProjectStore {
    pub(super) fn writer_lease(&self) -> io::Result<Option<ProjectWriterLock>> {
        if self.writer.is_some() {
            Ok(None)
        } else {
            ProjectWriterLock::acquire(&self.root).map(Some)
        }
    }
}

impl ProjectWriterLock {
    pub fn acquire(project: &Path) -> io::Result<Self> {
        let directory = project.join(".providence");
        fs::create_dir_all(&directory)?;
        let file = OpenOptions::new()
            .create(true)
            .truncate(false)
            .read(true)
            .write(true)
            .open(directory.join("writer.lock"))?;
        file.try_lock().map_err(lock_error)?;
        Ok(Self { _file: file })
    }
}

fn lock_error(error: std::fs::TryLockError) -> io::Error {
    match error {
        std::fs::TryLockError::WouldBlock => {
            io::Error::new(io::ErrorKind::WouldBlock, "project already has a writer")
        }
        std::fs::TryLockError::Error(error) => error,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn filesystem_lock_failures_are_not_reported_as_an_existing_writer() {
        let error = lock_error(std::fs::TryLockError::Error(io::Error::new(
            io::ErrorKind::Unsupported,
            "fixture filesystem does not support locking",
        )));
        assert_eq!(error.kind(), io::ErrorKind::Unsupported);
        assert_eq!(
            error.to_string(),
            "fixture filesystem does not support locking"
        );
    }
    #[test]
    fn exclusive_writer_is_released_when_its_owner_leaves() {
        let root = tempfile::tempdir().unwrap();
        let lock = ProjectWriterLock::acquire(root.path()).unwrap();
        assert!(ProjectWriterLock::acquire(root.path()).is_err());
        drop(lock);
        assert!(ProjectWriterLock::acquire(root.path()).is_ok());
    }
    #[test]
    fn a_session_blocks_other_sessions_and_stale_store_writes_until_all_owner_clones_leave() {
        use providence_core::model::{ProjectSnapshot, StableId};
        let root = tempfile::tempdir().unwrap();
        let snapshot = ProjectSnapshot::new_authored(StableId("writer".into()));
        let stale = crate::ProjectStore::create_new(root.path(), &snapshot).unwrap();
        let (owner, _session) = crate::ProjectStore::open_session(root.path()).unwrap();
        assert!(crate::ProjectStore::open_session(root.path()).is_err());
        assert!(stale.save_snapshot(&snapshot).is_err());
        let retained = owner.clone();
        drop(owner);
        assert!(crate::ProjectStore::open_session(root.path()).is_err());
        drop(retained);
        assert!(crate::ProjectStore::open_session(root.path()).is_ok());
    }
}

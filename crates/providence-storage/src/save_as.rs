use crate::CheckpointOutcome;
use crate::ProjectStore;
use crate::blob_retention::snapshot_project_blob_ids;
use crate::errors::StoreError;
use providence_core::session::EditorSession;
use std::collections::BTreeSet;
use std::fs;
use std::path::Path;
use tempfile::Builder as TempDirBuilder;

impl ProjectStore {
    pub fn save_session_as(
        &self,
        session: &EditorSession,
        destination: impl AsRef<Path>,
    ) -> Result<CheckpointOutcome, StoreError> {
        let requested = destination.as_ref();
        let file_name = requested
            .file_name()
            .filter(|name| !name.is_empty())
            .ok_or_else(|| StoreError::InvalidProjectDestination(requested.to_path_buf()))?;
        let parent = requested
            .parent()
            .filter(|path| !path.as_os_str().is_empty())
            .unwrap_or_else(|| Path::new("."));
        let canonical_parent = parent
            .canonicalize()
            .map_err(|_| StoreError::InvalidProjectDestination(requested.to_path_buf()))?;
        let destination = canonical_parent.join(file_name);
        if destination.try_exists()? {
            return Err(StoreError::ProjectDestinationExists(destination));
        }

        let canonical_source = self.root.canonicalize()?;
        if destination.starts_with(&canonical_source) {
            return Err(StoreError::ProjectDestinationInsideSource(destination));
        }

        let staging = TempDirBuilder::new()
            .prefix(".providence-save-as-")
            .tempdir_in(&canonical_parent)?;
        let target = Self {
            root: staging.path().to_path_buf(),
        };
        let snapshots = std::iter::once(session.snapshot())
            .chain(session.undo_history().iter().map(|entry| &entry.snapshot))
            .chain(session.redo_history().iter().map(|entry| &entry.snapshot));
        let payload_ids = snapshots
            .flat_map(snapshot_project_blob_ids)
            .collect::<BTreeSet<_>>();
        for id in payload_ids {
            let bytes = self.read_blob(&id)?;
            let copied = target.put_blob(&bytes)?;
            debug_assert_eq!(copied, id);
        }
        let outcome = target.checkpoint_session(
            session,
            &serde_json::json!({
                "method": "project.save-as",
            }),
        )?;
        self.copy_paint_resources_to(&target)?;

        if destination.try_exists()? {
            return Err(StoreError::ProjectDestinationExists(destination));
        }
        fs::rename(staging.path(), &destination)?;
        Ok(outcome)
    }
}

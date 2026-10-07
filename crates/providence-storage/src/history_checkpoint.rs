//! History may reuse verified portable segments, never an unchecked cache identity.

use crate::snapshot_segments::segment_matches;
use crate::{blob_store::sha256, session_history::decompress_local_session_snapshot};
use std::fs;

use providence_core::{
    model::{ProjectSnapshot, SNAPSHOT_FORMAT_VERSION},
    session::{EditorSession, SESSION_HISTORY_ENTRY_LIMIT},
};

use super::{
    LOCAL_SESSION_FORMAT_VERSION, PortableSnapshotManifest, ProjectStore, StoreError,
    StoredSessionManifest,
};

#[cfg(test)]
mod tests;

impl ProjectStore {
    pub(super) fn prepare_history_snapshot(
        &self,
        session: &EditorSession,
        method: &str,
    ) -> Result<Option<(Vec<u8>, String)>, StoreError> {
        if !matches!(method, "history.undo" | "history.redo") {
            return Ok(None);
        }
        let Some(previous) = self.current_session_manifest() else {
            return Ok(None);
        };
        if !transition_matches(&previous, session, method) {
            return Ok(None);
        }
        let current = match fs::read(self.snapshot_path()) {
            Ok(bytes) if sha256(&bytes) == previous.snapshot_sha256 => bytes,
            _ => return Ok(None),
        };
        if self.portable_snapshot_manifest(&current)?.is_none() {
            return Ok(None);
        }
        let entries = if method == "history.undo" {
            &previous.undo
        } else {
            &previous.redo
        };
        let entry = entries
            .last()
            .expect("transition checks a nonempty history");
        // Local history is rebuildable. Missing or unreadable optimization metadata falls back
        // to the canonical in-memory state; referenced authored blobs are still checked below.
        let Some(bytes) = self
            .read_local_session_blob(&entry.snapshot)
            .ok()
            .and_then(|stored| decompress_local_session_snapshot(&stored).ok())
        else {
            return Ok(None);
        };
        let Some(manifest) = self.portable_snapshot_manifest(&bytes).ok().flatten() else {
            return Ok(None);
        };
        if manifest.snapshot_format_version != SNAPSHOT_FORMAT_VERSION
            || !self.history_segments_match(&manifest, session.snapshot())?
        {
            return Ok(None);
        }
        self.validate_asset_blobs(session.snapshot())?;
        self.validate_source_blobs(session.snapshot())?;
        let digest = sha256(&bytes);
        Ok(Some((bytes, digest)))
    }

    fn history_segments_match(
        &self,
        manifest: &PortableSnapshotManifest,
        snapshot: &ProjectSnapshot,
    ) -> Result<bool, StoreError> {
        for (name, id) in &manifest.segments {
            let bytes = self.read_blob(id)?;
            if !segment_matches(name, &bytes, snapshot)? {
                return Ok(false);
            }
        }
        Ok(true)
    }
}

fn transition_matches(
    previous: &StoredSessionManifest,
    session: &EditorSession,
    method: &str,
) -> bool {
    if previous.format_version != LOCAL_SESSION_FORMAT_VERSION
        || previous.revision.0.checked_add(1) != Some(session.revision().0)
    {
        return false;
    }
    let (before, opposite, after, new_opposite) = if method == "history.undo" {
        (
            &previous.undo,
            &previous.redo,
            session.undo_history(),
            session.redo_history(),
        )
    } else {
        (
            &previous.redo,
            &previous.undo,
            session.redo_history(),
            session.undo_history(),
        )
    };
    !before.is_empty()
        && after.len() == before.len() - 1
        && new_opposite.len() == (opposite.len() + 1).min(SESSION_HISTORY_ENTRY_LIMIT)
        && before.last().map(|entry| &entry.changed_entities)
            == new_opposite.last().map(|entry| &entry.changed_entities)
        && before.last().map(|entry| entry.references_unchanged)
            == new_opposite.last().map(|entry| entry.references_unchanged)
}

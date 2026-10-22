//! Durable acknowledgement prepares every blob before replacing portable authored truth.

use std::{collections::BTreeMap, fs};

use crate::{
    atomic_file::atomic_write,
    blob_store::sha256,
    snapshot_segments::{encode_segment, segment_equal},
};
use providence_core::{
    model::{BlobId, ProjectSnapshot, SNAPSHOT_FORMAT_VERSION},
    session::{EditorSession, Revision},
};
use serde_json::Value;

use super::{
    CheckpointOutcome, PORTABLE_SNAPSHOT_FORMAT_VERSION, PORTABLE_SNAPSHOT_KIND,
    PROJECT_BLOB_PRUNE_INTERVAL, PortableSnapshotManifest, ProjectStore, SNAPSHOT_SEGMENTS,
    StoreError,
};

/// The normalized snapshot a session checkpoint last wrote, keyed by that manifest's digest.
#[derive(Debug)]
pub(super) struct CheckpointBase {
    snapshot_sha256: String,
    snapshot: ProjectSnapshot,
    segments: BTreeMap<String, BlobId>,
}

impl ProjectStore {
    pub(super) fn prepare_full_snapshot(
        &self,
        snapshot: &ProjectSnapshot,
    ) -> Result<(Vec<u8>, String), StoreError> {
        let prepared = self.prepare_snapshot(snapshot, None, &mut BTreeMap::new())?;
        Ok((prepared.0, prepared.1))
    }

    // A session checkpoint re-encodes exactly the segments whose normalized value differs from
    // the snapshot it last wrote, so it produces the same bytes as a full checkpoint. The base
    // applies only while the durable manifest is still the one it wrote.
    pub(super) fn prepare_session_snapshot(
        &self,
        snapshot: &ProjectSnapshot,
    ) -> Result<(Vec<u8>, String, CheckpointBase), StoreError> {
        let current = fs::read(self.snapshot_path())
            .ok()
            .map(|bytes| sha256(&bytes));
        let base = self
            .checkpoint_base
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .take()
            .filter(|base| current.as_deref() == Some(base.snapshot_sha256.as_str()));
        let mut lengths = self.verified_blob_lengths();
        let prepared = self.prepare_snapshot(snapshot, base.as_ref(), &mut lengths)?;
        *self
            .verified_blob_lengths
            .lock()
            .unwrap_or_else(|error| error.into_inner()) = lengths;
        Ok(prepared)
    }

    fn prepare_snapshot(
        &self,
        snapshot: &ProjectSnapshot,
        base: Option<&CheckpointBase>,
        lengths: &mut BTreeMap<BlobId, u64>,
    ) -> Result<(Vec<u8>, String, CheckpointBase), StoreError> {
        if snapshot.format_version != SNAPSHOT_FORMAT_VERSION {
            return Err(StoreError::Snapshot(
                providence_core::snapshot::SnapshotError::UnsupportedVersion(
                    snapshot.format_version,
                ),
            ));
        }
        fs::create_dir_all(&self.root)?;
        self.validate_asset_blobs_cached(snapshot, lengths)?;
        self.validate_source_blobs_cached(snapshot, lengths)?;
        let mut normalized = snapshot.clone();
        normalized.normalize();
        providence_core::snapshot::authoring_metadata::validate(&normalized)?;
        let mut segments = BTreeMap::new();
        for name in SNAPSHOT_SEGMENTS {
            let reused = match base {
                Some(base) if segment_equal(name, &normalized, &base.snapshot)? => base
                    .segments
                    .get(*name)
                    .filter(|id| self.blob_path(id).is_ok_and(|path| path.is_file()))
                    .cloned(),
                _ => None,
            };
            let id = match reused {
                Some(id) => id,
                None => self.put_blob(&encode_segment(name, &normalized)?)?,
            };
            segments.insert((*name).to_string(), id);
        }
        let (bytes, digest) = self.encode_portable_snapshot_manifest(segments.clone())?;
        let base = CheckpointBase {
            snapshot_sha256: digest.clone(),
            snapshot: normalized,
            segments,
        };
        Ok((bytes, digest, base))
    }

    // Blobs are content-addressed and only project-blob pruning deletes them, so a length
    // verified earlier stays valid while its file exists; pruning clears the cache.
    fn verified_blob_lengths(&self) -> BTreeMap<BlobId, u64> {
        let mut lengths = self
            .verified_blob_lengths
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .clone();
        lengths.retain(|id, _| self.blob_path(id).is_ok_and(|path| path.is_file()));
        lengths
    }

    fn remember_checkpoint_base(&self, base: Option<CheckpointBase>) {
        *self
            .checkpoint_base
            .lock()
            .unwrap_or_else(|error| error.into_inner()) = base;
    }

    pub(super) fn forget_verified_blob_lengths(&self) {
        self.verified_blob_lengths
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .clear();
    }

    pub(super) fn encode_portable_snapshot_manifest(
        &self,
        segments: BTreeMap<String, BlobId>,
    ) -> Result<(Vec<u8>, String), StoreError> {
        let manifest = PortableSnapshotManifest {
            kind: PORTABLE_SNAPSHOT_KIND.into(),
            format_version: PORTABLE_SNAPSHOT_FORMAT_VERSION,
            snapshot_format_version: SNAPSHOT_FORMAT_VERSION,
            segments,
        };
        let bytes = serde_json::to_vec_pretty(&manifest)?;
        let digest = sha256(&bytes);
        Ok((bytes, digest))
    }

    pub fn checkpoint(
        &self,
        snapshot: &ProjectSnapshot,
        revision: Revision,
        command: &Value,
    ) -> Result<CheckpointOutcome, StoreError> {
        let _writer = self.writer_lease()?;
        let snapshot_sha256 = self.write_snapshot(snapshot)?;
        let infrastructure_warning = self
            .update_infrastructure(snapshot, revision, command, &snapshot_sha256, None)
            .err()
            .map(|error| error.to_string());
        Ok(CheckpointOutcome {
            snapshot_sha256,
            session_state_blob: None,
            infrastructure_warning,
            history_snapshot_reused: false,
        })
    }

    // Undo and redo reuse a portable history snapshot and leave no base; every other
    // checkpoint compares against the base its predecessor wrote.
    fn prepare_checkpoint_snapshot(
        &self,
        session: &EditorSession,
        method: &str,
    ) -> Result<(Vec<u8>, String, Option<CheckpointBase>), StoreError> {
        if let Some((bytes, digest)) = self.prepare_history_snapshot(session, method)? {
            return Ok((bytes, digest, None));
        }
        let (bytes, digest, base) = self.prepare_session_snapshot(session.snapshot())?;
        Ok((bytes, digest, Some(base)))
    }

    pub fn checkpoint_session(
        &self,
        session: &EditorSession,
        command: &Value,
    ) -> Result<CheckpointOutcome, StoreError> {
        let _writer = self.writer_lease()?;
        let method = command
            .get("method")
            .and_then(Value::as_str)
            .unwrap_or_default();
        if method == "project.save"
            && let Some(outcome) = self.reuse_durable_checkpoint(session)?
        {
            return Ok(outcome);
        }
        let (snapshot_bytes, snapshot_sha256, base) =
            self.prepare_checkpoint_snapshot(session, method)?;
        let history_snapshot_reused = base.is_none();
        let (state_blob, retained_local_blobs) =
            match self.store_incremental_session(session, command, &snapshot_sha256)? {
                Some(stored) => stored,
                None => self.store_segmented_session(session, &snapshot_sha256, &snapshot_bytes)?,
            };
        self.backup_pre_selection_snapshot()?;
        atomic_write(&self.snapshot_path(), &snapshot_bytes)?;
        self.remember_checkpoint_base(base);
        let infrastructure_warning = self
            .update_session_infrastructure(
                session.snapshot(),
                session.revision(),
                command,
                &snapshot_sha256,
                Some(&state_blob),
            )
            .and_then(|_| self.prune_local_session_blobs(&retained_local_blobs))
            .and_then(|_| {
                if session
                    .revision()
                    .0
                    .is_multiple_of(PROJECT_BLOB_PRUNE_INTERVAL)
                {
                    self.prune_project_blobs(session, &snapshot_bytes, &state_blob)
                } else {
                    Ok(())
                }
            })
            .err()
            .map(|error| error.to_string());
        if infrastructure_warning.is_none() {
            self.remember_checkpoint(session, &snapshot_sha256, state_blob.clone());
        }
        Ok(CheckpointOutcome {
            snapshot_sha256,
            session_state_blob: Some(state_blob),
            infrastructure_warning,
            history_snapshot_reused,
        })
    }
}

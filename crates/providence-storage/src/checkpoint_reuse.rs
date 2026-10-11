//! Reuse is proved against typed session truth and hash-verified durable bytes.

use std::{collections::BTreeMap, fs};

use crate::{
    CheckpointOutcome, LOCAL_SESSION_FORMAT_VERSION, ProjectStore, StoreError,
    blob_store::sha256,
    session_history::decompress_local_session_snapshot,
    snapshot_segments::{segment_equal, segment_matches},
};
use providence_core::{
    model::{BlobId, ProjectSnapshot, SNAPSHOT_FORMAT_VERSION},
    session::EditorSession,
};

#[derive(Debug)]
pub(super) struct VerifiedCheckpoint {
    identity: (u64, providence_core::session::Revision),
    digest: String,
    history: BlobId,
}

impl ProjectStore {
    pub(super) fn remember_checkpoint(
        &self,
        session: &EditorSession,
        digest: &str,
        history: BlobId,
    ) {
        *self
            .checkpoint
            .lock()
            .unwrap_or_else(|error| error.into_inner()) = Some(VerifiedCheckpoint {
            identity: session.checkpoint_identity(),
            digest: digest.into(),
            history,
        });
    }
    pub(super) fn reuse_durable_checkpoint(
        &self,
        session: &EditorSession,
    ) -> Result<Option<CheckpointOutcome>, StoreError> {
        let Some(previous) = self.current_session_manifest() else {
            return Ok(None);
        };
        if previous.format_version != LOCAL_SESSION_FORMAT_VERSION
            || previous.revision != session.revision()
            || previous.undo.len() != session.undo_history().len()
            || previous.redo.len() != session.redo_history().len()
        {
            return Ok(None);
        }
        let current = fs::read(self.snapshot_path())?;
        if sha256(&current) != previous.snapshot_sha256 {
            return Ok(None);
        }
        let acknowledged = self.checkpoint_acknowledged(session, &previous);
        let Some(manifest) = self.portable_snapshot_manifest(&current)? else {
            return Ok(None);
        };
        if manifest.snapshot_format_version != SNAPSHOT_FORMAT_VERSION {
            return Ok(None);
        }
        let mut verified = BTreeMap::new();
        for (name, id) in &manifest.segments {
            let bytes = self.read_blob(id)?;
            if !acknowledged && !segment_matches(name, &bytes, session.snapshot())? {
                return Ok(None);
            }
            verified.insert(id.clone(), bytes);
        }
        let mut lengths = BTreeMap::new();
        self.verify_checkpoint_payloads(session.snapshot(), &mut lengths)?;
        if !self.verify_reused_history(
            session,
            &previous,
            &manifest,
            acknowledged,
            &mut verified,
            &mut lengths,
        )? {
            return Ok(None);
        }
        let (state_blob, _) = self.store_session_manifest(&previous)?;
        Ok(Some(CheckpointOutcome {
            snapshot_sha256: previous.snapshot_sha256,
            session_state_blob: Some(state_blob),
            infrastructure_warning: None,
            history_snapshot_reused: true,
        }))
    }

    fn checkpoint_acknowledged(
        &self,
        session: &EditorSession,
        previous: &crate::StoredSessionManifest,
    ) -> bool {
        self.checkpoint
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .as_ref()
            .is_some_and(|checkpoint| {
                checkpoint.identity == session.checkpoint_identity()
                    && checkpoint.digest == previous.snapshot_sha256
                    && checkpoint.history.0
                        == format!(
                            "sha256:{}",
                            sha256(
                                &serde_json::to_vec(&previous)
                                    .expect("session manifest serialization")
                            )
                        )
            })
    }

    fn verify_reused_history(
        &self,
        session: &EditorSession,
        previous: &crate::StoredSessionManifest,
        manifest: &crate::PortableSnapshotManifest,
        acknowledged: bool,
        verified: &mut BTreeMap<BlobId, Vec<u8>>,
        lengths: &mut BTreeMap<BlobId, u64>,
    ) -> Result<bool, StoreError> {
        for (stored, entry) in previous
            .undo
            .iter()
            .chain(&previous.redo)
            .zip(session.undo_history().iter().chain(session.redo_history()))
        {
            if stored.changed_entities != entry.changed_entities
                || stored.references_unchanged != entry.references_unchanged
            {
                return Ok(false);
            }
            let bytes = decompress_local_session_snapshot(
                &self.read_local_session_blob(&stored.snapshot)?,
            )?;
            let Some(historical) = self.portable_snapshot_manifest(&bytes)? else {
                return Ok(false);
            };
            if historical.snapshot_format_version != SNAPSHOT_FORMAT_VERSION {
                return Ok(false);
            }
            for (name, id) in &historical.segments {
                if !verified.contains_key(id) {
                    verified.insert(id.clone(), self.read_blob(id)?);
                }
                let unchanged = manifest.segments.get(name) == Some(id)
                    && segment_equal(name, session.snapshot(), &entry.snapshot)?;
                if !acknowledged
                    && !unchanged
                    && !segment_matches(name, &verified[id], &entry.snapshot)?
                {
                    return Ok(false);
                }
            }
            self.verify_checkpoint_payloads(&entry.snapshot, lengths)?;
        }
        Ok(true)
    }

    fn verify_checkpoint_payloads(
        &self,
        snapshot: &ProjectSnapshot,
        lengths: &mut BTreeMap<BlobId, u64>,
    ) -> Result<(), StoreError> {
        self.validate_asset_blobs_cached(snapshot, lengths)?;
        self.validate_source_blobs_cached(snapshot, lengths)
    }
}

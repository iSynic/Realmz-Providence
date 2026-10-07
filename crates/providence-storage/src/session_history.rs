use crate::LEGACY_LOCAL_SESSION_FORMAT_VERSION;
use crate::LOCAL_DIRECTORY;
use crate::LOCAL_SESSION_DIRECTORY;
use crate::LOCAL_SESSION_FORMAT_VERSION;
use crate::MAX_LOCAL_SESSION_SNAPSHOT_BYTES;
use crate::PortableSnapshotManifest;
use crate::ProjectStore;
use crate::StoredSessionHistoryEntry;
use crate::StoredSessionManifest;
use crate::blob_store::put_content_addressed_blob;
use crate::blob_store::read_content_addressed_blob;
use crate::blob_store::sha256;
use crate::database::create_schema;
use crate::errors::StoreError;
use flate2::Compression;
use flate2::read::ZlibDecoder;
use flate2::write::ZlibEncoder;
use providence_core::model::BlobId;
use providence_core::model::ProjectSnapshot;
use providence_core::session::EditorSession;
use providence_core::session::PersistedSessionState;
use providence_core::session::SESSION_HISTORY_ENTRY_LIMIT;
use providence_core::session::SessionHistoryEntry;
use rusqlite::OptionalExtension;
use serde_json::Value;
use std::collections::BTreeSet;
use std::fs;
use std::io::Read;
use std::io::Write;
use std::path::PathBuf;

impl ProjectStore {
    pub(super) fn store_segmented_session(
        &self,
        session: &EditorSession,
        snapshot_sha256: &str,
        snapshot_bytes: &[u8],
    ) -> Result<(BlobId, BTreeSet<BlobId>), StoreError> {
        let base_manifest = self
            .portable_snapshot_manifest(snapshot_bytes)?
            .ok_or_else(|| {
                StoreError::InvalidPortableSnapshot(
                    "prepared session snapshot must be segmented".into(),
                )
            })?;
        let undo =
            self.store_history_entries(session.undo_history(), session.snapshot(), &base_manifest)?;
        let redo =
            self.store_history_entries(session.redo_history(), session.snapshot(), &base_manifest)?;
        let manifest = StoredSessionManifest {
            format_version: LOCAL_SESSION_FORMAT_VERSION,
            snapshot_sha256: snapshot_sha256.to_string(),
            revision: session.revision(),
            undo,
            redo,
        };
        self.store_session_manifest(&manifest)
    }

    pub(super) fn store_incremental_session(
        &self,
        session: &EditorSession,
        command: &Value,
        snapshot_sha256: &str,
    ) -> Result<Option<(BlobId, BTreeSet<BlobId>)>, StoreError> {
        let Some(previous) = self.current_session_manifest() else {
            return Ok(None);
        };
        if previous.format_version != LOCAL_SESSION_FORMAT_VERSION
            || previous.revision.0.checked_add(1) != Some(session.revision().0)
        {
            return Ok(None);
        }
        let previous_snapshot = match fs::read(self.snapshot_path()) {
            Ok(bytes) if sha256(&bytes) == previous.snapshot_sha256 => bytes,
            _ => return Ok(None),
        };
        let previous_snapshot_blob =
            self.put_local_session_blob(&compress_local_session_snapshot(&previous_snapshot)?)?;
        let method = command
            .get("method")
            .and_then(Value::as_str)
            .unwrap_or_default();
        let mut undo = previous.undo;
        let mut redo = previous.redo;
        let transition_valid = match method {
            "history.undo" => transfer_history_checkpoint(
                &mut undo,
                &mut redo,
                session.undo_history(),
                session.redo_history(),
                previous_snapshot_blob,
            ),
            "history.redo" => transfer_history_checkpoint(
                &mut redo,
                &mut undo,
                session.redo_history(),
                session.undo_history(),
                previous_snapshot_blob,
            ),
            _ => append_edit_checkpoint(&mut undo, &mut redo, session, previous_snapshot_blob),
        };
        if !transition_valid {
            return Ok(None);
        }
        let manifest = StoredSessionManifest {
            format_version: LOCAL_SESSION_FORMAT_VERSION,
            snapshot_sha256: snapshot_sha256.to_string(),
            revision: session.revision(),
            undo,
            redo,
        };
        self.store_session_manifest(&manifest).map(Some)
    }

    pub(super) fn current_session_manifest(&self) -> Option<StoredSessionManifest> {
        let connection = self.open_database().ok()?;
        create_schema(&connection).ok()?;
        let state_blob = connection
            .query_row(
                "SELECT value FROM metadata WHERE key = 'session_state_blob'",
                [],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .ok()??;
        let bytes = self.read_local_session_blob(&BlobId(state_blob)).ok()?;
        serde_json::from_slice(&bytes).ok()
    }

    pub(super) fn store_session_manifest(
        &self,
        manifest: &StoredSessionManifest,
    ) -> Result<(BlobId, BTreeSet<BlobId>), StoreError> {
        let manifest_bytes = serde_json::to_vec(manifest)?;
        let manifest_blob = self.put_local_session_blob(&manifest_bytes)?;
        let retained = std::iter::once(manifest_blob.clone())
            .chain(
                manifest
                    .undo
                    .iter()
                    .chain(&manifest.redo)
                    .map(|entry| entry.snapshot.clone()),
            )
            .collect();
        Ok((manifest_blob, retained))
    }

    pub(super) fn store_history_entries(
        &self,
        entries: &[SessionHistoryEntry],
        base: &ProjectSnapshot,
        base_manifest: &PortableSnapshotManifest,
    ) -> Result<Vec<StoredSessionHistoryEntry>, StoreError> {
        entries
            .iter()
            .map(|entry| {
                let snapshot = self.prepare_history_entry(&entry.snapshot, base, base_manifest)?;
                let compressed = compress_local_session_snapshot(&snapshot)?;
                Ok(StoredSessionHistoryEntry {
                    snapshot: self.put_local_session_blob(&compressed)?,
                    changed_entities: entry.changed_entities.clone(),
                    references_unchanged: entry.references_unchanged,
                })
            })
            .collect()
    }

    pub(super) fn load_persisted_session(
        &self,
        id: &BlobId,
        snapshot: &ProjectSnapshot,
    ) -> Result<PersistedSessionState, StoreError> {
        if let Ok(bytes) = self.read_local_session_blob(id) {
            let manifest = serde_json::from_slice::<StoredSessionManifest>(&bytes)?;
            let portable_snapshot = fs::read(self.snapshot_path())?;
            let portable_snapshot_sha256 = sha256(&portable_snapshot);
            if !matches!(
                manifest.format_version,
                LEGACY_LOCAL_SESSION_FORMAT_VERSION | LOCAL_SESSION_FORMAT_VERSION
            ) || manifest.snapshot_sha256 != portable_snapshot_sha256
                || manifest.undo.len() > SESSION_HISTORY_ENTRY_LIMIT
                || manifest.redo.len() > SESSION_HISTORY_ENTRY_LIMIT
            {
                return Err(StoreError::InvalidLocalSession(
                    "manifest version, snapshot hash, or history bound is invalid".into(),
                ));
            }
            let base_manifest = self.portable_snapshot_manifest(&portable_snapshot)?;
            return Ok(PersistedSessionState {
                snapshot: snapshot.clone(),
                revision: manifest.revision,
                undo: self.load_history_entries(
                    &manifest.undo,
                    manifest.format_version,
                    snapshot,
                    base_manifest.as_ref(),
                )?,
                redo: self.load_history_entries(
                    &manifest.redo,
                    manifest.format_version,
                    snapshot,
                    base_manifest.as_ref(),
                )?,
            });
        }
        let bytes = self.read_blob(id)?;
        Ok(serde_json::from_slice::<PersistedSessionState>(&bytes)?)
    }

    pub(super) fn load_history_entries(
        &self,
        entries: &[StoredSessionHistoryEntry],
        format_version: u32,
        base_snapshot: &ProjectSnapshot,
        base_manifest: Option<&PortableSnapshotManifest>,
    ) -> Result<Vec<SessionHistoryEntry>, StoreError> {
        entries
            .iter()
            .map(|entry| {
                let stored = self.read_local_session_blob(&entry.snapshot)?;
                let bytes = if format_version == LEGACY_LOCAL_SESSION_FORMAT_VERSION {
                    stored
                } else {
                    decompress_local_session_snapshot(&stored)?
                };
                let snapshot = match (base_manifest, self.portable_snapshot_manifest(&bytes)?) {
                    (Some(base_manifest), Some(manifest)) => self
                        .load_segmented_snapshot_from_base(
                            &manifest,
                            base_manifest,
                            base_snapshot,
                        )?,
                    _ => self.load_snapshot_document(&bytes)?,
                };
                Ok(SessionHistoryEntry {
                    snapshot,
                    changed_entities: entry.changed_entities.clone(),
                    references_unchanged: entry.references_unchanged,
                })
            })
            .collect()
    }

    pub(super) fn put_local_session_blob(&self, bytes: &[u8]) -> Result<BlobId, StoreError> {
        put_content_addressed_blob(&self.local_session_root(), bytes)
    }

    pub(super) fn read_local_session_blob(&self, id: &BlobId) -> Result<Vec<u8>, StoreError> {
        read_content_addressed_blob(&self.local_session_root(), id)
    }

    pub(super) fn local_session_root(&self) -> PathBuf {
        self.root
            .join(LOCAL_DIRECTORY)
            .join(LOCAL_SESSION_DIRECTORY)
    }
}

pub(super) fn compress_local_session_snapshot(bytes: &[u8]) -> Result<Vec<u8>, StoreError> {
    let mut encoder = ZlibEncoder::new(Vec::new(), Compression::fast());
    encoder.write_all(bytes)?;
    Ok(encoder.finish()?)
}

pub(super) fn push_stored_history(
    history: &mut Vec<StoredSessionHistoryEntry>,
    entry: StoredSessionHistoryEntry,
) {
    history.push(entry);
    let excess = history.len().saturating_sub(SESSION_HISTORY_ENTRY_LIMIT);
    if excess > 0 {
        history.drain(..excess);
    }
}

pub(super) fn decompress_local_session_snapshot(bytes: &[u8]) -> Result<Vec<u8>, StoreError> {
    let mut decoder = ZlibDecoder::new(bytes).take(MAX_LOCAL_SESSION_SNAPSHOT_BYTES + 1);
    let mut decoded = Vec::new();
    decoder.read_to_end(&mut decoded)?;
    if decoded.len() as u64 > MAX_LOCAL_SESSION_SNAPSHOT_BYTES {
        return Err(StoreError::InvalidLocalSession(format!(
            "history segment exceeds the {} byte decoded limit",
            MAX_LOCAL_SESSION_SNAPSHOT_BYTES
        )));
    }
    Ok(decoded)
}

fn transfer_history_checkpoint(
    source: &mut Vec<StoredSessionHistoryEntry>,
    destination: &mut Vec<StoredSessionHistoryEntry>,
    current_source: &[SessionHistoryEntry],
    current_destination: &[SessionHistoryEntry],
    previous_snapshot: BlobId,
) -> bool {
    if source.is_empty()
        || current_source.len() != source.len() - 1
        || current_destination.len() != (destination.len() + 1).min(SESSION_HISTORY_ENTRY_LIMIT)
    {
        return false;
    }
    source.pop();
    let Some(entry) = current_destination.last() else {
        return false;
    };
    push_stored_history(
        destination,
        StoredSessionHistoryEntry {
            snapshot: previous_snapshot,
            changed_entities: entry.changed_entities.clone(),
            references_unchanged: entry.references_unchanged,
        },
    );
    true
}

fn append_edit_checkpoint(
    undo: &mut Vec<StoredSessionHistoryEntry>,
    redo: &mut Vec<StoredSessionHistoryEntry>,
    session: &EditorSession,
    previous_snapshot: BlobId,
) -> bool {
    if session.undo_history().len() != (undo.len() + 1).min(SESSION_HISTORY_ENTRY_LIMIT)
        || !session.redo_history().is_empty()
    {
        return false;
    }
    let Some(entry) = session.undo_history().last() else {
        return false;
    };
    push_stored_history(
        undo,
        StoredSessionHistoryEntry {
            snapshot: previous_snapshot,
            changed_entities: entry.changed_entities.clone(),
            references_unchanged: entry.references_unchanged,
        },
    );
    redo.clear();
    true
}

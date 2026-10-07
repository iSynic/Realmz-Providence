use crate::BLOB_ALGORITHM;
use crate::LEGACY_LOCAL_SESSION_FORMAT_VERSION;
use crate::LOCAL_SESSION_FORMAT_VERSION;
use crate::ProjectStore;
use crate::StoredSessionManifest;
use crate::errors::StoreError;
use crate::session_history::decompress_local_session_snapshot;
use providence_core::model::BlobId;
use providence_core::model::ProjectSnapshot;
use providence_core::session::EditorSession;
use std::collections::BTreeSet;
use std::fs;

impl ProjectStore {
    pub(super) fn prune_local_session_blobs(
        &self,
        retained: &BTreeSet<BlobId>,
    ) -> Result<(), StoreError> {
        let directory = self.local_session_root().join("blobs").join(BLOB_ALGORITHM);
        if !directory.is_dir() {
            return Ok(());
        }
        for entry in fs::read_dir(directory)? {
            let entry = entry?;
            if !entry.file_type()?.is_file() {
                continue;
            }
            let digest = entry.file_name().to_string_lossy().into_owned();
            let id = BlobId(format!("{BLOB_ALGORITHM}:{digest}"));
            if !retained.contains(&id) {
                fs::remove_file(entry.path())?;
            }
        }
        Ok(())
    }

    pub(super) fn prune_project_blobs(
        &self,
        session: &EditorSession,
        current_root: &[u8],
        state_blob: &BlobId,
    ) -> Result<(), StoreError> {
        let retained = self.retained_project_blob_ids(session, current_root, state_blob)?;
        let directory = self.root.join("blobs").join(BLOB_ALGORITHM);
        if !directory.is_dir() {
            return Ok(());
        }
        for entry in fs::read_dir(directory)? {
            let entry = entry?;
            if !entry.file_type()?.is_file() {
                continue;
            }
            let digest = entry.file_name().to_string_lossy().into_owned();
            if digest.len() != 64 || !digest.bytes().all(|byte| byte.is_ascii_hexdigit()) {
                continue;
            }
            let id = BlobId(format!("{BLOB_ALGORITHM}:{digest}"));
            if !retained.contains(&id) {
                fs::remove_file(entry.path())?;
            }
        }
        Ok(())
    }

    fn retained_project_blob_ids(
        &self,
        session: &EditorSession,
        current_root: &[u8],
        state_blob: &BlobId,
    ) -> Result<BTreeSet<BlobId>, StoreError> {
        let state_bytes = self.read_local_session_blob(state_blob)?;
        let manifest = serde_json::from_slice::<StoredSessionManifest>(&state_bytes)?;
        if !matches!(
            manifest.format_version,
            LEGACY_LOCAL_SESSION_FORMAT_VERSION | LOCAL_SESSION_FORMAT_VERSION
        ) {
            return Err(StoreError::InvalidLocalSession(format!(
                "cannot prune project blobs from local session format {}",
                manifest.format_version
            )));
        }

        let mut retained = snapshot_project_blob_ids(session.snapshot());
        for entry in session.undo_history().iter().chain(session.redo_history()) {
            retained.extend(snapshot_project_blob_ids(&entry.snapshot));
        }
        self.retain_portable_root_segments(current_root, &mut retained)?;
        let backup = self.root.join("snapshot-v35-backup.json");
        if backup.is_file() {
            let bytes = fs::read(backup)?;
            self.retain_portable_root_segments(&bytes, &mut retained)?;
            retained.extend(snapshot_project_blob_ids(
                &self.load_snapshot_document(&bytes)?,
            ));
        }
        for entry in manifest.undo.iter().chain(&manifest.redo) {
            let stored = self.read_local_session_blob(&entry.snapshot)?;
            let root = if manifest.format_version == LEGACY_LOCAL_SESSION_FORMAT_VERSION {
                stored
            } else {
                decompress_local_session_snapshot(&stored)?
            };
            self.retain_portable_root_segments(&root, &mut retained)?;
        }

        Ok(retained)
    }

    pub(super) fn retain_portable_root_segments(
        &self,
        root: &[u8],
        retained: &mut BTreeSet<BlobId>,
    ) -> Result<(), StoreError> {
        if let Some(manifest) = self.portable_snapshot_manifest(root)? {
            for id in manifest.segments.into_values() {
                self.blob_path(&id)?;
                retained.insert(id);
            }
        }
        Ok(())
    }
}

pub(super) fn snapshot_project_blob_ids(snapshot: &ProjectSnapshot) -> BTreeSet<BlobId> {
    let mut ids = snapshot
        .assets
        .iter()
        .flat_map(|asset| std::iter::once(&asset.blob).chain(asset.classic_payload_blob.iter()))
        .chain(snapshot.classic_sources.iter().map(|source| &source.blob))
        .chain(
            snapshot
                .terrain_catalog
                .iter()
                .filter_map(|profile| profile.source_blob.as_ref()),
        )
        .chain(
            snapshot
                .landlook_catalogs
                .iter()
                .map(|catalog| &catalog.source_blob),
        )
        .chain(
            snapshot
                .world
                .maps
                .iter()
                .filter_map(|map| map.runtime.as_ref()?.source_blob.as_ref()),
        )
        .chain(
            snapshot
                .world
                .special_land_solidity
                .iter()
                .map(|catalog| &catalog.source_blob),
        )
        .cloned()
        .collect::<BTreeSet<_>>();
    ids.extend(rule_source_blob_ids(snapshot));
    if let Some(context) = &snapshot.classic_rule_selection {
        ids.extend(context.witness_blobs().into_iter().cloned());
    }
    if let providence_core::model::ProjectOrigin::Imported {
        compatibility_annex,
    } = &snapshot.origin
    {
        ids.insert(compatibility_annex.clone());
    }
    ids
}

fn rule_source_blob_ids(snapshot: &ProjectSnapshot) -> impl Iterator<Item = BlobId> + '_ {
    std::iter::empty::<&BlobId>()
        .chain(
            snapshot
                .race_rules
                .iter()
                .filter_map(|rule| rule.source_blob.as_ref()),
        )
        .chain(
            snapshot
                .caste_rules
                .iter()
                .filter_map(|rule| rule.source_blob.as_ref()),
        )
        .chain(
            snapshot
                .rule_names
                .iter()
                .map(|catalog| &catalog.source_blob),
        )
        .chain(
            snapshot
                .item_rules
                .iter()
                .flat_map(|rule| [&rule.source_blob, &rule.text_source_blob]),
        )
        .chain(snapshot.scenario_item_rules.iter().flat_map(|rule| {
            std::iter::once(&rule.source_blob).chain(rule.text_source_blob.iter())
        }))
        .chain(snapshot.standard_spells.iter().flat_map(|spell| {
            spell
                .source_blob
                .iter()
                .chain(spell.text_source_blob.iter())
        }))
        .chain(snapshot.scenario_spells.iter().flat_map(|spell| {
            spell
                .source_blob
                .iter()
                .chain(spell.text_source_blob.iter())
        }))
        .chain(
            snapshot
                .player_map_names
                .iter()
                .filter_map(|catalog| catalog.source_blob.as_ref()),
        )
        .cloned()
}

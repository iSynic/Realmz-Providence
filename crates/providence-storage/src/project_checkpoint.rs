//! Durable acknowledgement prepares every blob before replacing portable authored truth.

use std::fs;

use crate::{atomic_file::atomic_write, blob_store::sha256};
use providence_core::{
    model::{BlobId, ProjectSnapshot, SNAPSHOT_FORMAT_VERSION},
    session::{EditorSession, Revision},
    snapshot::to_deterministic_json,
};
use serde_json::Value;

use super::{
    CheckpointOutcome, PORTABLE_SNAPSHOT_FORMAT_VERSION, PORTABLE_SNAPSHOT_KIND,
    PROJECT_BLOB_PRUNE_INTERVAL, PortableSnapshotManifest, ProjectStore, SNAPSHOT_SEGMENTS,
    StoreError,
};

impl ProjectStore {
    pub(super) fn prepare_full_snapshot(
        &self,
        snapshot: &ProjectSnapshot,
    ) -> Result<(Vec<u8>, String), StoreError> {
        fs::create_dir_all(&self.root)?;
        self.validate_asset_blobs(snapshot)?;
        self.validate_source_blobs(snapshot)?;
        let json = to_deterministic_json(snapshot)?;
        let Value::Object(mut fields) = serde_json::from_str(&json)? else {
            return Err(StoreError::InvalidPortableSnapshot(
                "canonical snapshot root is not an object".into(),
            ));
        };
        if fields.len() != SNAPSHOT_SEGMENTS.len()
            || SNAPSHOT_SEGMENTS
                .iter()
                .any(|name| !fields.contains_key(*name))
        {
            return Err(StoreError::InvalidPortableSnapshot(
                "canonical snapshot fields do not match the segment contract".into(),
            ));
        }
        let mut segments = std::collections::BTreeMap::new();
        for name in SNAPSHOT_SEGMENTS {
            let value = fields.remove(*name).expect("segment presence was checked");
            let bytes = serde_json::to_vec(&value)?;
            segments.insert((*name).to_string(), self.put_blob(&bytes)?);
        }
        self.encode_portable_snapshot_manifest(segments)
    }

    pub(super) fn prepare_session_snapshot(
        &self,
        snapshot: &ProjectSnapshot,
        command: &Value,
    ) -> Result<(Vec<u8>, String), StoreError> {
        let current = fs::read(self.snapshot_path()).ok();
        let current_manifest = current
            .as_deref()
            .map(|bytes| self.portable_snapshot_manifest(bytes))
            .transpose()?
            .flatten();
        let method = command
            .get("method")
            .and_then(Value::as_str)
            .unwrap_or_default();
        let Some(mut manifest) = current_manifest else {
            return self.prepare_full_snapshot(snapshot);
        };
        if manifest.snapshot_format_version != SNAPSHOT_FORMAT_VERSION {
            return self.prepare_full_snapshot(snapshot);
        }
        let Some(segment_updates) = session_segment_updates(snapshot, method)? else {
            return self.prepare_full_snapshot(snapshot);
        };
        for segment in segment_updates {
            manifest
                .segments
                .insert(segment.name.to_string(), self.put_blob(&segment.bytes)?);
        }
        self.encode_portable_snapshot_manifest(manifest.segments)
    }

    pub(super) fn encode_portable_snapshot_manifest(
        &self,
        segments: std::collections::BTreeMap<String, BlobId>,
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
        let snapshot_sha256 = self.save_snapshot(snapshot)?;
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

    pub fn checkpoint_session(
        &self,
        session: &EditorSession,
        command: &Value,
    ) -> Result<CheckpointOutcome, StoreError> {
        let method = command
            .get("method")
            .and_then(Value::as_str)
            .unwrap_or_default();
        let historical = self.prepare_history_snapshot(session, method)?;
        let history_snapshot_reused = historical.is_some();
        let (snapshot_bytes, snapshot_sha256) = match historical {
            Some(prepared) => prepared,
            None => self.prepare_session_snapshot(session.snapshot(), command)?,
        };
        let (state_blob, retained_local_blobs) =
            match self.store_incremental_session(session, command, &snapshot_sha256)? {
                Some(stored) => stored,
                None => self.store_segmented_session(session, &snapshot_sha256, &snapshot_bytes)?,
            };
        self.backup_pre_selection_snapshot()?;
        atomic_write(&self.snapshot_path(), &snapshot_bytes)?;
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
        Ok(CheckpointOutcome {
            snapshot_sha256,
            session_state_blob: Some(state_blob),
            infrastructure_warning,
            history_snapshot_reused,
        })
    }
}

#[derive(Clone, Copy)]
enum CheckpointSegment {
    ScenarioSpells,
    Messages,
    World,
    QuestLabels,
    Assets,
    ClassicResourceRemovals,
    MonsterSets,
    MonsterDescriptions,
    Battles,
}

struct PreparedSegment {
    name: &'static str,
    bytes: Vec<u8>,
}

impl CheckpointSegment {
    fn encode(self, snapshot: &ProjectSnapshot) -> Result<PreparedSegment, serde_json::Error> {
        let (name, bytes) = match self {
            Self::ScenarioSpells => (
                "scenarioSpells",
                serde_json::to_vec(&snapshot.scenario_spells)?,
            ),
            Self::Messages => ("messages", serde_json::to_vec(&snapshot.messages)?),
            Self::World => ("world", serde_json::to_vec(&snapshot.world)?),
            Self::QuestLabels => ("questLabels", serde_json::to_vec(&snapshot.quest_labels)?),
            Self::Assets => ("assets", serde_json::to_vec(&snapshot.assets)?),
            Self::ClassicResourceRemovals => (
                "classicResourceRemovals",
                serde_json::to_vec(&snapshot.classic_resource_removals)?,
            ),
            Self::MonsterSets => ("monsterSets", serde_json::to_vec(&snapshot.monster_sets)?),
            Self::MonsterDescriptions => (
                "monsterDescriptions",
                serde_json::to_vec(&snapshot.monster_descriptions)?,
            ),
            Self::Battles => ("battles", serde_json::to_vec(&snapshot.battles)?),
        };
        Ok(PreparedSegment { name, bytes })
    }
}

// This is a conservative serialization allowlist. Unlisted commands retain the full
// checkpoint path; adding a command here requires proving all fields it can change.
fn session_segments(method: &str) -> Option<&'static [CheckpointSegment]> {
    use CheckpointSegment::*;
    Some(match method {
        "spell.draft.apply" | "spell.update" => &[ScenarioSpells],
        "message.update" => &[Messages],
        "map.create" | "map.duplicate" | "map.paint-cells" | "map.paint-terrain"
        | "map.update-cell" => &[World],
        "quest-label.upsert" | "quest-label.delete" => &[QuestLabels],
        "picture.import"
        | "picture.remove"
        | "sound.import"
        | "sound.remove"
        | "icon.import"
        | "icon.remove"
        | "special-land.import"
        | "special-land.remove"
        | "monster-appearance.import-pair"
        | "monster-appearance.materialize-defaults"
        | "monster-appearance.restore-defaults" => &[Assets, ClassicResourceRemovals],
        "monster.update"
        | "monster-reference.retarget"
        | "monster.copy-to-all-sets"
        | "monster.generate-variants" => &[MonsterSets],
        "monster-description.update" | "monster.update-description" => &[MonsterDescriptions],
        "monster.operation.commit" => &[MonsterSets, MonsterDescriptions, Battles],
        "monster.draft.apply"
        | "monster-library.transfer.commit"
        | "monster.create"
        | "monster.duplicate"
        | "monster.clear"
        | "monster.switch-records"
        | "monster-library.copy-to-scenario"
        | "monster-library.copy-to-all-sets"
        | "monster-library.copy-and-generate-variants"
        | "monster-library.populate-scenario"
        | "monster-library.replace-scenario" => &[MonsterSets, MonsterDescriptions],
        "battle-monster-reference.repair" => &[Battles],
        _ => return None,
    })
}

fn session_segment_updates(
    snapshot: &ProjectSnapshot,
    method: &str,
) -> Result<Option<Vec<PreparedSegment>>, StoreError> {
    session_segments(method)
        .map(|segments| {
            segments
                .iter()
                .map(|segment| segment.encode(snapshot))
                .collect::<Result<Vec<_>, _>>()
        })
        .transpose()
        .map_err(StoreError::Json)
}

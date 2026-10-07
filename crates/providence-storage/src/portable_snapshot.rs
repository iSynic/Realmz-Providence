use crate::PORTABLE_SNAPSHOT_FORMAT_VERSION;
use crate::PORTABLE_SNAPSHOT_KIND;
use crate::PRE_CLASSIC_RESOURCE_REMOVALS_SNAPSHOT_FORMAT_VERSION;
use crate::PRE_QUEST_LABEL_SNAPSHOT_FORMAT_VERSION;
use crate::PRE_SCRIPT_DESCRIPTOR_SNAPSHOT_FORMAT_VERSION;
use crate::PRE_STARTUP_AUTHORING_SNAPSHOT_FORMAT_VERSION;
use crate::PortableSnapshotManifest;
use crate::ProjectStore;
use crate::SNAPSHOT_SEGMENTS;
use crate::atomic_file::atomic_write;
use crate::errors::StoreError;
use crate::snapshot_segments::replace_segment;
use providence_core::model::ProjectSnapshot;
use providence_core::model::SNAPSHOT_FORMAT_VERSION;
use providence_core::snapshot::from_json;
use serde_json::Value;
use std::fs;
use std::path::Path;

impl ProjectStore {
    pub fn load_snapshot(&self) -> Result<ProjectSnapshot, StoreError> {
        let path = self.snapshot_path();
        if !path.is_file() {
            return Err(StoreError::MissingSnapshot(path));
        }
        self.load_snapshot_document(&fs::read(path)?)
    }

    pub fn load_snapshot_file(path: impl AsRef<Path>) -> Result<ProjectSnapshot, StoreError> {
        let path = path.as_ref();
        let root = path.parent().ok_or_else(|| {
            StoreError::InvalidPortableSnapshot("snapshot path has no parent directory".into())
        })?;
        let store = Self {
            root: root.to_path_buf(),
        };
        store.load_snapshot_document(&fs::read(path)?)
    }

    pub fn save_snapshot(&self, snapshot: &ProjectSnapshot) -> Result<String, StoreError> {
        let (bytes, digest) = self.prepare_full_snapshot(snapshot)?;
        self.backup_pre_selection_snapshot()?;
        atomic_write(&self.snapshot_path(), &bytes)?;
        Ok(digest)
    }

    pub(super) fn load_snapshot_document(
        &self,
        bytes: &[u8],
    ) -> Result<ProjectSnapshot, StoreError> {
        if let Some(manifest) = self.portable_snapshot_manifest(bytes)? {
            return self.load_segmented_snapshot(&manifest);
        }
        let json = std::str::from_utf8(bytes).map_err(|error| {
            StoreError::InvalidPortableSnapshot(format!("snapshot is not UTF-8 JSON: {error}"))
        })?;
        Ok(from_json(json)?)
    }

    pub(super) fn portable_snapshot_manifest(
        &self,
        bytes: &[u8],
    ) -> Result<Option<PortableSnapshotManifest>, StoreError> {
        let value: Value = serde_json::from_slice(bytes)?;
        if value.get("kind").and_then(Value::as_str) != Some(PORTABLE_SNAPSHOT_KIND) {
            return Ok(None);
        }
        let manifest: PortableSnapshotManifest = serde_json::from_value(value)?;
        if manifest.format_version != PORTABLE_SNAPSHOT_FORMAT_VERSION {
            return Err(StoreError::InvalidPortableSnapshot(format!(
                "unsupported manifest version {}",
                manifest.format_version
            )));
        }
        let omitted_segments = omitted_manifest_segments(&manifest)?;
        let expected_segments = SNAPSHOT_SEGMENTS.len() - omitted_segments.len();
        if manifest.segments.len() != expected_segments
            || SNAPSHOT_SEGMENTS.iter().any(|name| {
                manifest.segments.contains_key(*name) == omitted_segments.contains(name)
            })
        {
            return Err(StoreError::InvalidPortableSnapshot(
                "manifest does not contain the exact canonical segment set".into(),
            ));
        }
        Ok(Some(manifest))
    }

    pub(super) fn load_segmented_snapshot(
        &self,
        manifest: &PortableSnapshotManifest,
    ) -> Result<ProjectSnapshot, StoreError> {
        let mut fields = serde_json::Map::new();
        for name in SNAPSHOT_SEGMENTS {
            let omitted = (*name == "importInterpretationVersion"
                && manifest.snapshot_format_version < 38)
                || (*name == "terrainMappings" && manifest.snapshot_format_version < 37)
                || (*name == "classicRuleSelection" && manifest.snapshot_format_version < 36)
                || (*name == "startupAuthoring"
                    && manifest.snapshot_format_version
                        <= PRE_STARTUP_AUTHORING_SNAPSHOT_FORMAT_VERSION)
                || (*name == "classicResourceRemovals"
                    && manifest.snapshot_format_version
                        <= PRE_CLASSIC_RESOURCE_REMOVALS_SNAPSHOT_FORMAT_VERSION)
                || (*name == "questLabels"
                    && manifest.snapshot_format_version == PRE_QUEST_LABEL_SNAPSHOT_FORMAT_VERSION)
                || (*name == "scriptDescriptors"
                    && manifest.snapshot_format_version
                        <= PRE_SCRIPT_DESCRIPTOR_SNAPSHOT_FORMAT_VERSION);
            if omitted {
                fields.insert(
                    (*name).to_string(),
                    if *name == "importInterpretationVersion" {
                        Value::from(0)
                    } else if matches!(*name, "startupAuthoring" | "classicRuleSelection") {
                        Value::Null
                    } else {
                        Value::Array(Vec::new())
                    },
                );
                continue;
            }
            let id = manifest.segments.get(*name).ok_or_else(|| {
                StoreError::InvalidPortableSnapshot(format!("missing segment {name}"))
            })?;
            let bytes = self.read_blob(id)?;
            let value = serde_json::from_slice(&bytes).map_err(|error| {
                StoreError::InvalidPortableSnapshot(format!(
                    "segment {name} is not valid JSON: {error}"
                ))
            })?;
            fields.insert((*name).to_string(), value);
        }
        let json = serde_json::to_string(&Value::Object(fields))?;
        Ok(from_json(&json)?)
    }

    pub(super) fn load_segmented_snapshot_from_base(
        &self,
        manifest: &PortableSnapshotManifest,
        base_manifest: &PortableSnapshotManifest,
        base_snapshot: &ProjectSnapshot,
    ) -> Result<ProjectSnapshot, StoreError> {
        if manifest.snapshot_format_version != base_manifest.snapshot_format_version {
            return self.load_segmented_snapshot(manifest);
        }

        let mut snapshot = base_snapshot.clone();
        for name in SNAPSHOT_SEGMENTS {
            let id = match (
                manifest.segments.get(*name),
                base_manifest.segments.get(*name),
            ) {
                (None, None) => continue,
                (Some(id), Some(base_id)) if id == base_id => continue,
                (Some(id), Some(_)) => id,
                _ => return self.load_segmented_snapshot(manifest),
            };
            if *name == "formatVersion"
                || (manifest.snapshot_format_version
                    <= PRE_STARTUP_AUTHORING_SNAPSHOT_FORMAT_VERSION
                    && matches!(*name, "campaign" | "classicSources"))
            {
                return self.load_segmented_snapshot(manifest);
            }
            let bytes = self.read_blob(id)?;
            replace_segment(&mut snapshot, name, &bytes)?;
        }
        if snapshot.format_version != SNAPSHOT_FORMAT_VERSION {
            return self.load_segmented_snapshot(manifest);
        }
        snapshot.normalize();
        providence_core::snapshot::authoring_metadata::validate(&snapshot)?;
        Ok(snapshot)
    }
}

fn omitted_manifest_segments(
    manifest: &PortableSnapshotManifest,
) -> Result<&'static [&'static str], StoreError> {
    validate_snapshot_version(manifest.snapshot_format_version)?;
    Ok(match manifest.snapshot_format_version {
        SNAPSHOT_FORMAT_VERSION => &[][..],
        37 => &["importInterpretationVersion"][..],
        36 => &["importInterpretationVersion", "terrainMappings"][..],
        35 => &[
            "importInterpretationVersion",
            "terrainMappings",
            "classicRuleSelection",
        ][..],
        PRE_STARTUP_AUTHORING_SNAPSHOT_FORMAT_VERSION => &[
            "importInterpretationVersion",
            "terrainMappings",
            "classicRuleSelection",
            "startupAuthoring",
        ][..],
        PRE_SCRIPT_DESCRIPTOR_SNAPSHOT_FORMAT_VERSION => &[
            "importInterpretationVersion",
            "terrainMappings",
            "classicRuleSelection",
            "scriptDescriptors",
            "startupAuthoring",
        ][..],
        PRE_CLASSIC_RESOURCE_REMOVALS_SNAPSHOT_FORMAT_VERSION => &[
            "importInterpretationVersion",
            "terrainMappings",
            "classicRuleSelection",
            "classicResourceRemovals",
            "scriptDescriptors",
            "startupAuthoring",
        ][..],
        PRE_QUEST_LABEL_SNAPSHOT_FORMAT_VERSION => &[
            "importInterpretationVersion",
            "terrainMappings",
            "classicRuleSelection",
            "classicResourceRemovals",
            "questLabels",
            "scriptDescriptors",
            "startupAuthoring",
        ][..],
        _ => unreachable!("snapshot version was validated"),
    })
}
fn validate_snapshot_version(version: u32) -> Result<(), StoreError> {
    if !matches!(
        version,
        SNAPSHOT_FORMAT_VERSION
            | 37
            | 36
            | 35
            | PRE_STARTUP_AUTHORING_SNAPSHOT_FORMAT_VERSION
            | PRE_SCRIPT_DESCRIPTOR_SNAPSHOT_FORMAT_VERSION
            | PRE_CLASSIC_RESOURCE_REMOVALS_SNAPSHOT_FORMAT_VERSION
            | PRE_QUEST_LABEL_SNAPSHOT_FORMAT_VERSION
    ) {
        return Err(StoreError::InvalidPortableSnapshot(format!(
            "manifest names snapshot format {}; expected {}, 36, 35, {}, {}, {}, or {}",
            version,
            SNAPSHOT_FORMAT_VERSION,
            PRE_STARTUP_AUTHORING_SNAPSHOT_FORMAT_VERSION,
            PRE_SCRIPT_DESCRIPTOR_SNAPSHOT_FORMAT_VERSION,
            PRE_CLASSIC_RESOURCE_REMOVALS_SNAPSHOT_FORMAT_VERSION,
            PRE_QUEST_LABEL_SNAPSHOT_FORMAT_VERSION
        )));
    }
    Ok(())
}

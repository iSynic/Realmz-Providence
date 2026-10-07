use crate::snapshot_segments::changed_segment_bytes;
use crate::{PortableSnapshotManifest, ProjectStore, SNAPSHOT_SEGMENTS, StoreError};
use providence_core::{
    model::{ProjectSnapshot, SNAPSHOT_FORMAT_VERSION},
    snapshot::SnapshotError,
};

impl ProjectStore {
    pub(super) fn prepare_history_entry(
        &self,
        snapshot: &ProjectSnapshot,
        base: &ProjectSnapshot,
        base_manifest: &PortableSnapshotManifest,
    ) -> Result<Vec<u8>, StoreError> {
        if snapshot.format_version != SNAPSHOT_FORMAT_VERSION {
            return Err(StoreError::Snapshot(SnapshotError::UnsupportedVersion(
                snapshot.format_version,
            )));
        }
        let mut normalized = snapshot.clone();
        normalized.normalize();
        self.validate_asset_blobs(&normalized)?;
        self.validate_source_blobs(&normalized)?;
        // The base is this checkpoint's freshly prepared canonical snapshot, not
        // an old revision or local history pointer. Compare every owned field.
        let mut segments = base_manifest.segments.clone();
        for name in SNAPSHOT_SEGMENTS {
            if let Some(bytes) = changed_segment_bytes(name, &normalized, base)? {
                segments.insert((*name).to_string(), self.put_blob(&bytes)?);
            }
        }
        self.encode_portable_snapshot_manifest(segments)
            .map(|(bytes, _)| bytes)
    }
}

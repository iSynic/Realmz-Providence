use super::*;
use providence_core::model::{BlobId, ClassicResourceKey, ProjectSnapshot, StableId};

mod application_media;
mod project_assets;
mod source_evidence;

fn asset(identity: &str, label: &str, kind: &str, resource_id: i32) -> AssetDescriptor {
    AssetDescriptor {
        identity: StableId(identity.into()),
        label: label.into(),
        kind: kind.into(),
        mime_type: Some("image/png".into()),
        classic_resource: Some(ClassicResourceKey {
            resource_type: "PICT".into(),
            resource_id,
        }),
        scenario_music_slot: None,
        blob: BlobId(format!("sha256:{}", "a".repeat(64))),
        byte_length: 12,
        classic_payload_blob: None,
        classic_payload_byte_length: None,
        extension: Some("png".into()),
        width: Some(32),
        height: Some(32),
        duration_ms: None,
        sample_rate: None,
        channels: None,
        tile_width: None,
        tile_height: None,
        columns: None,
        rows: None,
        landlook: None,
        base_tile: None,
        source: "Scenario.rsrc".into(),
    }
}

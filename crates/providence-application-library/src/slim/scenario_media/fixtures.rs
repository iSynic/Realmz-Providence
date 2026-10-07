use providence_core::{
    codecs::ClassicMediaAsset,
    model::{ClassicResourceKey, StableId},
    rebuilt::RebuiltV3AssetRecord,
};

pub(super) fn asset(resource_id: i32, path: &str, sha256: &str) -> RebuiltV3AssetRecord {
    RebuiltV3AssetRecord {
        id: StableId(format!("scenario-cicn-{resource_id}")),
        label: format!("scenario-cicn-{resource_id}"),
        kind: "monster-icon".into(),
        mime_type: Some("image/png".into()),
        resource_type: Some("cicn".into()),
        resource_id: Some(resource_id),
        scenario_music_slot: None,
        bytes: 3,
        sha256: sha256.into(),
        path: path.into(),
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
    }
}

pub(super) fn media(
    resource_id: i32,
    label: &str,
    width: u32,
    height: u32,
    runtime_payload: Vec<u8>,
) -> ClassicMediaAsset {
    ClassicMediaAsset {
        resource: ClassicResourceKey {
            resource_type: "cicn".into(),
            resource_id,
        },
        label: label.into(),
        attributes: 0,
        kind: "icon".into(),
        mime_type: "image/png".into(),
        extension: "png".into(),
        width: Some(width),
        height: Some(height),
        duration_ms: None,
        sample_rate: None,
        channels: None,
        runtime_payload,
        classic_payload: Vec::new(),
    }
}

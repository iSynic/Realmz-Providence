use crate::execute;
use crate::request_params::required_string;
use crate::request_params::required_value;
use providence_core::model::AssetDescriptor;
use providence_core::model::ClassicResourceKey;
use providence_core::model::StableId;
use providence_core::session::EditorCommand;
use providence_core::session::EditorSession;
use providence_storage::ProjectStore;
use serde::Deserialize;
use serde_json::Value;
use std::fs;
use std::path::Path;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AssetImportMetadata {
    identity: StableId,
    label: String,
    kind: String,
    #[serde(default)]
    mime_type: Option<String>,
    #[serde(default)]
    classic_resource: Option<ClassicResourceKey>,
    #[serde(default)]
    scenario_music_slot: Option<u8>,
    #[serde(default)]
    width: Option<u32>,
    #[serde(default)]
    height: Option<u32>,
    #[serde(default)]
    duration_ms: Option<u32>,
    #[serde(default)]
    sample_rate: Option<u32>,
    #[serde(default)]
    channels: Option<u16>,
    #[serde(default)]
    tile_width: Option<u32>,
    #[serde(default)]
    tile_height: Option<u32>,
    #[serde(default)]
    columns: Option<u32>,
    #[serde(default)]
    rows: Option<u32>,
    #[serde(default)]
    landlook: Option<i8>,
    #[serde(default)]
    base_tile: Option<i16>,
    source: String,
}

pub(crate) fn import(
    session: &mut EditorSession,
    store: Option<&ProjectStore>,
    params: Value,
) -> Result<Value, String> {
    let store = store.ok_or_else(|| {
        "asset.import requires serve-project so payload bytes have a durable blob store".to_string()
    })?;
    let path = required_string(&params, "path")?;
    let metadata: AssetImportMetadata =
        serde_json::from_value(required_value(&params, "asset")?.clone())
            .map_err(|error| format!("invalid asset metadata: {error}"))?;
    let bytes = fs::read(&path).map_err(|error| format!("could not read asset {path}: {error}"))?;
    let blob = store.put_blob(&bytes).map_err(|error| error.to_string())?;
    let extension = asset_extension(&path)?;
    execute(
        session,
        &params,
        EditorCommand::UpsertAsset {
            asset: Box::new(metadata.into_asset(blob, bytes.len() as u64, extension)),
        },
    )
}

fn asset_extension(path: &str) -> Result<Option<String>, String> {
    let extension = Path::new(path)
        .extension()
        .and_then(|extension| extension.to_str())
        .map(str::to_ascii_lowercase)
        .filter(|extension| !extension.is_empty());
    if extension.as_ref().is_some_and(|extension| {
        !extension
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit())
    }) {
        return Err("asset file extension must contain only ASCII letters and digits".into());
    }
    Ok(extension)
}

impl AssetImportMetadata {
    fn into_asset(
        self,
        blob: providence_core::model::BlobId,
        byte_length: u64,
        extension: Option<String>,
    ) -> AssetDescriptor {
        AssetDescriptor {
            identity: self.identity,
            label: self.label,
            kind: self.kind,
            mime_type: self.mime_type,
            classic_resource: self.classic_resource,
            scenario_music_slot: self.scenario_music_slot,
            blob,
            byte_length,
            classic_payload_blob: None,
            classic_payload_byte_length: None,
            extension,
            width: self.width,
            height: self.height,
            duration_ms: self.duration_ms,
            sample_rate: self.sample_rate,
            channels: self.channels,
            tile_width: self.tile_width,
            tile_height: self.tile_height,
            columns: self.columns,
            rows: self.rows,
            landlook: self.landlook,
            base_tile: self.base_tile,
            source: self.source,
        }
    }
}

use crate::execute;
use crate::image_files::mime_type_for_image_extension;
use crate::image_files::portable_extension;
use crate::request_params::required_i64;
use crate::request_params::required_string;
use crate::request_params::required_u32;
use base64::Engine as _;
use base64::engine::general_purpose::STANDARD as BASE64;
use providence_core::codecs::SPECIAL_LAND_TILE_HEIGHT;
use providence_core::codecs::SPECIAL_LAND_TILE_MAX_ID;
use providence_core::codecs::SPECIAL_LAND_TILE_MIN_ID;
use providence_core::codecs::SPECIAL_LAND_TILE_WIDTH;
use providence_core::codecs::encode_special_land_tile_cicn;
use providence_core::model::AssetDescriptor;
use providence_core::model::ClassicResourceKey;
use providence_core::model::StableId;
use providence_core::session::EditorCommand;
use providence_core::session::EditorSession;
use providence_storage::ProjectStore;
use serde_json::Value;
use serde_json::json;
use std::fs;

pub(crate) fn import_special_land_tile(
    session: &mut EditorSession,
    store: Option<&ProjectStore>,
    params: Value,
) -> Result<Value, String> {
    let store = store.ok_or_else(|| {
        "special-land.import requires serve-project so source and Classic payload bytes are durable"
            .to_string()
    })?;
    let input = SpecialLandImport::read(&params)?;
    let resource_id = input.resource_id;
    let (width, height) = (input.width, input.height);
    let asset = input.store_asset(store, &params)?;
    let identity = asset.identity.clone();
    let classic_payload_blob = asset.classic_payload_blob.clone();
    let classic_payload_bytes = asset.classic_payload_byte_length;
    let mut result = execute(
        session,
        &params,
        EditorCommand::UpsertAsset {
            asset: Box::new(asset),
        },
    )?;
    if let Some(object) = result.as_object_mut() {
        object.insert("identity".into(), json!(identity));
        object.insert("resourceType".into(), json!("cicn"));
        object.insert("resourceId".into(), json!(resource_id));
        object.insert("sourceWidth".into(), json!(width));
        object.insert("sourceHeight".into(), json!(height));
        object.insert("width".into(), json!(SPECIAL_LAND_TILE_WIDTH));
        object.insert("height".into(), json!(SPECIAL_LAND_TILE_HEIGHT));
        object.insert("classicPayloadBlob".into(), json!(classic_payload_blob));
        object.insert("classicPayloadBytes".into(), json!(classic_payload_bytes));
    }
    Ok(result)
}

pub(crate) fn read_special_land_preview(
    session: &EditorSession,
    store: Option<&ProjectStore>,
    params: Value,
) -> Result<Value, String> {
    let store = store.ok_or_else(|| {
        "special-land.preview requires serve-project so the content-addressed payload is available"
            .to_string()
    })?;
    let identity = StableId(required_string(&params, "identity")?);
    let asset = session
        .snapshot()
        .assets
        .iter()
        .find(|asset| asset.identity == identity && asset.kind == "special-land-tile")
        .ok_or_else(|| format!("Special Land Tile '{}' was not found", identity.0))?;
    let bytes = store
        .read_blob(&asset.blob)
        .map_err(|error| error.to_string())?;
    Ok(json!({
        "identity": asset.identity,
        "mimeType": asset.mime_type,
        "bytes": bytes.len(),
        "base64": BASE64.encode(bytes),
    }))
}

struct SpecialLandImport {
    label: String,
    width: u32,
    height: u32,
    resource_id: i16,
    cicn: Vec<u8>,
    source_bytes: Vec<u8>,
    extension: Option<String>,
}

impl SpecialLandImport {
    fn read(params: &Value) -> Result<Self, String> {
        let path = required_string(params, "path")?;
        let label = required_string(params, "label")?;
        let label = label.trim().to_owned();
        if label.is_empty() {
            return Err("Special Land Tile label cannot be empty".into());
        }
        let width = required_u32(params, "width")?;
        let height = required_u32(params, "height")?;
        let resource_id = i16::try_from(required_i64(params, "resourceId")?).map_err(|_| {
            "special-land resourceId is outside the Classic signed-short range".to_string()
        })?;
        if !(SPECIAL_LAND_TILE_MIN_ID..=SPECIAL_LAND_TILE_MAX_ID).contains(&resource_id) {
            return Err("Special Land Tile resourceId must be a negative signed-short ID".into());
        }
        let rgba = BASE64
            .decode(required_string(params, "rgbaBase64")?)
            .map_err(|error| format!("invalid Special Land Tile RGBA base64: {error}"))?;
        let cicn = encode_special_land_tile_cicn(&rgba, width, height)
            .map_err(|error| error.to_string())?;
        let source_bytes = fs::read(&path)
            .map_err(|error| format!("could not read Special Land Tile source {path}: {error}"))?;
        let extension = portable_extension(&path)?;
        Ok(Self {
            label,
            width,
            height,
            resource_id,
            cicn,
            source_bytes,
            extension,
        })
    }

    fn store_asset(self, store: &ProjectStore, params: &Value) -> Result<AssetDescriptor, String> {
        let Self {
            label,
            width,
            height,
            resource_id,
            cicn,
            source_bytes,
            extension,
        } = self;
        let source_blob = store
            .put_blob(&source_bytes)
            .map_err(|error| error.to_string())?;
        let classic_payload_blob = store.put_blob(&cicn).map_err(|error| error.to_string())?;
        let landlook = params
            .get("landlook")
            .and_then(Value::as_i64)
            .map(i8::try_from)
            .transpose()
            .map_err(|_| "special-land landlook is outside the signed-byte range".to_string())?;
        let base_tile = params
            .get("baseTile")
            .and_then(Value::as_i64)
            .map(i16::try_from)
            .transpose()
            .map_err(|_| "special-land baseTile is outside the signed-short range".to_string())?;
        let identity = StableId(format!("special-land.{resource_id}"));
        Ok(AssetDescriptor {
            identity: identity.clone(),
            label,
            kind: "special-land-tile".into(),
            mime_type: Some(mime_type_for_image_extension(extension.as_deref()).into()),
            classic_resource: Some(ClassicResourceKey {
                resource_type: "cicn".into(),
                resource_id: i32::from(resource_id),
            }),
            scenario_music_slot: None,
            blob: source_blob,
            byte_length: source_bytes.len() as u64,
            classic_payload_blob: Some(classic_payload_blob.clone()),
            classic_payload_byte_length: Some(cicn.len() as u64),
            extension,
            width: Some(SPECIAL_LAND_TILE_WIDTH),
            height: Some(SPECIAL_LAND_TILE_HEIGHT),
            duration_ms: None,
            sample_rate: None,
            channels: None,
            tile_width: None,
            tile_height: None,
            columns: None,
            rows: None,
            landlook,
            base_tile,
            source: format!("authored transparent image import ({width} x {height} source)"),
        })
    }
}

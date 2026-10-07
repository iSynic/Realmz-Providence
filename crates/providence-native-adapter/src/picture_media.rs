use crate::execute;
use crate::image_files::mime_type_for_image_extension;
use crate::image_files::portable_extension;
use crate::request_params::required_i64;
use crate::request_params::required_string;
use crate::request_params::required_u32;
use base64::Engine as _;
use base64::engine::general_purpose::STANDARD as BASE64;
use providence_core::codecs::SCENARIO_PICTURE_MAX_ID;
use providence_core::codecs::SCENARIO_PICTURE_MIN_ID;
use providence_core::codecs::SCENARIO_SPLASH_PICTURE_ID;
use providence_core::codecs::encode_scenario_picture_pict;
use providence_core::model::AssetDescriptor;
use providence_core::model::ClassicResourceKey;
use providence_core::model::StableId;
use providence_core::session::EditorCommand;
use providence_core::session::EditorSession;
use providence_storage::ProjectStore;
use serde_json::Value;
use serde_json::json;
use std::fs;

pub(crate) fn import_scenario_picture(
    session: &mut EditorSession,
    store: Option<&ProjectStore>,
    params: Value,
) -> Result<Value, String> {
    let store = store.ok_or_else(|| {
        "picture.import requires serve-project so source and Classic payload bytes are durable"
            .to_string()
    })?;
    let input = PictureImport::read(&params)?;
    let resource_id = input.resource_id;
    let asset = input.store_asset(store)?;
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
        object.insert("resourceType".into(), json!("PICT"));
        object.insert("resourceId".into(), json!(resource_id));
        object.insert("classicPayloadBlob".into(), json!(classic_payload_blob));
        object.insert("classicPayloadBytes".into(), json!(classic_payload_bytes));
    }
    Ok(result)
}

pub(crate) fn read_picture_preview(
    session: &EditorSession,
    store: Option<&ProjectStore>,
    params: Value,
) -> Result<Value, String> {
    let store = store.ok_or_else(|| {
        "picture.preview requires serve-project so the content-addressed payload is available"
            .to_string()
    })?;
    let identity = StableId(required_string(&params, "identity")?);
    let asset = session
        .snapshot()
        .assets
        .iter()
        .find(|asset| asset.identity == identity && asset.kind == "picture")
        .ok_or_else(|| format!("Scenario Picture '{}' was not found", identity.0))?;
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

pub(crate) fn picture_projection(asset: &AssetDescriptor) -> Value {
    let resource_id = asset
        .classic_resource
        .as_ref()
        .filter(|resource| resource.resource_type == "PICT")
        .map(|resource| resource.resource_id);
    json!({
        "identity": asset.identity,
        "label": asset.label,
        "resourceType": "PICT",
        "resourceId": resource_id,
        "role": if resource_id == Some(i32::from(SCENARIO_SPLASH_PICTURE_ID)) { "splash" } else { "display" },
        "mimeType": asset.mime_type,
        "width": asset.width,
        "height": asset.height,
        "bytes": asset.byte_length,
        "classicPayloadBytes": asset.classic_payload_byte_length,
        "hasPreview": asset.mime_type.as_deref().is_some_and(|mime| mime.starts_with("image/")),
    })
}

struct PictureImport {
    label: String,
    width: u32,
    height: u32,
    resource_id: i16,
    pict: Vec<u8>,
    source_bytes: Vec<u8>,
    extension: Option<String>,
}

impl PictureImport {
    fn read(params: &Value) -> Result<Self, String> {
        let path = required_string(params, "path")?;
        let label = required_string(params, "label")?;
        let width = required_u32(params, "width")?;
        let height = required_u32(params, "height")?;
        let resource_id = required_i64(params, "resourceId")?;
        let resource_id = i16::try_from(resource_id).map_err(|_| {
            "picture resourceId is outside the Classic signed-short range".to_string()
        })?;
        if !(SCENARIO_PICTURE_MIN_ID..=SCENARIO_PICTURE_MAX_ID).contains(&resource_id) {
            return Err("Scenario Picture resourceId must be between 30000 and 30128".into());
        }
        let rgba = BASE64
            .decode(required_string(params, "rgbaBase64")?)
            .map_err(|error| format!("invalid picture RGBA base64: {error}"))?;
        let pict = encode_scenario_picture_pict(
            &rgba,
            width,
            height,
            params
                .get("dither")
                .and_then(Value::as_bool)
                .unwrap_or(true),
        )
        .map_err(|error| error.to_string())?;
        let source_bytes = fs::read(&path)
            .map_err(|error| format!("could not read picture source {path}: {error}"))?;
        let extension = portable_extension(&path)?;
        Ok(Self {
            label,
            width,
            height,
            resource_id,
            pict,
            source_bytes,
            extension,
        })
    }

    fn store_asset(self, store: &ProjectStore) -> Result<AssetDescriptor, String> {
        let Self {
            label,
            width,
            height,
            resource_id,
            pict,
            source_bytes,
            extension,
        } = self;
        let source_blob = store
            .put_blob(&source_bytes)
            .map_err(|error| error.to_string())?;
        let classic_payload_blob = store.put_blob(&pict).map_err(|error| error.to_string())?;
        let identity = StableId(format!("picture:{resource_id}"));
        Ok(AssetDescriptor {
            identity: identity.clone(),
            label,
            kind: "picture".into(),
            mime_type: Some(mime_type_for_image_extension(extension.as_deref()).into()),
            classic_resource: Some(ClassicResourceKey {
                resource_type: "PICT".into(),
                resource_id: i32::from(resource_id),
            }),
            scenario_music_slot: None,
            blob: source_blob,
            byte_length: source_bytes.len() as u64,
            classic_payload_blob: Some(classic_payload_blob.clone()),
            classic_payload_byte_length: Some(pict.len() as u64),
            extension,
            width: Some(width),
            height: Some(height),
            duration_ms: None,
            sample_rate: None,
            channels: None,
            tile_width: None,
            tile_height: None,
            columns: None,
            rows: None,
            landlook: None,
            base_tile: None,
            source: "authored image import".into(),
        })
    }
}

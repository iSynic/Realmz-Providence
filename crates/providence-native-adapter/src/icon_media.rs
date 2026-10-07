use crate::execute;
use crate::image_files::mime_type_for_image_extension;
use crate::image_files::portable_extension;
use crate::request_params::required_i64;
use crate::request_params::required_string;
use crate::request_params::required_u32;
use base64::Engine as _;
use base64::engine::general_purpose::STANDARD as BASE64;
use providence_core::codecs::SCENARIO_ICON_HEIGHT;
use providence_core::codecs::SCENARIO_ICON_MAX_ID;
use providence_core::codecs::SCENARIO_ICON_MIN_ID;
use providence_core::codecs::SCENARIO_ICON_WIDTH;
use providence_core::codecs::encode_scenario_icon_cicn;
use providence_core::model::AssetDescriptor;
use providence_core::model::ClassicResourceKey;
use providence_core::model::StableId;
use providence_core::session::EditorCommand;
use providence_core::session::EditorSession;
use providence_storage::ProjectStore;
use serde_json::Value;
use serde_json::json;
use std::fs;

pub(crate) fn import_scenario_icon(
    session: &mut EditorSession,
    store: Option<&ProjectStore>,
    params: Value,
) -> Result<Value, String> {
    let path = required_string(&params, "path")?;
    let source_bytes =
        fs::read(&path).map_err(|error| format!("could not read icon source {path}: {error}"))?;
    let extension = portable_extension(&path)?;
    import_scenario_icon_bytes(session, store, params, source_bytes, extension)
}

pub(crate) fn import_scenario_icon_bytes(
    session: &mut EditorSession,
    store: Option<&ProjectStore>,
    params: Value,
    source_bytes: Vec<u8>,
    extension: Option<String>,
) -> Result<Value, String> {
    let store = store.ok_or_else(|| {
        "icon.import requires serve-project so source and Classic payload bytes are durable"
            .to_string()
    })?;
    let input = IconImport::read(&params)?;
    let resource_id = input.resource_id;
    let (width, height) = (input.width, input.height);
    let asset = input.store_asset(store, &source_bytes, extension)?;
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
        object.insert("width".into(), json!(SCENARIO_ICON_WIDTH));
        object.insert("height".into(), json!(SCENARIO_ICON_HEIGHT));
        object.insert("classicPayloadBlob".into(), json!(classic_payload_blob));
        object.insert("classicPayloadBytes".into(), json!(classic_payload_bytes));
    }
    Ok(result)
}

pub(crate) fn read_icon_preview(
    session: &EditorSession,
    store: Option<&ProjectStore>,
    params: Value,
) -> Result<Value, String> {
    let store = store.ok_or_else(|| {
        "icon.preview requires serve-project so the content-addressed payload is available"
            .to_string()
    })?;
    let identity = StableId(required_string(&params, "identity")?);
    let asset = session
        .snapshot()
        .assets
        .iter()
        .find(|asset| asset.identity == identity && asset.kind == "icon")
        .ok_or_else(|| format!("Scenario Icon '{}' was not found", identity.0))?;
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

pub(crate) fn icon_projection(asset: &AssetDescriptor) -> Value {
    let resource_id = asset
        .classic_resource
        .as_ref()
        .filter(|resource| resource.resource_type == "cicn")
        .map(|resource| resource.resource_id);
    json!({
        "identity": asset.identity,
        "label": asset.label,
        "resourceType": "cicn",
        "resourceId": resource_id,
        "role": "scenario",
        "mimeType": asset.mime_type,
        "width": asset.width,
        "height": asset.height,
        "bytes": asset.byte_length,
        "classicPayloadBytes": asset.classic_payload_byte_length,
        "hasPreview": asset.mime_type.as_deref().is_some_and(|mime| mime.starts_with("image/")),
    })
}

struct IconImport {
    label: String,
    width: u32,
    height: u32,
    resource_id: i16,
    cicn: Vec<u8>,
}

impl IconImport {
    fn read(params: &Value) -> Result<Self, String> {
        let label = required_string(params, "label")?;
        let label = label.trim().to_owned();
        if label.is_empty() {
            return Err("Scenario Icon label cannot be empty".into());
        }
        let width = required_u32(params, "width")?;
        let height = required_u32(params, "height")?;
        let resource_id = i16::try_from(required_i64(params, "resourceId")?)
            .map_err(|_| "icon resourceId is outside the Classic signed-short range".to_string())?;
        if !(SCENARIO_ICON_MIN_ID..=SCENARIO_ICON_MAX_ID).contains(&resource_id) {
            return Err("Scenario Icon resourceId must be a positive signed-short ID".into());
        }
        let rgba = BASE64
            .decode(required_string(params, "rgbaBase64")?)
            .map_err(|error| format!("invalid icon RGBA base64: {error}"))?;
        let cicn =
            encode_scenario_icon_cicn(&rgba, width, height).map_err(|error| error.to_string())?;
        Ok(Self {
            label,
            width,
            height,
            resource_id,
            cicn,
        })
    }

    fn store_asset(
        self,
        store: &ProjectStore,
        source_bytes: &[u8],
        extension: Option<String>,
    ) -> Result<AssetDescriptor, String> {
        let Self {
            label,
            width,
            height,
            resource_id,
            cicn,
        } = self;
        let source_blob = store
            .put_blob(source_bytes)
            .map_err(|error| error.to_string())?;
        let classic_payload_blob = store.put_blob(&cicn).map_err(|error| error.to_string())?;
        let identity = StableId(format!("icon:{resource_id}"));
        Ok(AssetDescriptor {
            identity: identity.clone(),
            label,
            kind: "icon".into(),
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
            width: Some(SCENARIO_ICON_WIDTH),
            height: Some(SCENARIO_ICON_HEIGHT),
            duration_ms: None,
            sample_rate: None,
            channels: None,
            tile_width: None,
            tile_height: None,
            columns: None,
            rows: None,
            landlook: None,
            base_tile: None,
            source: format!("authored image import ({width} x {height} source)"),
        })
    }
}

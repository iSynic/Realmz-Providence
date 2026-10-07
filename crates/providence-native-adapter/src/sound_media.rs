use crate::execute;
use crate::image_files::portable_extension;
use crate::request_params::required_i64;
use crate::request_params::required_string;
use crate::wav_input::decode_wav_pcm8;
use base64::Engine as _;
use base64::engine::general_purpose::STANDARD as BASE64;
use providence_core::codecs::SCENARIO_SOUND_MAX_ID;
use providence_core::codecs::SCENARIO_SOUND_MIN_ID;
use providence_core::codecs::downmix_scenario_sound_pcm8;
use providence_core::codecs::encode_scenario_sound_snd;
use providence_core::model::AssetDescriptor;
use providence_core::model::ClassicResourceKey;
use providence_core::model::StableId;
use providence_core::session::EditorCommand;
use providence_core::session::EditorSession;
use providence_storage::ProjectStore;
use serde_json::Value;
use serde_json::json;
use std::fs;

pub(crate) fn import_scenario_sound(
    session: &mut EditorSession,
    store: Option<&ProjectStore>,
    params: Value,
) -> Result<Value, String> {
    let store = store.ok_or_else(|| {
        "sound.import requires serve-project so source and Classic payload bytes are durable"
            .to_string()
    })?;
    let input = SoundImport::read(&params)?;
    let resource_id = input.resource_id;
    let asset = input.store_asset(store)?;
    let identity = asset.identity.clone();
    let classic_payload_blob = asset.classic_payload_blob.clone();
    let classic_payload_bytes = asset.classic_payload_byte_length;
    let (sample_rate, channels, duration_ms) =
        (asset.sample_rate, asset.channels, asset.duration_ms);
    let mut result = execute(
        session,
        &params,
        EditorCommand::UpsertAsset {
            asset: Box::new(asset),
        },
    )?;
    if let Some(object) = result.as_object_mut() {
        object.insert("identity".into(), json!(identity));
        object.insert("resourceType".into(), json!("snd "));
        object.insert("resourceId".into(), json!(resource_id));
        object.insert("sampleRate".into(), json!(sample_rate));
        object.insert("channels".into(), json!(channels));
        object.insert("durationMs".into(), json!(duration_ms));
        object.insert("classicPayloadBlob".into(), json!(classic_payload_blob));
        object.insert("classicPayloadBytes".into(), json!(classic_payload_bytes));
    }
    Ok(result)
}

pub(crate) fn read_sound_preview(
    session: &EditorSession,
    store: Option<&ProjectStore>,
    params: Value,
) -> Result<Value, String> {
    let store = store.ok_or_else(|| {
        "sound.preview requires serve-project so the content-addressed payload is available"
            .to_string()
    })?;
    let identity = StableId(required_string(&params, "identity")?);
    let asset = session
        .snapshot()
        .assets
        .iter()
        .find(|asset| asset.identity == identity && asset.kind == "sound")
        .ok_or_else(|| format!("Scenario Sound '{}' was not found", identity.0))?;
    let bytes = store
        .read_blob(&asset.blob)
        .map_err(|error| error.to_string())?;
    let decoded = decode_wav_pcm8(&bytes)?;
    let mono = downmix_scenario_sound_pcm8(&decoded.pcm8, decoded.channels)
        .map_err(|error| error.to_string())?;
    Ok(json!({
        "identity": asset.identity,
        "mimeType": "audio/pcm-u8",
        "sampleRate": decoded.sample_rate,
        "channels": 1,
        "durationMs": decoded.duration_ms,
        "pcm8Base64": BASE64.encode(mono),
    }))
}

pub(crate) fn sound_projection(asset: &AssetDescriptor) -> Value {
    let resource_id = asset
        .classic_resource
        .as_ref()
        .filter(|resource| resource.resource_type == "snd ")
        .map(|resource| resource.resource_id);
    json!({
        "identity": asset.identity,
        "label": asset.label,
        "resourceType": "snd ",
        "resourceId": resource_id,
        "mimeType": asset.mime_type,
        "sampleRate": asset.sample_rate,
        "channels": asset.channels,
        "durationMs": asset.duration_ms,
        "bytes": asset.byte_length,
        "classicPayloadBytes": asset.classic_payload_byte_length,
        "hasPreview": asset.mime_type.as_deref() == Some("audio/wav"),
    })
}

struct SoundImport {
    label: String,
    resource_id: i16,
    decoded: crate::wav_input::DecodedWav,
    snd: Vec<u8>,
    source_bytes: Vec<u8>,
    extension: Option<String>,
}

impl SoundImport {
    fn read(params: &Value) -> Result<Self, String> {
        let path = required_string(params, "path")?;
        let label = required_string(params, "label")?;
        let label = label.trim().to_owned();
        if label.is_empty() {
            return Err("Scenario Sound label cannot be empty".into());
        }
        let resource_id = required_i64(params, "resourceId")?;
        let resource_id = i16::try_from(resource_id).map_err(|_| {
            "sound resourceId is outside the Classic signed-short range".to_string()
        })?;
        if !(SCENARIO_SOUND_MIN_ID..=SCENARIO_SOUND_MAX_ID).contains(&resource_id) {
            return Err("Scenario Sound resourceId must be between 200 and 500".into());
        }
        let source_bytes = fs::read(&path)
            .map_err(|error| format!("could not read sound source {path}: {error}"))?;
        let decoded = decode_wav_pcm8(&source_bytes)?;
        let snd = encode_scenario_sound_snd(&decoded.pcm8, decoded.sample_rate, decoded.channels)
            .map_err(|error| error.to_string())?;
        let extension = portable_extension(&path)?;
        Ok(Self {
            label,
            resource_id,
            decoded,
            snd,
            source_bytes,
            extension,
        })
    }

    fn store_asset(self, store: &ProjectStore) -> Result<AssetDescriptor, String> {
        let Self {
            label,
            resource_id,
            decoded,
            snd,
            source_bytes,
            extension,
        } = self;
        let source_blob = store
            .put_blob(&source_bytes)
            .map_err(|error| error.to_string())?;
        let classic_payload_blob = store.put_blob(&snd).map_err(|error| error.to_string())?;
        let identity = StableId(format!("sound:{resource_id}"));
        Ok(AssetDescriptor {
            identity: identity.clone(),
            label,
            kind: "sound".into(),
            mime_type: Some("audio/wav".into()),
            classic_resource: Some(ClassicResourceKey {
                resource_type: "snd ".into(),
                resource_id: i32::from(resource_id),
            }),
            scenario_music_slot: None,
            blob: source_blob,
            byte_length: source_bytes.len() as u64,
            classic_payload_blob: Some(classic_payload_blob.clone()),
            classic_payload_byte_length: Some(snd.len() as u64),
            extension,
            width: None,
            height: None,
            duration_ms: Some(decoded.duration_ms),
            sample_rate: Some(decoded.sample_rate),
            channels: Some(decoded.channels),
            tile_width: None,
            tile_height: None,
            columns: None,
            rows: None,
            landlook: None,
            base_tile: None,
            source: "authored WAV import".into(),
        })
    }
}

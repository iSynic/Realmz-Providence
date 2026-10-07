use crate::request_params::{required_string, required_u64};
use base64::{Engine, engine::general_purpose::STANDARD as BASE64};
use providence_core::{
    model::StableId,
    personal_library::{PersonalAsset, PersonalLibrary},
};
use providence_storage::PersonalLibraryStore;
use serde_json::{Value, json};

pub(super) fn dispatch(
    store: &PersonalLibraryStore,
    method: &str,
    params: &Value,
) -> Option<Result<Value, String>> {
    if !matches!(
        method,
        "personal-library.describe"
            | "personal-library.collections"
            | "personal-library.list"
            | "personal-library.open"
            | "personal-library.preview"
            | "personal-library.preview-icon"
    ) {
        return None;
    }
    Some(read(store, method, params))
}

fn read(store: &PersonalLibraryStore, method: &str, params: &Value) -> Result<Value, String> {
    let library = store.load_manifest().map_err(|e| e.to_string())?;
    let (undo, redo) = library.history_counts();
    match method {
        "personal-library.describe" => Ok(json!({"configured":true,"revision":library.revision(),
            "total":library.assets().count(),"collections":library.collections().count(),"undo":undo,"redo":redo})),
        "personal-library.list" => Ok(list(&library, params)),
        "personal-library.collections" => Ok(collections(&library, params)),
        _ => {
            let id = StableId(required_string(params, "identity")?);
            let asset = library
                .asset(&id)
                .ok_or("This personal asset no longer exists.")?;
            if method == "personal-library.open" {
                return Ok(
                    json!({"revision":library.revision(),"asset":asset,"ownership":"personal"}),
                );
            }
            if method.ends_with("preview-icon")
                && required_u64(params, "expectedLibraryRevision")? != library.revision()
            {
                return Err("My Library changed. Select the artwork again.".into());
            }
            preview(
                store,
                asset,
                library.revision(),
                method.ends_with("preview-icon"),
            )
        }
    }
}

fn collections(library: &PersonalLibrary, params: &Value) -> Value {
    let (mut offset, limit) = page(params);
    if let Some(identity) = params["seekIdentity"].as_str()
        && let Some(index) = library.collections().position(|(id, _)| id.0 == identity)
    {
        offset = index / limit * limit;
    }
    let total = library.collections().count();
    let items = library
        .collections()
        .skip(offset)
        .take(limit)
        .map(|(identity, name)| json!({"identity":identity,"name":name}))
        .collect::<Vec<_>>();
    json!({"revision":library.revision(),"items":items,"total":total,"offset":offset,
        "limit":limit,"truncated":offset.saturating_add(limit)<total})
}

fn page(params: &Value) -> (usize, usize) {
    (
        params["offset"]
            .as_u64()
            .unwrap_or(0)
            .min(usize::MAX as u64) as usize,
        params["limit"].as_u64().unwrap_or(25).clamp(1, 128) as usize,
    )
}

fn list(library: &PersonalLibrary, params: &Value) -> Value {
    let query = params["query"]
        .as_str()
        .unwrap_or_default()
        .trim()
        .to_lowercase();
    let collection = params["collection"].as_str();
    let kind = params["kind"].as_str().unwrap_or("all");
    let status = params["status"].as_str().unwrap_or("all");
    let rows = library
        .assets()
        .filter(|asset| {
            let key = asset
                .media
                .as_ref()
                .and_then(|media| media.primary.classic_resource.as_ref());
            let searchable = format!(
                "{} {} {} {}",
                asset.name,
                asset.identity.0,
                asset_kind(asset),
                key.map(|key| key.resource_id.to_string())
                    .unwrap_or_default()
            )
            .to_lowercase();
            (query.is_empty() || searchable.contains(&query))
                && (kind == "all" || kind == asset_kind(asset))
                && collection.is_none_or(|id| {
                    asset
                        .collection
                        .as_ref()
                        .is_some_and(|actual| actual.0 == id)
                })
                && (status == "all" || (status == "ready") == asset.media.is_some())
        })
        .collect::<Vec<_>>();
    let total = rows.len();
    let (mut offset, limit) = page(params);
    if let Some(seek) = params["seekIdentity"].as_str()
        && let Some(index) = rows.iter().position(|asset| asset.identity.0 == seek)
    {
        offset = index / limit * limit;
    }
    let items = rows
        .into_iter()
        .skip(offset)
        .take(limit)
        .map(|asset| {
            let mut row = serde_json::to_value(asset).unwrap_or(Value::Null);
            row["kind"] = json!(asset_kind(asset));
            row["prepared"] = json!(asset.media.is_some());
            row["previewCommand"] = json!("personal-library.preview");
            row
        })
        .collect::<Vec<_>>();
    let (undo, redo) = library.history_counts();
    json!({"configured":true,"revision":library.revision(),"items":items,"offset":offset,"limit":limit,"total":total,"truncated":offset.saturating_add(limit)<total,"undo":undo,"redo":redo})
}

fn asset_kind(asset: &PersonalAsset) -> &str {
    asset
        .media
        .as_ref()
        .map(|media| media.primary.kind.as_str())
        .unwrap_or_else(|| {
            asset
                .import_kind
                .as_deref()
                .unwrap_or(match asset.mime_type.as_str() {
                    "image/png" => "icon",
                    "audio/wav" => "sound",
                    "text/plain" => "text-resource",
                    _ => "original",
                })
        })
}

fn preview(
    store: &PersonalLibraryStore,
    asset: &PersonalAsset,
    revision: u64,
    icon: bool,
) -> Result<Value, String> {
    let bytes = store
        .read_original(
            asset
                .media
                .as_ref()
                .map(|media| &media.primary.blob)
                .unwrap_or(&asset.original),
        )
        .map_err(|_| "The original is missing or damaged. Restore it to preview this asset.")?;
    if bytes.len() as u64
        != asset
            .media
            .as_ref()
            .map(|media| media.primary.byte_length)
            .unwrap_or(asset.byte_length)
    {
        return Err("The stored original has an incorrect length.".into());
    }
    if asset_kind(asset) == "text-resource" {
        let text = String::from_utf8(bytes).map_err(|_| "This original is not valid UTF-8.")?;
        return Ok(
            json!({"identity":asset.identity,"revision":revision,"mimeType":"text/plain","text":text}),
        );
    }
    if asset_kind(asset) == "sound" {
        let decoded = crate::wav_input::decode_wav_pcm8(&bytes)?;
        let pcm =
            providence_core::codecs::downmix_scenario_sound_pcm8(&decoded.pcm8, decoded.channels)
                .map_err(|e| e.to_string())?;
        return Ok(
            json!({"identity":asset.identity,"revision":revision,"mimeType":"audio/pcm-u8","sampleRate":decoded.sample_rate,"channels":1,"durationMs":decoded.duration_ms,"pcm8Base64":BASE64.encode(pcm)}),
        );
    }
    let preview = if icon {
        crate::personal_image::classic_icon_preview(&bytes)?
    } else {
        crate::personal_image::preview(&bytes)?
    };
    Ok(
        json!({"identity":asset.identity,"revision":revision,"width":preview.width,"height":preview.height,
        "mimeType":"image/png","base64":BASE64.encode(preview.png),"ownership":"personal"}),
    )
}

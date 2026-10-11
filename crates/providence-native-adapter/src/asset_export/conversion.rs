use super::{AssetDescriptor, Entry, catalog::Inventory};
use providence_core::codecs::{decode_cicn, decode_classic_pict, encode_runtime_rgba_png};
use sha2::{Digest, Sha256};

pub(super) fn png_fingerprint(bytes: &[u8]) -> Option<[u8; 32]> {
    let image = crate::personal_image::decode(bytes).ok()?;
    let mut hash = Sha256::new();
    hash.update(image.width.to_le_bytes());
    hash.update(image.height.to_le_bytes());
    hash.update(&image.rgba);
    Some(hash.finalize().into())
}

pub(super) fn extension(asset: &AssetDescriptor) -> Option<&'static str> {
    match asset.kind.as_str() {
        "text-style-resource" => None,
        "music" => Some("mod"),
        "sound" => Some("wav"),
        "text-resource" => Some("txt"),
        _ if asset
            .mime_type
            .as_deref()
            .is_some_and(|mime| mime.starts_with("image/")) =>
        {
            Some("png")
        }
        _ => None,
    }
}

pub(super) fn convert(inventory: &Inventory<'_>, entry: &Entry) -> Result<Vec<u8>, String> {
    let asset = &entry.asset;
    let bytes = inventory.read(entry, &asset.blob, asset.byte_length)?;
    match extension(asset) {
        Some("png") if asset.mime_type.as_deref() == Some("image/png") => {
            crate::personal_image::decode(&bytes)?;
            Ok(bytes)
        }
        Some("png") => native_png(inventory, entry),
        Some("wav") if asset.mime_type.as_deref() == Some("audio/wav") => {
            crate::wav_input::decode_wav_pcm8(&bytes)?;
            // Validation does not replace the original PCM with the preview downmix.
            Ok(bytes)
        }
        Some("mod") => {
            providence_core::codecs::scenario_music_asset(1, &bytes, asset.blob.clone())
                .map_err(|e| e.to_string())?;
            Ok(bytes)
        }
        Some("txt") if asset.mime_type.as_deref() == Some("text/plain") => {
            let text = std::str::from_utf8(&bytes).map_err(|_| "Text is not valid UTF-8.")?;
            Ok(text.replace("\r\n", "\n").replace('\r', "\n").into_bytes())
        }
        _ => Err(
            "No supported conversion for this asset; its original files remain exportable.".into(),
        ),
    }
}

fn native_png(inventory: &Inventory<'_>, entry: &Entry) -> Result<Vec<u8>, String> {
    let asset = &entry.asset;
    let blob = asset
        .classic_payload_blob
        .as_ref()
        .ok_or("No native image payload is available for PNG conversion.")?;
    let length = asset
        .classic_payload_byte_length
        .ok_or("Native image length is unavailable.")?;
    let native = inventory.read(entry, blob, length)?;
    let resource = asset
        .classic_resource
        .as_ref()
        .ok_or("Native image family is unavailable.")?;
    let (rgba, width, height) = match resource.resource_type.as_str() {
        "PICT" => {
            let image = decode_classic_pict(&native).map_err(|e| e.to_string())?;
            (image.rgba, image.width, image.height)
        }
        "cicn" => {
            let image = decode_cicn(&native).map_err(|e| e.to_string())?;
            (image.rgba, image.width, image.height)
        }
        _ => return Err("This native image family cannot be converted to PNG.".into()),
    };
    encode_runtime_rgba_png(&rgba, width, height).map_err(|e| e.to_string())
}

pub(super) fn original_extension(asset: &AssetDescriptor, native: bool) -> String {
    if native && let Some(key) = &asset.classic_resource {
        return match key.resource_type.as_str() {
            "PICT" => "pict",
            "cicn" => "cicn",
            "snd " => "snd",
            "TEXT" => "text",
            "styl" => "styl",
            "MOD " => "mod",
            _ => "bin",
        }
        .into();
    }
    match asset.mime_type.as_deref() {
        Some("image/png") => "png",
        Some("image/jpeg") => "jpg",
        Some("image/webp") => "webp",
        Some("image/bmp") => "bmp",
        Some("audio/wav") => "wav",
        Some("audio/x-mod") => "mod",
        Some("text/plain") => "txt",
        _ => asset
            .extension
            .as_deref()
            .filter(|ext| ext.len() <= 12 && ext.bytes().all(|c| c.is_ascii_alphanumeric()))
            .unwrap_or("bin"),
    }
    .to_owned()
}

use super::*;
use providence_core::{codecs::*, model::ClassicResourceKey};
use std::{fs::File, io::Read};

pub(super) struct Material {
    pub(super) asset: AssetDescriptor,
    pub(super) runtime: Vec<u8>,
    pub(super) native: Vec<u8>,
    pub(super) source: BlobId,
}

struct EncodedRaster {
    native: Vec<u8>,
    image: crate::personal_image::DecodedImage,
}

pub(super) use super::import_workflow::dispatch;

pub(super) fn read_original(
    params: &Value,
    library: Option<&providence_storage::PersonalLibraryStore>,
) -> Result<Vec<u8>, String> {
    if let Some(library) = library {
        let state = library.load_manifest().map_err(|e| e.to_string())?;
        let id = StableId(required_string(params, "sourceLibraryIdentity")?);
        let entry = state
            .asset(&id)
            .ok_or("The original library entry no longer exists.")?;
        return library
            .read_original(&entry.original)
            .map_err(|e| e.to_string());
    }
    read_file(&required_string(params, "path")?)
}

fn read_file(path: &str) -> Result<Vec<u8>, String> {
    let mut bytes = Vec::new();
    File::open(path)
        .map_err(|e| format!("Could not open the source: {e}"))?
        .take(64 * 1024 * 1024 + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    if bytes.len() > 64 * 1024 * 1024 {
        return Err("Media import supports files up to 64 MiB.".into());
    }
    Ok(bytes)
}

pub(super) fn prepare(
    bytes: &[u8],
    kind: &str,
    label: &str,
    params: &Value,
    retained: Option<&PersonalMedia>,
    original_only: bool,
) -> Result<Vec<Material>, String> {
    if let Some(retained) = retained
        && kind != retained.primary.kind
    {
        return Err("Replacement keeps the selected media family.".into());
    }
    let number = retained
        .and_then(|media| media.primary.classic_resource.as_ref())
        .map(|key| key.resource_id)
        .unwrap_or(i32::from(crate::request_params::required_i16(
            params,
            "resourceId",
        )?));
    let mut materials = vec![convert(
        bytes,
        kind,
        label,
        number,
        params,
        retained.map(|media| &media.primary),
        original_only,
    )?];
    if let Some(companion) = retained.and_then(|media| media.companion.as_ref()) {
        if companion.kind == "text-style-resource" {
            return Err("TEXT replacement uses the text editor to preserve existing formatting. Open Edit instead.".into());
        }
        let reverse = read_file(&required_string(params, "reversePath")?)?;
        materials.push(convert(
            &reverse,
            &companion.kind,
            label,
            companion
                .classic_resource
                .as_ref()
                .ok_or("Missing reverse resource number")?
                .resource_id,
            params,
            Some(companion),
            false,
        )?);
    } else if kind == "combat-icon" && !original_only {
        let reverse = read_file(&required_string(params, "reversePath")?)?;
        let reverse_id = number
            .checked_add(308)
            .filter(|id| *id <= 32767)
            .ok_or("Choose a base number with room for its reverse appearance.")?;
        materials.push(convert(
            &reverse, kind, label, reverse_id, params, None, false,
        )?);
    }
    Ok(materials)
}

fn convert(
    bytes: &[u8],
    kind: &str,
    label: &str,
    number: i32,
    params: &Value,
    retained: Option<&AssetDescriptor>,
    original_only: bool,
) -> Result<Material, String> {
    if kind == "music" {
        return super::music::replacement(bytes, label, number, retained);
    }
    let mut asset = descriptor(kind, label, number);
    let (runtime, native) = match kind {
        "picture" | "tileset" | "icon" | "combat-icon" | "portrait" | "special-land-tile" => {
            raster(bytes, params, &mut asset, retained, original_only)?
        }
        "sound" => sound(bytes, &mut asset, original_only)?,
        "text-resource" => text(bytes, params, &mut asset, original_only)?,
        _ => return Err("Choose a supported PNG, WAV, standard MOD or UTF-8 media family.".into()),
    };
    asset.blob = digest(&runtime);
    asset.byte_length = runtime.len() as u64;
    if kind == "combat-icon" {
        asset.source = format!(
            "{AUTHORED_MONSTER_APPEARANCE_SOURCE_PREFIX}(explicit pair, {} x {})",
            asset.width.unwrap_or(32),
            asset.height.unwrap_or(32)
        );
    }
    if !original_only {
        asset.classic_payload_blob = Some(digest(&native));
        asset.classic_payload_byte_length = Some(native.len() as u64);
    }
    if kind == "special-land-tile" {
        asset.landlook = params["landlook"]
            .as_i64()
            .map(|n| i8::try_from(n).map_err(|_| "Invalid land look"))
            .transpose()?;
        asset.base_tile = params["baseTile"]
            .as_i64()
            .map(|n| i16::try_from(n).map_err(|_| "Invalid base tile"))
            .transpose()?;
    }
    if let Some(retained) = retained {
        retain_resource_binding(&mut asset, retained);
    }
    Ok(Material {
        asset,
        runtime,
        native,
        source: digest(bytes),
    })
}

fn raster(
    bytes: &[u8],
    params: &Value,
    asset: &mut AssetDescriptor,
    retained: Option<&AssetDescriptor>,
    original: bool,
) -> Result<(Vec<u8>, Vec<u8>), String> {
    let image = crate::personal_image::decode(bytes)?;
    asset.mime_type = Some("image/png".into());
    asset.extension = Some("png".into());
    if original {
        asset.width = Some(image.width);
        asset.height = Some(image.height);
        return Ok((bytes.to_vec(), vec![]));
    }
    let picture = matches!(asset.kind.as_str(), "picture" | "tileset");
    let pair = asset.kind == "combat-icon"
        || retained.is_some_and(|asset| asset.width != Some(32) || asset.height != Some(32))
            && !picture;
    let dimensions = raster_dimensions(&image, params, retained, picture, pair)?;
    if asset
        .classic_resource
        .as_ref()
        .is_some_and(|key| key.resource_type == "PICT" && key.resource_id == 302)
        && (image.width, image.height) != (640, 640)
    {
        return Err(
            "The shared map/battle atlas must retain its complete 640 by 640 image.".into(),
        );
    }
    let converted = super::images::convert(
        &image,
        dimensions.0,
        dimensions.1,
        &params["settings"],
        picture,
    )?;
    let dither = params["settings"]["dither"].as_bool().unwrap_or(picture);
    let EncodedRaster { native, image } = encode_raster(&converted, picture, dither)?;
    asset.width = Some(image.width);
    asset.height = Some(image.height);
    set_tileset_geometry(asset)?;
    let png = encode_runtime_rgba_png(&image.rgba, image.width, image.height)
        .map_err(|e| e.to_string())?;
    Ok((png, native))
}

fn raster_dimensions(
    image: &crate::personal_image::DecodedImage,
    params: &Value,
    retained: Option<&AssetDescriptor>,
    picture: bool,
    pair: bool,
) -> Result<(u32, u32), String> {
    let dimensions = if let Some(retained) = retained
        && pair
    {
        (
            retained.width.ok_or("Missing retained width")?,
            retained.height.ok_or("Missing retained height")?,
        )
    } else if picture {
        (image.width, image.height)
    } else if pair {
        (
            params["width"].as_u64().unwrap_or(32) as u32,
            params["height"].as_u64().unwrap_or(32) as u32,
        )
    } else {
        (32, 32)
    };
    Ok(dimensions)
}

fn set_tileset_geometry(asset: &mut AssetDescriptor) -> Result<(), String> {
    if asset.kind != "tileset" {
        return Ok(());
    }
    let number = asset
        .classic_resource
        .as_ref()
        .ok_or("Tilesets require an exact picture number.")?
        .resource_id;
    let height = if number == 302 {
        640
    } else if (300..=310).contains(&number) {
        320
    } else {
        return Err("Choose a supported Landlook or shared map/battle picture number.".into());
    };
    if asset.width != Some(640) || asset.height != Some(height) {
        return Err(format!(
            "This tileset requires the complete 640 by {height} image."
        ));
    }
    asset.tile_width = Some(32);
    asset.tile_height = Some(32);
    asset.columns = Some(20);
    asset.rows = Some(height / 32);
    asset.landlook = (number != 302).then_some((number - 300) as i8);
    Ok(())
}

fn encode_raster(
    converted: &crate::personal_image::DecodedImage,
    picture: bool,
    dither: bool,
) -> Result<EncodedRaster, String> {
    let (native, decoded) = if picture {
        let native = encode_scenario_picture_pict(
            &converted.rgba,
            converted.width,
            converted.height,
            dither,
        )
        .map_err(|e| e.to_string())?;
        let decoded = decode_classic_pict(&native).map_err(|e| e.to_string())?;
        (
            native,
            crate::personal_image::DecodedImage {
                rgba: decoded.rgba,
                width: decoded.width,
                height: decoded.height,
            },
        )
    } else {
        let native = encode_monster_appearance_cicn_with_dither(
            &converted.rgba,
            converted.width,
            converted.height,
            dither,
        )
        .map_err(|e| e.to_string())?;
        let decoded = decode_cicn(&native).map_err(|e| e.to_string())?;
        (
            native,
            crate::personal_image::DecodedImage {
                rgba: decoded.rgba,
                width: decoded.width,
                height: decoded.height,
            },
        )
    };
    Ok(EncodedRaster {
        native,
        image: decoded,
    })
}

fn sound(
    bytes: &[u8],
    asset: &mut AssetDescriptor,
    original: bool,
) -> Result<(Vec<u8>, Vec<u8>), String> {
    let decoded = crate::wav_input::decode_wav_pcm8(bytes)?;
    asset.mime_type = Some("audio/wav".into());
    asset.extension = Some("wav".into());
    asset.duration_ms = Some(decoded.duration_ms);
    asset.sample_rate = Some(decoded.sample_rate);
    if original {
        asset.channels = Some(decoded.channels);
        return Ok((bytes.to_vec(), vec![]));
    }
    let mono =
        downmix_scenario_sound_pcm8(&decoded.pcm8, decoded.channels).map_err(|e| e.to_string())?;
    let native =
        encode_scenario_sound_snd(&mono, decoded.sample_rate, 1).map_err(|e| e.to_string())?;
    let wav =
        encode_runtime_pcm_wav(&mono, decoded.sample_rate, 1, 8).map_err(|e| e.to_string())?;
    asset.channels = Some(1);
    Ok((wav, native))
}

fn text(
    bytes: &[u8],
    params: &Value,
    asset: &mut AssetDescriptor,
    original: bool,
) -> Result<(Vec<u8>, Vec<u8>), String> {
    if bytes.len() > 1024 * 1024 {
        return Err("Text import supports UTF-8 files up to 1 MiB.".into());
    }
    let source = std::str::from_utf8(bytes).map_err(|_| "This file is not valid UTF-8.")?;
    asset.mime_type = Some("text/plain".into());
    asset.extension = Some("txt".into());
    if original {
        return Ok((bytes.to_vec(), vec![]));
    }
    let text = params["text"]
        .as_str()
        .unwrap_or(source.strip_prefix('\u{feff}').unwrap_or(source))
        .replace("\r\n", "\n")
        .replace('\r', "\n");
    if text.len() > 1024 * 1024 {
        return Err("Text import supports up to 1 MiB of UTF-8 content.".into());
    }
    let native = encode_classic_text_payload(&text).map_err(|e| e.to_string())?;
    Ok((text.into_bytes(), native))
}

fn descriptor(kind: &str, label: &str, number: i32) -> AssetDescriptor {
    let family = match kind {
        "picture" | "tileset" => "PICT",
        "sound" => "snd ",
        "text-resource" => "TEXT",
        _ => "cicn",
    };
    AssetDescriptor {
        identity: StableId(format!("{kind}:{number}")),
        label: label.into(),
        kind: kind.into(),
        mime_type: None,
        classic_resource: Some(ClassicResourceKey {
            resource_type: family.into(),
            resource_id: number,
        }),
        scenario_music_slot: None,
        blob: BlobId(String::new()),
        byte_length: 0,
        classic_payload_blob: None,
        classic_payload_byte_length: None,
        extension: None,
        width: None,
        height: None,
        duration_ms: None,
        sample_rate: None,
        channels: None,
        tile_width: None,
        tile_height: None,
        columns: None,
        rows: None,
        landlook: None,
        base_tile: None,
        source: "authored media import".into(),
    }
}

fn digest(bytes: &[u8]) -> BlobId {
    BlobId(format!("sha256:{:x}", Sha256::digest(bytes)))
}

pub(super) fn source_preview(bytes: &[u8], kind: &str) -> Result<Value, String> {
    if kind == "music" {
        let material = super::music::prepare(bytes, "Source music", 1)?;
        return super::music::preview(&material.asset, bytes);
    }
    use base64::{Engine, engine::general_purpose::STANDARD as BASE64};
    if matches!(
        kind,
        "picture" | "tileset" | "icon" | "combat-icon" | "portrait" | "special-land-tile"
    ) {
        let preview = crate::personal_image::preview(bytes)?;
        Ok(
            json!({"mimeType":"image/png","width":preview.width,"height":preview.height,"base64":BASE64.encode(preview.png)}),
        )
    } else if kind == "sound" {
        let decoded = crate::wav_input::decode_wav_pcm8(bytes)?;
        Ok(
            json!({"mimeType":"audio/wav", "base64":BASE64.encode(bytes),
            "sampleRate":decoded.sample_rate,"durationMs":decoded.duration_ms,
            "channels":decoded.channels,"bitsPerSample":decoded.bits_per_sample,
            "encoding":if decoded.audio_format == 3 {"Float PCM"} else {"Integer PCM"}}),
        )
    } else {
        Ok(
            json!({"mimeType":if kind=="sound" {"audio/wav"} else {"text/plain"},"base64":BASE64.encode(bytes)}),
        )
    }
}

pub(super) fn warnings(bytes: &[u8], kind: &str, params: &Value) -> Result<Vec<String>, String> {
    let mut warnings = vec![];
    if kind == "sound" && params["output"] != "original" {
        warnings.push("Output uses mono unsigned 8-bit PCM; the source file is unchanged.".into());
    }
    if kind == "text-resource" {
        let source = std::str::from_utf8(bytes).map_err(|_| "Invalid UTF-8")?;
        if source.starts_with('\u{feff}') || source.contains('\r') {
            warnings
                .push("UTF-8 BOM and line endings are normalized for Realmz-ready output.".into());
        }
    }
    Ok(warnings)
}

fn retain_resource_binding(asset: &mut AssetDescriptor, retained: &AssetDescriptor) {
    asset.identity = retained.identity.clone();
    asset.classic_resource = retained.classic_resource.clone();
    asset.source = retained.source.clone();
    asset.landlook = retained.landlook;
    asset.base_tile = retained.base_tile;
    asset.tile_width = retained.tile_width;
    asset.tile_height = retained.tile_height;
    asset.columns = retained.columns;
    asset.rows = retained.rows;
}

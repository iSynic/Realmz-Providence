use crate::error::{ProvidenceError, Result};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use std::collections::BTreeMap;

const APPLE_SINGLE_MAGIC: usize = 0x0005_1600;
const APPLE_DOUBLE_MAGIC: usize = 0x0005_1607;
const RESOURCE_FORK_ENTRY_ID: usize = 2;
pub const MINIMUM_SCENARIO_RESOURCE_FORK_BYTES: usize = 46;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ResourceForkEntry {
    pub resource_type: String,
    pub id: i16,
    pub name: String,
    pub attributes: u8,
    pub data: Vec<u8>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RgbaImagePayload {
    pub width: u32,
    pub height: u32,
    pub rgba_base64: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PcmAudioPayload {
    pub sample_rate: u32,
    pub channels: u16,
    pub duration_ms: Option<u32>,
    pub pcm8_base64: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ResourcePreviewStatus {
    PreviewReady,
    Playable,
    TextReady,
    MetadataOnly,
    UnsupportedVariant,
    Malformed,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourcePreviewDiagnostic {
    pub severity: String,
    pub message: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DecodedResourcePreview {
    pub status: ResourcePreviewStatus,
    pub mime_type: String,
    pub data_url: Option<String>,
    pub summary: BTreeMap<String, String>,
    pub diagnostics: Vec<ResourcePreviewDiagnostic>,
}

pub fn parse_resource_fork_entries(buffer: &[u8]) -> Vec<ResourceForkEntry> {
    let buffer = extract_resource_fork(buffer);
    if buffer.len() < 32 {
        return Vec::new();
    }
    let Some(data_offset) = u32_safe(buffer, 0) else {
        return Vec::new();
    };
    let Some(map_offset) = u32_safe(buffer, 4) else {
        return Vec::new();
    };
    if map_offset + 28 > buffer.len() {
        return Vec::new();
    }
    let Some(type_list_relative_offset) = u16_safe(buffer, map_offset + 24) else {
        return Vec::new();
    };
    let Some(name_list_relative_offset) = u16_safe(buffer, map_offset + 26) else {
        return Vec::new();
    };
    let type_list_offset = map_offset + type_list_relative_offset;
    let name_list_offset = map_offset + name_list_relative_offset;
    if type_list_offset + 2 > buffer.len() {
        return Vec::new();
    }
    let Some(raw_type_count) = u16_safe(buffer, type_list_offset) else {
        return Vec::new();
    };
    if raw_type_count == u16::MAX as usize {
        return Vec::new();
    }
    let mut entries = Vec::new();
    for type_index in 0..=raw_type_count {
        let type_offset = type_list_offset + 2 + type_index * 8;
        if type_offset + 8 > buffer.len() {
            continue;
        }
        let resource_type =
            String::from_utf8_lossy(&buffer[type_offset..type_offset + 4]).to_string();
        let Some(raw_resource_count) = u16_safe(buffer, type_offset + 4) else {
            continue;
        };
        let Some(ref_list_relative_offset) = u16_safe(buffer, type_offset + 6) else {
            continue;
        };
        let ref_list_offset = type_list_offset + ref_list_relative_offset;
        for ref_index in 0..=raw_resource_count {
            let ref_offset = ref_list_offset + ref_index * 12;
            if ref_offset + 12 > buffer.len() {
                continue;
            }
            let id = i16_be(buffer, ref_offset);
            let name_relative_offset = i16_be(buffer, ref_offset + 2);
            let name = if name_relative_offset >= 0 {
                let name_offset = name_list_offset + name_relative_offset as usize;
                if name_offset < buffer.len() {
                    let length = buffer[name_offset] as usize;
                    let end = (name_offset + 1 + length).min(buffer.len());
                    decode_classic_text(&buffer[name_offset + 1..end])
                } else {
                    String::new()
                }
            } else {
                String::new()
            };
            let data_relative_offset = ((buffer[ref_offset + 5] as usize) << 16)
                | ((buffer[ref_offset + 6] as usize) << 8)
                | buffer[ref_offset + 7] as usize;
            let length_offset = data_offset + data_relative_offset;
            let Some(length) = u32_safe(buffer, length_offset) else {
                continue;
            };
            if length_offset + 4 + length > buffer.len() {
                continue;
            }
            let offset = length_offset + 4;
            entries.push(ResourceForkEntry {
                resource_type: resource_type.clone(),
                id,
                name,
                attributes: buffer[ref_offset + 4],
                data: buffer[offset..offset + length].to_vec(),
            });
        }
    }
    entries
}

pub fn resource_fork_payload(buffer: &[u8]) -> &[u8] {
    extract_resource_fork(buffer)
}

pub fn write_resource_fork(entries: &[ResourceForkEntry]) -> Result<Vec<u8>> {
    let mut grouped: BTreeMap<String, Vec<ResourceForkEntry>> = BTreeMap::new();
    for entry in entries {
        if entry.resource_type.len() != 4 {
            return Err(ProvidenceError::message(format!(
                "Resource type '{}' must be four bytes",
                entry.resource_type
            )));
        }
        grouped
            .entry(entry.resource_type.clone())
            .or_default()
            .push(entry.clone());
    }
    for entries in grouped.values_mut() {
        entries.sort_by_key(|entry| entry.id);
    }

    let mut data_section = Vec::new();
    let mut offsets: BTreeMap<(String, i16), usize> = BTreeMap::new();
    for (resource_type, entries) in &grouped {
        for entry in entries {
            offsets.insert((resource_type.clone(), entry.id), data_section.len());
            push_u32(&mut data_section, entry.data.len());
            data_section.extend_from_slice(&entry.data);
        }
    }

    let type_count = grouped.len();
    let type_list_len = 2 + type_count * 8;
    let ref_list_start = type_list_len;
    let ref_list_len: usize = grouped.values().map(|entries| entries.len() * 12).sum();
    let name_list_start = ref_list_start + ref_list_len;

    let mut type_list = Vec::new();
    push_u16(
        &mut type_list,
        if type_count == 0 {
            u16::MAX as usize
        } else {
            type_count - 1
        },
    );
    let mut ref_cursor = ref_list_start;
    for (resource_type, entries) in &grouped {
        type_list.extend_from_slice(resource_type.as_bytes());
        push_u16(&mut type_list, entries.len().saturating_sub(1));
        push_u16(&mut type_list, ref_cursor);
        ref_cursor += entries.len() * 12;
    }

    let mut ref_lists = Vec::new();
    let mut names = Vec::new();
    for (resource_type, entries) in &grouped {
        for entry in entries {
            push_i16(&mut ref_lists, entry.id);
            if entry.name.is_empty() {
                push_i16(&mut ref_lists, -1);
            } else {
                push_i16(&mut ref_lists, names.len() as i16);
                let encoded = encode_classic_text(&entry.name);
                names.push(encoded.len().min(255) as u8);
                names.extend_from_slice(&encoded[..encoded.len().min(255)]);
            }
            ref_lists.push(entry.attributes);
            let offset = offsets
                .get(&(resource_type.clone(), entry.id))
                .copied()
                .unwrap_or_default();
            ref_lists.push(((offset >> 16) & 0xff) as u8);
            ref_lists.push(((offset >> 8) & 0xff) as u8);
            ref_lists.push((offset & 0xff) as u8);
            ref_lists.extend_from_slice(&[0, 0, 0, 0]);
        }
    }

    let data_offset = 16usize;
    let map_offset = data_offset + data_section.len();
    let map_len = 28 + type_list.len() + ref_lists.len() + names.len();
    let total_len = map_offset + map_len;
    let mut output = Vec::with_capacity(total_len);
    push_u32(&mut output, data_offset);
    push_u32(&mut output, map_offset);
    push_u32(&mut output, data_section.len());
    push_u32(&mut output, map_len);
    output.extend_from_slice(&data_section);

    let mut map = Vec::with_capacity(map_len);
    push_u32(&mut map, data_offset);
    push_u32(&mut map, map_offset);
    push_u32(&mut map, data_section.len());
    push_u32(&mut map, map_len);
    map.extend_from_slice(&[0, 0, 0, 0]);
    map.extend_from_slice(&[0, 0]);
    map.extend_from_slice(&[0, 0]);
    push_u16(&mut map, 28);
    push_u16(&mut map, name_list_start + 28);
    map.extend_from_slice(&type_list);
    map.extend_from_slice(&ref_lists);
    map.extend_from_slice(&names);
    output.extend_from_slice(&map);
    Ok(output)
}

/// Builds the content-neutral resource container required for a fresh scenario.
///
/// Realmz must be able to open the scenario resource fork before selecting the
/// scenario. Third-party scenarios do not require built-in `RLMZ` index
/// resources, so the authoritative baseline is a standard empty Resource
/// Manager container rather than imported or synthetic metadata.
pub fn write_minimum_scenario_resource_fork() -> Result<Vec<u8>> {
    let output = write_resource_fork(&[])?;
    if output.len() != MINIMUM_SCENARIO_RESOURCE_FORK_BYTES {
        return Err(ProvidenceError::message(format!(
            "Minimum scenario resource fork should be {MINIMUM_SCENARIO_RESOURCE_FORK_BYTES} bytes, found {}",
            output.len()
        )));
    }
    Ok(output)
}

pub fn merge_resource_entries(
    original: &[u8],
    updates: Vec<ResourceForkEntry>,
) -> Result<(Vec<u8>, usize)> {
    merge_resource_entries_with_removals(original, updates, &[])
}

pub fn merge_resource_entries_with_removals(
    original: &[u8],
    updates: Vec<ResourceForkEntry>,
    removals: &[(String, i32)],
) -> Result<(Vec<u8>, usize)> {
    let mut entries = parse_resource_fork_entries(original);
    entries.retain(|entry| {
        !removals.iter().any(|(resource_type, resource_id)| {
            entry.resource_type == *resource_type && i32::from(entry.id) == *resource_id
        })
    });
    let mut replaced = 0usize;
    for update in updates {
        if let Some(existing) = entries
            .iter_mut()
            .find(|entry| entry.resource_type == update.resource_type && entry.id == update.id)
        {
            *existing = update;
            replaced += 1;
        } else {
            entries.push(update);
        }
    }
    let bytes = write_resource_fork(&entries)?;
    Ok((bytes, replaced))
}

pub fn encode_pict_resource(payload: &RgbaImagePayload) -> Result<Vec<u8>> {
    encode_pict_resource_with_dither(payload, true)
}

pub fn encode_pict_resource_with_dither(
    payload: &RgbaImagePayload,
    dither: bool,
) -> Result<Vec<u8>> {
    let rgba = STANDARD
        .decode(&payload.rgba_base64)
        .map_err(|error| ProvidenceError::message(error.to_string()))?;
    expected_rgba_len(payload.width, payload.height, rgba.len())?;
    let (indices, palette) = quantize_rgba_to_palette(&rgba, payload.width as usize, dither);
    let row_bytes = payload.width as usize;

    let mut pict = vec![0; 10];
    write_rect(
        &mut pict,
        2,
        0,
        0,
        payload.height as i16,
        payload.width as i16,
    );
    push_u16(&mut pict, 0x0098);
    push_u16(&mut pict, 0x8000 | row_bytes);
    push_rect(&mut pict, 0, 0, payload.height as i16, payload.width as i16);
    push_u16(&mut pict, 0);
    push_u16(&mut pict, 0);
    push_u32(&mut pict, 0);
    push_u32(&mut pict, 0);
    push_u32(&mut pict, 0);
    push_u16(&mut pict, 0);
    push_u16(&mut pict, 8);
    push_u16(&mut pict, 1);
    push_u16(&mut pict, 8);
    push_u32(&mut pict, 0);
    push_u32(&mut pict, 0);
    push_u32(&mut pict, 0);
    push_u32(&mut pict, 0);
    push_u16(&mut pict, 0);
    push_u16(&mut pict, palette.len().saturating_sub(1));
    for (index, color) in palette.iter().enumerate() {
        push_u16(&mut pict, index);
        push_u16(&mut pict, (color[0] as usize) * 257);
        push_u16(&mut pict, (color[1] as usize) * 257);
        push_u16(&mut pict, (color[2] as usize) * 257);
    }
    push_rect(&mut pict, 0, 0, payload.height as i16, payload.width as i16);
    push_rect(&mut pict, 0, 0, payload.height as i16, payload.width as i16);
    push_u16(&mut pict, 0);
    for y in 0..payload.height as usize {
        let row = &indices[y * row_bytes..(y + 1) * row_bytes];
        let encoded = packbits(row);
        if row_bytes > 250 {
            push_u16(&mut pict, encoded.len());
        } else {
            pict.push(encoded.len().min(255) as u8);
        }
        pict.extend_from_slice(&encoded);
    }
    push_u16(&mut pict, 0x00ff);
    let size = pict.len().min(i16::MAX as usize) as i16;
    write_i16_be(&mut pict, 0, size);
    Ok(pict)
}

pub fn encode_cicn_resource(payload: &RgbaImagePayload) -> Result<Vec<u8>> {
    encode_cicn_resource_with_dimensions(payload, 32, 32)
}

pub fn encode_cicn_resource_with_dimensions(
    payload: &RgbaImagePayload,
    target_width: u32,
    target_height: u32,
) -> Result<Vec<u8>> {
    if target_width == 0 || target_height == 0 || target_width > 512 || target_height > 512 {
        return Err(ProvidenceError::message(format!(
            "Invalid cicn target size {}x{}",
            target_width, target_height
        )));
    }
    let rgba = STANDARD
        .decode(&payload.rgba_base64)
        .map_err(|error| ProvidenceError::message(error.to_string()))?;
    expected_rgba_len(payload.width, payload.height, rgba.len())?;
    let resized = resize_rgba_nearest(
        &rgba,
        payload.width as usize,
        payload.height as usize,
        target_width as usize,
        target_height as usize,
    );
    let (indices, palette) = quantize_rgba_to_palette(&resized, target_width as usize, false);
    let width = target_width as usize;
    let height = target_height as usize;
    let row_bytes = width;
    let mask_row_bytes = width.div_ceil(8);
    let bitmap_row_bytes = mask_row_bytes;
    let mask_offset = 82usize;
    let bitmap_offset = mask_offset + mask_row_bytes * height;
    let color_table_offset = bitmap_offset + bitmap_row_bytes * height;
    let pixel_data_offset = color_table_offset + 8 + palette.len() * 8;
    let mut cicn = vec![0u8; pixel_data_offset + row_bytes * height];
    write_u16_be(&mut cicn, 4, 0x8000 | row_bytes);
    write_rect(&mut cicn, 6, 0, 0, height as i16, width as i16);
    write_u16_be(&mut cicn, 32, 8);
    write_u16_be(&mut cicn, 54, 0x8000 | mask_row_bytes);
    write_rect(&mut cicn, 56, 0, 0, height as i16, width as i16);
    write_u16_be(&mut cicn, 68, 0x8000 | bitmap_row_bytes);
    write_rect(&mut cicn, 70, 0, 0, height as i16, width as i16);
    for y in 0..height {
        for x in 0..width {
            let alpha = resized[(y * width + x) * 4 + 3];
            if alpha > 16 {
                cicn[mask_offset + y * mask_row_bytes + x / 8] |= 1 << (7 - (x % 8));
            }
        }
    }
    write_u16_be(
        &mut cicn,
        color_table_offset + 6,
        palette.len().saturating_sub(1),
    );
    for (index, color) in palette.iter().enumerate() {
        let offset = color_table_offset + 8 + index * 8;
        write_u16_be(&mut cicn, offset, index);
        write_u16_be(&mut cicn, offset + 2, (color[0] as usize) * 257);
        write_u16_be(&mut cicn, offset + 4, (color[1] as usize) * 257);
        write_u16_be(&mut cicn, offset + 6, (color[2] as usize) * 257);
    }
    cicn[pixel_data_offset..pixel_data_offset + indices.len()].copy_from_slice(&indices);
    Ok(cicn)
}

pub fn encode_snd_resource(payload: &PcmAudioPayload) -> Result<Vec<u8>> {
    let mut samples = STANDARD
        .decode(&payload.pcm8_base64)
        .map_err(|error| ProvidenceError::message(error.to_string()))?;
    if payload.channels > 1 {
        samples = downmix_interleaved_u8(&samples, payload.channels as usize);
    }
    let header_offset = 20usize;
    let mut snd = Vec::new();
    push_u16(&mut snd, 1);
    push_u16(&mut snd, 1);
    push_u16(&mut snd, 5);
    push_u32(&mut snd, 0x0000_0080);
    push_u16(&mut snd, 1);
    push_u16(&mut snd, 0x8051);
    push_u16(&mut snd, 0);
    push_u32(&mut snd, header_offset);
    push_u32(&mut snd, 0);
    push_u32(&mut snd, samples.len());
    push_u32(&mut snd, (payload.sample_rate as usize) << 16);
    push_u32(&mut snd, 0);
    push_u32(&mut snd, samples.len());
    snd.push(0);
    snd.push(60);
    snd.extend_from_slice(&samples);
    Ok(snd)
}

pub fn preview_data_url_for_resource(resource_type: &str, data: &[u8]) -> Result<Option<String>> {
    Ok(inspect_resource_preview(resource_type, data)?.data_url)
}

pub fn inspect_resource_preview(
    resource_type: &str,
    data: &[u8],
) -> Result<DecodedResourcePreview> {
    let mut summary = BTreeMap::new();
    summary.insert("resourceType".to_string(), resource_type.trim().to_string());
    summary.insert("bytes".to_string(), data.len().to_string());
    match resource_type {
        "PICT" => {
            let preview = crate::resource_preview::inspect_resource_preview("PICT", data)?;
            Ok(DecodedResourcePreview {
                status: preview_status_from_shared(preview.status),
                mime_type: preview.mime_type,
                data_url: preview.data_url,
                summary: preview.summary,
                diagnostics: diagnostics_from_shared(preview.diagnostics),
            })
        }
        "cicn" => match decode_cicn(data) {
            Ok(image) => {
                summary.insert("width".to_string(), image.width.to_string());
                summary.insert("height".to_string(), image.height.to_string());
                Ok(DecodedResourcePreview {
                    status: ResourcePreviewStatus::PreviewReady,
                    mime_type: "image/png".to_string(),
                    data_url: Some(encode_png_data_url(image.width, image.height, &image.rgba)?),
                    summary,
                    diagnostics: Vec::new(),
                })
            }
            Err(error) => Ok(metadata_preview(
                ResourcePreviewStatus::UnsupportedVariant,
                "image/cicn",
                summary,
                format!("cicn decoder could not render this resource variant: {error}"),
            )),
        },
        "snd " => match decode_snd_to_wav(data) {
            Ok(wav) => Ok(DecodedResourcePreview {
                status: ResourcePreviewStatus::Playable,
                mime_type: "audio/wav".to_string(),
                data_url: Some(format!("data:audio/wav;base64,{}", STANDARD.encode(wav))),
                summary,
                diagnostics: Vec::new(),
            }),
            Err(error) => Ok(metadata_preview(
                ResourcePreviewStatus::UnsupportedVariant,
                "audio/x-mac-snd",
                summary,
                format!("Sound decoder could not play this resource variant: {error}"),
            )),
        },
        "TEXT" => {
            let text = decode_classic_text(data);
            summary.insert("characters".to_string(), text.chars().count().to_string());
            Ok(text_preview(summary, text))
        }
        "STR#" => {
            let strings = decode_string_list_resource(data);
            summary.insert("strings".to_string(), strings.len().to_string());
            Ok(text_preview(summary, strings.join("\n")))
        }
        "styl" => {
            let run_count = u16_safe(data, 0).unwrap_or(0);
            summary.insert("styleRunCountCandidate".to_string(), run_count.to_string());
            Ok(metadata_preview(
                ResourcePreviewStatus::MetadataOnly,
                "application/octet-stream",
                summary,
                "Style resources are paired with TEXT resources; raw style runs are inventoried here.".to_string(),
            ))
        }
        "vers" => {
            summary.insert(
                "versionText".to_string(),
                decode_classic_text(&data[data.len().min(6)..]),
            );
            Ok(metadata_preview(
                ResourcePreviewStatus::MetadataOnly,
                "application/octet-stream",
                summary,
                "Version metadata resource inventoried.".to_string(),
            ))
        }
        "RLMZ" => Ok(metadata_preview(
            ResourcePreviewStatus::MetadataOnly,
            "application/octet-stream",
            summary,
            "Realmz metadata resource inventoried.".to_string(),
        )),
        _ => Ok(metadata_preview(
            ResourcePreviewStatus::MetadataOnly,
            "application/octet-stream",
            summary,
            format!("No preview decoder exists for resource type {resource_type}."),
        )),
    }
}

fn text_preview(summary: BTreeMap<String, String>, text: String) -> DecodedResourcePreview {
    DecodedResourcePreview {
        status: ResourcePreviewStatus::TextReady,
        mime_type: "text/plain".to_string(),
        data_url: Some(format!(
            "data:text/plain;base64,{}",
            STANDARD.encode(text.as_bytes())
        )),
        summary,
        diagnostics: Vec::new(),
    }
}

fn preview_status_from_shared(
    status: crate::resource_preview::ResourcePreviewStatus,
) -> ResourcePreviewStatus {
    match status {
        crate::resource_preview::ResourcePreviewStatus::PreviewReady => {
            ResourcePreviewStatus::PreviewReady
        }
        crate::resource_preview::ResourcePreviewStatus::Playable => ResourcePreviewStatus::Playable,
        crate::resource_preview::ResourcePreviewStatus::TextReady => {
            ResourcePreviewStatus::TextReady
        }
        crate::resource_preview::ResourcePreviewStatus::MetadataOnly => {
            ResourcePreviewStatus::MetadataOnly
        }
        crate::resource_preview::ResourcePreviewStatus::Malformed => {
            ResourcePreviewStatus::Malformed
        }
        crate::resource_preview::ResourcePreviewStatus::UnsupportedVariant
        | crate::resource_preview::ResourcePreviewStatus::MissingFallback => {
            ResourcePreviewStatus::UnsupportedVariant
        }
    }
}

fn diagnostics_from_shared(
    diagnostics: Vec<crate::resource_preview::ResourcePreviewDiagnostic>,
) -> Vec<ResourcePreviewDiagnostic> {
    diagnostics
        .into_iter()
        .map(|diagnostic| ResourcePreviewDiagnostic {
            severity: diagnostic.severity,
            message: diagnostic.message,
        })
        .collect()
}

fn metadata_preview(
    status: ResourcePreviewStatus,
    mime_type: &str,
    summary: BTreeMap<String, String>,
    message: String,
) -> DecodedResourcePreview {
    DecodedResourcePreview {
        status,
        mime_type: mime_type.to_string(),
        data_url: None,
        summary,
        diagnostics: vec![ResourcePreviewDiagnostic {
            severity: "info".to_string(),
            message,
        }],
    }
}

pub fn encode_png_data_url(width: u32, height: u32, rgba: &[u8]) -> Result<String> {
    let mut png_bytes = Vec::new();
    {
        let mut encoder = png::Encoder::new(&mut png_bytes, width, height);
        encoder.set_color(png::ColorType::Rgba);
        encoder.set_depth(png::BitDepth::Eight);
        let mut writer = encoder
            .write_header()
            .map_err(|error| ProvidenceError::message(error.to_string()))?;
        writer
            .write_image_data(rgba)
            .map_err(|error| ProvidenceError::message(error.to_string()))?;
    }
    Ok(format!(
        "data:image/png;base64,{}",
        STANDARD.encode(png_bytes)
    ))
}

pub fn decode_snd_to_wav(data: &[u8]) -> Result<Vec<u8>> {
    if data.len() < 44 || i16_be(data, 0) != 1 {
        return Err(ProvidenceError::message("Unsupported snd resource format"));
    }
    let command_count_offset = 10usize;
    let command_count = u16_safe(data, command_count_offset).unwrap_or(0);
    let mut header_offset = None;
    let mut cursor = command_count_offset + 2;
    for _ in 0..command_count {
        if cursor + 8 > data.len() {
            break;
        }
        let command = u16_safe(data, cursor).unwrap_or(0);
        let offset = u32_safe(data, cursor + 4).unwrap_or(0);
        if command & 0x7fff == 0x0051 && command & 0x8000 != 0 {
            header_offset = Some(offset);
            break;
        }
        cursor += 8;
    }
    let Some(header_offset) = header_offset else {
        return Err(ProvidenceError::message("No bufferCmd sound header found"));
    };
    if header_offset + 22 > data.len() {
        return Err(ProvidenceError::message("Sound header is out of range"));
    }
    let length = u32_safe(data, header_offset + 4).unwrap_or(0);
    let sample_rate_fixed = u32_safe(data, header_offset + 8).unwrap_or(22_254 << 16);
    let sample_rate = (sample_rate_fixed >> 16).max(1) as u32;
    let sample_start = header_offset + 22;
    if sample_start + length > data.len() {
        return Err(ProvidenceError::message("Sound sample data is truncated"));
    }
    let samples = &data[sample_start..sample_start + length];
    Ok(encode_wav_u8(sample_rate, samples))
}

struct DecodedImage {
    width: u32,
    height: u32,
    rgba: Vec<u8>,
}

#[cfg(test)]
fn decode_pict_packbits8(pict: &[u8]) -> Result<DecodedImage> {
    let Some(rect) = find_packbits_rect(pict) else {
        return Err(ProvidenceError::message("No 8-bit PackBitsRect found"));
    };
    let mut palette = vec![[0u8, 0u8, 0u8]; rect.color_count.max(1)];
    for index in 0..rect.color_count {
        let offset = rect.color_table_offset + 8 + index * 8;
        let color_index = color_table_palette_index(
            rect.color_table_flags,
            index,
            u16_safe(pict, offset).unwrap_or(index),
            palette.len(),
        );
        if color_index < palette.len() {
            palette[color_index] = [
                (u16_safe(pict, offset + 2).unwrap_or(0) >> 8) as u8,
                (u16_safe(pict, offset + 4).unwrap_or(0) >> 8) as u8,
                (u16_safe(pict, offset + 6).unwrap_or(0) >> 8) as u8,
            ];
        }
    }
    let width = rect.width.min(2048);
    let height = rect.height.min(2048);
    let mut rgba = vec![0u8; width * height * 4];
    let mut cursor = rect.data_offset;
    for y in 0..rect.height {
        if cursor >= pict.len() {
            break;
        }
        let packed_length = if rect.row_bytes > 250 {
            let value = u16_safe(pict, cursor).unwrap_or(0);
            cursor += 2;
            value
        } else {
            let value = pict[cursor] as usize;
            cursor += 1;
            value
        };
        let row = decode_packbits_row(pict, cursor, packed_length, rect.row_bytes);
        cursor += packed_length.min(pict.len().saturating_sub(cursor));
        if y >= height {
            continue;
        }
        for x in 0..width {
            let index = row.get(x).copied().unwrap_or(0) as usize;
            let color = palette.get(index).copied().unwrap_or([0, 0, 0]);
            let out = (y * width + x) * 4;
            rgba[out] = color[0];
            rgba[out + 1] = color[1];
            rgba[out + 2] = color[2];
            rgba[out + 3] = 255;
        }
    }
    Ok(DecodedImage {
        width: width as u32,
        height: height as u32,
        rgba,
    })
}

#[cfg(test)]
struct PackBitsRect {
    row_bytes: usize,
    color_table_offset: usize,
    color_table_flags: usize,
    color_count: usize,
    width: usize,
    height: usize,
    data_offset: usize,
}

#[cfg(test)]
fn find_packbits_rect(pict: &[u8]) -> Option<PackBitsRect> {
    let mut offset = 10usize;
    while offset + 80 < pict.len() {
        let opcode = u16_safe(pict, offset)?;
        if opcode == 0x0098 || opcode == 0x0099 {
            let pixmap = offset + 2;
            let row_bytes_raw = u16_safe(pict, pixmap)?;
            let row_bytes = row_bytes_raw & 0x3fff;
            let pixel_type = u16_safe(pict, pixmap + 26)?;
            let pixel_size = u16_safe(pict, pixmap + 28)?;
            let component_count = u16_safe(pict, pixmap + 30)?;
            let component_size = u16_safe(pict, pixmap + 32)?;
            if row_bytes_raw & 0x8000 != 0
                && row_bytes > 0
                && row_bytes <= 4096
                && pixel_type == 0
                && pixel_size == 8
                && component_count == 1
                && component_size == 8
            {
                let color_table_offset = pixmap + 46;
                let color_table_flags = u16_safe(pict, color_table_offset + 4)?;
                let color_count = u16_safe(pict, color_table_offset + 6)? + 1;
                let after_color_table = color_table_offset + 8 + color_count * 8;
                if after_color_table + 18 < pict.len() {
                    let width = (i16_be(pict, after_color_table + 6)
                        - i16_be(pict, after_color_table + 2))
                    .max(0) as usize;
                    let height = (i16_be(pict, after_color_table + 4)
                        - i16_be(pict, after_color_table))
                    .max(0) as usize;
                    let mut data_offset = after_color_table + 18;
                    if opcode == 0x0099 {
                        let region_size = u16_safe(pict, data_offset)?;
                        if region_size < 10 || data_offset + region_size >= pict.len() {
                            offset += 2;
                            continue;
                        }
                        data_offset += region_size;
                    }
                    if width > 0 && height > 0 {
                        return Some(PackBitsRect {
                            row_bytes,
                            color_table_offset,
                            color_table_flags,
                            color_count,
                            width,
                            height,
                            data_offset,
                        });
                    }
                }
            }
        }
        offset += 2;
    }
    None
}

fn decode_cicn(cicn: &[u8]) -> Result<DecodedImage> {
    if cicn.len() < 82 {
        return Err(ProvidenceError::message("cicn resource is too short"));
    }
    let row_bytes = u16_safe(cicn, 4).unwrap_or(0) & 0x3fff;
    let width = (i16_be(cicn, 12) - i16_be(cicn, 8)).max(0) as usize;
    let height = (i16_be(cicn, 10) - i16_be(cicn, 6)).max(0) as usize;
    let pixel_size = u16_safe(cicn, 32).unwrap_or(0);
    let mask_row_bytes = u16_safe(cicn, 54).unwrap_or(0) & 0x3fff;
    let mask_top = i16_be(cicn, 56);
    let mask_bottom = i16_be(cicn, 60);
    let mask_height = if mask_bottom > mask_top {
        (mask_bottom - mask_top) as usize
    } else {
        height
    };
    let bitmap_row_bytes = u16_safe(cicn, 68).unwrap_or(0) & 0x3fff;
    let bitmap_top = i16_be(cicn, 70);
    let bitmap_bottom = i16_be(cicn, 74);
    let bitmap_height = if bitmap_bottom > bitmap_top {
        (bitmap_bottom - bitmap_top) as usize
    } else {
        0
    };
    if width == 0 || height == 0 || ![1, 2, 4, 8].contains(&pixel_size) {
        return Err(ProvidenceError::message("Unsupported cicn geometry"));
    }
    let mask_offset = 82usize;
    let bitmap_offset = mask_offset + mask_row_bytes * mask_height;
    let color_table_offset = bitmap_offset + bitmap_row_bytes * bitmap_height;
    if color_table_offset + 8 > cicn.len() {
        return Err(ProvidenceError::message("cicn color table is missing"));
    }
    let color_count = u16_safe(cicn, color_table_offset + 6).unwrap_or(0) + 1;
    let pixel_data_offset = color_table_offset + 8 + color_count * 8;
    if pixel_data_offset + row_bytes * height > cicn.len() {
        return Err(ProvidenceError::message("cicn pixel data is truncated"));
    }
    let mut color_entries = Vec::with_capacity(color_count);
    let color_table_flags = u16_safe(cicn, color_table_offset + 4).unwrap_or(0);
    for index in 0..color_count {
        let offset = color_table_offset + 8 + index * 8;
        color_entries.push(ColorTableEntry {
            color_num: u16_safe(cicn, offset).unwrap_or(index),
            rgb: [
                color_component_8(u16_safe(cicn, offset + 2).unwrap_or(0)),
                color_component_8(u16_safe(cicn, offset + 4).unwrap_or(0)),
                color_component_8(u16_safe(cicn, offset + 6).unwrap_or(0)),
            ],
        });
    }
    let max_pixel_value = (1usize << pixel_size) - 1;
    let mut rgba = vec![0u8; width * height * 4];
    for y in 0..height {
        for x in 0..width {
            let color_index = match pixel_size {
                8 => cicn[pixel_data_offset + y * row_bytes + x] as usize,
                4 => {
                    let byte = cicn[pixel_data_offset + y * row_bytes + x / 2];
                    if x % 2 == 0 {
                        (byte >> 4) as usize
                    } else {
                        (byte & 0x0f) as usize
                    }
                }
                2 => {
                    let byte = cicn[pixel_data_offset + y * row_bytes + x / 4];
                    ((byte >> (6 - (x % 4) * 2)) & 0x03) as usize
                }
                _ => {
                    let byte = cicn[pixel_data_offset + y * row_bytes + x / 8];
                    ((byte >> (7 - (x % 8))) & 0x01) as usize
                }
            };
            let mask_byte = cicn
                .get(mask_offset + y * mask_row_bytes + x / 8)
                .copied()
                .unwrap_or(0xff);
            let alpha = if (mask_byte >> (7 - (x % 8))) & 1 == 1 {
                255
            } else {
                0
            };
            let color = lookup_color_table_entry(&color_entries, color_table_flags, color_index)
                .unwrap_or_else(|| {
                    if color_index == max_pixel_value {
                        [0, 0, 0]
                    } else {
                        [0, 0, 0]
                    }
                });
            let out = (y * width + x) * 4;
            rgba[out] = color[0];
            rgba[out + 1] = color[1];
            rgba[out + 2] = color[2];
            rgba[out + 3] = alpha;
        }
    }
    Ok(DecodedImage {
        width: width as u32,
        height: height as u32,
        rgba,
    })
}

#[derive(Clone, Copy)]
struct ColorTableEntry {
    color_num: usize,
    rgb: [u8; 3],
}

fn lookup_color_table_entry(
    entries: &[ColorTableEntry],
    flags: usize,
    color_id: usize,
) -> Option<[u8; 3]> {
    if flags & 0x8000 != 0 {
        return entries.get(color_id).map(|entry| entry.rgb);
    }
    entries
        .iter()
        .find(|entry| entry.color_num == color_id)
        .map(|entry| entry.rgb)
}

fn color_component_8(component: usize) -> u8 {
    (component / 0x0101) as u8
}

#[cfg(test)]
fn color_table_palette_index(
    flags: usize,
    entry_index: usize,
    color_index: usize,
    palette_len: usize,
) -> usize {
    if flags & 0x8000 != 0 || color_index >= palette_len {
        entry_index
    } else {
        color_index
    }
}

fn encode_wav_u8(sample_rate: u32, samples: &[u8]) -> Vec<u8> {
    let mut wav = Vec::new();
    wav.extend_from_slice(b"RIFF");
    push_u32_le(&mut wav, 36 + samples.len());
    wav.extend_from_slice(b"WAVEfmt ");
    push_u32_le(&mut wav, 16);
    push_u16_le(&mut wav, 1);
    push_u16_le(&mut wav, 1);
    push_u32_le(&mut wav, sample_rate as usize);
    push_u32_le(&mut wav, sample_rate as usize);
    push_u16_le(&mut wav, 1);
    push_u16_le(&mut wav, 8);
    wav.extend_from_slice(b"data");
    push_u32_le(&mut wav, samples.len());
    wav.extend_from_slice(samples);
    wav
}

#[derive(Clone)]
struct QuantizedColor {
    color: [u8; 3],
    count: usize,
}

fn quantize_rgba_to_palette(rgba: &[u8], width: usize, dither: bool) -> (Vec<u8>, Vec<[u8; 3]>) {
    let palette = adaptive_palette(rgba);
    let indices = if dither {
        quantize_with_floyd_steinberg(rgba, width, &palette)
    } else {
        quantize_nearest(rgba, &palette)
    };
    (indices, palette)
}

fn adaptive_palette(rgba: &[u8]) -> Vec<[u8; 3]> {
    let mut histogram = BTreeMap::<[u8; 3], usize>::new();
    for pixel in rgba.chunks_exact(4) {
        let color = [pixel[0] & 0xf8, pixel[1] & 0xf8, pixel[2] & 0xf8];
        *histogram.entry(color).or_insert(0) += 1;
    }
    if histogram.is_empty() {
        return vec![[0, 0, 0]];
    }
    let colors = histogram
        .into_iter()
        .map(|(color, count)| QuantizedColor { color, count })
        .collect::<Vec<_>>();
    if colors.len() <= 256 {
        return colors.into_iter().map(|entry| entry.color).collect();
    }
    let mut buckets = vec![colors];
    while buckets.len() < 256 {
        let Some(bucket_index) = buckets
            .iter()
            .enumerate()
            .filter(|(_, bucket)| bucket.len() > 1)
            .max_by_key(|(_, bucket)| bucket_score(bucket))
            .map(|(index, _)| index)
        else {
            break;
        };
        let bucket = buckets.swap_remove(bucket_index);
        let (left, right) = split_color_bucket(bucket);
        if left.is_empty() || right.is_empty() {
            buckets.push([left, right].concat());
            break;
        }
        buckets.push(left);
        buckets.push(right);
    }
    let mut palette = buckets
        .iter()
        .map(|bucket| weighted_average_color(bucket))
        .collect::<Vec<_>>();
    palette.sort();
    palette.truncate(256);
    if palette.is_empty() {
        palette.push([0, 0, 0]);
    }
    palette
}

fn bucket_score(bucket: &[QuantizedColor]) -> usize {
    let (min, max) = bucket_bounds(bucket);
    let range = (0..3)
        .map(|channel| max[channel] as usize - min[channel] as usize)
        .max()
        .unwrap_or(0);
    range * bucket.iter().map(|entry| entry.count).sum::<usize>()
}

fn split_color_bucket(
    mut bucket: Vec<QuantizedColor>,
) -> (Vec<QuantizedColor>, Vec<QuantizedColor>) {
    let (min, max) = bucket_bounds(&bucket);
    let channel = (0..3)
        .max_by_key(|channel| max[*channel] as usize - min[*channel] as usize)
        .unwrap_or(0);
    bucket.sort_by_key(|entry| entry.color[channel]);
    let total = bucket.iter().map(|entry| entry.count).sum::<usize>();
    let half = total / 2;
    let mut running = 0usize;
    let mut split_index = 1usize;
    for (index, entry) in bucket.iter().enumerate() {
        running += entry.count;
        if running >= half {
            split_index = (index + 1).clamp(1, bucket.len().saturating_sub(1));
            break;
        }
    }
    let right = bucket.split_off(split_index);
    (bucket, right)
}

fn bucket_bounds(bucket: &[QuantizedColor]) -> ([u8; 3], [u8; 3]) {
    let mut min = [u8::MAX; 3];
    let mut max = [u8::MIN; 3];
    for entry in bucket {
        for channel in 0..3 {
            min[channel] = min[channel].min(entry.color[channel]);
            max[channel] = max[channel].max(entry.color[channel]);
        }
    }
    (min, max)
}

fn weighted_average_color(bucket: &[QuantizedColor]) -> [u8; 3] {
    let total = bucket.iter().map(|entry| entry.count).sum::<usize>().max(1);
    let mut sums = [0usize; 3];
    for entry in bucket {
        for (channel, sum) in sums.iter_mut().enumerate() {
            *sum += entry.color[channel] as usize * entry.count;
        }
    }
    [
        (sums[0] / total) as u8,
        (sums[1] / total) as u8,
        (sums[2] / total) as u8,
    ]
}

fn quantize_nearest(rgba: &[u8], palette: &[[u8; 3]]) -> Vec<u8> {
    rgba.chunks_exact(4)
        .map(|pixel| nearest_palette_index(palette, [pixel[0], pixel[1], pixel[2]]))
        .collect()
}

fn quantize_with_floyd_steinberg(rgba: &[u8], width: usize, palette: &[[u8; 3]]) -> Vec<u8> {
    let pixels = rgba.len() / 4;
    if pixels == 0 || width == 0 {
        return Vec::new();
    }
    let height = pixels.div_ceil(width);
    let mut work = rgba
        .chunks_exact(4)
        .map(|pixel| [pixel[0] as f32, pixel[1] as f32, pixel[2] as f32])
        .collect::<Vec<_>>();
    let mut indices = vec![0u8; pixels];
    for y in 0..height {
        for x in 0..width {
            let index = y * width + x;
            if index >= pixels {
                continue;
            }
            let old = [
                work[index][0].clamp(0.0, 255.0) as u8,
                work[index][1].clamp(0.0, 255.0) as u8,
                work[index][2].clamp(0.0, 255.0) as u8,
            ];
            let palette_index = nearest_palette_index(palette, old);
            let new = palette[palette_index as usize];
            indices[index] = palette_index;
            let error = [
                old[0] as f32 - new[0] as f32,
                old[1] as f32 - new[1] as f32,
                old[2] as f32 - new[2] as f32,
            ];
            diffuse_error(&mut work, pixels, width, x + 1, y, error, 7.0 / 16.0);
            if x > 0 {
                diffuse_error(&mut work, pixels, width, x - 1, y + 1, error, 3.0 / 16.0);
            }
            diffuse_error(&mut work, pixels, width, x, y + 1, error, 5.0 / 16.0);
            diffuse_error(&mut work, pixels, width, x + 1, y + 1, error, 1.0 / 16.0);
        }
    }
    indices
}

fn diffuse_error(
    work: &mut [[f32; 3]],
    pixels: usize,
    width: usize,
    x: usize,
    y: usize,
    error: [f32; 3],
    factor: f32,
) {
    let index = y * width + x;
    if index >= pixels {
        return;
    }
    for (channel, channel_error) in error.iter().enumerate() {
        work[index][channel] += channel_error * factor;
    }
}

fn nearest_palette_index(palette: &[[u8; 3]], color: [u8; 3]) -> u8 {
    palette
        .iter()
        .enumerate()
        .min_by_key(|(_, candidate)| {
            let dr = color[0] as i32 - candidate[0] as i32;
            let dg = color[1] as i32 - candidate[1] as i32;
            let db = color[2] as i32 - candidate[2] as i32;
            dr * dr + dg * dg + db * db
        })
        .map(|(index, _)| index as u8)
        .unwrap_or(0)
}

fn resize_rgba_nearest(
    rgba: &[u8],
    source_width: usize,
    source_height: usize,
    target_width: usize,
    target_height: usize,
) -> Vec<u8> {
    let mut output = vec![0u8; target_width * target_height * 4];
    for y in 0..target_height {
        for x in 0..target_width {
            let sx = x * source_width / target_width;
            let sy = y * source_height / target_height;
            let src = (sy * source_width + sx) * 4;
            let dst = (y * target_width + x) * 4;
            output[dst..dst + 4].copy_from_slice(&rgba[src..src + 4]);
        }
    }
    output
}

fn packbits(row: &[u8]) -> Vec<u8> {
    let mut output = Vec::new();
    let mut cursor = 0usize;
    while cursor < row.len() {
        let mut run = 1usize;
        while cursor + run < row.len() && row[cursor + run] == row[cursor] && run < 128 {
            run += 1;
        }
        if run >= 3 {
            output.push((257 - run) as u8);
            output.push(row[cursor]);
            cursor += run;
            continue;
        }
        let literal_start = cursor;
        cursor += run;
        while cursor < row.len() {
            let mut next_run = 1usize;
            while cursor + next_run < row.len()
                && row[cursor + next_run] == row[cursor]
                && next_run < 128
            {
                next_run += 1;
            }
            if next_run >= 3 || cursor - literal_start >= 128 {
                break;
            }
            cursor += next_run;
        }
        let len = cursor - literal_start;
        output.push((len - 1) as u8);
        output.extend_from_slice(&row[literal_start..cursor]);
    }
    output
}

#[cfg(test)]
fn decode_packbits_row(
    buffer: &[u8],
    offset: usize,
    packed_length: usize,
    expected: usize,
) -> Vec<u8> {
    let end = (offset + packed_length).min(buffer.len());
    let mut cursor = offset;
    let mut output = Vec::with_capacity(expected);
    while cursor < end && output.len() < expected {
        let control = buffer[cursor] as i8;
        cursor += 1;
        if (0..=127).contains(&control) {
            let count = control as usize + 1;
            for _ in 0..count {
                if cursor >= end {
                    break;
                }
                output.push(buffer[cursor]);
                cursor += 1;
            }
        } else if (-127..=-1).contains(&control) && cursor < end {
            let count = (1 - control) as usize;
            let value = buffer[cursor];
            cursor += 1;
            for _ in 0..count {
                output.push(value);
            }
        }
    }
    output.resize(expected, 0);
    output
}

fn downmix_interleaved_u8(samples: &[u8], channels: usize) -> Vec<u8> {
    if channels <= 1 {
        return samples.to_vec();
    }
    samples
        .chunks(channels)
        .map(|frame| {
            let sum: usize = frame.iter().map(|value| *value as usize).sum();
            (sum / frame.len().max(1)) as u8
        })
        .collect()
}

fn expected_rgba_len(width: u32, height: u32, len: usize) -> Result<()> {
    let expected = width as usize * height as usize * 4;
    if len != expected {
        return Err(ProvidenceError::message(format!(
            "RGBA payload length {len} does not match {width} x {height}"
        )));
    }
    Ok(())
}

fn extract_resource_fork(buffer: &[u8]) -> &[u8] {
    if buffer.len() < 26 {
        return buffer;
    }
    let Some(magic) = u32_safe(buffer, 0) else {
        return buffer;
    };
    if magic != APPLE_SINGLE_MAGIC && magic != APPLE_DOUBLE_MAGIC {
        return buffer;
    }
    let Some(entry_count) = u16_safe(buffer, 24) else {
        return buffer;
    };
    for index in 0..entry_count {
        let entry_offset = 26 + index * 12;
        let Some(entry_id) = u32_safe(buffer, entry_offset) else {
            continue;
        };
        let Some(offset) = u32_safe(buffer, entry_offset + 4) else {
            continue;
        };
        let Some(length) = u32_safe(buffer, entry_offset + 8) else {
            continue;
        };
        if entry_id == RESOURCE_FORK_ENTRY_ID && offset + length <= buffer.len() {
            return &buffer[offset..offset + length];
        }
    }
    buffer
}

fn decode_classic_text(bytes: &[u8]) -> String {
    bytes
        .iter()
        .map(|byte| match *byte {
            0 => ' ',
            9 => '\t',
            10 | 13 => '\n',
            32..=126 => *byte as char,
            _ => '?',
        })
        .collect::<String>()
        .trim()
        .to_string()
}

pub fn decode_string_list_resource(bytes: &[u8]) -> Vec<String> {
    let Some(count) = u16_safe(bytes, 0) else {
        return Vec::new();
    };
    let mut strings = Vec::new();
    let mut cursor = 2usize;
    for _ in 0..count {
        if cursor >= bytes.len() {
            break;
        }
        let len = bytes[cursor] as usize;
        cursor += 1;
        let end = (cursor + len).min(bytes.len());
        strings.push(decode_classic_text(&bytes[cursor..end]));
        cursor = end;
    }
    strings
}

pub fn encode_string_list_resource(strings: &[String]) -> Vec<u8> {
    let mut output = Vec::new();
    push_u16(&mut output, strings.len());
    for string in strings {
        let encoded = encode_classic_text(string);
        let len = encoded.len().min(255);
        output.push(len as u8);
        output.extend_from_slice(&encoded[..len]);
    }
    output
}

fn encode_classic_text(value: &str) -> Vec<u8> {
    value
        .chars()
        .map(|ch| if ch.is_ascii() { ch as u8 } else { b'?' })
        .collect()
}

fn push_rect(output: &mut Vec<u8>, top: i16, left: i16, bottom: i16, right: i16) {
    push_i16(output, top);
    push_i16(output, left);
    push_i16(output, bottom);
    push_i16(output, right);
}

fn write_rect(buffer: &mut [u8], offset: usize, top: i16, left: i16, bottom: i16, right: i16) {
    write_i16_be(buffer, offset, top);
    write_i16_be(buffer, offset + 2, left);
    write_i16_be(buffer, offset + 4, bottom);
    write_i16_be(buffer, offset + 6, right);
}

fn push_u16(output: &mut Vec<u8>, value: usize) {
    output.extend_from_slice(&(value as u16).to_be_bytes());
}

fn push_i16(output: &mut Vec<u8>, value: i16) {
    output.extend_from_slice(&value.to_be_bytes());
}

fn push_u32(output: &mut Vec<u8>, value: usize) {
    output.extend_from_slice(&(value as u32).to_be_bytes());
}

fn push_u16_le(output: &mut Vec<u8>, value: usize) {
    output.extend_from_slice(&(value as u16).to_le_bytes());
}

fn push_u32_le(output: &mut Vec<u8>, value: usize) {
    output.extend_from_slice(&(value as u32).to_le_bytes());
}

fn write_u16_be(buffer: &mut [u8], offset: usize, value: usize) {
    buffer[offset..offset + 2].copy_from_slice(&(value as u16).to_be_bytes());
}

fn write_i16_be(buffer: &mut [u8], offset: usize, value: i16) {
    buffer[offset..offset + 2].copy_from_slice(&value.to_be_bytes());
}

fn i16_be(buffer: &[u8], offset: usize) -> i16 {
    if offset + 2 > buffer.len() {
        return 0;
    }
    i16::from_be_bytes([buffer[offset], buffer[offset + 1]])
}

fn u16_safe(buffer: &[u8], offset: usize) -> Option<usize> {
    (offset + 2 <= buffer.len())
        .then(|| u16::from_be_bytes([buffer[offset], buffer[offset + 1]]) as usize)
}

fn u32_safe(buffer: &[u8], offset: usize) -> Option<usize> {
    (offset + 4 <= buffer.len()).then(|| {
        u32::from_be_bytes([
            buffer[offset],
            buffer[offset + 1],
            buffer[offset + 2],
            buffer[offset + 3],
        ]) as usize
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn minimum_scenario_resource_fork_is_canonical_empty_container() {
        let bytes =
            write_minimum_scenario_resource_fork().expect("write minimum scenario resource fork");
        assert_eq!(bytes.len(), MINIMUM_SCENARIO_RESOURCE_FORK_BYTES);
        assert!(parse_resource_fork_entries(&bytes).is_empty());
        assert_eq!(u32_safe(&bytes, 0), Some(16));
        assert_eq!(u32_safe(&bytes, 4), Some(16));
        assert_eq!(u32_safe(&bytes, 8), Some(0));
        assert_eq!(u32_safe(&bytes, 12), Some(30));
        let map_offset = u32_safe(&bytes, 4).expect("map offset");
        let type_list_offset = map_offset + u16_safe(&bytes, map_offset + 24).expect("type list");
        assert_eq!(u16_safe(&bytes, type_list_offset), Some(u16::MAX as usize));
    }

    #[test]
    fn resource_fork_preserves_and_replaces_entries() {
        let original = write_resource_fork(&[
            ResourceForkEntry {
                resource_type: "PICT".to_string(),
                id: 200,
                name: "Old".to_string(),
                attributes: 0,
                data: vec![1, 2, 3],
            },
            ResourceForkEntry {
                resource_type: "TEXT".to_string(),
                id: 1,
                name: String::new(),
                attributes: 0,
                data: b"hello".to_vec(),
            },
        ])
        .expect("write original");
        let (merged, replaced) = merge_resource_entries(
            &original,
            vec![
                ResourceForkEntry {
                    resource_type: "PICT".to_string(),
                    id: 200,
                    name: "New".to_string(),
                    attributes: 0,
                    data: vec![9, 9],
                },
                ResourceForkEntry {
                    resource_type: "snd ".to_string(),
                    id: 201,
                    name: "Sound".to_string(),
                    attributes: 0,
                    data: vec![4, 5],
                },
            ],
        )
        .expect("merge");
        let entries = parse_resource_fork_entries(&merged);
        assert_eq!(replaced, 1);
        assert!(entries
            .iter()
            .any(|entry| entry.resource_type == "TEXT" && entry.id == 1));
        assert!(entries.iter().any(|entry| entry.resource_type == "PICT"
            && entry.id == 200
            && entry.data == vec![9, 9]));
        assert!(entries
            .iter()
            .any(|entry| entry.resource_type == "snd " && entry.id == 201));
    }

    #[test]
    fn resource_fork_removes_excluded_entries() {
        let original = write_resource_fork(&[
            ResourceForkEntry {
                resource_type: "PICT".to_string(),
                id: 170,
                name: "Interface override".to_string(),
                attributes: 0,
                data: vec![1, 2],
            },
            ResourceForkEntry {
                resource_type: "TEXT".to_string(),
                id: 7,
                name: "Message".to_string(),
                attributes: 0,
                data: vec![3, 4],
            },
        ])
        .expect("write original");
        let (merged, replaced) = merge_resource_entries_with_removals(
            &original,
            Vec::new(),
            &[("PICT".to_string(), 170)],
        )
        .expect("remove resource");
        let entries = parse_resource_fork_entries(&merged);
        assert_eq!(replaced, 0);
        assert!(!entries
            .iter()
            .any(|entry| entry.resource_type == "PICT" && entry.id == 170));
        assert!(entries
            .iter()
            .any(|entry| entry.resource_type == "TEXT" && entry.id == 7));
    }

    #[test]
    fn string_list_resource_roundtrips_classic_pascal_strings() {
        let strings = vec![
            "Discover Magic".to_string(),
            "Caf\u{e9} spell".to_string(),
            "".to_string(),
        ];
        let encoded = encode_string_list_resource(&strings);
        assert_eq!(u16_safe(&encoded, 0), Some(3));
        assert_eq!(
            decode_string_list_resource(&encoded),
            vec![
                "Discover Magic".to_string(),
                "Caf? spell".to_string(),
                "".to_string(),
            ]
        );
    }

    #[test]
    fn pict_and_cicn_round_trip_to_preview_png() {
        let rgba = vec![255u8; 32 * 32 * 4];
        let payload = RgbaImagePayload {
            width: 32,
            height: 32,
            rgba_base64: STANDARD.encode(&rgba),
        };
        let pict = encode_pict_resource(&payload).expect("pict");
        let cicn = encode_cicn_resource(&payload).expect("cicn");
        assert_eq!(i16_be(&pict, 2), 0);
        assert_eq!(i16_be(&pict, 4), 0);
        assert_eq!(i16_be(&pict, 6), 32);
        assert_eq!(i16_be(&pict, 8), 32);
        assert!(preview_data_url_for_resource("PICT", &pict)
            .expect("pict preview")
            .expect("pict data url")
            .starts_with("data:image/png;base64,"));
        assert!(preview_data_url_for_resource("cicn", &cicn)
            .expect("cicn preview")
            .expect("cicn data url")
            .starts_with("data:image/png;base64,"));
    }

    #[test]
    fn cicn_encoder_preserves_requested_monster_icon_dimensions() {
        for (width, height) in [(32u32, 32u32), (32, 64), (64, 32), (64, 64)] {
            let mut rgba = Vec::new();
            for y in 0..height {
                for x in 0..width {
                    rgba.extend_from_slice(&[
                        (x * 5).min(255) as u8,
                        (y * 3).min(255) as u8,
                        ((x + y) * 2).min(255) as u8,
                        255,
                    ]);
                }
            }
            let payload = RgbaImagePayload {
                width,
                height,
                rgba_base64: STANDARD.encode(&rgba),
            };
            let cicn = encode_cicn_resource_with_dimensions(&payload, width, height)
                .expect("dimensioned cicn");
            let decoded = decode_cicn(&cicn).expect("decoded cicn");
            assert_eq!(decoded.width, width);
            assert_eq!(decoded.height, height);
            assert!(preview_data_url_for_resource("cicn", &cicn)
                .expect("cicn preview")
                .expect("cicn data url")
                .starts_with("data:image/png;base64,"));
        }
    }

    #[test]
    fn resource_fork_preview_decodes_ordered_custom_landlook_palette_fixture() {
        let path = std::path::Path::new(
            "F:/Realmz/base/Realmz/Scenarios/War in the Sword Lands/Scenario.rsrc",
        );
        if !path.is_file() {
            eprintln!("Skipping War in the Sword Lands PICT fixture; local fixture is absent.");
            return;
        }
        let fork = std::fs::read(path).expect("read War scenario resource fork");
        let Some(pict) = parse_resource_fork_entries(&fork)
            .into_iter()
            .find(|entry| entry.resource_type == "PICT" && entry.id == 307)
            .map(|entry| entry.data)
        else {
            eprintln!("Skipping War in the Sword Lands PICT fixture; PICT 307 is absent.");
            return;
        };
        let rect = find_packbits_rect(&pict).expect("War PICT 307 should contain PackBitsRect");
        assert_eq!(rect.color_table_flags & 0x8000, 0x8000);
        let image = decode_pict_packbits8(&pict).expect("War PICT 307 should decode");
        let nonblack_pixels = image
            .rgba
            .chunks_exact(4)
            .filter(|pixel| pixel[0] != 0 || pixel[1] != 0 || pixel[2] != 0)
            .count();
        assert!(
            nonblack_pixels > ((image.width as usize * image.height as usize) / 2),
            "ordered ColorTable PICT should not decode as an all-black atlas"
        );
    }

    #[test]
    fn cicn_fixtures_do_not_decode_dark_art_as_opaque_white() {
        let fixtures = [
            (
                "F:/Realmz/base/Realmz/Scenarios/War in the Sword Lands/Scenario.rsrc",
                [-186, -163, -162, -161].as_slice(),
            ),
            (
                "F:/Realmz - Providence/public/bundled-libraries/realmz-reference/The Family Jewels.rsrc",
                [146, 147, 148, 155].as_slice(),
            ),
        ];
        for (path, ids) in fixtures {
            let path = std::path::Path::new(path);
            if !path.is_file() {
                eprintln!(
                    "Skipping cicn fixture {}; local fixture is absent.",
                    path.display()
                );
                continue;
            }
            let fork = std::fs::read(path).expect("read cicn fixture resource fork");
            let entries = parse_resource_fork_entries(&fork);
            for id in ids {
                let Some(cicn) = entries
                    .iter()
                    .find(|entry| entry.resource_type == "cicn" && entry.id == *id)
                    .map(|entry| entry.data.as_slice())
                else {
                    eprintln!(
                        "Skipping cicn {} from {}; resource is absent.",
                        id,
                        path.display()
                    );
                    continue;
                };
                let image = decode_cicn(cicn).expect("cicn should decode");
                let mut opaque_pixels = 0usize;
                let mut opaque_white_pixels = 0usize;
                for pixel in image.rgba.chunks_exact(4) {
                    if pixel[3] == 0 {
                        continue;
                    }
                    opaque_pixels += 1;
                    if pixel[0] > 245 && pixel[1] > 245 && pixel[2] > 245 {
                        opaque_white_pixels += 1;
                    }
                }
                assert!(
                    opaque_pixels > 0,
                    "cicn {id} from {} should have visible pixels",
                    path.display()
                );
                assert!(
                    opaque_white_pixels * 4 <= opaque_pixels,
                    "cicn {id} from {} decoded as too much opaque white ({opaque_white_pixels}/{opaque_pixels})",
                    path.display()
                );
            }
        }
    }

    #[test]
    fn adaptive_quantizer_caps_palette_at_256_colors() {
        let mut rgba = Vec::new();
        for y in 0..40u8 {
            for x in 0..40u8 {
                rgba.extend_from_slice(&[
                    x.wrapping_mul(17),
                    y.wrapping_mul(11),
                    x.wrapping_mul(7).wrapping_add(y.wrapping_mul(5)),
                    255,
                ]);
            }
        }
        let (indices, palette) = quantize_rgba_to_palette(&rgba, 40, false);
        assert_eq!(indices.len(), 40 * 40);
        assert!(palette.len() <= 256);
        assert!(indices
            .iter()
            .all(|index| (*index as usize) < palette.len()));
    }

    #[test]
    fn floyd_steinberg_quantizer_is_deterministic() {
        let mut rgba = Vec::new();
        for y in 0..24u8 {
            for x in 0..24u8 {
                rgba.extend_from_slice(&[x.wrapping_mul(23), y.wrapping_mul(19), x ^ y, 255]);
            }
        }
        let first = quantize_rgba_to_palette(&rgba, 24, true);
        let second = quantize_rgba_to_palette(&rgba, 24, true);
        assert_eq!(first, second);
    }

    #[test]
    fn snd_round_trip_to_wav_preview() {
        let payload = PcmAudioPayload {
            sample_rate: 11_025,
            channels: 1,
            duration_ms: Some(10),
            pcm8_base64: STANDARD.encode(vec![128u8; 128]),
        };
        let snd = encode_snd_resource(&payload).expect("snd");
        let wav = decode_snd_to_wav(&snd).expect("wav");
        assert!(wav.starts_with(b"RIFF"));
    }

    #[test]
    fn text_resource_previews_include_string_lists_and_metadata() {
        let str_list = vec![
            0, 2, 5, b'H', b'e', b'l', b'l', b'o', 5, b'W', b'o', b'r', b'l', b'd',
        ];
        let preview = inspect_resource_preview("STR#", &str_list).expect("str preview");
        assert!(matches!(preview.status, ResourcePreviewStatus::TextReady));
        assert_eq!(
            preview.summary.get("strings").map(String::as_str),
            Some("2")
        );
        assert!(preview
            .data_url
            .expect("text data")
            .starts_with("data:text/plain;base64,"));

        let styl = inspect_resource_preview("styl", &[0, 1, 0, 0]).expect("styl preview");
        assert!(matches!(styl.status, ResourcePreviewStatus::MetadataOnly));
        assert_eq!(
            styl.summary
                .get("styleRunCountCandidate")
                .map(String::as_str),
            Some("1")
        );
    }
}

use crate::error::{ProvidenceError, Result};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use std::collections::BTreeMap;

const APPLE_SINGLE_MAGIC: usize = 0x0005_1600;
const APPLE_DOUBLE_MAGIC: usize = 0x0005_1607;
const RESOURCE_FORK_ENTRY_ID: usize = 2;

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
    push_u16(&mut type_list, type_count.saturating_sub(1));
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

pub fn merge_resource_entries(
    original: &[u8],
    updates: Vec<ResourceForkEntry>,
) -> Result<(Vec<u8>, usize)> {
    let mut entries = parse_resource_fork_entries(original);
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
    let rgba = STANDARD
        .decode(&payload.rgba_base64)
        .map_err(|error| ProvidenceError::message(error.to_string()))?;
    expected_rgba_len(payload.width, payload.height, rgba.len())?;
    let (indices, palette) = quantize_rgba_to_palette(&rgba);
    let row_bytes = payload.width as usize;

    let mut pict = vec![0; 10];
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
    let rgba = STANDARD
        .decode(&payload.rgba_base64)
        .map_err(|error| ProvidenceError::message(error.to_string()))?;
    expected_rgba_len(payload.width, payload.height, rgba.len())?;
    let resized = resize_rgba_nearest(
        &rgba,
        payload.width as usize,
        payload.height as usize,
        32,
        32,
    );
    let (indices, palette) = quantize_rgba_to_palette(&resized);
    let width = 32usize;
    let height = 32usize;
    let row_bytes = width;
    let mask_row_bytes = width / 8;
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
        "PICT" => match decode_pict_packbits8(data) {
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
                "image/pict",
                summary,
                format!("PICT decoder could not render this resource variant: {error}"),
            )),
        },
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
            let strings = decode_string_list(data);
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

fn decode_pict_packbits8(pict: &[u8]) -> Result<DecodedImage> {
    let Some(rect) = find_packbits_rect(pict) else {
        return Err(ProvidenceError::message("No 8-bit PackBitsRect found"));
    };
    let mut palette = Vec::new();
    for index in 0..rect.color_count {
        let offset = rect.color_table_offset + 8 + index * 8;
        palette.push([
            (u16_safe(pict, offset + 2).unwrap_or(0) >> 8) as u8,
            (u16_safe(pict, offset + 4).unwrap_or(0) >> 8) as u8,
            (u16_safe(pict, offset + 6).unwrap_or(0) >> 8) as u8,
        ]);
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

struct PackBitsRect {
    row_bytes: usize,
    color_table_offset: usize,
    color_count: usize,
    width: usize,
    height: usize,
    data_offset: usize,
}

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
    let mut palette = vec![[0u8, 0u8, 0u8]; color_count.max(1)];
    for index in 0..color_count {
        let offset = color_table_offset + 8 + index * 8;
        let color_index = u16_safe(cicn, offset).unwrap_or(index);
        if color_index < palette.len() {
            palette[color_index] = [
                (u16_safe(cicn, offset + 2).unwrap_or(0) >> 8) as u8,
                (u16_safe(cicn, offset + 4).unwrap_or(0) >> 8) as u8,
                (u16_safe(cicn, offset + 6).unwrap_or(0) >> 8) as u8,
            ];
        }
    }
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
            let color = palette.get(color_index).copied().unwrap_or([0, 0, 0]);
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

fn quantize_rgba_to_palette(rgba: &[u8]) -> (Vec<u8>, Vec<[u8; 3]>) {
    let mut palette = Vec::<[u8; 3]>::new();
    let mut lookup = BTreeMap::<[u8; 3], u8>::new();
    let mut indices = Vec::with_capacity(rgba.len() / 4);
    for pixel in rgba.chunks_exact(4) {
        let color = [
            (pixel[0] / 51) * 51,
            (pixel[1] / 51) * 51,
            (pixel[2] / 51) * 51,
        ];
        let index = if let Some(index) = lookup.get(&color) {
            *index
        } else if palette.len() < 256 {
            let index = palette.len() as u8;
            palette.push(color);
            lookup.insert(color, index);
            index
        } else {
            nearest_palette_index(&palette, color)
        };
        indices.push(index);
    }
    if palette.is_empty() {
        palette.push([0, 0, 0]);
    }
    (indices, palette)
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

fn decode_string_list(bytes: &[u8]) -> Vec<String> {
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

fn encode_classic_text(value: &str) -> Vec<u8> {
    value
        .bytes()
        .map(|byte| if byte.is_ascii() { byte } else { b'?' })
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
    fn pict_and_cicn_round_trip_to_preview_png() {
        let rgba = vec![255u8; 32 * 32 * 4];
        let payload = RgbaImagePayload {
            width: 32,
            height: 32,
            rgba_base64: STANDARD.encode(&rgba),
        };
        let pict = encode_pict_resource(&payload).expect("pict");
        let cicn = encode_cicn_resource(&payload).expect("cicn");
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

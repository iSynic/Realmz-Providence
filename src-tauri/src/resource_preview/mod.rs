use crate::error::{ProvidenceError, Result};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use std::collections::BTreeMap;

pub mod audit;
mod cicn;
mod pict;
pub mod sound;
mod text;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "kebab-case")]
pub enum ResourcePreviewStatus {
    PreviewReady,
    Playable,
    TextReady,
    MetadataOnly,
    UnsupportedVariant,
    Malformed,
    MissingFallback,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourcePreviewDiagnostic {
    pub severity: String,
    pub code: String,
    pub message: String,
    pub decoder: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub offset: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub opcode: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub variant: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hint: Option<String>,
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

#[derive(Debug, Clone)]
pub(crate) struct DecodedImage {
    pub width: u32,
    pub height: u32,
    pub rgba: Vec<u8>,
}

pub fn preview_data_url_for_resource(resource_type: &str, data: &[u8]) -> Result<Option<String>> {
    Ok(inspect_resource_preview(resource_type, data)?.data_url)
}

pub fn inspect_resource_preview(
    resource_type: &str,
    data: &[u8],
) -> Result<DecodedResourcePreview> {
    let summary = base_summary(resource_type, data);
    match resource_type {
        "PICT" => pict::inspect(data, summary),
        "cicn" => cicn::inspect(data, summary),
        "snd " => sound::inspect(data, summary),
        "TEXT" => Ok(text::inspect_text(data, summary)),
        "STR#" => Ok(text::inspect_string_list(data, summary)),
        "styl" => Ok(text::inspect_style(data, summary)),
        "vers" => Ok(text::inspect_version(data, summary)),
        "RLMZ" => Ok(text::inspect_rlmz(data, summary)),
        other => Ok(metadata_preview(
            ResourcePreviewStatus::MetadataOnly,
            "application/octet-stream",
            summary,
            diagnostic(
                "info",
                "resource.no_decoder",
                format!("No preview decoder is registered for resource type {other}."),
                "resource-preview",
            )
            .with_variant(other.trim()),
        )),
    }
}

fn base_summary(resource_type: &str, data: &[u8]) -> BTreeMap<String, String> {
    let mut summary = BTreeMap::new();
    summary.insert("resourceType".to_string(), resource_type.trim().to_string());
    summary.insert("bytes".to_string(), data.len().to_string());
    summary
}

pub(crate) fn image_preview(
    mut summary: BTreeMap<String, String>,
    image: DecodedImage,
    diagnostics: Vec<ResourcePreviewDiagnostic>,
) -> Result<DecodedResourcePreview> {
    summary.insert("width".to_string(), image.width.to_string());
    summary.insert("height".to_string(), image.height.to_string());
    Ok(DecodedResourcePreview {
        status: ResourcePreviewStatus::PreviewReady,
        mime_type: "image/png".to_string(),
        data_url: Some(encode_png_data_url(image.width, image.height, &image.rgba)?),
        summary,
        diagnostics,
    })
}

pub(crate) fn playable_preview(
    summary: BTreeMap<String, String>,
    wav: Vec<u8>,
    diagnostics: Vec<ResourcePreviewDiagnostic>,
) -> DecodedResourcePreview {
    DecodedResourcePreview {
        status: ResourcePreviewStatus::Playable,
        mime_type: "audio/wav".to_string(),
        data_url: Some(format!("data:audio/wav;base64,{}", STANDARD.encode(wav))),
        summary,
        diagnostics,
    }
}

pub(crate) fn text_preview(
    summary: BTreeMap<String, String>,
    text: String,
    diagnostics: Vec<ResourcePreviewDiagnostic>,
) -> DecodedResourcePreview {
    DecodedResourcePreview {
        status: ResourcePreviewStatus::TextReady,
        mime_type: "text/plain".to_string(),
        data_url: Some(format!(
            "data:text/plain;base64,{}",
            STANDARD.encode(text.as_bytes())
        )),
        summary,
        diagnostics,
    }
}

pub(crate) fn metadata_preview(
    status: ResourcePreviewStatus,
    mime_type: &str,
    summary: BTreeMap<String, String>,
    diagnostic: ResourcePreviewDiagnostic,
) -> DecodedResourcePreview {
    DecodedResourcePreview {
        status,
        mime_type: mime_type.to_string(),
        data_url: None,
        summary,
        diagnostics: vec![diagnostic],
    }
}

pub(crate) fn encode_png_data_url(width: u32, height: u32, rgba: &[u8]) -> Result<String> {
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

pub(crate) fn diagnostic(
    severity: &str,
    code: &str,
    message: impl Into<String>,
    decoder: &str,
) -> ResourcePreviewDiagnostic {
    ResourcePreviewDiagnostic {
        severity: severity.to_string(),
        code: code.to_string(),
        message: message.into(),
        decoder: decoder.to_string(),
        offset: None,
        opcode: None,
        variant: None,
        hint: None,
    }
}

pub(crate) trait DiagnosticExt {
    fn with_offset(self, offset: usize) -> Self;
    fn with_opcode(self, opcode: usize) -> Self;
    fn with_variant(self, variant: impl Into<String>) -> Self;
    fn with_hint(self, hint: impl Into<String>) -> Self;
}

impl DiagnosticExt for ResourcePreviewDiagnostic {
    fn with_offset(mut self, offset: usize) -> Self {
        self.offset = Some(offset);
        self
    }

    fn with_opcode(mut self, opcode: usize) -> Self {
        self.opcode = Some(format!("0x{opcode:04X}"));
        self
    }

    fn with_variant(mut self, variant: impl Into<String>) -> Self {
        self.variant = Some(variant.into());
        self
    }

    fn with_hint(mut self, hint: impl Into<String>) -> Self {
        self.hint = Some(hint.into());
        self
    }
}

pub(crate) fn u16_be(buffer: &[u8], offset: usize) -> Option<usize> {
    (offset + 2 <= buffer.len())
        .then(|| u16::from_be_bytes([buffer[offset], buffer[offset + 1]]) as usize)
}

pub(crate) fn i16_be(buffer: &[u8], offset: usize) -> i16 {
    if offset + 2 > buffer.len() {
        return 0;
    }
    i16::from_be_bytes([buffer[offset], buffer[offset + 1]])
}

pub(crate) fn u32_be(buffer: &[u8], offset: usize) -> Option<usize> {
    (offset + 4 <= buffer.len()).then(|| {
        u32::from_be_bytes([
            buffer[offset],
            buffer[offset + 1],
            buffer[offset + 2],
            buffer[offset + 3],
        ]) as usize
    })
}

pub(crate) fn decode_classic_text(bytes: &[u8]) -> String {
    bytes
        .iter()
        .map(|byte| match *byte {
            0 => ' ',
            9 => '\t',
            10 | 13 => '\n',
            32..=126 => *byte as char,
            0x80 => 'A',
            0x81 => 'A',
            0x82 => 'C',
            0x83 => 'E',
            0x84 => 'N',
            0x85 => 'O',
            0x86 => 'U',
            0x87 => 'a',
            0x88 => 'a',
            0x89 => 'a',
            0x8a => 'a',
            0x8b => 'a',
            0x8c => 'c',
            0x8d => 'e',
            0x8e => 'e',
            0x8f => 'e',
            0x90 => 'e',
            0x91 => 'i',
            0x92 => 'i',
            0x93 => 'i',
            0x94 => 'i',
            0x95 => 'n',
            0x96 => 'o',
            0x97 => 'o',
            0x98 => 'o',
            0x99 => 'o',
            0x9a => 'u',
            0x9b => 'u',
            0x9c => 'u',
            0x9d => 'u',
            _ => '?',
        })
        .collect::<String>()
        .trim()
        .to_string()
}

pub(crate) fn decode_packbits_row(
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
            let count = (1i16 - control as i16) as usize;
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

pub(crate) fn encode_wav_u8(sample_rate: u32, samples: &[u8]) -> Vec<u8> {
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

fn push_u16_le(output: &mut Vec<u8>, value: usize) {
    output.extend_from_slice(&(value as u16).to_le_bytes());
}

fn push_u32_le(output: &mut Vec<u8>, value: usize) {
    output.extend_from_slice(&(value as u32).to_le_bytes());
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::resource_fork::{encode_cicn_resource, encode_pict_resource, RgbaImagePayload};

    #[test]
    fn encoded_picture_and_icon_preview() {
        let rgba = vec![255u8; 32 * 32 * 4];
        let payload = RgbaImagePayload {
            width: 32,
            height: 32,
            rgba_base64: STANDARD.encode(&rgba),
        };
        let pict = encode_pict_resource(&payload).expect("pict");
        let cicn = encode_cicn_resource(&payload).expect("cicn");
        assert_eq!(
            inspect_resource_preview("PICT", &pict)
                .expect("pict")
                .status,
            ResourcePreviewStatus::PreviewReady
        );
        assert_eq!(
            inspect_resource_preview("cicn", &cicn)
                .expect("cicn")
                .status,
            ResourcePreviewStatus::PreviewReady
        );
    }

    #[test]
    fn unsupported_preview_has_structured_diagnostic() {
        let preview = inspect_resource_preview("PICT", &[0, 1, 2, 3]).expect("preview");
        assert_eq!(preview.status, ResourcePreviewStatus::Malformed);
        let diagnostic = preview.diagnostics.first().expect("diagnostic");
        assert!(!diagnostic.code.is_empty());
        assert!(!diagnostic.decoder.is_empty());
    }
}

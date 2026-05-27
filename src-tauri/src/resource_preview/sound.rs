use super::{
    diagnostic, encode_wav_u8, metadata_preview, playable_preview, u16_be, u32_be,
    DecodedResourcePreview, DiagnosticExt, ResourcePreviewStatus,
};
use crate::error::{ProvidenceError, Result};
use std::collections::BTreeMap;

pub(crate) fn inspect(
    data: &[u8],
    mut summary: BTreeMap<String, String>,
) -> Result<DecodedResourcePreview> {
    summary.insert(
        "format".to_string(),
        u16_be(data, 0)
            .map(|value| value.to_string())
            .unwrap_or_else(|| "missing".to_string()),
    );
    match decode_snd(data) {
        Ok(decoded) => {
            summary.insert("sampleRate".to_string(), decoded.sample_rate.to_string());
            summary.insert("samples".to_string(), decoded.samples.to_string());
            summary.insert("channels".to_string(), "1".to_string());
            summary.insert("variant".to_string(), decoded.variant);
            Ok(playable_preview(summary, decoded.wav, Vec::new()))
        }
        Err(failure) => Ok(metadata_preview(
            if failure.malformed {
                ResourcePreviewStatus::Malformed
            } else {
                ResourcePreviewStatus::UnsupportedVariant
            },
            "audio/x-mac-snd",
            summary,
            failure.diagnostic,
        )),
    }
}

pub fn decode_snd_to_wav(data: &[u8]) -> Result<Vec<u8>> {
    decode_snd(data)
        .map(|decoded| decoded.wav)
        .map_err(|failure| ProvidenceError::message(failure.diagnostic.message))
}

struct SoundDecode {
    wav: Vec<u8>,
    sample_rate: u32,
    samples: usize,
    variant: String,
}

struct SoundFailure {
    diagnostic: super::ResourcePreviewDiagnostic,
    malformed: bool,
}

fn decode_snd(data: &[u8]) -> std::result::Result<SoundDecode, SoundFailure> {
    let Some(format) = u16_be(data, 0) else {
        return Err(SoundFailure {
            malformed: true,
            diagnostic: diagnostic(
                "error",
                "snd.too_short",
                "snd resource is too short to contain a format word.",
                "snd",
            ),
        });
    };
    match format {
        1 => decode_format_one(data),
        2 => decode_format_two(data),
        other => Err(SoundFailure {
            malformed: false,
            diagnostic: diagnostic(
                "warning",
                "snd.unsupported_format",
                format!("snd resource format {other} is not a sampled-sound variant Providence can play yet."),
                "snd",
            )
            .with_variant(format!("format-{other}")),
        }),
    }
}

fn decode_format_one(data: &[u8]) -> std::result::Result<SoundDecode, SoundFailure> {
    if data.len() < 22 {
        return Err(SoundFailure {
            malformed: true,
            diagnostic: diagnostic(
                "error",
                "snd.format1_truncated",
                "format-1 snd resource is truncated before the command list.",
                "snd",
            ),
        });
    }
    let command_count_offset = 10usize;
    let command_count = u16_be(data, command_count_offset).unwrap_or(0);
    let mut cursor = command_count_offset + 2;
    let mut header_offset = None;
    let mut commands = Vec::new();
    for _ in 0..command_count {
        if cursor + 8 > data.len() {
            break;
        }
        let command = u16_be(data, cursor).unwrap_or(0);
        let offset = u32_be(data, cursor + 4).unwrap_or(0);
        commands.push(format!("0x{command:04X}@{offset}"));
        if command & 0x7fff == 0x0051 && command & 0x8000 != 0 {
            header_offset = Some(offset);
            break;
        }
        cursor += 8;
    }
    let Some(header_offset) = header_offset else {
        return Err(SoundFailure {
            malformed: false,
            diagnostic: diagnostic(
                "warning",
                "snd.no_buffer_command",
                format!(
                    "format-1 snd has no bufferCmd sound header. Commands: {}",
                    commands.join(", ")
                ),
                "snd",
            )
            .with_variant("format-1"),
        });
    };
    decode_standard_header(data, header_offset, 22, "format-1")
}

fn decode_format_two(data: &[u8]) -> std::result::Result<SoundDecode, SoundFailure> {
    if data.len() < 36 {
        return Err(SoundFailure {
            malformed: true,
            diagnostic: diagnostic(
                "error",
                "snd.format2_truncated",
                "format-2 sampled snd resource is truncated before its sound header.",
                "snd",
            ),
        });
    }
    let command_count = u16_be(data, 4).unwrap_or(0);
    let command = u16_be(data, 6).unwrap_or(0);
    let command_param = u32_be(data, 10).unwrap_or(0);
    if command_count == 0 || command & 0x7fff != 0x0051 {
        return Err(SoundFailure {
            malformed: false,
            diagnostic: diagnostic(
                "warning",
                "snd.format2_no_buffer_command",
                format!("format-2 snd expected a bufferCmd at offset 6; found commandCount={command_count}, command=0x{command:04X}."),
                "snd",
            )
            .with_opcode(command)
            .with_variant("format-2"),
        });
    }
    let mut decoded = decode_standard_header(data, 14, 22, "format-2")?;
    decoded.variant = format!("format-2 commandParam={command_param}");
    Ok(decoded)
}

fn decode_standard_header(
    data: &[u8],
    header_offset: usize,
    header_len: usize,
    variant: &str,
) -> std::result::Result<SoundDecode, SoundFailure> {
    if header_offset + header_len > data.len() {
        return Err(SoundFailure {
            malformed: true,
            diagnostic: diagnostic(
                "error",
                "snd.header_out_of_range",
                format!("{variant} sound header points outside the resource."),
                "snd",
            )
            .with_offset(header_offset)
            .with_variant(variant),
        });
    }
    let length = u32_be(data, header_offset + 4).unwrap_or(0);
    let sample_rate_fixed = u32_be(data, header_offset + 8).unwrap_or(22_254 << 16);
    let sample_rate = (sample_rate_fixed >> 16).max(1) as u32;
    let sample_start = header_offset + header_len;
    if sample_start + length > data.len() {
        return Err(SoundFailure {
            malformed: true,
            diagnostic: diagnostic(
                "error",
                "snd.sample_truncated",
                format!("{variant} declares {length} sample bytes, but the resource ends early."),
                "snd",
            )
            .with_offset(sample_start)
            .with_variant(variant),
        });
    }
    let samples = &data[sample_start..sample_start + length];
    let (playback_rate, playback_samples) = playable_pcm(sample_rate, samples);
    Ok(SoundDecode {
        wav: encode_wav_u8(playback_rate, &playback_samples),
        sample_rate,
        samples: samples.len(),
        variant: if playback_rate != sample_rate {
            format!("{variant} playbackRate={playback_rate}")
        } else {
            variant.to_string()
        },
    })
}

fn playable_pcm(sample_rate: u32, samples: &[u8]) -> (u32, Vec<u8>) {
    if sample_rate >= 8_000 {
        return (sample_rate, samples.to_vec());
    }
    let target_rate = 8_000u32;
    let output_len = ((samples.len() as u64 * target_rate as u64) / sample_rate.max(1) as u64)
        .max(1) as usize;
    let mut output = Vec::with_capacity(output_len);
    for index in 0..output_len {
        let source = (index as u64 * sample_rate.max(1) as u64 / target_rate as u64)
            .min(samples.len().saturating_sub(1) as u64) as usize;
        output.push(samples.get(source).copied().unwrap_or(128));
    }
    (target_rate, output)
}

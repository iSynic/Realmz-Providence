pub(crate) fn decode_wav_pcm8(bytes: &[u8]) -> Result<DecodedWav, String> {
    let (format, data) = read_wav_chunks(bytes)?;
    format.validate_geometry(data)?;
    let pcm8 = convert_pcm8(data, format.audio_format, format.bits_per_sample)?;
    let channels = format.channels;
    let sample_rate = format.sample_rate;
    if pcm8.is_empty() {
        return Err("WAV source contains no audio samples".into());
    }
    let frames = pcm8.len() / usize::from(channels);
    let duration_ms =
        ((frames as u64 * 1_000) / u64::from(sample_rate)).min(u64::from(u32::MAX)) as u32;
    Ok(DecodedWav {
        sample_rate,
        channels,
        duration_ms,
        bits_per_sample: format.bits_per_sample,
        audio_format: format.audio_format,
        pcm8,
    })
}

pub(crate) fn read_u16_le(bytes: &[u8], offset: usize) -> Option<u16> {
    Some(u16::from_le_bytes(
        bytes.get(offset..offset + 2)?.try_into().ok()?,
    ))
}

pub(crate) fn read_u32_le(bytes: &[u8], offset: usize) -> Option<u32> {
    Some(u32::from_le_bytes(
        bytes.get(offset..offset + 4)?.try_into().ok()?,
    ))
}
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct DecodedWav {
    pub(crate) sample_rate: u32,
    pub(crate) channels: u16,
    pub(crate) duration_ms: u32,
    pub(crate) bits_per_sample: u16,
    pub(crate) audio_format: u16,
    pub(crate) pcm8: Vec<u8>,
}

struct WavFormat {
    audio_format: u16,
    channels: u16,
    sample_rate: u32,
    block_align: u16,
    bits_per_sample: u16,
}

fn read_wav_chunks(bytes: &[u8]) -> Result<(WavFormat, &[u8]), String> {
    if bytes.len() < 12 || &bytes[..4] != b"RIFF" || &bytes[8..12] != b"WAVE" {
        return Err("Scenario Sound import currently requires a RIFF/WAVE source".into());
    }
    let mut cursor = 12usize;
    let mut format = None;
    let mut data = None;
    while cursor + 8 <= bytes.len() {
        let chunk_type = &bytes[cursor..cursor + 4];
        let length = read_u32_le(bytes, cursor + 4)
            .ok_or_else(|| "WAV chunk length is truncated".to_string())?
            as usize;
        let start = cursor + 8;
        let end = start
            .checked_add(length)
            .filter(|end| *end <= bytes.len())
            .ok_or_else(|| "WAV chunk extends beyond the source file".to_string())?;
        if chunk_type == b"fmt " {
            if length < 16 {
                return Err("WAV fmt chunk is shorter than 16 bytes".into());
            }
            format = Some(WavFormat {
                audio_format: read_u16_le(bytes, start).unwrap_or(0),
                channels: read_u16_le(bytes, start + 2).unwrap_or(0),
                sample_rate: read_u32_le(bytes, start + 4).unwrap_or(0),
                block_align: read_u16_le(bytes, start + 12).unwrap_or(0),
                bits_per_sample: read_u16_le(bytes, start + 14).unwrap_or(0),
            });
        } else if chunk_type == b"data" {
            data = Some(&bytes[start..end]);
        }
        cursor = end + (length & 1);
    }
    let format = format.ok_or_else(|| "WAV source has no fmt chunk".to_string())?;
    let data = data.ok_or_else(|| "WAV source has no data chunk".to_string())?;
    Ok((format, data))
}

impl WavFormat {
    fn validate_geometry(&self, data: &[u8]) -> Result<(), String> {
        let Self {
            channels,
            sample_rate,
            block_align,
            bits_per_sample,
            ..
        } = *self;
        if !(1..=8).contains(&channels) {
            return Err(format!("WAV channel count {channels} is outside 1-8"));
        }
        if !(1..=65_535).contains(&sample_rate) {
            return Err(format!(
                "WAV sample rate {sample_rate} is outside the Classic 1-65535 Hz range"
            ));
        }
        let bytes_per_sample = usize::from(bits_per_sample).div_ceil(8);
        let expected_align = usize::from(channels)
            .checked_mul(bytes_per_sample)
            .ok_or_else(|| "WAV block alignment overflowed".to_string())?;
        if expected_align == 0 || usize::from(block_align) != expected_align {
            return Err("WAV block alignment does not match its channel/sample geometry".into());
        }
        if !data.len().is_multiple_of(expected_align) {
            return Err("WAV sample data ends inside an audio frame".into());
        }
        Ok(())
    }
}

fn convert_pcm8(data: &[u8], audio_format: u16, bits_per_sample: u16) -> Result<Vec<u8>, String> {
    let pcm8 = match (audio_format, bits_per_sample) {
        (1, 8) => data.to_vec(),
        (1, 16) => data
            .chunks_exact(2)
            .map(|sample| {
                let value = i16::from_le_bytes([sample[0], sample[1]]);
                ((i32::from(value) + 32_768) >> 8) as u8
            })
            .collect(),
        (1, 24) => data
            .chunks_exact(3)
            .map(|sample| {
                let raw = i32::from(sample[0])
                    | (i32::from(sample[1]) << 8)
                    | (i32::from(sample[2]) << 16);
                let value = if raw & 0x0080_0000 != 0 {
                    raw | !0x00ff_ffff
                } else {
                    raw
                };
                ((i64::from(value) + 8_388_608) >> 16) as u8
            })
            .collect(),
        (1, 32) => data
            .chunks_exact(4)
            .map(|sample| {
                let value = i32::from_le_bytes(sample.try_into().unwrap());
                ((i64::from(value) + 2_147_483_648) >> 24) as u8
            })
            .collect(),
        (3, 32) => data
            .chunks_exact(4)
            .map(|sample| {
                let value = f32::from_le_bytes(sample.try_into().unwrap());
                ((value.clamp(-1.0, 1.0) * 127.5) + 127.5).round() as u8
            })
            .collect(),
        _ => {
            return Err(format!(
                "WAV format {audio_format} with {bits_per_sample}-bit samples is unsupported; use PCM 8/16/24/32-bit or 32-bit float"
            ));
        }
    };
    Ok(pcm8)
}

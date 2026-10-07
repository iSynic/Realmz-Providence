const MAX_RUNTIME_WAV_BYTES: usize = 64 * 1024 * 1024;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RuntimeWavError {
    InvalidSampleRate(u32),
    InvalidChannels(u16),
    InvalidBitsPerSample(u16),
    EmptyPcm,
    MisalignedPcm { bytes: usize, frame_bytes: usize },
    PayloadTooLarge,
}

impl std::fmt::Display for RuntimeWavError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InvalidSampleRate(rate) => write!(formatter, "invalid WAV sample rate {rate}"),
            Self::InvalidChannels(channels) => {
                write!(formatter, "invalid WAV channel count {channels}")
            }
            Self::InvalidBitsPerSample(bits) => write!(formatter, "invalid WAV sample size {bits}"),
            Self::EmptyPcm => write!(formatter, "WAV PCM payload is empty"),
            Self::MisalignedPcm { bytes, frame_bytes } => write!(
                formatter,
                "WAV PCM payload has {bytes} bytes, not a multiple of its {frame_bytes}-byte frames"
            ),
            Self::PayloadTooLarge => write!(formatter, "WAV payload exceeds the bounded encoder"),
        }
    }
}

impl std::error::Error for RuntimeWavError {}

pub fn encode_runtime_pcm_wav(
    pcm_le: &[u8],
    sample_rate: u32,
    channels: u16,
    bits_per_sample: u16,
) -> Result<Vec<u8>, RuntimeWavError> {
    if sample_rate == 0 || sample_rate > 65_535 {
        return Err(RuntimeWavError::InvalidSampleRate(sample_rate));
    }
    if !(1..=2).contains(&channels) {
        return Err(RuntimeWavError::InvalidChannels(channels));
    }
    if !matches!(bits_per_sample, 8 | 16) {
        return Err(RuntimeWavError::InvalidBitsPerSample(bits_per_sample));
    }
    if pcm_le.is_empty() {
        return Err(RuntimeWavError::EmptyPcm);
    }
    if pcm_le.len() > MAX_RUNTIME_WAV_BYTES {
        return Err(RuntimeWavError::PayloadTooLarge);
    }
    let frame_bytes = usize::from(channels) * usize::from(bits_per_sample / 8);
    if !pcm_le.len().is_multiple_of(frame_bytes) {
        return Err(RuntimeWavError::MisalignedPcm {
            bytes: pcm_le.len(),
            frame_bytes,
        });
    }
    let data_length = u32::try_from(pcm_le.len()).map_err(|_| RuntimeWavError::PayloadTooLarge)?;
    let padding = data_length & 1;
    let riff_length = 36u32
        .checked_add(data_length)
        .and_then(|length| length.checked_add(padding))
        .ok_or(RuntimeWavError::PayloadTooLarge)?;
    let block_align = channels * (bits_per_sample / 8);
    let byte_rate = sample_rate
        .checked_mul(u32::from(block_align))
        .ok_or(RuntimeWavError::PayloadTooLarge)?;

    let mut wav = Vec::with_capacity(riff_length as usize + 8);
    wav.extend_from_slice(b"RIFF");
    wav.extend_from_slice(&riff_length.to_le_bytes());
    wav.extend_from_slice(b"WAVEfmt ");
    wav.extend_from_slice(&16u32.to_le_bytes());
    wav.extend_from_slice(&1u16.to_le_bytes());
    wav.extend_from_slice(&channels.to_le_bytes());
    wav.extend_from_slice(&sample_rate.to_le_bytes());
    wav.extend_from_slice(&byte_rate.to_le_bytes());
    wav.extend_from_slice(&block_align.to_le_bytes());
    wav.extend_from_slice(&bits_per_sample.to_le_bytes());
    wav.extend_from_slice(b"data");
    wav.extend_from_slice(&data_length.to_le_bytes());
    wav.extend_from_slice(pcm_le);
    if padding != 0 {
        wav.push(0);
    }
    Ok(wav)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wav_is_deterministic_and_carries_exact_pcm_geometry() {
        let pcm = [0x34, 0x12, 0xdc, 0xfe];
        let first = encode_runtime_pcm_wav(&pcm, 22_050, 1, 16).unwrap();
        let second = encode_runtime_pcm_wav(&pcm, 22_050, 1, 16).unwrap();
        assert_eq!(first, second);
        assert_eq!(&first[..12], b"RIFF(\0\0\0WAVE");
        assert_eq!(u16::from_le_bytes([first[22], first[23]]), 1);
        assert_eq!(
            u32::from_le_bytes(first[24..28].try_into().unwrap()),
            22_050
        );
        assert_eq!(u16::from_le_bytes([first[34], first[35]]), 16);
        assert_eq!(&first[44..], &pcm);
    }

    #[test]
    fn wav_pads_an_odd_data_chunk_without_claiming_the_pad_as_audio() {
        let wav = encode_runtime_pcm_wav(&[1, 2, 3], 8_000, 1, 8).unwrap();
        assert_eq!(u32::from_le_bytes(wav[4..8].try_into().unwrap()), 40);
        assert_eq!(u32::from_le_bytes(wav[40..44].try_into().unwrap()), 3);
        assert_eq!(&wav[44..], &[1, 2, 3, 0]);
    }

    #[test]
    fn wav_rejects_unplayable_or_misaligned_geometry() {
        assert_eq!(
            encode_runtime_pcm_wav(&[1], 8_000, 2, 8),
            Err(RuntimeWavError::MisalignedPcm {
                bytes: 1,
                frame_bytes: 2
            })
        );
        assert_eq!(
            encode_runtime_pcm_wav(&[1], 0, 1, 8),
            Err(RuntimeWavError::InvalidSampleRate(0))
        );
    }
}

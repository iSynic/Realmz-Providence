use super::byte_io::{read_slice, read_u16, read_u32};
use super::constants::{EXTENDED_HEADER_BYTES, MAX_PCM_BYTES, STANDARD_HEADER_BYTES};
use super::types::{SndCompressionKind, SndDecodeError, SndHeaderKind};

pub(super) struct DecodedSamples {
    pub(super) header_kind: SndHeaderKind,
    pub(super) compression: SndCompressionKind,
    pub(super) channels: u16,
    pub(super) bits_per_sample: u16,
    pub(super) frames: u32,
    pub(super) loop_start: u32,
    pub(super) loop_end: u32,
    pub(super) runtime_pcm: Vec<u8>,
}

pub(super) fn decode_standard(
    input: &[u8],
    standard: &[u8],
    header_offset: usize,
    source_loop_start: u32,
    source_loop_end: u32,
) -> Result<DecodedSamples, SndDecodeError> {
    let byte_length = usize::try_from(read_u32(standard, 4, "sample length")?)
        .map_err(|_| SndDecodeError::PcmLengthOverflow)?;
    let samples = bounded_samples(input, header_offset + STANDARD_HEADER_BYTES, byte_length)?;
    Ok(DecodedSamples {
        header_kind: SndHeaderKind::Standard,
        compression: SndCompressionKind::None,
        channels: 1,
        bits_per_sample: 8,
        frames: u32::try_from(byte_length).map_err(|_| SndDecodeError::PcmLengthOverflow)?,
        loop_start: source_loop_start,
        loop_end: source_loop_end,
        runtime_pcm: samples.to_vec(),
    })
}

pub(super) fn decode_extended(
    input: &[u8],
    header_offset: usize,
    source_loop_start: u32,
    source_loop_end: u32,
) -> Result<DecodedSamples, SndDecodeError> {
    let extended = read_slice(
        input,
        header_offset,
        EXTENDED_HEADER_BYTES,
        "extended sound header",
    )
    .map_err(|_| SndDecodeError::HeaderOutOfRange(header_offset))?;
    let raw_channels = read_u32(extended, 4, "channel count")?;
    if !(1..=2).contains(&raw_channels) {
        return Err(SndDecodeError::UnsupportedChannels(raw_channels));
    }
    let channels = raw_channels as u16;
    let frames = read_u32(extended, 22, "frame count")?;
    let bits_per_sample = read_u16(extended, 48, "sample size")?;
    if !matches!(bits_per_sample, 8 | 16) {
        return Err(SndDecodeError::UnsupportedSampleSize(bits_per_sample));
    }
    let byte_length = usize::try_from(frames)
        .ok()
        .and_then(|frames| frames.checked_mul(usize::from(channels)))
        .and_then(|samples| samples.checked_mul(usize::from(bits_per_sample / 8)))
        .filter(|length| *length <= MAX_PCM_BYTES)
        .ok_or(SndDecodeError::PcmLengthOverflow)?;
    let samples = bounded_samples(input, header_offset + EXTENDED_HEADER_BYTES, byte_length)?;
    let runtime_pcm = if bits_per_sample == 16 {
        big_endian_words_to_little_endian(samples)
    } else {
        samples.to_vec()
    };
    Ok(DecodedSamples {
        header_kind: SndHeaderKind::Extended,
        compression: SndCompressionKind::None,
        channels,
        bits_per_sample,
        frames,
        loop_start: source_loop_start,
        loop_end: source_loop_end,
        runtime_pcm,
    })
}

pub(super) fn bounded_samples(
    input: &[u8],
    sample_offset: usize,
    byte_length: usize,
) -> Result<&[u8], SndDecodeError> {
    if byte_length > MAX_PCM_BYTES {
        return Err(SndDecodeError::PcmLengthOverflow);
    }
    let sample_end = sample_offset
        .checked_add(byte_length)
        .ok_or(SndDecodeError::PcmLengthOverflow)?;
    input
        .get(sample_offset..sample_end)
        .ok_or(SndDecodeError::TruncatedSamples {
            offset: sample_offset,
            expected: byte_length,
            available: input.len().saturating_sub(sample_offset),
        })
}

pub(super) fn big_endian_words_to_little_endian(samples: &[u8]) -> Vec<u8> {
    samples
        .chunks_exact(2)
        .flat_map(|word| [word[1], word[0]])
        .collect()
}

use super::byte_io::{read_slice, read_u32};
use super::compressed::decode_compressed_header;
use super::constants::STANDARD_HEADER_BYTES;
use super::pcm::{decode_extended, decode_standard};
use super::types::{DecodedSnd, SndDecodeError, SndHeaderLocation, SndResourceFormat};

pub(super) fn decode_header(
    input: &[u8],
    resource_format: SndResourceFormat,
    command: u16,
    header_offset: usize,
    header_location: SndHeaderLocation,
) -> Result<DecodedSnd, SndDecodeError> {
    let standard = read_slice(input, header_offset, STANDARD_HEADER_BYTES, "sound header")
        .map_err(|_| SndDecodeError::HeaderOutOfRange(header_offset))?;
    let sample_rate_fixed = read_u32(standard, 8, "sample rate")?;
    let sample_rate = sample_rate_fixed >> 16;
    if sample_rate == 0 {
        return Err(SndDecodeError::InvalidSampleRate(sample_rate_fixed));
    }
    let source_loop_start = read_u32(standard, 12, "loop start")?;
    let source_loop_end = read_u32(standard, 16, "loop end")?;
    let encoding = standard[20];
    let base_frequency = standard[21];
    let samples = match encoding {
        0 => decode_standard(
            input,
            standard,
            header_offset,
            source_loop_start,
            source_loop_end,
        )?,
        0xff => decode_extended(input, header_offset, source_loop_start, source_loop_end)?,
        0xfe => decode_compressed_header(input, header_offset, source_loop_start, source_loop_end)?,
        other => return Err(SndDecodeError::UnsupportedHeaderEncoding(other)),
    };
    Ok(DecodedSnd {
        resource_format,
        command,
        header_location,
        header_offset: u32::try_from(header_offset)
            .map_err(|_| SndDecodeError::PcmLengthOverflow)?,
        header_kind: samples.header_kind,
        compression: samples.compression,
        sample_rate_fixed,
        sample_rate,
        channels: samples.channels,
        bits_per_sample: samples.bits_per_sample,
        frames: samples.frames,
        loop_start: samples.loop_start,
        loop_end: samples.loop_end,
        base_frequency,
        runtime_pcm: samples.runtime_pcm,
    })
}

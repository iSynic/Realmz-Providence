use super::byte_io::{read_slice, read_u16, read_u32};
use super::constants::{
    COMPRESSED_HEADER_BYTES, FIXED_COMPRESSION, FORMAT_SOWT, FORMAT_TWOS, MACE_THREE_TO_ONE,
    MAX_PCM_BYTES, NOT_COMPRESSED,
};
use super::pcm::{DecodedSamples, big_endian_words_to_little_endian, bounded_samples};
use super::types::{SndCompressionKind, SndDecodeError, SndHeaderKind};

struct CompressedHeader {
    channels: u16,
    packet_frames: u32,
    format: u32,
    compression_id: u16,
    source_bits: u16,
    sample_offset: usize,
}

impl CompressedHeader {
    fn read(input: &[u8], header_offset: usize) -> Result<Self, SndDecodeError> {
        let header = read_slice(
            input,
            header_offset,
            COMPRESSED_HEADER_BYTES,
            "compressed sound header",
        )
        .map_err(|_| SndDecodeError::HeaderOutOfRange(header_offset))?;
        let raw_channels = read_u32(header, 4, "channel count")?;
        if !(1..=2).contains(&raw_channels) {
            return Err(SndDecodeError::UnsupportedChannels(raw_channels));
        }
        let channels = raw_channels as u16;
        let packet_frames = read_u32(header, 22, "compressed frame count")?;
        let format = read_u32(header, 40, "compression format")?;
        let state_vars = read_u32(header, 48, "compression state")?;
        let compression_id = read_u16(header, 56, "compression ID")?;
        let declared_bits = read_u16(header, 62, "sample size")?;
        let source_bits = if declared_bits == 0 {
            (state_vars >> 16) as u16
        } else {
            declared_bits
        };
        let sample_offset = header_offset + COMPRESSED_HEADER_BYTES;
        Ok(CompressedHeader {
            channels,
            packet_frames,
            format,
            compression_id,
            source_bits,
            sample_offset,
        })
    }
}

pub(super) fn decode_compressed_header(
    input: &[u8],
    header_offset: usize,
    source_loop_start: u32,
    source_loop_end: u32,
) -> Result<DecodedSamples, SndDecodeError> {
    let header = CompressedHeader::read(input, header_offset)?;
    match header.compression_id {
        MACE_THREE_TO_ONE => decode_mace(input, &header, source_loop_start, source_loop_end),
        NOT_COMPRESSED | FIXED_COMPRESSION
            if header.compression_id == NOT_COMPRESSED
                || matches!(header.format, FORMAT_TWOS | FORMAT_SOWT) =>
        {
            decode_pcm(input, &header, source_loop_start, source_loop_end)
        }
        _ => Err(SndDecodeError::UnsupportedCompression {
            compression_id: header.compression_id,
            format: header.format,
        }),
    }
}

fn decode_mace(
    input: &[u8],
    header: &CompressedHeader,
    source_loop_start: u32,
    source_loop_end: u32,
) -> Result<DecodedSamples, SndDecodeError> {
    let CompressedHeader {
        channels,
        packet_frames,
        source_bits,
        sample_offset,
        ..
    } = *header;
    if channels != 1 {
        return Err(SndDecodeError::UnsupportedCompressedStereo);
    }
    if source_bits != 8 {
        return Err(SndDecodeError::UnsupportedSampleSize(source_bits));
    }
    let compressed_bytes = usize::try_from(packet_frames)
        .ok()
        .and_then(|frames| frames.checked_mul(2))
        .filter(|length| *length <= MAX_PCM_BYTES / 6)
        .ok_or(SndDecodeError::PcmLengthOverflow)?;
    let compressed = bounded_samples(input, sample_offset, compressed_bytes)?;
    let samples = super::super::classic_mace::decode_mace3_mono(compressed);
    let runtime_pcm = samples
        .iter()
        .flat_map(|sample| sample.to_le_bytes())
        .collect::<Vec<_>>();
    let frames = packet_frames
        .checked_mul(6)
        .ok_or(SndDecodeError::PcmLengthOverflow)?;
    Ok(DecodedSamples {
        header_kind: SndHeaderKind::Compressed,
        compression: SndCompressionKind::Mace3,
        channels,
        bits_per_sample: 16,
        frames,
        loop_start: source_loop_start.saturating_mul(3),
        loop_end: source_loop_end.saturating_mul(3),
        runtime_pcm,
    })
}

fn decode_pcm(
    input: &[u8],
    header: &CompressedHeader,
    source_loop_start: u32,
    source_loop_end: u32,
) -> Result<DecodedSamples, SndDecodeError> {
    let CompressedHeader {
        channels,
        packet_frames,
        format,
        source_bits,
        sample_offset,
        ..
    } = *header;
    if !matches!(source_bits, 8 | 16) {
        return Err(SndDecodeError::UnsupportedSampleSize(source_bits));
    }
    let byte_length = usize::try_from(packet_frames)
        .ok()
        .and_then(|frames| frames.checked_mul(usize::from(channels)))
        .and_then(|samples| samples.checked_mul(usize::from(source_bits / 8)))
        .filter(|length| *length <= MAX_PCM_BYTES)
        .ok_or(SndDecodeError::PcmLengthOverflow)?;
    let samples = bounded_samples(input, sample_offset, byte_length)?;
    let little_endian = source_bits == 16 && format == FORMAT_SOWT;
    let runtime_pcm = if source_bits == 16 && !little_endian {
        big_endian_words_to_little_endian(samples)
    } else {
        samples.to_vec()
    };
    Ok(DecodedSamples {
        header_kind: SndHeaderKind::Compressed,
        compression: if little_endian {
            SndCompressionKind::LittleEndianPcm
        } else {
            SndCompressionKind::None
        },
        channels,
        bits_per_sample: source_bits,
        frames: packet_frames,
        loop_start: source_loop_start,
        loop_end: source_loop_end,
        runtime_pcm,
    })
}

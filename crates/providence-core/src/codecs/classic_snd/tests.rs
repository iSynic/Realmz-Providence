use super::constants::FORMAT_SOWT;
use super::*;
use crate::codecs::encode_scenario_sound_snd;

#[test]
fn decodes_the_controlled_format_one_encoder() {
    let source = [0, 64, 128, 255];
    let snd = encode_scenario_sound_snd(&source, 11_025, 1).unwrap();
    let decoded = decode_classic_snd(&snd).unwrap();
    assert_eq!(decoded.resource_format, SndResourceFormat::Format1);
    assert_eq!(decoded.command, 0x8051);
    assert_eq!(decoded.header_location, SndHeaderLocation::DeclaredOffset);
    assert_eq!(decoded.header_offset, 20);
    assert_eq!(decoded.header_kind, SndHeaderKind::Standard);
    assert_eq!(decoded.compression, SndCompressionKind::None);
    assert_eq!((decoded.sample_rate, decoded.channels), (11_025, 1));
    assert_eq!((decoded.bits_per_sample, decoded.frames), (8, 4));
    assert_eq!(decoded.runtime_pcm, source);
}

#[test]
fn decodes_format_two_sound_command_with_inline_standard_header() {
    let snd = standard_fixture(SndResourceFormat::Format2, 0x8050, 11_025, &[1, 2, 3]);
    let decoded = decode_classic_snd(&snd).unwrap();
    assert_eq!(decoded.resource_format, SndResourceFormat::Format2);
    assert_eq!(decoded.command, 0x8050);
    assert_eq!(decoded.header_location, SndHeaderLocation::DeclaredOffset);
    assert_eq!(decoded.header_offset, 14);
    assert_eq!(decoded.runtime_pcm, [1, 2, 3]);
}

#[test]
fn recovers_realmz_format_two_header_at_command_tail() {
    let mut snd = standard_fixture(SndResourceFormat::Format2, 0x8051, 11_025, &[1, 2, 3]);
    snd[10..14].copy_from_slice(&20u32.to_be_bytes());

    let decoded = decode_classic_snd(&snd).unwrap();
    assert_eq!(
        decoded.header_location,
        SndHeaderLocation::Format2CommandTailRecovery
    );
    assert_eq!(decoded.header_offset, 14);
    assert_eq!(decoded.runtime_pcm, [1, 2, 3]);
}

#[test]
fn retains_a_valid_declared_format_two_offset() {
    let mut snd = command_prefix(SndResourceFormat::Format2, 0x8051, 20);
    snd.extend_from_slice(&[0xa5; 6]);
    snd.extend_from_slice(&0u32.to_be_bytes());
    snd.extend_from_slice(&3u32.to_be_bytes());
    snd.extend_from_slice(&(11_025u32 << 16).to_be_bytes());
    snd.extend_from_slice(&0u32.to_be_bytes());
    snd.extend_from_slice(&3u32.to_be_bytes());
    snd.extend_from_slice(&[0, 60, 1, 2, 3]);

    let decoded = decode_classic_snd(&snd).unwrap();
    assert_eq!(decoded.header_location, SndHeaderLocation::DeclaredOffset);
    assert_eq!(decoded.header_offset, 20);
    assert_eq!(decoded.runtime_pcm, [1, 2, 3]);
}

#[test]
fn does_not_scan_for_an_arbitrary_format_two_header() {
    let mut snd = standard_fixture(SndResourceFormat::Format2, 0x8051, 11_025, &[1, 2, 3]);
    snd[10..14].copy_from_slice(&21u32.to_be_bytes());
    assert!(decode_classic_snd(&snd).is_err());
}

#[test]
fn decodes_extended_stereo_eight_bit_pcm() {
    let snd = extended_fixture(2, 8, 22_050, 2, &[0, 255, 64, 192]);
    let decoded = decode_classic_snd(&snd).unwrap();
    assert_eq!(decoded.header_kind, SndHeaderKind::Extended);
    assert_eq!((decoded.channels, decoded.bits_per_sample), (2, 8));
    assert_eq!(decoded.frames, 2);
    assert_eq!(decoded.runtime_pcm, [0, 255, 64, 192]);
}

#[test]
fn converts_extended_sixteen_bit_pcm_to_runtime_little_endian() {
    let snd = extended_fixture(1, 16, 22_050, 2, &[0x12, 0x34, 0xfe, 0xdc]);
    let decoded = decode_classic_snd(&snd).unwrap();
    assert_eq!((decoded.channels, decoded.bits_per_sample), (1, 16));
    assert_eq!(decoded.runtime_pcm, [0x34, 0x12, 0xdc, 0xfe]);
}

#[test]
fn expands_mace_three_to_one_to_sixteen_bit_runtime_pcm() {
    let snd = compressed_fixture(1, 8, 10_442, 1, 3, 0, &[0x53, 0xd7]);
    let decoded = decode_classic_snd(&snd).unwrap();
    assert_eq!(decoded.header_kind, SndHeaderKind::Compressed);
    assert_eq!(decoded.compression, SndCompressionKind::Mace3);
    assert_eq!((decoded.channels, decoded.bits_per_sample), (1, 16));
    assert_eq!(decoded.frames, 6);
    let samples = decoded
        .runtime_pcm
        .chunks_exact(2)
        .map(|word| i16::from_le_bytes([word[0], word[1]]))
        .collect::<Vec<_>>();
    assert_eq!(samples, [330, -94, 456, 281, -372, -795]);
}

#[test]
fn preserves_sowt_little_endian_pcm() {
    let source = [0x21, 0x04, 0xed, 0xff];
    let snd = compressed_fixture(1, 16, 22_050, 2, 0xffff, FORMAT_SOWT, &source);
    let decoded = decode_classic_snd(&snd).unwrap();
    assert_eq!(decoded.header_kind, SndHeaderKind::Compressed);
    assert_eq!(decoded.compression, SndCompressionKind::LittleEndianPcm);
    assert_eq!((decoded.channels, decoded.bits_per_sample), (1, 16));
    assert_eq!(decoded.frames, 2);
    assert_eq!(decoded.runtime_pcm, source);
}

#[test]
fn rejects_missing_sample_command_and_truncated_pcm() {
    let mut no_command = standard_fixture(SndResourceFormat::Format2, 0x8001, 8_000, &[1]);
    assert_eq!(
        decode_classic_snd(&no_command),
        Err(SndDecodeError::NoSampleCommand(SndResourceFormat::Format2))
    );
    no_command = standard_fixture(SndResourceFormat::Format2, 0x8051, 8_000, &[1, 2]);
    no_command.truncate(no_command.len() - 1);
    assert!(matches!(
        decode_classic_snd(&no_command),
        Err(SndDecodeError::TruncatedSamples { .. })
    ));
}

fn standard_fixture(
    format: SndResourceFormat,
    command: u16,
    sample_rate: u32,
    pcm: &[u8],
) -> Vec<u8> {
    let header_offset = if format == SndResourceFormat::Format1 {
        20
    } else {
        14
    };
    let mut snd = command_prefix(format, command, header_offset);
    snd.extend_from_slice(&0u32.to_be_bytes());
    snd.extend_from_slice(&(pcm.len() as u32).to_be_bytes());
    snd.extend_from_slice(&(sample_rate << 16).to_be_bytes());
    snd.extend_from_slice(&0u32.to_be_bytes());
    snd.extend_from_slice(&(pcm.len() as u32).to_be_bytes());
    snd.extend_from_slice(&[0, 60]);
    snd.extend_from_slice(pcm);
    snd
}

fn extended_fixture(
    channels: u32,
    bits: u16,
    sample_rate: u32,
    frames: u32,
    pcm_be: &[u8],
) -> Vec<u8> {
    let mut snd = command_prefix(SndResourceFormat::Format1, 0x8051, 20);
    snd.extend_from_slice(&0u32.to_be_bytes());
    snd.extend_from_slice(&channels.to_be_bytes());
    snd.extend_from_slice(&(sample_rate << 16).to_be_bytes());
    snd.extend_from_slice(&0u32.to_be_bytes());
    snd.extend_from_slice(&frames.to_be_bytes());
    snd.extend_from_slice(&[0xff, 60]);
    snd.extend_from_slice(&frames.to_be_bytes());
    snd.extend_from_slice(&[0; 22]);
    snd.extend_from_slice(&bits.to_be_bytes());
    snd.extend_from_slice(&[0; 14]);
    assert_eq!(snd.len(), 84);
    snd.extend_from_slice(pcm_be);
    snd
}

fn compressed_fixture(
    channels: u32,
    bits: u16,
    sample_rate: u32,
    packet_frames: u32,
    compression_id: u16,
    format: u32,
    payload: &[u8],
) -> Vec<u8> {
    let mut snd = command_prefix(SndResourceFormat::Format1, 0x8051, 20);
    snd.extend_from_slice(&0u32.to_be_bytes());
    snd.extend_from_slice(&channels.to_be_bytes());
    snd.extend_from_slice(&(sample_rate << 16).to_be_bytes());
    snd.extend_from_slice(&0u32.to_be_bytes());
    snd.extend_from_slice(&packet_frames.to_be_bytes());
    snd.extend_from_slice(&[0xfe, 60]);
    snd.extend_from_slice(&packet_frames.to_be_bytes());
    snd.extend_from_slice(&[0; 10]);
    snd.extend_from_slice(&0u32.to_be_bytes());
    snd.extend_from_slice(&format.to_be_bytes());
    snd.extend_from_slice(&0u32.to_be_bytes());
    snd.extend_from_slice(&0u32.to_be_bytes());
    snd.extend_from_slice(&0u32.to_be_bytes());
    snd.extend_from_slice(&compression_id.to_be_bytes());
    snd.extend_from_slice(&0u16.to_be_bytes());
    snd.extend_from_slice(&0u16.to_be_bytes());
    snd.extend_from_slice(&bits.to_be_bytes());
    assert_eq!(snd.len(), 84);
    snd.extend_from_slice(payload);
    snd
}

fn command_prefix(format: SndResourceFormat, command: u16, header_offset: usize) -> Vec<u8> {
    let mut snd = Vec::new();
    match format {
        SndResourceFormat::Format1 => {
            snd.extend_from_slice(&1u16.to_be_bytes());
            snd.extend_from_slice(&1u16.to_be_bytes());
            snd.extend_from_slice(&5u16.to_be_bytes());
            snd.extend_from_slice(&0x80u32.to_be_bytes());
            snd.extend_from_slice(&1u16.to_be_bytes());
        }
        SndResourceFormat::Format2 => {
            snd.extend_from_slice(&2u16.to_be_bytes());
            snd.extend_from_slice(&0u16.to_be_bytes());
            snd.extend_from_slice(&1u16.to_be_bytes());
        }
    }
    snd.extend_from_slice(&command.to_be_bytes());
    snd.extend_from_slice(&0u16.to_be_bytes());
    snd.extend_from_slice(&(header_offset as u32).to_be_bytes());
    snd
}

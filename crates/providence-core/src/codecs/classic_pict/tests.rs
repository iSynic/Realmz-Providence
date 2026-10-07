use super::bitmap::DIRECT_BITS_RECT;
use super::*;
use crate::codecs::encode_scenario_picture_pict;

#[test]
fn decodes_the_controlled_indexed_packbits_encoder() {
    let mut source = vec![[248, 0, 0, 255]; 8];
    source.extend(vec![[0, 248, 0, 255]; 8]);
    let source = source.into_iter().flatten().collect::<Vec<_>>();
    let pict = encode_scenario_picture_pict(&source, 8, 2, false).unwrap();
    let decoded = decode_classic_pict(&pict).unwrap();
    assert_eq!(decoded.stream_version, PictStreamVersion::Version2);
    assert_eq!((decoded.width, decoded.height), (8, 2));
    assert_eq!(decoded.rgba, source);
    assert_eq!(decoded.bitmap_commands, 1);
    assert_eq!(decoded.formats, vec![PictBitmapFormat::Indexed8]);
}

#[test]
fn composes_multiple_bitmap_commands_in_stream_order() {
    let red_pixels = [248, 0, 0, 255].repeat(8);
    let blue_pixels = [0, 0, 248, 255].repeat(8);
    let red = encode_scenario_picture_pict(&red_pixels, 8, 1, false).unwrap();
    let blue = encode_scenario_picture_pict(&blue_pixels, 8, 1, false).unwrap();
    let mut first = red[40..red.len() - 2].to_vec();
    let mut second = blue[40..blue.len() - 2].to_vec();
    set_indexed_destination(&mut first, 0, 0, 1, 8);
    set_indexed_destination(&mut second, 1, 0, 2, 8);
    let mut pict = red[..40].to_vec();
    pict[6..8].copy_from_slice(&2i16.to_be_bytes());
    pict[32..34].copy_from_slice(&2i16.to_be_bytes());
    pict.extend(first);
    pict.extend(second);
    pict.extend_from_slice(&0x00ffu16.to_be_bytes());
    let size = pict.len() as i16;
    pict[0..2].copy_from_slice(&size.to_be_bytes());
    let decoded = decode_classic_pict(&pict).unwrap();
    assert_eq!((decoded.width, decoded.height), (8, 2));
    assert_eq!(decoded.bitmap_commands, 2);
    assert_eq!(&decoded.rgba[..32], red_pixels);
    assert_eq!(&decoded.rgba[32..], blue_pixels);
}

#[test]
fn accepts_a_versioned_pict_after_a_512_byte_standalone_header() {
    let pixels = [0, 248, 0, 255].repeat(8);
    let resource = encode_scenario_picture_pict(&pixels, 8, 1, false).unwrap();
    let mut standalone = vec![0; 512];
    standalone.extend_from_slice(&resource[..10]);
    standalone.extend_from_slice(&[0x00, 0x11, 0x02, 0xff]);
    standalone.extend_from_slice(&resource[10..]);
    let decoded = decode_classic_pict(&standalone).unwrap();
    assert_eq!((decoded.width, decoded.height), (8, 1));
    assert_eq!(decoded.rgba, pixels);
    assert_eq!(decoded.stream_version, PictStreamVersion::Version2);
}

#[test]
fn decodes_a_version_one_monochrome_packbits_picture() {
    let mut pict = vec![0; 10];
    pict[6..8].copy_from_slice(&1i16.to_be_bytes());
    pict[8..10].copy_from_slice(&8i16.to_be_bytes());
    pict.extend_from_slice(&[0x11, 0x01]);
    pict.extend_from_slice(&[0xa1, 0x01, 0xf2, 0x00, 0x02, b'O', b'K']);
    pict.push(0x01);
    pict.extend_from_slice(&10u16.to_be_bytes());
    pict.extend_from_slice(&[0, 0, 0, 0, 0, 1, 0, 8]);
    pict.push(0x98);
    pict.extend_from_slice(&8u16.to_be_bytes());
    pict.extend_from_slice(&[0, 0, 0, 0, 0, 1, 0, 8]);
    pict.extend_from_slice(&[0, 0, 0, 0, 0, 1, 0, 8]);
    pict.extend_from_slice(&[0, 0, 0, 0, 0, 1, 0, 8]);
    pict.extend_from_slice(&0u16.to_be_bytes());
    pict.extend_from_slice(&[2, 0xf9, 0xaa]);
    pict.push(0xff);
    let picture_length = pict.len() as u16;
    pict[..2].copy_from_slice(&picture_length.to_be_bytes());

    let decoded = decode_classic_pict(&pict).unwrap();
    assert_eq!((decoded.width, decoded.height), (8, 1));
    assert_eq!(decoded.stream_version, PictStreamVersion::Version1);
    assert_eq!(decoded.bitmap_commands, 1);
    assert_eq!(decoded.formats, vec![PictBitmapFormat::Monochrome]);
    assert_eq!(
        decoded.rgba,
        [
            0, 0, 0, 255, 255, 255, 255, 255, 0, 0, 0, 255, 255, 255, 255, 255, 0, 0, 0, 255, 255,
            255, 255, 255, 0, 0, 0, 255, 255, 255, 255, 255
        ]
    );
}

#[test]
fn refuses_unimplemented_version_one_drawing_commands_without_scanning() {
    let mut pict = vec![0; 10];
    pict[6..8].copy_from_slice(&1i16.to_be_bytes());
    pict[8..10].copy_from_slice(&1i16.to_be_bytes());
    pict.extend_from_slice(&[0x11, 0x01, 0x30]);
    pict.extend_from_slice(&[0, 0, 0, 0, 0, 1, 0, 1]);
    pict.push(0xff);

    assert_eq!(
        decode_classic_pict(&pict),
        Err(PictDecodeError::UnsupportedVersionOneOpcode {
            offset: 12,
            opcode: 0x30,
        })
    );
}

#[test]
fn refuses_a_v1_standalone_stream_outside_the_certified_seam() {
    let pixels = [0, 248, 0, 255].repeat(8);
    let resource = encode_scenario_picture_pict(&pixels, 8, 1, false).unwrap();
    let mut standalone = vec![0; 512];
    standalone.extend_from_slice(&resource[..10]);
    standalone.extend_from_slice(&[0x11, 0x01]);
    standalone.extend_from_slice(&resource[10..]);
    assert_eq!(
        decode_classic_pict(&standalone),
        Err(PictDecodeError::InvalidStandaloneContainer)
    );
}

#[test]
fn decodes_planar_direct_32_bit_packbits() {
    let pict = direct_fixture(2, 8, 4, 32, 3, 8, &[7, 10, 20, 30, 40, 50, 60, 0, 0]);
    let decoded = decode_classic_pict(&pict).unwrap();
    assert_eq!((decoded.width, decoded.height), (2, 1));
    assert_eq!(decoded.rgba, [10, 30, 50, 255, 20, 40, 60, 255]);
    assert_eq!(decoded.formats, vec![PictBitmapFormat::Direct32]);
}

#[test]
fn decodes_word_packbits_direct_16() {
    let pict = direct_fixture(2, 4, 3, 16, 3, 5, &[1, 0x7c, 0, 0x03, 0xe0]);
    let decoded = decode_classic_pict(&pict).unwrap();
    assert_eq!((decoded.width, decoded.height), (2, 1));
    assert_eq!(decoded.rgba, [255, 0, 0, 255, 0, 255, 0, 255]);
    assert_eq!(decoded.formats, vec![PictBitmapFormat::Direct16]);
}

#[test]
fn rejects_a_truncated_packbits_row() {
    let source = vec![248; 8 * 4];
    let mut pict = encode_scenario_picture_pict(&source, 8, 1, false).unwrap();
    pict.truncate(pict.len() - 3);
    assert!(matches!(
        decode_classic_pict(&pict),
        Err(PictDecodeError::Truncated { .. })
            | Err(PictDecodeError::InvalidPackBits { .. })
            | Err(PictDecodeError::PackBitsLengthMismatch { .. })
    ));
}

fn set_indexed_destination(command: &mut [u8], top: i16, left: i16, bottom: i16, right: i16) {
    let colors = usize::from(u16::from_be_bytes([command[54], command[55]])) + 1;
    let destination = 2 + 46 + 8 + colors * 8 + 8;
    command[destination..destination + 2].copy_from_slice(&top.to_be_bytes());
    command[destination + 2..destination + 4].copy_from_slice(&left.to_be_bytes());
    command[destination + 4..destination + 6].copy_from_slice(&bottom.to_be_bytes());
    command[destination + 6..destination + 8].copy_from_slice(&right.to_be_bytes());
}

fn direct_fixture(
    width: i16,
    row_bytes: u16,
    pack_type: u16,
    pixel_size: u16,
    components: u16,
    component_size: u16,
    packed_row: &[u8],
) -> Vec<u8> {
    let mut pict = vec![0; 10];
    pict[6..8].copy_from_slice(&1i16.to_be_bytes());
    pict[8..10].copy_from_slice(&width.to_be_bytes());
    pict.extend_from_slice(&DIRECT_BITS_RECT.to_be_bytes());
    pict.extend_from_slice(&0u32.to_be_bytes());
    pict.extend_from_slice(&(0x8000u16 | row_bytes).to_be_bytes());
    for value in [0i16, 0, 1, width] {
        pict.extend_from_slice(&value.to_be_bytes());
    }
    pict.extend_from_slice(&0u16.to_be_bytes());
    pict.extend_from_slice(&pack_type.to_be_bytes());
    for _ in 0..3 {
        pict.extend_from_slice(&0u32.to_be_bytes());
    }
    pict.extend_from_slice(&16u16.to_be_bytes());
    pict.extend_from_slice(&pixel_size.to_be_bytes());
    pict.extend_from_slice(&components.to_be_bytes());
    pict.extend_from_slice(&component_size.to_be_bytes());
    for _ in 0..3 {
        pict.extend_from_slice(&0u32.to_be_bytes());
    }
    for _ in 0..2 {
        for value in [0i16, 0, 1, width] {
            pict.extend_from_slice(&value.to_be_bytes());
        }
    }
    pict.extend_from_slice(&0u16.to_be_bytes());
    pict.push(packed_row.len() as u8);
    pict.extend_from_slice(packed_row);
    pict.extend_from_slice(&0x00ffu16.to_be_bytes());
    pict
}

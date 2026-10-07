use super::encode::{write_rect, write_u16};
use super::*;

#[test]
fn cicn_encoder_is_deterministic_and_writes_32_pixel_geometry_and_mask() {
    let rgba = [255, 16, 8, 255, 0, 32, 255, 0];
    let first = encode_scenario_icon_cicn(&rgba, 2, 1).unwrap();
    let second = encode_scenario_icon_cicn(&rgba, 2, 1).unwrap();
    assert_eq!(first, second);
    assert_eq!(&first[6..14], &[0, 0, 0, 0, 0, 32, 0, 32]);
    assert_eq!(u16::from_be_bytes([first[32], first[33]]), 8);
    assert!(first[82..82 + 4 * 32].contains(&0));
    assert!(first[82..82 + 4 * 32].iter().any(|byte| *byte != 0));
}

#[test]
fn decoder_reimports_the_controlled_encoder_output_with_mask_alpha() {
    let source = [255, 16, 8, 255, 0, 32, 255, 0];
    let encoded = encode_scenario_icon_cicn(&source, 2, 1).unwrap();
    let decoded = decode_cicn(&encoded).unwrap();
    assert_eq!(
        (decoded.width, decoded.height, decoded.pixel_depth),
        (32, 32, 8)
    );
    assert_eq!(&decoded.rgba[0..4], &[248, 16, 8, 255]);
    assert_eq!(&decoded.rgba[(15 * 4)..(15 * 4 + 4)], &[248, 16, 8, 255]);
    assert_eq!(&decoded.rgba[(16 * 4)..(16 * 4 + 4)], &[0, 32, 248, 0]);
}

#[test]
fn decoder_supports_one_two_four_and_eight_bit_indexed_rows() {
    for (depth, packed, expected_indices) in [
        (1, vec![0x50], vec![0, 1, 0, 1]),
        (2, vec![0x1b], vec![0, 1, 2, 3]),
        (4, vec![0x01, 0x23], vec![0, 1, 2, 3]),
        (8, vec![0, 1, 2, 3], vec![0, 1, 2, 3]),
    ] {
        let decoded = decode_cicn(&indexed_cicn(depth, 0x8000, &packed)).unwrap();
        assert_eq!(decoded.pixel_depth, depth as u16);
        assert_eq!((decoded.width, decoded.height), (4, 1));
        let reds = decoded
            .rgba
            .chunks_exact(4)
            .map(|pixel| pixel[0])
            .collect::<Vec<_>>();
        assert_eq!(
            reds,
            expected_indices
                .iter()
                .map(|index| [8, 72, 136, 200][*index])
                .collect::<Vec<_>>()
        );
        assert!(decoded.rgba.chunks_exact(4).all(|pixel| pixel[3] == 255));
    }
}

#[test]
fn decoder_obeys_explicit_color_numbers_for_an_unordered_table() {
    let mut payload = indexed_cicn(8, 0, &[0, 1, 2, 3]);
    let table = 84;
    for (index, number) in [3usize, 2, 1, 0].into_iter().enumerate() {
        write_u16(&mut payload, table + 8 + index * 8, number);
    }
    let decoded = decode_cicn(&payload).unwrap();
    let reds = decoded
        .rgba
        .chunks_exact(4)
        .map(|pixel| pixel[0])
        .collect::<Vec<_>>();
    assert_eq!(reds, vec![200, 136, 72, 8]);
}

#[test]
fn decoder_rejects_short_rows_and_truncated_payload_sections() {
    let mut short_row = indexed_cicn(8, 0x8000, &[0, 1, 2, 3]);
    write_u16(&mut short_row, 4, 3);
    assert_eq!(
        decode_cicn(&short_row),
        Err(CicnCodecError::InvalidRowBytes {
            expected_at_least: 4,
            actual: 3,
        })
    );

    let truncated = &indexed_cicn(8, 0x8000, &[0, 1, 2, 3])[..115];
    assert_eq!(
        decode_cicn(truncated),
        Err(CicnCodecError::TruncatedColorTable)
    );
}

fn indexed_cicn(depth: usize, color_table_flags: usize, packed: &[u8]) -> Vec<u8> {
    let width = 4usize;
    let height = 1usize;
    let mask_row_bytes = 1usize;
    let bitmap_row_bytes = 1usize;
    let color_table_offset = 82 + mask_row_bytes * height + bitmap_row_bytes * height;
    let pixel_data_offset = color_table_offset + 8 + 4 * 8;
    let mut payload = vec![0; pixel_data_offset + packed.len()];
    write_u16(&mut payload, 4, packed.len());
    write_rect(&mut payload, 6, 0, 0, height as i16, width as i16);
    write_u16(&mut payload, 32, depth);
    write_u16(&mut payload, 54, mask_row_bytes);
    write_rect(&mut payload, 56, 0, 0, height as i16, width as i16);
    write_u16(&mut payload, 68, bitmap_row_bytes);
    write_rect(&mut payload, 70, 0, 0, height as i16, width as i16);
    payload[82] = 0xf0;
    write_u16(&mut payload, color_table_offset + 4, color_table_flags);
    write_u16(&mut payload, color_table_offset + 6, 3);
    for (index, red) in [8usize, 72, 136, 200].into_iter().enumerate() {
        let offset = color_table_offset + 8 + index * 8;
        write_u16(&mut payload, offset, index);
        write_u16(&mut payload, offset + 2, red * 257);
        write_u16(&mut payload, offset + 4, 0);
        write_u16(&mut payload, offset + 6, 0);
    }
    payload[pixel_data_offset..].copy_from_slice(packed);
    payload
}

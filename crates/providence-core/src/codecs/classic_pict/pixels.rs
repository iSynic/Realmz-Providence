use super::types::PictBitmapFormat;

pub(super) fn decode_indexed_rows(
    rows: &[Vec<u8>],
    width: usize,
    height: usize,
    palette: Option<&[[u8; 3]]>,
    format: PictBitmapFormat,
) -> Vec<u8> {
    let depth = match format {
        PictBitmapFormat::Indexed1 | PictBitmapFormat::Monochrome => 1,
        PictBitmapFormat::Indexed2 => 2,
        PictBitmapFormat::Indexed4 => 4,
        _ => 8,
    };
    let mut rgba = vec![0; width * height * 4];
    for (y, row) in rows.iter().enumerate().take(height) {
        for x in 0..width {
            let index = indexed_pixel(row, x, depth);
            let color = if format == PictBitmapFormat::Monochrome {
                if index == 0 {
                    [255, 255, 255]
                } else {
                    [0, 0, 0]
                }
            } else {
                palette
                    .and_then(|values| values.get(index))
                    .copied()
                    .unwrap_or([0, 0, 0])
            };
            let output = (y * width + x) * 4;
            rgba[output..output + 3].copy_from_slice(&color);
            rgba[output + 3] = 255;
        }
    }
    rgba
}

pub(super) fn indexed_pixel(row: &[u8], x: usize, depth: usize) -> usize {
    let bit = x * depth;
    let byte = row.get(bit / 8).copied().unwrap_or(0);
    let shift = 8 - depth - bit % 8;
    let mask = u8::MAX >> (8 - depth);
    usize::from((byte >> shift) & mask)
}

pub(super) fn decode_direct_pixels(
    rows: &[Vec<u8>],
    width: usize,
    height: usize,
    pixel_size: u16,
    components: u16,
    pack_type: u16,
) -> Vec<u8> {
    let mut rgba = vec![0; width * height * 4];
    for (y, row) in rows.iter().enumerate().take(height) {
        for x in 0..width {
            let color = if pixel_size == 16 {
                let source = x * 2;
                let value = u16::from_be_bytes([row[source], row[source + 1]]);
                [
                    five_bit_to_u8((value >> 10) & 0x1f),
                    five_bit_to_u8((value >> 5) & 0x1f),
                    five_bit_to_u8(value & 0x1f),
                ]
            } else if pack_type == 4 && components == 3 {
                [row[x], row[x + width], row[x + width * 2]]
            } else if pack_type == 2 {
                let source = x * 3;
                [row[source], row[source + 1], row[source + 2]]
            } else {
                let source = x * 4;
                [row[source + 1], row[source + 2], row[source + 3]]
            };
            let output = (y * width + x) * 4;
            rgba[output..output + 3].copy_from_slice(&color);
            rgba[output + 3] = 255;
        }
    }
    rgba
}

pub(super) fn five_bit_to_u8(value: u16) -> u8 {
    ((u32::from(value) * 255 + 15) / 31) as u8
}

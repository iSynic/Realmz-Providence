use super::super::quantize_rgba_to_palette;
use super::{SCENARIO_ICON_HEIGHT, SCENARIO_ICON_WIDTH, ScenarioIconCodecError};

pub fn encode_scenario_icon_cicn(
    rgba: &[u8],
    width: u32,
    height: u32,
) -> Result<Vec<u8>, ScenarioIconCodecError> {
    if width == 0 || height == 0 || width > 4096 || height > 4096 {
        return Err(ScenarioIconCodecError::InvalidDimensions { width, height });
    }
    let expected = (width as usize)
        .checked_mul(height as usize)
        .and_then(|pixels| pixels.checked_mul(4))
        .ok_or(ScenarioIconCodecError::InvalidDimensions { width, height })?;
    if rgba.len() != expected {
        return Err(ScenarioIconCodecError::InvalidRgbaLength {
            expected,
            actual: rgba.len(),
        });
    }

    let target_width = SCENARIO_ICON_WIDTH as usize;
    let target_height = SCENARIO_ICON_HEIGHT as usize;
    let resized = resize_rgba_nearest(
        rgba,
        width as usize,
        height as usize,
        target_width,
        target_height,
    );
    encode_indexed_cicn(&resized, target_width, target_height, false)
}

pub(super) fn encode_indexed_cicn(
    rgba: &[u8],
    width: usize,
    height: usize,
    dither: bool,
) -> Result<Vec<u8>, ScenarioIconCodecError> {
    let (indices, palette) = quantize_rgba_to_palette(rgba, width, dither);
    let row_bytes = width;
    let mask_row_bytes = width.div_ceil(8);
    let mask_offset = 82usize;
    let bitmap_offset = mask_offset + mask_row_bytes * height;
    let color_table_offset = bitmap_offset + mask_row_bytes * height;
    let pixel_data_offset = color_table_offset + 8 + palette.len() * 8;
    let mut cicn = vec![0u8; pixel_data_offset + row_bytes * height];

    write_u16(&mut cicn, 4, 0x8000 | row_bytes);
    write_rect(&mut cicn, 6, 0, 0, height as i16, width as i16);
    write_u16(&mut cicn, 32, 8);
    write_u16(&mut cicn, 54, 0x8000 | mask_row_bytes);
    write_rect(&mut cicn, 56, 0, 0, height as i16, width as i16);
    write_u16(&mut cicn, 68, 0x8000 | mask_row_bytes);
    write_rect(&mut cicn, 70, 0, 0, height as i16, width as i16);

    for y in 0..height {
        for x in 0..width {
            if rgba[(y * width + x) * 4 + 3] > 16 {
                cicn[mask_offset + y * mask_row_bytes + x / 8] |= 1 << (7 - (x % 8));
            }
        }
    }
    write_u16(
        &mut cicn,
        color_table_offset + 6,
        palette.len().saturating_sub(1),
    );
    for (index, color) in palette.iter().enumerate() {
        let offset = color_table_offset + 8 + index * 8;
        write_u16(&mut cicn, offset, index);
        write_u16(&mut cicn, offset + 2, usize::from(color[0]) * 257);
        write_u16(&mut cicn, offset + 4, usize::from(color[1]) * 257);
        write_u16(&mut cicn, offset + 6, usize::from(color[2]) * 257);
    }
    cicn[pixel_data_offset..pixel_data_offset + indices.len()].copy_from_slice(&indices);
    Ok(cicn)
}

fn resize_rgba_nearest(
    rgba: &[u8],
    source_width: usize,
    source_height: usize,
    target_width: usize,
    target_height: usize,
) -> Vec<u8> {
    let mut resized = vec![0u8; target_width * target_height * 4];
    for y in 0..target_height {
        let source_y = y * source_height / target_height;
        for x in 0..target_width {
            let source_x = x * source_width / target_width;
            let source = (source_y * source_width + source_x) * 4;
            let target = (y * target_width + x) * 4;
            resized[target..target + 4].copy_from_slice(&rgba[source..source + 4]);
        }
    }
    resized
}

pub(super) fn write_u16(buffer: &mut [u8], offset: usize, value: usize) {
    buffer[offset..offset + 2].copy_from_slice(&(value as u16).to_be_bytes());
}

pub(super) fn write_rect(
    buffer: &mut [u8],
    offset: usize,
    top: i16,
    left: i16,
    bottom: i16,
    right: i16,
) {
    for (index, value) in [top, left, bottom, right].into_iter().enumerate() {
        let start = offset + index * 2;
        buffer[start..start + 2].copy_from_slice(&value.to_be_bytes());
    }
}

use super::{CicnCodecError, DecodedCicn};

pub fn decode_cicn(payload: &[u8]) -> Result<DecodedCicn, CicnCodecError> {
    let geometry = PixelGeometry::read(payload)?;
    let mask = MaskLayout::read(payload, &geometry)?;
    let table = ColorTable::read(payload, &geometry, &mask)?;
    Ok(DecodedCicn {
        width: geometry.width as u32,
        height: geometry.height as u32,
        pixel_depth: geometry.pixel_depth,
        rgba: decode_pixels(payload, &geometry, &mask, &table),
    })
}

struct PixelGeometry {
    width: usize,
    height: usize,
    row_bytes: usize,
    pixel_depth: u16,
}

impl PixelGeometry {
    fn read(payload: &[u8]) -> Result<Self, CicnCodecError> {
        if payload.len() < 82 {
            return Err(CicnCodecError::PayloadTooShort);
        }
        let row_bytes = usize::from(read_u16_at(payload, 4)? & 0x3fff);
        let top = read_i16_at(payload, 6)?;
        let left = read_i16_at(payload, 8)?;
        let bottom = read_i16_at(payload, 10)?;
        let right = read_i16_at(payload, 12)?;
        let width = right.checked_sub(left).unwrap_or(0);
        let height = bottom.checked_sub(top).unwrap_or(0);
        if width <= 0 || height <= 0 || width > 512 || height > 512 {
            return Err(CicnCodecError::InvalidDimensions {
                width: u32::try_from(width).unwrap_or(0),
                height: u32::try_from(height).unwrap_or(0),
            });
        }
        let width = width as usize;
        let height = height as usize;
        let pixel_depth = read_u16_at(payload, 32)?;
        if !matches!(pixel_depth, 1 | 2 | 4 | 8) {
            return Err(CicnCodecError::UnsupportedPixelDepth(pixel_depth));
        }
        let minimum_row_bytes = width
            .checked_mul(usize::from(pixel_depth))
            .and_then(|bits| bits.checked_add(7))
            .map(|bits| bits / 8)
            .ok_or(CicnCodecError::InvalidDimensions {
                width: width as u32,
                height: height as u32,
            })?;
        if row_bytes < minimum_row_bytes {
            return Err(CicnCodecError::InvalidRowBytes {
                expected_at_least: minimum_row_bytes,
                actual: row_bytes,
            });
        }
        Ok(Self {
            width,
            height,
            row_bytes,
            pixel_depth,
        })
    }
}

struct MaskLayout {
    row_bytes: usize,
    height: usize,
    color_table_offset: usize,
}

impl MaskLayout {
    fn read(payload: &[u8], geometry: &PixelGeometry) -> Result<Self, CicnCodecError> {
        let PixelGeometry { width, height, .. } = *geometry;
        let mask_row_bytes = usize::from(read_u16_at(payload, 54)? & 0x3fff);
        let mask_height = rect_height_or(payload, 56, height)?;
        if mask_row_bytes != 0 && (mask_row_bytes < width.div_ceil(8) || mask_height < height) {
            return Err(CicnCodecError::TruncatedMaskOrBitmap);
        }
        let bitmap_row_bytes = usize::from(read_u16_at(payload, 68)? & 0x3fff);
        let bitmap_height = rect_height_or(payload, 70, 0)?;
        let mask_bytes = mask_row_bytes
            .checked_mul(mask_height)
            .ok_or(CicnCodecError::TruncatedMaskOrBitmap)?;
        let bitmap_bytes = bitmap_row_bytes
            .checked_mul(bitmap_height)
            .ok_or(CicnCodecError::TruncatedMaskOrBitmap)?;
        let color_table_offset = 82usize
            .checked_add(mask_bytes)
            .and_then(|offset| offset.checked_add(bitmap_bytes))
            .ok_or(CicnCodecError::TruncatedMaskOrBitmap)?;
        if color_table_offset > payload.len() {
            return Err(CicnCodecError::TruncatedMaskOrBitmap);
        }
        Ok(Self {
            row_bytes: mask_row_bytes,
            height: mask_height,
            color_table_offset,
        })
    }
}

struct ColorTable {
    flags: u16,
    pixel_data_offset: usize,
    colors: Vec<CicnColor>,
}

impl ColorTable {
    fn read(
        payload: &[u8],
        geometry: &PixelGeometry,
        mask: &MaskLayout,
    ) -> Result<Self, CicnCodecError> {
        let color_table_offset = mask.color_table_offset;
        let PixelGeometry {
            row_bytes, height, ..
        } = *geometry;
        if color_table_offset
            .checked_add(8)
            .is_none_or(|end| end > payload.len())
        {
            return Err(CicnCodecError::TruncatedColorTable);
        }
        let color_table_flags = read_u16_at(payload, color_table_offset + 4)?;
        let color_count = usize::from(read_u16_at(payload, color_table_offset + 6)?) + 1;
        let color_table_bytes = color_count
            .checked_mul(8)
            .ok_or(CicnCodecError::TruncatedColorTable)?;
        let pixel_data_offset = color_table_offset
            .checked_add(8)
            .and_then(|offset| offset.checked_add(color_table_bytes))
            .ok_or(CicnCodecError::TruncatedColorTable)?;
        if pixel_data_offset > payload.len() {
            return Err(CicnCodecError::TruncatedColorTable);
        }
        // Validate raster bounds before reading colors, preserving framing-error precedence.
        let pixel_bytes = row_bytes
            .checked_mul(height)
            .ok_or(CicnCodecError::TruncatedPixelData)?;
        if pixel_data_offset
            .checked_add(pixel_bytes)
            .is_none_or(|end| end > payload.len())
        {
            return Err(CicnCodecError::TruncatedPixelData);
        }

        let mut colors = Vec::with_capacity(color_count);
        for index in 0..color_count {
            let offset = color_table_offset + 8 + index * 8;
            colors.push(CicnColor {
                number: read_u16_at(payload, offset)?,
                rgb: [
                    color_component(read_u16_at(payload, offset + 2)?),
                    color_component(read_u16_at(payload, offset + 4)?),
                    color_component(read_u16_at(payload, offset + 6)?),
                ],
            });
        }
        Ok(Self {
            flags: color_table_flags,
            pixel_data_offset,
            colors,
        })
    }
}

fn decode_pixels(
    payload: &[u8],
    geometry: &PixelGeometry,
    mask: &MaskLayout,
    table: &ColorTable,
) -> Vec<u8> {
    let PixelGeometry {
        width,
        height,
        row_bytes,
        pixel_depth,
    } = *geometry;
    let mut rgba = vec![0; width * height * 4];
    for y in 0..height {
        for x in 0..width {
            let row = table.pixel_data_offset + y * row_bytes;
            let color_number = match pixel_depth {
                8 => usize::from(payload[row + x]),
                4 => {
                    let byte = payload[row + x / 2];
                    usize::from(if x % 2 == 0 { byte >> 4 } else { byte & 0x0f })
                }
                2 => usize::from((payload[row + x / 4] >> (6 - (x % 4) * 2)) & 0x03),
                1 => usize::from((payload[row + x / 8] >> (7 - x % 8)) & 0x01),
                _ => unreachable!("pixel depth validated above"),
            };
            let rgb = if table.flags & 0x8000 != 0 {
                table.colors.get(color_number)
            } else {
                table
                    .colors
                    .iter()
                    .find(|color| usize::from(color.number) == color_number)
            }
            .map_or([0, 0, 0], |color| color.rgb);
            let alpha = if mask.row_bytes == 0 || y >= mask.height {
                255
            } else {
                let mask_byte = payload[82 + y * mask.row_bytes + x / 8];
                if (mask_byte >> (7 - x % 8)) & 1 == 1 {
                    255
                } else {
                    0
                }
            };
            let output = (y * width + x) * 4;
            rgba[output..output + 3].copy_from_slice(&rgb);
            rgba[output + 3] = alpha;
        }
    }

    rgba
}

#[derive(Debug, Clone, Copy)]
struct CicnColor {
    number: u16,
    rgb: [u8; 3],
}

fn rect_height_or(
    payload: &[u8],
    rect_offset: usize,
    fallback: usize,
) -> Result<usize, CicnCodecError> {
    let top = read_i16_at(payload, rect_offset)?;
    let bottom = read_i16_at(payload, rect_offset + 4)?;
    Ok(bottom
        .checked_sub(top)
        .filter(|height| *height > 0)
        .map_or(fallback, |height| height as usize))
}

fn read_u16_at(payload: &[u8], offset: usize) -> Result<u16, CicnCodecError> {
    payload
        .get(offset..offset + 2)
        .and_then(|bytes| bytes.try_into().ok())
        .map(u16::from_be_bytes)
        .ok_or(CicnCodecError::PayloadTooShort)
}

fn read_i16_at(payload: &[u8], offset: usize) -> Result<i16, CicnCodecError> {
    read_u16_at(payload, offset).map(|value| i16::from_be_bytes(value.to_be_bytes()))
}

fn color_component(component: u16) -> u8 {
    (component / 0x0101) as u8
}

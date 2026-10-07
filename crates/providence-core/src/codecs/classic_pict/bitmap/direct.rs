use super::super::byte_io::{checked_slice, read_u16, validate_row_bytes};
use super::super::geometry::{BitmapCommand, Rect};
use super::super::pixels::decode_direct_pixels;
use super::super::rows::decode_direct_rows;
use super::super::types::{PictBitmapFormat, PictDecodeError};
use super::skip_region_if_present;

pub(super) fn parse_direct_bitmap(
    bytes: &[u8],
    offset: usize,
    opcode: u16,
    opcode_bytes: usize,
) -> Result<BitmapCommand, PictDecodeError> {
    let header = offset + opcode_bytes;
    checked_slice(bytes, header, 68, "DirectBits header")?;
    let raw_row_bytes = read_u16(bytes, header + 4, "DirectBits header")?;
    let row_bytes = usize::from(raw_row_bytes & 0x3fff);
    validate_row_bytes(offset, row_bytes)?;
    let bounds = Rect::read(bytes, header + 6)?;
    let (width, height) = bounds.bounded(offset)?;
    let DirectFormat {
        pixel_size,
        components,
        pack_type,
    } = DirectFormat::read(bytes, header, offset, opcode, raw_row_bytes)?;
    let minimum_row_bytes = width
        .checked_mul(usize::from(pixel_size) / 8)
        .ok_or(PictDecodeError::InvalidRowBytes { offset, row_bytes })?;
    if row_bytes < minimum_row_bytes {
        return Err(PictDecodeError::InvalidRowBytes { offset, row_bytes });
    }
    let source = Rect::read(bytes, header + 50)?;
    let destination = Rect::read(bytes, header + 58)?;
    source.bounded(offset)?;
    destination.bounded(offset)?;
    let data_offset = skip_region_if_present(bytes, header + 68, offset, opcode)?;
    let (rows, next_offset) = decode_direct_rows(
        bytes,
        data_offset,
        row_bytes,
        width,
        height,
        components,
        pack_type,
    )?;
    let format = if pixel_size == 16 {
        PictBitmapFormat::Direct16
    } else {
        PictBitmapFormat::Direct32
    };
    let rgba = decode_direct_pixels(&rows, width, height, pixel_size, components, pack_type);
    Ok(BitmapCommand {
        next_offset,
        bounds,
        source,
        destination,
        format,
        rgba,
    })
}

struct DirectFormat {
    pixel_size: u16,
    components: u16,
    pack_type: u16,
}

impl DirectFormat {
    fn read(
        bytes: &[u8],
        header: usize,
        offset: usize,
        opcode: u16,
        raw_row_bytes: u16,
    ) -> Result<Self, PictDecodeError> {
        let pack_type = read_u16(bytes, header + 16, "DirectBits header")?;
        let pixel_type = read_u16(bytes, header + 30, "DirectBits header")?;
        let pixel_size = read_u16(bytes, header + 32, "DirectBits header")?;
        let components = read_u16(bytes, header + 34, "DirectBits header")?;
        let component_size = read_u16(bytes, header + 36, "DirectBits header")?;
        if raw_row_bytes & 0x8000 == 0
            || pixel_type != 16
            || !matches!(pixel_size, 16 | 32)
            || !matches!(components, 3 | 4)
            || !matches!(component_size, 5 | 8)
            || !matches!(pack_type, 0..=4)
            || (pixel_size == 16 && matches!(pack_type, 2 | 4))
            || (pixel_size == 32 && pack_type == 3)
        {
            return Err(PictDecodeError::UnsupportedBitmap { offset, opcode });
        }
        Ok(Self {
            pixel_size,
            components,
            pack_type,
        })
    }
}

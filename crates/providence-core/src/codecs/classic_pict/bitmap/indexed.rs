use super::super::byte_io::{checked_slice, read_u16, validate_row_bytes};
use super::super::geometry::{BitmapCommand, Rect};
use super::super::pixels::decode_indexed_rows;
use super::super::rows::decode_rows;
use super::super::types::{PictBitmapFormat, PictDecodeError};
use super::{PACK_BITS_RECT, PACK_BITS_RGN, skip_region_if_present};

pub(super) fn parse_indexed_or_monochrome_bitmap(
    bytes: &[u8],
    offset: usize,
    opcode: u16,
    opcode_bytes: usize,
) -> Result<BitmapCommand, PictDecodeError> {
    let header = offset + opcode_bytes;
    let raw_row_bytes = read_u16(bytes, header, "bitmap header")?;
    let row_bytes = usize::from(raw_row_bytes & 0x3fff);
    validate_row_bytes(offset, row_bytes)?;
    let pixmap = raw_row_bytes & 0x8000 != 0;
    let bounds = Rect::read(bytes, header + 2)?;
    let (width, height) = bounds.bounded(offset)?;

    let shape = if pixmap {
        read_pixmap(bytes, header, offset, opcode, row_bytes, width)?
    } else {
        read_monochrome(bytes, header, offset, row_bytes, width)?
    };
    let IndexedShape {
        source,
        destination,
        format,
        palette,
        data_offset,
    } = shape;
    source.bounded(offset)?;
    destination.bounded(offset)?;
    let data_offset = skip_region_if_present(bytes, data_offset, offset, opcode)?;
    let packed = matches!(opcode, PACK_BITS_RECT | PACK_BITS_RGN) && row_bytes >= 8;
    let (rows, next_offset) = decode_rows(
        bytes,
        data_offset,
        row_bytes,
        row_bytes,
        height,
        packed,
        false,
    )?;
    let rgba = decode_indexed_rows(&rows, width, height, palette.as_deref(), format);
    Ok(BitmapCommand {
        next_offset,
        bounds,
        source,
        destination,
        format,
        rgba,
    })
}

struct IndexedShape {
    source: Rect,
    destination: Rect,
    format: PictBitmapFormat,
    palette: Option<Vec<[u8; 3]>>,
    data_offset: usize,
}

fn read_pixmap(
    bytes: &[u8],
    header: usize,
    offset: usize,
    opcode: u16,
    row_bytes: usize,
    width: usize,
) -> Result<IndexedShape, PictDecodeError> {
    checked_slice(bytes, header, 46, "pixmap header")?;
    let pixel_type = read_u16(bytes, header + 26, "pixmap header")?;
    let pixel_size = read_u16(bytes, header + 28, "pixmap header")?;
    let components = read_u16(bytes, header + 30, "pixmap header")?;
    let component_size = read_u16(bytes, header + 32, "pixmap header")?;
    if pixel_type != 0
        || !matches!(pixel_size, 1 | 2 | 4 | 8)
        || components != 1
        || component_size != pixel_size
    {
        return Err(PictDecodeError::UnsupportedBitmap { offset, opcode });
    }
    if width
        .checked_mul(usize::from(pixel_size))
        .is_none_or(|bits| bits > row_bytes * 8)
    {
        return Err(PictDecodeError::InvalidRowBytes { offset, row_bytes });
    }
    let table_offset = header + 46;
    let (palette, after_table) = decode_color_table(bytes, table_offset)?;
    let source = Rect::read(bytes, after_table)?;
    let destination = Rect::read(bytes, after_table + 8)?;
    let format = match pixel_size {
        1 => PictBitmapFormat::Indexed1,
        2 => PictBitmapFormat::Indexed2,
        4 => PictBitmapFormat::Indexed4,
        _ => PictBitmapFormat::Indexed8,
    };
    Ok(IndexedShape {
        source,
        destination,
        format,
        palette: Some(palette),
        data_offset: after_table + 18,
    })
}

fn read_monochrome(
    bytes: &[u8],
    header: usize,
    offset: usize,
    row_bytes: usize,
    width: usize,
) -> Result<IndexedShape, PictDecodeError> {
    if width > row_bytes * 8 {
        return Err(PictDecodeError::InvalidRowBytes { offset, row_bytes });
    }
    checked_slice(bytes, header, 28, "bitmap header")?;
    Ok(IndexedShape {
        source: Rect::read(bytes, header + 10)?,
        destination: Rect::read(bytes, header + 18)?,
        format: PictBitmapFormat::Monochrome,
        palette: None,
        data_offset: header + 28,
    })
}

fn decode_color_table(
    bytes: &[u8],
    offset: usize,
) -> Result<(Vec<[u8; 3]>, usize), PictDecodeError> {
    checked_slice(bytes, offset, 8, "color table")?;
    let flags = read_u16(bytes, offset + 4, "color table")?;
    let count = usize::from(read_u16(bytes, offset + 6, "color table")?) + 1;
    if count > 256 {
        return Err(PictDecodeError::InvalidColorTable { offset });
    }
    let length = count
        .checked_mul(8)
        .and_then(|entries| entries.checked_add(8))
        .ok_or(PictDecodeError::InvalidColorTable { offset })?;
    checked_slice(bytes, offset, length, "color table")?;
    let mut palette = vec![[0, 0, 0]; count];
    for entry in 0..count {
        let position = offset + 8 + entry * 8;
        let explicit = usize::from(read_u16(bytes, position, "color table")?);
        let index = if flags & 0x8000 != 0 || explicit >= count {
            entry
        } else {
            explicit
        };
        palette[index] = [
            bytes[position + 2],
            bytes[position + 4],
            bytes[position + 6],
        ];
    }
    Ok((palette, offset + length))
}

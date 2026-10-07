mod direct;
mod indexed;
use super::byte_io::{checked_slice, read_u16};
use super::geometry::BitmapCommand;
use super::types::PictDecodeError;

pub(super) const BITS_RECT: u16 = 0x0090;
pub(super) const BITS_RGN: u16 = 0x0091;
pub(super) const PACK_BITS_RECT: u16 = 0x0098;
pub(super) const PACK_BITS_RGN: u16 = 0x0099;
pub(super) const DIRECT_BITS_RECT: u16 = 0x009a;
pub(super) const DIRECT_BITS_RGN: u16 = 0x009b;

pub(super) fn parse_bitmap(
    bytes: &[u8],
    offset: usize,
    opcode: u16,
    opcode_bytes: usize,
) -> Result<BitmapCommand, PictDecodeError> {
    if matches!(opcode, DIRECT_BITS_RECT | DIRECT_BITS_RGN) {
        direct::parse_direct_bitmap(bytes, offset, opcode, opcode_bytes)
    } else {
        indexed::parse_indexed_or_monochrome_bitmap(bytes, offset, opcode, opcode_bytes)
    }
}

pub(super) fn skip_region_if_present(
    bytes: &[u8],
    offset: usize,
    command_offset: usize,
    opcode: u16,
) -> Result<usize, PictDecodeError> {
    if !matches!(opcode, BITS_RGN | PACK_BITS_RGN | DIRECT_BITS_RGN) {
        return Ok(offset);
    }
    let size = usize::from(read_u16(bytes, offset, "bitmap region")?);
    if size < 10 {
        return Err(PictDecodeError::Truncated {
            offset: command_offset,
            section: "bitmap region",
        });
    }
    checked_slice(bytes, offset, size, "bitmap region")?;
    Ok(offset + size)
}

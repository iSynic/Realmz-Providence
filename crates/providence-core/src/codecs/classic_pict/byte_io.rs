use super::types::PictDecodeError;

const MAX_ROW_BYTES: usize = 16_384;

pub(super) fn validate_row_bytes(offset: usize, row_bytes: usize) -> Result<(), PictDecodeError> {
    if row_bytes == 0 || row_bytes > MAX_ROW_BYTES {
        return Err(PictDecodeError::InvalidRowBytes { offset, row_bytes });
    }
    Ok(())
}

pub(super) fn read_u16(
    bytes: &[u8],
    offset: usize,
    section: &'static str,
) -> Result<u16, PictDecodeError> {
    let value = checked_slice(bytes, offset, 2, section)?;
    Ok(u16::from_be_bytes([value[0], value[1]]))
}

pub(super) fn read_i16(
    bytes: &[u8],
    offset: usize,
    section: &'static str,
) -> Result<i16, PictDecodeError> {
    let value = checked_slice(bytes, offset, 2, section)?;
    Ok(i16::from_be_bytes([value[0], value[1]]))
}

pub(super) fn checked_slice<'a>(
    bytes: &'a [u8],
    offset: usize,
    length: usize,
    section: &'static str,
) -> Result<&'a [u8], PictDecodeError> {
    let end = offset
        .checked_add(length)
        .ok_or(PictDecodeError::Truncated { offset, section })?;
    bytes
        .get(offset..end)
        .ok_or(PictDecodeError::Truncated { offset, section })
}

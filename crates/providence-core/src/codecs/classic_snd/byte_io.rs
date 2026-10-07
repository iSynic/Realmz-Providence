use super::types::SndDecodeError;

pub(super) fn read_u16(
    input: &[u8],
    offset: usize,
    section: &'static str,
) -> Result<u16, SndDecodeError> {
    let bytes = read_slice(input, offset, 2, section)?;
    Ok(u16::from_be_bytes([bytes[0], bytes[1]]))
}

pub(super) fn read_u32(
    input: &[u8],
    offset: usize,
    section: &'static str,
) -> Result<u32, SndDecodeError> {
    let bytes = read_slice(input, offset, 4, section)?;
    Ok(u32::from_be_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]))
}

pub(super) fn read_slice<'a>(
    input: &'a [u8],
    offset: usize,
    length: usize,
    section: &'static str,
) -> Result<&'a [u8], SndDecodeError> {
    let end = offset
        .checked_add(length)
        .ok_or(SndDecodeError::Truncated { offset, section })?;
    input
        .get(offset..end)
        .ok_or(SndDecodeError::Truncated { offset, section })
}

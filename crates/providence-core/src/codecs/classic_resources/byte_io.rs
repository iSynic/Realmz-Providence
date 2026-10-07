use super::contracts::ResourceForkError;

pub(super) fn checked_range(
    bytes: &[u8],
    offset: usize,
    length: usize,
) -> Result<std::ops::Range<usize>, ResourceForkError> {
    let end = offset
        .checked_add(length)
        .filter(|end| *end <= bytes.len())
        .ok_or(ResourceForkError::Malformed)?;
    Ok(offset..end)
}

pub(super) fn read_byte(bytes: &[u8], offset: usize) -> Result<u8, ResourceForkError> {
    bytes
        .get(offset)
        .copied()
        .ok_or(ResourceForkError::Malformed)
}

pub(super) fn read_i16(bytes: &[u8], offset: usize) -> Result<i16, ResourceForkError> {
    bytes
        .get(offset..offset + 2)
        .map(|value| i16::from_be_bytes([value[0], value[1]]))
        .ok_or(ResourceForkError::Malformed)
}

pub(super) fn read_u16(bytes: &[u8], offset: usize) -> Result<usize, ResourceForkError> {
    bytes
        .get(offset..offset + 2)
        .map(|value| u16::from_be_bytes([value[0], value[1]]) as usize)
        .ok_or(ResourceForkError::Malformed)
}

pub(super) fn read_u32(bytes: &[u8], offset: usize) -> Result<usize, ResourceForkError> {
    bytes
        .get(offset..offset + 4)
        .map(|value| u32::from_be_bytes([value[0], value[1], value[2], value[3]]) as usize)
        .ok_or(ResourceForkError::Malformed)
}

pub(super) fn push_u16(output: &mut Vec<u8>, value: usize) -> Result<(), ResourceForkError> {
    let value = u16::try_from(value).map_err(|_| ResourceForkError::TypeOrReferenceListTooLarge)?;
    output.extend_from_slice(&value.to_be_bytes());
    Ok(())
}

pub(super) fn push_u32(output: &mut Vec<u8>, value: usize) -> Result<(), ResourceForkError> {
    let value = u32::try_from(value).map_err(|_| ResourceForkError::Malformed)?;
    output.extend_from_slice(&value.to_be_bytes());
    Ok(())
}

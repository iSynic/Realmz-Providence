use super::{
    byte_io::{checked_range, read_u16, read_u32},
    contracts::ResourceForkError,
};

pub(super) const APPLE_SINGLE_MAGIC: u32 = 0x0005_1600;
pub(super) const APPLE_DOUBLE_MAGIC: u32 = 0x0005_1607;
pub(super) const RESOURCE_FORK_ENTRY_ID: u32 = 2;

/// Returns the native filename spellings to try for a Classic resource fork, in precedence order.
/// Filesystem adapters apply this list inside the selected scenario directory.
pub fn classic_resource_fork_candidate_paths(native_path: &str) -> Vec<String> {
    let Some(base_name) = native_path.strip_suffix(".rsrc") else {
        return Vec::new();
    };
    vec![
        native_path.to_owned(),
        format!("{base_name}.rsf"),
        format!("._{base_name}"),
        format!(".rsrc/{base_name}"),
    ]
}

pub(super) fn resource_fork_payload(bytes: &[u8]) -> Result<&[u8], ResourceForkError> {
    let Some(magic) = bytes
        .get(0..4)
        .map(|value| u32::from_be_bytes(value.try_into().expect("four bytes")))
    else {
        return Err(ResourceForkError::Malformed);
    };
    if !matches!(magic, APPLE_SINGLE_MAGIC | APPLE_DOUBLE_MAGIC) {
        return Ok(bytes);
    }
    let count = read_u16(bytes, 24)?;
    for index in 0..count {
        let descriptor = 26 + index * 12;
        if read_u32(bytes, descriptor)? != RESOURCE_FORK_ENTRY_ID as usize {
            continue;
        }
        let offset = read_u32(bytes, descriptor + 4)?;
        let length = read_u32(bytes, descriptor + 8)?;
        return Ok(&bytes[checked_range(bytes, offset, length)?]);
    }
    Err(ResourceForkError::MissingContainerResourceFork)
}

pub(super) fn replace_resource_fork_payload(
    original: &[u8],
    resource_fork: &[u8],
) -> Result<Vec<u8>, ResourceForkError> {
    let magic = read_u32(original, 0)? as u32;
    if !matches!(magic, APPLE_SINGLE_MAGIC | APPLE_DOUBLE_MAGIC) {
        return Ok(resource_fork.to_vec());
    }
    let count = read_u16(original, 24)?;
    let header_length = 26usize
        .checked_add(count * 12)
        .ok_or(ResourceForkError::Malformed)?;
    let mut output = original
        .get(..header_length)
        .ok_or(ResourceForkError::Malformed)?
        .to_vec();
    let mut found = false;
    for index in 0..count {
        let descriptor = 26 + index * 12;
        let entry_id = read_u32(original, descriptor)? as u32;
        let offset = read_u32(original, descriptor + 4)?;
        let length = read_u32(original, descriptor + 8)?;
        let payload = if entry_id == RESOURCE_FORK_ENTRY_ID {
            if found {
                return Err(ResourceForkError::Malformed);
            }
            found = true;
            resource_fork
        } else {
            &original[checked_range(original, offset, length)?]
        };
        let next_offset = output.len();
        output[descriptor + 4..descriptor + 8].copy_from_slice(&(next_offset as u32).to_be_bytes());
        output[descriptor + 8..descriptor + 12]
            .copy_from_slice(&(payload.len() as u32).to_be_bytes());
        output.extend_from_slice(payload);
    }
    if !found {
        return Err(ResourceForkError::MissingContainerResourceFork);
    }
    Ok(output)
}

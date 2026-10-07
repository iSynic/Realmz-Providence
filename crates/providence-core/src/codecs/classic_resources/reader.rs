use super::super::classic_text_resources::decode_mac_roman_name;
use super::{
    byte_io::{checked_range, read_byte, read_i16, read_u16, read_u32},
    container::resource_fork_payload,
    contracts::{ResourceEntry, ResourceForkError},
};
use std::collections::BTreeSet;

pub fn parse_resource_entries(bytes: &[u8]) -> Result<Vec<ResourceEntry>, ResourceForkError> {
    parse_resource_entries_impl(bytes, true)
}

pub fn parse_resource_entries_preserving_duplicates(
    bytes: &[u8],
) -> Result<Vec<ResourceEntry>, ResourceForkError> {
    parse_resource_entries_impl(bytes, false)
}

fn parse_resource_entries_impl(
    bytes: &[u8],
    reject_duplicates: bool,
) -> Result<Vec<ResourceEntry>, ResourceForkError> {
    let mut entries = Vec::new();
    visit_resource_entries(
        bytes,
        reject_duplicates,
        |resource_type, id, name, attributes, data, _| {
            entries.push(ResourceEntry {
                resource_type,
                id,
                name,
                attributes,
                data: data.to_vec(),
            });
        },
    )?;
    Ok(entries)
}

pub(super) fn visit_resource_entries(
    bytes: &[u8],
    reject_duplicates: bool,
    mut visit: impl FnMut([u8; 4], i16, String, u8, &[u8], usize),
) -> Result<(), ResourceForkError> {
    let fork = resource_fork_payload(bytes)?;
    let sections = ForkSections::read(fork)?;
    if sections.raw_type_count == u16::MAX as usize {
        return Ok(());
    }
    let mut identities = BTreeSet::new();
    for type_index in 0..=sections.raw_type_count {
        let type_offset = sections
            .type_list
            .checked_add(2 + type_index * 8)
            .ok_or(ResourceForkError::Malformed)?;
        let resource_type: [u8; 4] = fork
            .get(type_offset..type_offset + 4)
            .ok_or(ResourceForkError::Malformed)?
            .try_into()
            .map_err(|_| ResourceForkError::Malformed)?;
        let raw_resource_count = read_u16(fork, type_offset + 4)?;
        let reference_list = sections
            .type_list
            .checked_add(read_u16(fork, type_offset + 6)?)
            .ok_or(ResourceForkError::Malformed)?;
        for reference_index in 0..=raw_resource_count {
            let reference = reference_list
                .checked_add(reference_index * 12)
                .ok_or(ResourceForkError::Malformed)?;
            let id = read_i16(fork, reference)?;
            if reject_duplicates && !identities.insert((resource_type, id)) {
                return Err(ResourceForkError::DuplicateResource { resource_type, id });
            }
            let name = reference_name(fork, sections.name_list, reference)?;
            let attributes = read_byte(fork, reference + 4)?;
            let (data, offset) = reference_payload(fork, sections.data_offset, reference)?;
            visit(resource_type, id, name, attributes, data, offset);
        }
    }
    Ok(())
}

struct ForkSections {
    data_offset: usize,
    type_list: usize,
    name_list: usize,
    raw_type_count: usize,
}

impl ForkSections {
    fn read(fork: &[u8]) -> Result<Self, ResourceForkError> {
        if fork.len() < 32 {
            return Err(ResourceForkError::Malformed);
        }
        let data_offset = read_u32(fork, 0)?;
        let map_offset = read_u32(fork, 4)?;
        let data_length = read_u32(fork, 8)?;
        let map_length = read_u32(fork, 12)?;
        checked_range(fork, data_offset, data_length)?;
        checked_range(fork, map_offset, map_length)?;
        let type_list = map_offset
            .checked_add(read_u16(fork, map_offset + 24)?)
            .ok_or(ResourceForkError::Malformed)?;
        let name_list = map_offset
            .checked_add(read_u16(fork, map_offset + 26)?)
            .ok_or(ResourceForkError::Malformed)?;
        let raw_type_count = read_u16(fork, type_list)?;
        Ok(Self {
            data_offset,
            type_list,
            name_list,
            raw_type_count,
        })
    }
}

fn reference_name(
    fork: &[u8],
    name_list: usize,
    reference: usize,
) -> Result<String, ResourceForkError> {
    let raw_name_offset = read_i16(fork, reference + 2)?;
    let name = if raw_name_offset < 0 {
        String::new()
    } else {
        let offset = name_list
            .checked_add(raw_name_offset as usize)
            .ok_or(ResourceForkError::Malformed)?;
        let length = usize::from(read_byte(fork, offset)?);
        let range = checked_range(fork, offset + 1, length)?;
        decode_mac_roman_name(&fork[range])
    };
    Ok(name)
}

fn reference_payload(
    fork: &[u8],
    data_offset: usize,
    reference: usize,
) -> Result<(&[u8], usize), ResourceForkError> {
    let relative = (usize::from(read_byte(fork, reference + 5)?) << 16)
        | (usize::from(read_byte(fork, reference + 6)?) << 8)
        | usize::from(read_byte(fork, reference + 7)?);
    let length_offset = data_offset
        .checked_add(relative)
        .ok_or(ResourceForkError::Malformed)?;
    let length = read_u32(fork, length_offset)?;
    let range = checked_range(fork, length_offset + 4, length)?;
    Ok((&fork[range.clone()], range.start))
}

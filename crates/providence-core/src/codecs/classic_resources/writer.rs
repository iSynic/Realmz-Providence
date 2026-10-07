use super::super::classic_text_resources::encode_mac_roman_name;
use super::{
    byte_io::{push_u16, push_u32},
    contracts::{ResourceEntry, ResourceForkError},
};
use std::collections::{BTreeMap, BTreeSet};

type ResourceGroups = BTreeMap<[u8; 4], Vec<ResourceEntry>>;

pub fn write_resource_fork(entries: &[ResourceEntry]) -> Result<Vec<u8>, ResourceForkError> {
    write_resource_fork_impl(entries, true)
}

pub(in crate::codecs) fn write_resource_fork_preserving_duplicates(
    entries: &[ResourceEntry],
) -> Result<Vec<u8>, ResourceForkError> {
    write_resource_fork_impl(entries, false)
}

fn write_resource_fork_impl(
    entries: &[ResourceEntry],
    reject_duplicates: bool,
) -> Result<Vec<u8>, ResourceForkError> {
    let grouped = group_entries(entries, reject_duplicates)?;
    let (data_section, data_offsets) = encode_payloads(&grouped)?;
    let layout = MapLayout::for_groups(&grouped)?;
    let type_list = encode_types(&grouped, &layout)?;
    let (references, names) = encode_references(&grouped, &data_offsets)?;
    assemble_fork(&data_section, &type_list, &references, &names, &layout)
}

fn group_entries(
    entries: &[ResourceEntry],
    reject_duplicates: bool,
) -> Result<ResourceGroups, ResourceForkError> {
    let mut grouped = BTreeMap::<[u8; 4], Vec<ResourceEntry>>::new();
    let mut identities = BTreeSet::new();
    for entry in entries {
        if reject_duplicates && !identities.insert((entry.resource_type, entry.id)) {
            return Err(ResourceForkError::DuplicateResource {
                resource_type: entry.resource_type,
                id: entry.id,
            });
        }
        grouped
            .entry(entry.resource_type)
            .or_default()
            .push(entry.clone());
    }
    if grouped.len() > u16::MAX as usize {
        return Err(ResourceForkError::TooManyTypes);
    }
    for (resource_type, resources) in &mut grouped {
        if resources.len() > u16::MAX as usize {
            return Err(ResourceForkError::TooManyResources(*resource_type));
        }
        resources.sort_by_key(|entry| entry.id);
    }

    Ok(grouped)
}

fn encode_payloads(grouped: &ResourceGroups) -> Result<(Vec<u8>, Vec<usize>), ResourceForkError> {
    let mut data_section = Vec::new();
    let mut data_offsets = Vec::new();
    for resources in grouped.values() {
        for entry in resources {
            if data_section.len() > 0x00ff_ffff {
                return Err(ResourceForkError::DataOffsetTooLarge);
            }
            data_offsets.push(data_section.len());
            push_u32(&mut data_section, entry.data.len())?;
            data_section.extend_from_slice(&entry.data);
        }
    }

    Ok((data_section, data_offsets))
}

struct MapLayout {
    type_list_length: usize,
    name_list_start: usize,
}

impl MapLayout {
    fn for_groups(grouped: &ResourceGroups) -> Result<Self, ResourceForkError> {
        let type_list_length = 2usize
            .checked_add(grouped.len() * 8)
            .ok_or(ResourceForkError::TypeOrReferenceListTooLarge)?;
        let reference_list_length = grouped
            .values()
            .map(|resources| resources.len() * 12)
            .sum::<usize>();
        let name_list_start = type_list_length
            .checked_add(reference_list_length)
            .ok_or(ResourceForkError::TypeOrReferenceListTooLarge)?;
        if name_list_start > u16::MAX as usize {
            return Err(ResourceForkError::TypeOrReferenceListTooLarge);
        }

        Ok(Self {
            type_list_length,
            name_list_start,
        })
    }
}

fn encode_types(
    grouped: &ResourceGroups,
    layout: &MapLayout,
) -> Result<Vec<u8>, ResourceForkError> {
    let mut type_list = Vec::new();
    push_u16(
        &mut type_list,
        if grouped.is_empty() {
            u16::MAX as usize
        } else {
            grouped.len() - 1
        },
    )?;
    let mut reference_cursor = layout.type_list_length;
    for (resource_type, resources) in grouped {
        type_list.extend_from_slice(resource_type);
        push_u16(&mut type_list, resources.len().saturating_sub(1))?;
        push_u16(&mut type_list, reference_cursor)?;
        reference_cursor += resources.len() * 12;
    }

    Ok(type_list)
}

fn encode_references(
    grouped: &ResourceGroups,
    data_offsets: &[usize],
) -> Result<(Vec<u8>, Vec<u8>), ResourceForkError> {
    let mut references = Vec::new();
    let mut names = Vec::new();
    let mut data_offset_index = 0usize;
    for resources in grouped.values() {
        for entry in resources {
            references.extend_from_slice(&entry.id.to_be_bytes());
            if entry.name.is_empty() {
                references.extend_from_slice(&(-1i16).to_be_bytes());
            } else {
                let encoded = encode_mac_roman_name(&entry.name)
                    .ok_or(ResourceForkError::UnencodableResourceName)?;
                if encoded.len() > 255 || names.len() > i16::MAX as usize {
                    return Err(ResourceForkError::ResourceNameTooLong);
                }
                references.extend_from_slice(&(names.len() as i16).to_be_bytes());
                names.push(encoded.len() as u8);
                names.extend_from_slice(&encoded);
            }
            references.push(entry.attributes);
            let offset = *data_offsets
                .get(data_offset_index)
                .ok_or(ResourceForkError::Malformed)?;
            data_offset_index += 1;
            if offset > 0x00ff_ffff {
                return Err(ResourceForkError::DataOffsetTooLarge);
            }
            references.extend_from_slice(&[
                ((offset >> 16) & 0xff) as u8,
                ((offset >> 8) & 0xff) as u8,
                (offset & 0xff) as u8,
                0,
                0,
                0,
                0,
            ]);
        }
    }

    Ok((references, names))
}

fn assemble_fork(
    data_section: &[u8],
    type_list: &[u8],
    references: &[u8],
    names: &[u8],
    layout: &MapLayout,
) -> Result<Vec<u8>, ResourceForkError> {
    let data_offset = 16usize;
    let map_offset = data_offset + data_section.len();
    let map_length = 28 + type_list.len() + references.len() + names.len();
    let mut output = Vec::new();
    push_u32(&mut output, data_offset)?;
    push_u32(&mut output, map_offset)?;
    push_u32(&mut output, data_section.len())?;
    push_u32(&mut output, map_length)?;
    output.extend_from_slice(data_section);

    push_u32(&mut output, data_offset)?;
    push_u32(&mut output, map_offset)?;
    push_u32(&mut output, data_section.len())?;
    push_u32(&mut output, map_length)?;
    output.extend_from_slice(&[0; 8]);
    push_u16(&mut output, 28)?;
    push_u16(&mut output, 28 + layout.name_list_start)?;
    output.extend_from_slice(type_list);
    output.extend_from_slice(references);
    output.extend_from_slice(names);
    Ok(output)
}

pub fn empty_resource_fork() -> Vec<u8> {
    write_resource_fork(&[]).expect("empty resource fork has fixed valid geometry")
}

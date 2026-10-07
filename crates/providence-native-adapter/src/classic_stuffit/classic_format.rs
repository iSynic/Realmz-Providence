use super::{checksum::crc16, names};
use stuffit::{SitArchive, SitEntry};

const ARCHIVE_HEADER: usize = 22;
const ENTRY_HEADER: usize = 112;

// The native scenario profile is one root folder with flat files. Stored forks
// avoid the experimental SIT5 writer while retaining Classic Finder metadata.
pub(super) fn serialize(entries: &[SitEntry]) -> Result<Vec<u8>, String> {
    let root = entries.first().ok_or("Missing StuffIt root folder")?;
    validate_entries(entries)?;
    let size = ARCHIVE_HEADER
        + (entries.len() + 1) * ENTRY_HEADER
        + entries
            .iter()
            .map(|entry| entry.data_fork.len() + entry.resource_fork.len())
            .sum::<usize>();
    if size > super::MAX_ARCHIVE_BYTES {
        return Err("StuffIt output exceeded its bounded archive size.".into());
    }
    let mut bytes = Vec::with_capacity(size);
    bytes.extend_from_slice(b"SIT!\0\x01");
    bytes.extend_from_slice(&(size as u32).to_be_bytes());
    bytes.extend_from_slice(b"rLau\x01\0\0\0\0\0\0\0");
    for entry in entries {
        bytes.extend_from_slice(&header(entry, if entry.is_folder { 0x20 } else { 0 })?);
        bytes.extend_from_slice(&entry.resource_fork);
        bytes.extend_from_slice(&entry.data_fork);
    }
    bytes.extend_from_slice(&header(root, 0x21)?);
    archive(&bytes, entries)?;
    Ok(bytes)
}

fn validate_entries(entries: &[SitEntry]) -> Result<(), String> {
    let root = entries.first().ok_or("Missing StuffIt root folder")?;
    names::encode(&root.name)?;
    if !root.is_folder
        || !root.data_fork.is_empty()
        || !root.resource_fork.is_empty()
        || entries.len() > super::MAX_FILES + 1
    {
        return Err("Invalid StuffIt root or file count".into());
    }
    for entry in &entries[1..] {
        let (parent, name) = entry.name.split_once('/').ok_or("Missing StuffIt parent")?;
        names::encode(name)?;
        if parent != root.name || entry.is_folder {
            return Err("StuffIt scenario export requires one flat root folder".into());
        }
    }
    Ok(())
}

fn header(entry: &SitEntry, method: u8) -> Result<[u8; ENTRY_HEADER], String> {
    let name = names::encode(
        entry
            .name
            .rsplit('/')
            .next()
            .ok_or("Missing StuffIt name")?,
    )?;
    let mut bytes = [0u8; ENTRY_HEADER];
    bytes[..2].fill(method);
    bytes[2] = name.len() as u8;
    bytes[3..3 + name.len()].copy_from_slice(&name);
    bytes[66..70].copy_from_slice(&entry.file_type);
    bytes[70..74].copy_from_slice(&entry.creator);
    bytes[74..76].copy_from_slice(&entry.finder_flags.to_be_bytes());
    bytes[76..80].copy_from_slice(&entry.creation_date.to_be_bytes());
    bytes[80..84].copy_from_slice(&entry.modification_date.to_be_bytes());
    let resource =
        u32::try_from(entry.resource_fork.len()).map_err(|_| "StuffIt fork size overflow")?;
    let data = u32::try_from(entry.data_fork.len()).map_err(|_| "StuffIt fork size overflow")?;
    for (offset, length) in [(84, resource), (88, data), (92, resource), (96, data)] {
        bytes[offset..offset + 4].copy_from_slice(&length.to_be_bytes());
    }
    bytes[100..102].copy_from_slice(&crc16(&entry.resource_fork).to_be_bytes());
    bytes[102..104].copy_from_slice(&crc16(&entry.data_fork).to_be_bytes());
    let crc = crc16(&bytes[..110]);
    bytes[110..112].copy_from_slice(&crc.to_be_bytes());
    Ok(bytes)
}

pub(super) fn archive(bytes: &[u8], expected: &[SitEntry]) -> Result<(), String> {
    validate_entries(expected)?;
    check_structure(bytes, expected)?;
    let decoded =
        SitArchive::parse(bytes).map_err(|error| format!("StuffIt verification: {error}"))?;
    if decoded.entries.len() != expected.len() {
        return Err("StuffIt verification lost or added entries".into());
    }
    for (actual, expected) in decoded.entries.iter().zip(expected) {
        if actual.name != expected.name
            || actual.is_folder != expected.is_folder
            || actual.file_type != expected.file_type
            || actual.creator != expected.creator
            || actual.finder_flags != expected.finder_flags
            || actual.creation_date != expected.creation_date
            || actual.modification_date != expected.modification_date
        {
            return Err(format!(
                "StuffIt name/metadata verification failed for {}",
                expected.name
            ));
        }
        let (data, resource) = actual
            .decompressed_forks()
            .map_err(|error| format!("StuffIt fork verification: {error}"))?;
        if data != expected.data_fork || resource != expected.resource_fork {
            return Err(format!(
                "StuffIt fork verification failed for {}",
                expected.name
            ));
        }
    }
    Ok(())
}

fn check_structure(bytes: &[u8], expected: &[SitEntry]) -> Result<(), String> {
    if bytes.len() > super::MAX_ARCHIVE_BYTES
        || bytes.get(..6) != Some(b"SIT!\0\x01")
        || bytes.get(10..22) != Some(b"rLau\x01\0\0\0\0\0\0\0")
        || bytes.get(6..10) != Some(&(bytes.len() as u32).to_be_bytes())
    {
        return Err("StuffIt verification rejected the archive header".into());
    }
    let mut offset = ARCHIVE_HEADER;
    for entry in expected {
        check_header(bytes, offset, entry, if entry.is_folder { 0x20 } else { 0 })?;
        offset += ENTRY_HEADER + entry.resource_fork.len() + entry.data_fork.len();
        if offset > bytes.len() {
            return Err("Truncated StuffIt fork".into());
        }
    }
    check_header(bytes, offset, &expected[0], 0x21)?;
    if offset + ENTRY_HEADER != bytes.len() {
        return Err("StuffIt verification found trailing or missing entries".into());
    }
    Ok(())
}

fn check_header(bytes: &[u8], offset: usize, entry: &SitEntry, method: u8) -> Result<(), String> {
    let actual = bytes
        .get(offset..offset + ENTRY_HEADER)
        .ok_or("Truncated StuffIt entry header")?;
    if actual != header(entry, method)? {
        return Err(format!(
            "StuffIt header/CRC verification failed for {}",
            entry.name
        ));
    }
    Ok(())
}

use crate::model::{BlobId, RuleNameCatalog};

use super::{ResourceEntry, parse_resource_entries, parse_resource_entries_preserving_duplicates};

pub const RACE_NAME_RESOURCE_ID: i16 = 129;
pub const CASTE_NAME_RESOURCE_ID: i16 = 131;
pub const REQUIRED_RACE_NAMES: usize = 30;
pub const REQUIRED_CASTE_NAMES: usize = 30;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RuleNameCodecError {
    MalformedResourceFork,
    MissingStringList(i16),
    DuplicateStringList(i16),
    TruncatedStringList(i16),
    TooFewNames {
        resource_id: i16,
        expected: usize,
        actual: usize,
    },
}

impl std::fmt::Display for RuleNameCodecError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::MalformedResourceFork => write!(
                formatter,
                "Custom Names is not a valid resource fork or AppleDouble file"
            ),
            Self::MissingStringList(id) => write!(formatter, "Custom Names is missing STR# {id}"),
            Self::DuplicateStringList(id) => {
                write!(formatter, "STR# {id} has ambiguous duplicate resources")
            }
            Self::TruncatedStringList(id) => {
                write!(formatter, "Custom Names STR# {id} is truncated")
            }
            Self::TooFewNames {
                resource_id,
                expected,
                actual,
            } => write!(
                formatter,
                "Custom Names STR# {resource_id} has {actual} strings; expected at least {expected}"
            ),
        }
    }
}

impl std::error::Error for RuleNameCodecError {}

pub fn decode_rule_name_catalog(
    bytes: &[u8],
    source: String,
    source_blob: BlobId,
) -> Result<RuleNameCatalog, RuleNameCodecError> {
    let entries =
        parse_resource_entries(bytes).map_err(|_| RuleNameCodecError::MalformedResourceFork)?;
    let race_data = find_resource(&entries, b"STR#", RACE_NAME_RESOURCE_ID)?;
    let caste_data = find_resource(&entries, b"STR#", CASTE_NAME_RESOURCE_ID)?;
    let race_names = decode_string_list(race_data, RACE_NAME_RESOURCE_ID)?;
    let caste_names = decode_string_list(caste_data, CASTE_NAME_RESOURCE_ID)?;
    validate_names(&race_names, RACE_NAME_RESOURCE_ID, REQUIRED_RACE_NAMES)?;
    validate_names(&caste_names, CASTE_NAME_RESOURCE_ID, REQUIRED_CASTE_NAMES)?;
    Ok(RuleNameCatalog {
        source,
        source_blob,
        race_resource_id: RACE_NAME_RESOURCE_ID,
        caste_resource_id: CASTE_NAME_RESOURCE_ID,
        race_names,
        caste_names,
    })
}

pub fn decode_string_list_resource(
    bytes: &[u8],
    resource_id: i16,
) -> Result<Option<Vec<String>>, RuleNameCodecError> {
    let entries = parse_resource_entries_preserving_duplicates(bytes)
        .map_err(|_| RuleNameCodecError::MalformedResourceFork)?;
    match find_resource(&entries, b"STR#", resource_id) {
        Ok(data) => decode_string_list(data, resource_id).map(Some),
        Err(RuleNameCodecError::MissingStringList(_)) => Ok(None),
        Err(error) => Err(error),
    }
}

pub fn decode_available_string_list_resource(
    bytes: &[u8],
    resource_id: i16,
) -> Result<Option<(Vec<String>, bool)>, RuleNameCodecError> {
    let entries = parse_resource_entries_preserving_duplicates(bytes)
        .map_err(|_| RuleNameCodecError::MalformedResourceFork)?;
    match find_resource(&entries, b"STR#", resource_id) {
        Ok(data) => Ok(Some(decode_available_string_list(data))),
        Err(RuleNameCodecError::MissingStringList(_)) => Ok(None),
        Err(error) => Err(error),
    }
}

pub fn effective_race_name<'a>(
    catalog: Option<&'a RuleNameCatalog>,
    classic_id: u8,
    override_name: &'a str,
) -> Option<&'a str> {
    if !override_name.trim().is_empty() {
        return Some(override_name);
    }
    catalog?
        .race_names
        .get(usize::from(classic_id.checked_sub(1)?))
        .map(String::as_str)
}

pub fn effective_caste_name<'a>(
    catalog: Option<&'a RuleNameCatalog>,
    classic_id: u8,
    override_name: &'a str,
) -> Option<&'a str> {
    if !override_name.trim().is_empty() {
        return Some(override_name);
    }
    catalog?
        .caste_names
        .get(usize::from(classic_id.checked_sub(1)?))
        .map(String::as_str)
}

fn validate_names(
    names: &[String],
    resource_id: i16,
    expected: usize,
) -> Result<(), RuleNameCodecError> {
    if names.len() < expected {
        return Err(RuleNameCodecError::TooFewNames {
            resource_id,
            expected,
            actual: names.len(),
        });
    }
    Ok(())
}

fn decode_string_list(bytes: &[u8], id: i16) -> Result<Vec<String>, RuleNameCodecError> {
    let count = read_u16(bytes, 0).ok_or(RuleNameCodecError::TruncatedStringList(id))?;
    let mut cursor = 2usize;
    let mut names = Vec::with_capacity(count);
    for _ in 0..count {
        let length = *bytes
            .get(cursor)
            .ok_or(RuleNameCodecError::TruncatedStringList(id))? as usize;
        cursor += 1;
        let end = cursor
            .checked_add(length)
            .filter(|end| *end <= bytes.len())
            .ok_or(RuleNameCodecError::TruncatedStringList(id))?;
        names.push(decode_classic_text(&bytes[cursor..end]));
        cursor = end;
    }
    Ok(names)
}

fn decode_available_string_list(bytes: &[u8]) -> (Vec<String>, bool) {
    let Some(count) = read_u16(bytes, 0) else {
        return (Vec::new(), false);
    };
    let mut cursor = 2usize;
    let mut names = Vec::with_capacity(count);
    for _ in 0..count {
        let Some(length) = bytes.get(cursor).copied().map(usize::from) else {
            return (names, false);
        };
        cursor += 1;
        let Some(end) = cursor.checked_add(length).filter(|end| *end <= bytes.len()) else {
            return (names, false);
        };
        names.push(decode_classic_text(&bytes[cursor..end]));
        cursor = end;
    }
    (names, true)
}

fn find_resource<'a>(
    entries: &'a [ResourceEntry],
    wanted_type: &[u8; 4],
    wanted_id: i16,
) -> Result<&'a [u8], RuleNameCodecError> {
    let mut matches = entries
        .iter()
        .filter(|entry| entry.resource_type == *wanted_type && entry.id == wanted_id);
    let entry = matches
        .next()
        .ok_or(RuleNameCodecError::MissingStringList(wanted_id))?;
    if matches.next().is_some() {
        return Err(RuleNameCodecError::DuplicateStringList(wanted_id));
    }
    Ok(entry.data.as_slice())
}

fn decode_classic_text(bytes: &[u8]) -> String {
    bytes
        .iter()
        .map(|byte| match *byte {
            0 => ' ',
            9 => '\t',
            10 | 13 => '\n',
            32..=126 => *byte as char,
            _ => '?',
        })
        .collect::<String>()
        .trim()
        .to_string()
}

fn read_u16(bytes: &[u8], offset: usize) -> Option<usize> {
    bytes
        .get(offset..offset + 2)
        .map(|value| u16::from_be_bytes([value[0], value[1]]) as usize)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn targeted_name_reads_preserve_unrelated_duplicate_keys_but_reject_ambiguous_names() {
        let entry = |resource_type, id, data| ResourceEntry {
            resource_type,
            id,
            name: String::new(),
            attributes: 0,
            data,
        };
        let names = entry(*b"STR#", 129, vec![0, 1, 3, b'E', b'l', b'f']);
        let mut entries = vec![
            names.clone(),
            entry([0; 4], -1, vec![1]),
            entry([0; 4], -1, vec![2]),
        ];
        let fork =
            super::super::classic_resources::write_resource_fork_preserving_duplicates(&entries)
                .unwrap();
        let original = fork.clone();
        assert_eq!(
            decode_string_list_resource(&fork, 129).unwrap(),
            Some(vec!["Elf".into()])
        );
        assert_eq!(decode_string_list_resource(&fork, 131).unwrap(), None);
        assert_eq!(
            decode_available_string_list_resource(&fork, 129).unwrap(),
            Some((vec!["Elf".into()], true))
        );
        assert_eq!(fork, original);
        entries.push(names);
        let ambiguous =
            super::super::classic_resources::write_resource_fork_preserving_duplicates(&entries)
                .unwrap();
        assert_eq!(
            decode_string_list_resource(&ambiguous, 129),
            Err(RuleNameCodecError::DuplicateStringList(129))
        );
        assert_eq!(
            decode_available_string_list_resource(&ambiguous, 129),
            Err(RuleNameCodecError::DuplicateStringList(129))
        );
        assert!(decode_string_list_resource(&fork[..fork.len() / 2], 129).is_err());
    }

    #[test]
    fn decodes_authoritative_rule_names_from_resource_fork() {
        let races = (1..=30).map(|id| format!("Race {id}")).collect::<Vec<_>>();
        let castes = (1..=30).map(|id| format!("Caste {id}")).collect::<Vec<_>>();
        let bytes = resource_fork(&races, &castes);

        let catalog = decode_rule_name_catalog(
            &bytes,
            "Data Files/Custom Names.rsrc".into(),
            BlobId("sha256:names".into()),
        )
        .expect("decode names");

        assert_eq!(catalog.race_names.len(), 30);
        assert_eq!(catalog.caste_names.len(), 30);
        assert_eq!(catalog.race_names[0], "Race 1");
        assert_eq!(catalog.caste_names[29], "Caste 30");
    }

    #[test]
    fn rejects_a_catalog_that_cannot_name_all_native_records() {
        let races = vec!["Human".to_string()];
        let castes = (1..=30).map(|id| format!("Caste {id}")).collect::<Vec<_>>();
        let error = decode_rule_name_catalog(
            &resource_fork(&races, &castes),
            "Custom Names".into(),
            BlobId("sha256:names".into()),
        )
        .expect_err("short race list must fail");

        assert_eq!(
            error,
            RuleNameCodecError::TooFewNames {
                resource_id: RACE_NAME_RESOURCE_ID,
                expected: 30,
                actual: 1,
            }
        );
    }

    #[test]
    fn decodes_the_resource_entry_from_an_appledouble_container() {
        let races = (1..=30).map(|id| format!("Race {id}")).collect::<Vec<_>>();
        let castes = (1..=30).map(|id| format!("Caste {id}")).collect::<Vec<_>>();
        let fork = resource_fork(&races, &castes);
        let mut apple_double = vec![0u8; 38];
        apple_double[0..4].copy_from_slice(&0x0005_1607u32.to_be_bytes());
        apple_double[4..8].copy_from_slice(&0x0002_0000u32.to_be_bytes());
        apple_double[24..26].copy_from_slice(&1u16.to_be_bytes());
        apple_double[26..30].copy_from_slice(&2u32.to_be_bytes());
        apple_double[30..34].copy_from_slice(&38u32.to_be_bytes());
        apple_double[34..38].copy_from_slice(&(fork.len() as u32).to_be_bytes());
        apple_double.extend_from_slice(&fork);

        let catalog = decode_rule_name_catalog(
            &apple_double,
            "._Custom Names".into(),
            BlobId("sha256:names".into()),
        )
        .expect("decode AppleDouble names");

        assert_eq!(catalog.race_names[0], "Race 1");
        assert_eq!(catalog.caste_names[0], "Caste 1");
    }

    fn string_list(names: &[String]) -> Vec<u8> {
        let mut output = Vec::new();
        output.extend_from_slice(&(names.len() as u16).to_be_bytes());
        for name in names {
            output.push(name.len() as u8);
            output.extend_from_slice(name.as_bytes());
        }
        output
    }

    fn resource_fork(races: &[String], castes: &[String]) -> Vec<u8> {
        let race_data = string_list(races);
        let caste_data = string_list(castes);
        let mut data = Vec::new();
        data.extend_from_slice(&(race_data.len() as u32).to_be_bytes());
        data.extend_from_slice(&race_data);
        let caste_offset = data.len();
        data.extend_from_slice(&(caste_data.len() as u32).to_be_bytes());
        data.extend_from_slice(&caste_data);

        let data_offset = 16usize;
        let map_offset = data_offset + data.len();
        let mut map = vec![0; 28];
        map[24..26].copy_from_slice(&28u16.to_be_bytes());
        map[26..28].copy_from_slice(&62u16.to_be_bytes());
        map.extend_from_slice(&0u16.to_be_bytes());
        map.extend_from_slice(b"STR#");
        map.extend_from_slice(&1u16.to_be_bytes());
        map.extend_from_slice(&10u16.to_be_bytes());
        for (id, offset) in [
            (RACE_NAME_RESOURCE_ID, 0usize),
            (CASTE_NAME_RESOURCE_ID, caste_offset),
        ] {
            map.extend_from_slice(&id.to_be_bytes());
            map.extend_from_slice(&(-1i16).to_be_bytes());
            map.push(0);
            map.push(((offset >> 16) & 0xff) as u8);
            map.push(((offset >> 8) & 0xff) as u8);
            map.push((offset & 0xff) as u8);
            map.extend_from_slice(&0u32.to_be_bytes());
        }

        let mut output = Vec::new();
        output.extend_from_slice(&(data_offset as u32).to_be_bytes());
        output.extend_from_slice(&(map_offset as u32).to_be_bytes());
        output.extend_from_slice(&(data.len() as u32).to_be_bytes());
        output.extend_from_slice(&(map.len() as u32).to_be_bytes());
        output.extend_from_slice(&data);
        output.extend_from_slice(&map);
        output
    }
}

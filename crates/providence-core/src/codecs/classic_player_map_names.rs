use crate::model::{BlobId, PlayerMapNameCatalog};

use super::classic_text_resources::{decode_mac_roman_text, encode_mac_roman_text};
use super::{
    ResourceEntry, ResourceForkError, empty_resource_fork,
    merge_resource_entries_preserving_unowned_duplicates,
    parse_resource_entries_preserving_duplicates,
};

pub const PLAYER_MAP_AVAILABLE_NAMES_RESOURCE_ID: i16 = -102;
pub const PLAYER_MAP_UNAVAILABLE_NAMES_RESOURCE_ID: i16 = -101;
pub const PLAYER_MAP_RUNTIME_NAME_SLOTS: usize = 20;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PlayerMapNameCodecError {
    ResourceFork(ResourceForkError),
    MissingStringList(i16),
    TruncatedStringList(i16),
    TooManyNames {
        resource_id: i16,
        actual: usize,
    },
    NameTooLong {
        resource_id: i16,
        index: usize,
        bytes: usize,
    },
    NonClassicText {
        resource_id: i16,
        index: usize,
    },
}

impl std::fmt::Display for PlayerMapNameCodecError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::ResourceFork(error) => write!(formatter, "{error}"),
            Self::MissingStringList(id) => {
                write!(formatter, "Scenario.rsrc is missing Player Map STR# {id}")
            }
            Self::TruncatedStringList(id) => {
                write!(formatter, "Scenario.rsrc Player Map STR# {id} is truncated")
            }
            Self::TooManyNames {
                resource_id,
                actual,
            } => write!(
                formatter,
                "Scenario.rsrc Player Map STR# {resource_id} has {actual} names; STR# supports at most {}",
                u16::MAX
            ),
            Self::NameTooLong {
                resource_id,
                index,
                bytes,
            } => write!(
                formatter,
                "Scenario.rsrc Player Map STR# {resource_id} name {} encodes to {bytes} bytes; Classic maximum is 255",
                index + 1
            ),
            Self::NonClassicText { resource_id, index } => write!(
                formatter,
                "Scenario.rsrc Player Map STR# {resource_id} name {} contains text that cannot be encoded as MacRoman",
                index + 1
            ),
        }
    }
}

impl std::error::Error for PlayerMapNameCodecError {}

impl From<ResourceForkError> for PlayerMapNameCodecError {
    fn from(value: ResourceForkError) -> Self {
        Self::ResourceFork(value)
    }
}

pub fn decode_player_map_name_catalog(
    bytes: &[u8],
    source_blob: Option<BlobId>,
) -> Result<PlayerMapNameCatalog, PlayerMapNameCodecError> {
    let entries = parse_resource_entries_preserving_duplicates(bytes)?;
    let available_names = decode_required_list(&entries, PLAYER_MAP_AVAILABLE_NAMES_RESOURCE_ID)?;
    let unavailable_names =
        decode_required_list(&entries, PLAYER_MAP_UNAVAILABLE_NAMES_RESOURCE_ID)?;
    validate_player_map_name_catalog(&PlayerMapNameCatalog {
        source_blob: source_blob.clone(),
        available_names: available_names.clone(),
        unavailable_names: unavailable_names.clone(),
    })?;
    Ok(PlayerMapNameCatalog {
        source_blob,
        available_names,
        unavailable_names,
    })
}

pub fn decode_player_map_name_string_list(
    bytes: &[u8],
    resource_id: i16,
) -> Result<Option<Vec<String>>, PlayerMapNameCodecError> {
    let entries = parse_resource_entries_preserving_duplicates(bytes)?;
    find_owned_entry(&entries, resource_id)?
        .map(|entry| decode_string_list(&entry.data, resource_id))
        .transpose()
}

pub fn encode_player_map_name_resources(
    catalog: &PlayerMapNameCatalog,
    compatibility_source: Option<&[u8]>,
) -> Result<Vec<u8>, PlayerMapNameCodecError> {
    validate_player_map_name_catalog(catalog)?;
    let original = compatibility_source
        .map(ToOwned::to_owned)
        .unwrap_or_else(empty_resource_fork);
    let entries = parse_resource_entries_preserving_duplicates(&original)?;
    let available_matches = list_matches(
        &entries,
        PLAYER_MAP_AVAILABLE_NAMES_RESOURCE_ID,
        &catalog.available_names,
    )?;
    let unavailable_matches = list_matches(
        &entries,
        PLAYER_MAP_UNAVAILABLE_NAMES_RESOURCE_ID,
        &catalog.unavailable_names,
    )?;
    if compatibility_source.is_some() && available_matches && unavailable_matches {
        return Ok(original);
    }

    let updates = [
        (
            PLAYER_MAP_AVAILABLE_NAMES_RESOURCE_ID,
            &catalog.available_names,
        ),
        (
            PLAYER_MAP_UNAVAILABLE_NAMES_RESOURCE_ID,
            &catalog.unavailable_names,
        ),
    ]
    .into_iter()
    .map(|(resource_id, names)| {
        let existing = find_owned_entry(&entries, resource_id)?;
        if existing.is_some_and(|entry| {
            decode_string_list(&entry.data, resource_id).is_ok_and(|decoded| decoded == *names)
        }) {
            return Ok(existing.expect("matching entry exists").clone());
        }
        Ok(ResourceEntry {
            resource_type: *b"STR#",
            id: resource_id,
            name: existing
                .map(|entry| entry.name.clone())
                .unwrap_or_else(|| "Map Names".into()),
            attributes: existing.map_or(0, |entry| entry.attributes),
            data: encode_string_list(names, resource_id)?,
        })
    })
    .collect::<Result<Vec<_>, PlayerMapNameCodecError>>()?;
    merge_resource_entries_preserving_unowned_duplicates(&original, updates).map_err(Into::into)
}

pub fn validate_player_map_name_catalog(
    catalog: &PlayerMapNameCatalog,
) -> Result<(), PlayerMapNameCodecError> {
    validate_names(
        &catalog.available_names,
        PLAYER_MAP_AVAILABLE_NAMES_RESOURCE_ID,
    )?;
    validate_names(
        &catalog.unavailable_names,
        PLAYER_MAP_UNAVAILABLE_NAMES_RESOURCE_ID,
    )
}

pub fn player_map_names(
    catalog: Option<&PlayerMapNameCatalog>,
    native_id: u32,
) -> (Option<&str>, Option<&str>) {
    let Ok(index) = usize::try_from(native_id) else {
        return (None, None);
    };
    let Some(catalog) = catalog else {
        return (None, None);
    };
    (
        catalog.available_names.get(index).map(String::as_str),
        catalog.unavailable_names.get(index).map(String::as_str),
    )
}

fn validate_names(names: &[String], resource_id: i16) -> Result<(), PlayerMapNameCodecError> {
    if names.len() > u16::MAX as usize {
        return Err(PlayerMapNameCodecError::TooManyNames {
            resource_id,
            actual: names.len(),
        });
    }
    for (index, name) in names.iter().enumerate() {
        encode_name(name, resource_id, index)?;
    }
    Ok(())
}

fn decode_required_list(
    entries: &[ResourceEntry],
    resource_id: i16,
) -> Result<Vec<String>, PlayerMapNameCodecError> {
    let entry = find_owned_entry(entries, resource_id)?
        .ok_or(PlayerMapNameCodecError::MissingStringList(resource_id))?;
    decode_string_list(&entry.data, resource_id)
}

fn list_matches(
    entries: &[ResourceEntry],
    resource_id: i16,
    names: &[String],
) -> Result<bool, PlayerMapNameCodecError> {
    Ok(find_owned_entry(entries, resource_id)?
        .and_then(|entry| decode_string_list(&entry.data, resource_id).ok())
        .is_some_and(|decoded| decoded == names))
}

fn find_owned_entry(
    entries: &[ResourceEntry],
    resource_id: i16,
) -> Result<Option<&ResourceEntry>, PlayerMapNameCodecError> {
    let mut matches = entries
        .iter()
        .filter(|entry| entry.resource_type == *b"STR#" && entry.id == resource_id);
    let first = matches.next();
    if matches.next().is_some() {
        return Err(PlayerMapNameCodecError::ResourceFork(
            ResourceForkError::DuplicateResource {
                resource_type: *b"STR#",
                id: resource_id,
            },
        ));
    }
    Ok(first)
}

fn decode_string_list(
    bytes: &[u8],
    resource_id: i16,
) -> Result<Vec<String>, PlayerMapNameCodecError> {
    let count = bytes
        .get(0..2)
        .map(|value| u16::from_be_bytes([value[0], value[1]]) as usize)
        .ok_or(PlayerMapNameCodecError::TruncatedStringList(resource_id))?;
    let mut cursor = 2usize;
    let mut names = Vec::with_capacity(count);
    for _ in 0..count {
        let length = bytes
            .get(cursor)
            .copied()
            .map(usize::from)
            .ok_or(PlayerMapNameCodecError::TruncatedStringList(resource_id))?;
        cursor += 1;
        let end = cursor
            .checked_add(length)
            .filter(|end| *end <= bytes.len())
            .ok_or(PlayerMapNameCodecError::TruncatedStringList(resource_id))?;
        names.push(decode_classic_text(&bytes[cursor..end]));
        cursor = end;
    }
    Ok(names)
}

fn encode_string_list(
    names: &[String],
    resource_id: i16,
) -> Result<Vec<u8>, PlayerMapNameCodecError> {
    let mut output = Vec::new();
    output.extend_from_slice(&(names.len() as u16).to_be_bytes());
    for (index, name) in names.iter().enumerate() {
        let encoded = encode_name(name, resource_id, index)?;
        output.push(encoded.len() as u8);
        output.extend_from_slice(&encoded);
    }
    Ok(output)
}

fn encode_name(
    name: &str,
    resource_id: i16,
    index: usize,
) -> Result<Vec<u8>, PlayerMapNameCodecError> {
    let bytes = encode_mac_roman_text(name)
        .ok_or(PlayerMapNameCodecError::NonClassicText { resource_id, index })?;
    if bytes.len() > 255 {
        return Err(PlayerMapNameCodecError::NameTooLong {
            resource_id,
            index,
            bytes: bytes.len(),
        });
    }
    Ok(bytes)
}

fn decode_classic_text(bytes: &[u8]) -> String {
    decode_mac_roman_text(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::codecs::{parse_resource_entries, write_resource_fork};

    fn names(prefix: &str) -> Vec<String> {
        (1..=PLAYER_MAP_RUNTIME_NAME_SLOTS)
            .map(|index| format!("{prefix} {index}"))
            .collect()
    }

    fn catalog() -> PlayerMapNameCatalog {
        PlayerMapNameCatalog {
            source_blob: None,
            available_names: names("Known Map"),
            unavailable_names: names("Unknown Map"),
        }
    }

    #[test]
    fn fresh_output_owns_exactly_the_two_map_name_lists() {
        let output = encode_player_map_name_resources(&catalog(), None).unwrap();
        let entries = parse_resource_entries(&output).unwrap();
        assert_eq!(entries.len(), 2);
        assert!(entries.iter().all(|entry| entry.resource_type == *b"STR#"));
        assert_eq!(
            decode_player_map_name_catalog(&output, Some(BlobId("sha256:names".into())))
                .unwrap()
                .available_names[19],
            "Known Map 20"
        );
    }

    #[test]
    fn no_edit_is_container_exact_and_one_list_edit_preserves_other_entries() {
        let mut entries =
            parse_resource_entries(&encode_player_map_name_resources(&catalog(), None).unwrap())
                .unwrap();
        entries.push(ResourceEntry {
            resource_type: *b"PICT",
            id: 303,
            name: "Unrelated".into(),
            attributes: 7,
            data: vec![1, 2, 3, 4],
        });
        let source = write_resource_fork(&entries).unwrap();
        let mut decoded = decode_player_map_name_catalog(
            &source,
            Some(BlobId("sha256:scenario-resource".into())),
        )
        .unwrap();
        assert_eq!(
            encode_player_map_name_resources(&decoded, Some(&source)).unwrap(),
            source
        );

        let unavailable_before = entries
            .iter()
            .find(|entry| entry.resource_type == *b"STR#" && entry.id == -101)
            .unwrap()
            .clone();
        decoded.available_names[2] = "The Hidden Causeway".into();
        let edited = encode_player_map_name_resources(&decoded, Some(&source)).unwrap();
        let edited_entries = parse_resource_entries(&edited).unwrap();
        assert_eq!(
            edited_entries
                .iter()
                .find(|entry| entry.resource_type == *b"STR#" && entry.id == -101)
                .unwrap(),
            &unavailable_before
        );
        assert_eq!(
            edited_entries
                .iter()
                .find(|entry| entry.resource_type == *b"PICT" && entry.id == 303)
                .unwrap()
                .data,
            vec![1, 2, 3, 4]
        );
    }

    #[test]
    fn player_map_names_round_trip_mac_roman_and_classic_line_endings() {
        let mut names = catalog();
        names.available_names[0] = "Café".into();
        names.available_names[10] = "Undine Cave\nUndine Cave".into();
        let source = encode_player_map_name_resources(&names, None).expect("encode MacRoman names");
        let decoded = decode_player_map_name_catalog(&source, None).expect("decode MacRoman names");

        assert_eq!(decoded.available_names[0], "Café");
        assert_eq!(decoded.available_names[10], "Undine Cave\nUndine Cave");
        assert_eq!(
            encode_player_map_name_resources(&decoded, Some(&source)).unwrap(),
            source
        );
    }

    #[test]
    fn classic_control_bytes_remain_representable_player_map_text() {
        let mut names = catalog();
        names.unavailable_names[19] = "Unknown\u{10} Map".into();
        let source = encode_player_map_name_resources(&names, None)
            .expect("MacRoman control bytes are representable in STR# text");
        let decoded = decode_player_map_name_catalog(&source, None).expect("decode names");
        assert_eq!(decoded.unavailable_names[19], "Unknown\u{10} Map");
        assert_eq!(
            encode_player_map_name_resources(&decoded, Some(&source)).unwrap(),
            source
        );
    }

    #[test]
    fn targeted_name_list_decoding_ignores_duplicate_unrelated_resource_keys() {
        let mut entries =
            parse_resource_entries(&encode_player_map_name_resources(&catalog(), None).unwrap())
                .unwrap();
        for data in [vec![1], vec![2]] {
            entries.push(ResourceEntry {
                resource_type: *b"PICT",
                id: 30_015,
                name: "duplicate unrelated resource key fixture".into(),
                attributes: 0,
                data,
            });
        }
        let source = super::super::write_resource_fork_preserving_duplicates(&entries).unwrap();
        assert_eq!(
            decode_player_map_name_string_list(&source, -102)
                .unwrap()
                .unwrap(),
            names("Known Map")
        );
    }

    #[test]
    fn preserves_short_legacy_lists_and_macroman_control_text() {
        let mut short = catalog();
        short.available_names.pop();
        let encoded = encode_player_map_name_resources(&short, None).unwrap();
        assert_eq!(
            decode_player_map_name_catalog(&encoded, None)
                .unwrap()
                .available_names
                .len(),
            19
        );
        let mut representable = catalog();
        representable.unavailable_names[0] = "Uncharted — North\u{0001}".into();
        let encoded = encode_player_map_name_resources(&representable, None).unwrap();
        assert_eq!(
            decode_player_map_name_catalog(&encoded, None)
                .unwrap()
                .unavailable_names[0],
            representable.unavailable_names[0]
        );

        let mut unsupported = catalog();
        unsupported.unavailable_names[0] = "Uncharted 🐈".into();
        assert!(matches!(
            encode_player_map_name_resources(&unsupported, None),
            Err(PlayerMapNameCodecError::NonClassicText {
                resource_id: -101,
                index: 0
            })
        ));
    }
}

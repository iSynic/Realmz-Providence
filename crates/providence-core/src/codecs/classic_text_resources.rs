use std::collections::BTreeMap;

mod writing;

use sha2::{Digest, Sha256};

use super::{
    CLASSIC_SCENARIO_RESOURCE_SOURCE, ResourceEntry, ResourceForkError, empty_resource_fork,
    merge_resource_entries_preserving_unowned_duplicates,
    parse_resource_entries_preserving_duplicates,
};
use crate::model::{AssetDescriptor, BlobId, ClassicResourceKey, StableId};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DecodedClassicTextAsset {
    pub asset: AssetDescriptor,
    pub resource_name: String,
    pub resource_attributes: u8,
    pub runtime_payload: Vec<u8>,
    pub classic_payload: Vec<u8>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ClassicTextResourceError {
    ResourceFork(ResourceForkError),
    InvalidResourceIdentity(StableId),
    InvalidStyleEdit {
        identity: StableId,
        reason: String,
    },
    DuplicateResourceId(i16),
    MissingClassicPayload(StableId),
    ClassicPayloadLengthMismatch {
        identity: StableId,
        expected: u64,
        actual: u64,
    },
    UnrepresentableText {
        character: char,
        character_index: usize,
    },
}

impl std::fmt::Display for ClassicTextResourceError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InvalidStyleEdit { identity, reason } => write!(
                formatter,
                "text formatting '{}' cannot be exported: {reason}",
                identity.0
            ),
            Self::ResourceFork(error) => write!(formatter, "{error}"),
            Self::InvalidResourceIdentity(identity) => write!(
                formatter,
                "text asset '{}' does not identify a Classic TEXT resource",
                identity.0
            ),
            Self::DuplicateResourceId(resource_id) => write!(
                formatter,
                "more than one text asset owns Classic TEXT resource {resource_id}"
            ),
            Self::MissingClassicPayload(identity) => write!(
                formatter,
                "text asset '{}' is missing its Classic payload",
                identity.0
            ),
            Self::ClassicPayloadLengthMismatch {
                identity,
                expected,
                actual,
            } => write!(
                formatter,
                "text asset '{}' declares {expected} Classic bytes but supplied {actual}",
                identity.0
            ),
            Self::UnrepresentableText {
                character,
                character_index,
            } => write!(
                formatter,
                "character {character:?} at character index {character_index} is not representable in Classic MacRoman text"
            ),
        }
    }
}

impl std::error::Error for ClassicTextResourceError {}

impl From<ResourceForkError> for ClassicTextResourceError {
    fn from(value: ResourceForkError) -> Self {
        Self::ResourceFork(value)
    }
}

/// Compiles TEXT and explicitly retained paired styl payloads into Scenario.rsrc.
/// Imported names, attributes and unchanged resource bytes remain compatibility-owned.
pub fn compile_classic_text_resource_fork(
    assets: &[AssetDescriptor],
    payloads: &BTreeMap<String, Vec<u8>>,
    compatibility_source: Option<&[u8]>,
) -> Result<Vec<u8>, ClassicTextResourceError> {
    writing::compile(assets, payloads, compatibility_source)
}

/// Converts editor UTF-8/LF text into the exact Classic MacRoman/CR payload domain.
pub fn encode_classic_text_payload(value: &str) -> Result<Vec<u8>, ClassicTextResourceError> {
    value
        .chars()
        .enumerate()
        .map(|(character_index, character)| {
            encode_mac_roman_character(character).ok_or(
                ClassicTextResourceError::UnrepresentableText {
                    character,
                    character_index,
                },
            )
        })
        .collect()
}

/// Extracts only scenario scrolling-text resources and their optional style runs.
///
/// TEXT is transcoded from MacRoman/Classic line endings to UTF-8 for Rebuilt. The
/// exact resource payload remains separately addressed for compatibility. `styl`
/// is already the byte format consumed by Rebuilt, so its runtime and Classic blob
/// identities are intentionally equal. Unrelated resource-fork entries are never
/// interpreted here and remain owned by the compatibility source.
pub fn decode_classic_text_assets(
    bytes: &[u8],
    source: &str,
) -> Result<Vec<DecodedClassicTextAsset>, ClassicTextResourceError> {
    let source_blob = BlobId(format!("sha256:{:x}", Sha256::digest(bytes)));
    let mut decoded = parse_resource_entries_preserving_duplicates(bytes)?
        .into_iter()
        .filter(|entry| matches!(&entry.resource_type, b"TEXT" | b"styl"))
        .map(|entry| {
            let (resource_type, kind, mime_type, extension, runtime_payload) =
                if entry.resource_type == *b"TEXT" {
                    (
                        "TEXT",
                        "text-resource",
                        "text/plain",
                        "txt",
                        decode_mac_roman_text(&entry.data).into_bytes(),
                    )
                } else {
                    (
                        "styl",
                        "text-style-resource",
                        "application/octet-stream",
                        "bin",
                        entry.data.clone(),
                    )
                };
            let runtime_blob = BlobId(format!("sha256:{:x}", Sha256::digest(&runtime_payload)));
            let classic_blob = BlobId(format!("sha256:{:x}", Sha256::digest(&entry.data)));
            let label = if entry.name.is_empty() {
                format!("{resource_type} {}", entry.id)
            } else {
                entry.name.clone()
            };
            DecodedClassicTextAsset {
                asset: AssetDescriptor {
                    identity: StableId(format!("classic-resource:{resource_type}:{}", entry.id)),
                    label,
                    kind: kind.into(),
                    mime_type: Some(mime_type.into()),
                    classic_resource: Some(ClassicResourceKey {
                        resource_type: resource_type.into(),
                        resource_id: i32::from(entry.id),
                    }),
                    scenario_music_slot: None,
                    blob: runtime_blob,
                    byte_length: runtime_payload.len() as u64,
                    classic_payload_blob: Some(classic_blob),
                    classic_payload_byte_length: Some(entry.data.len() as u64),
                    extension: Some(extension.into()),
                    width: None,
                    height: None,
                    duration_ms: None,
                    sample_rate: None,
                    channels: None,
                    tile_width: None,
                    tile_height: None,
                    columns: None,
                    rows: None,
                    landlook: None,
                    base_tile: None,
                    source: format!("{source} ({})", source_blob.0),
                },
                resource_name: entry.name,
                resource_attributes: entry.attributes,
                runtime_payload,
                classic_payload: entry.data,
            }
        })
        .collect::<Vec<_>>();
    decoded.sort_by(|left, right| {
        left.asset
            .classic_resource
            .cmp(&right.asset.classic_resource)
            .then_with(|| left.asset.identity.cmp(&right.asset.identity))
    });
    Ok(decoded)
}

pub(super) fn decode_mac_roman_text(bytes: &[u8]) -> String {
    bytes
        .iter()
        .map(|byte| match *byte {
            0 => ' ',
            13 => '\n',
            0x80..=0xff => MAC_ROMAN_HIGH[usize::from(*byte - 0x80)],
            _ => char::from(*byte),
        })
        .collect()
}

pub(super) fn encode_mac_roman_text(value: &str) -> Option<Vec<u8>> {
    value.chars().map(encode_mac_roman_character).collect()
}

pub(super) fn encode_mac_roman_character(character: char) -> Option<u8> {
    if character == '\0' {
        None
    } else if character == '\n' {
        Some(13)
    } else if character.is_ascii() {
        Some(character as u8)
    } else {
        MAC_ROMAN_HIGH
            .iter()
            .position(|candidate| *candidate == character)
            .map(|index| index as u8 + 0x80)
    }
}

pub(super) fn decode_mac_roman_name(bytes: &[u8]) -> String {
    bytes
        .iter()
        .map(|byte| match *byte {
            0x80..=0xff => MAC_ROMAN_HIGH[usize::from(*byte - 0x80)],
            _ => char::from(*byte),
        })
        .collect()
}

pub(super) fn encode_mac_roman_name(value: &str) -> Option<Vec<u8>> {
    value
        .chars()
        .map(|character| {
            if character.is_ascii() {
                Some(character as u8)
            } else {
                MAC_ROMAN_HIGH
                    .iter()
                    .position(|candidate| *candidate == character)
                    .map(|index| index as u8 + 0x80)
            }
        })
        .collect()
}

const MAC_ROMAN_HIGH: [char; 128] = [
    'Ä', 'Å', 'Ç', 'É', 'Ñ', 'Ö', 'Ü', 'á', 'à', 'â', 'ä', 'ã', 'å', 'ç', 'é', 'è', 'ê', 'ë', 'í',
    'ì', 'î', 'ï', 'ñ', 'ó', 'ò', 'ô', 'ö', 'õ', 'ú', 'ù', 'û', 'ü', '†', '°', '¢', '£', '§', '•',
    '¶', 'ß', '®', '©', '™', '´', '¨', '≠', 'Æ', 'Ø', '∞', '±', '≤', '≥', '¥', 'µ', '∂', '∑', '∏',
    'π', '∫', 'ª', 'º', 'Ω', 'æ', 'ø', '¿', '¡', '¬', '√', 'ƒ', '≈', '∆', '«', '»', '…',
    '\u{00a0}', 'À', 'Ã', 'Õ', 'Œ', 'œ', '–', '—', '“', '”', '‘', '’', '÷', '◊', 'ÿ', 'Ÿ', '⁄',
    '€', '‹', '›', 'ﬁ', 'ﬂ', '‡', '·', '‚', '„', '‰', 'Â', 'Ê', 'Á', 'Ë', 'È', 'Í', 'Î', 'Ï', 'Ì',
    'Ó', 'Ô', '\u{f8ff}', 'Ò', 'Ú', 'Û', 'Ù', 'ı', 'ˆ', '˜', '¯', '˘', '˙', '˚', '¸', '˝', '˛',
    'ˇ',
];

#[cfg(test)]
mod tests {
    use super::*;
    use crate::codecs::{ResourceEntry, write_resource_fork};

    #[test]
    fn extracts_text_and_style_with_distinct_runtime_and_classic_payloads() {
        let source = write_resource_fork(&[
            ResourceEntry {
                resource_type: *b"TEXT",
                id: -200,
                name: "Chronicle".into(),
                attributes: 5,
                data: vec![b'C', b'a', b'f', 0x8e, 13, 0xd2, b'Q', 0xd3],
            },
            ResourceEntry {
                resource_type: *b"styl",
                id: -200,
                name: String::new(),
                attributes: 3,
                data: vec![0, 0],
            },
            ResourceEntry {
                resource_type: *b"PICT",
                id: 128,
                name: "Unrelated".into(),
                attributes: 0,
                data: vec![1, 2, 3],
            },
        ])
        .expect("resource fork");

        let decoded = decode_classic_text_assets(&source, "Scenario.rsrc").expect("decode");

        assert_eq!(decoded.len(), 2);
        let text = decoded
            .iter()
            .find(|entry| entry.asset.kind == "text-resource")
            .expect("TEXT");
        assert_eq!(text.runtime_payload, "Café\n“Q”".as_bytes());
        assert_eq!(
            text.classic_payload,
            vec![b'C', b'a', b'f', 0x8e, 13, 0xd2, b'Q', 0xd3]
        );
        assert_eq!(text.resource_name, "Chronicle");
        assert_eq!(text.resource_attributes, 5);
        assert_eq!(text.asset.mime_type.as_deref(), Some("text/plain"));
        assert_eq!(text.asset.classic_payload_byte_length, Some(8));
        assert_ne!(
            text.asset.blob,
            text.asset.classic_payload_blob.clone().unwrap()
        );
        let style = decoded
            .iter()
            .find(|entry| entry.asset.kind == "text-style-resource")
            .expect("styl");
        assert_eq!(style.runtime_payload, style.classic_payload);
        assert_eq!(
            style.asset.blob,
            style.asset.classic_payload_blob.clone().unwrap()
        );
    }

    #[test]
    fn preserves_duplicate_relevant_keys_for_the_selection_layer_to_reject() {
        let source = super::super::classic_resources::write_resource_fork_preserving_duplicates(&[
            ResourceEntry {
                resource_type: *b"TEXT",
                id: 7,
                name: "First".into(),
                attributes: 0,
                data: b"first".to_vec(),
            },
            ResourceEntry {
                resource_type: *b"TEXT",
                id: 7,
                name: "Second".into(),
                attributes: 0,
                data: b"second".to_vec(),
            },
        ])
        .expect("duplicate resource fork");

        let decoded = decode_classic_text_assets(&source, "Scenario.rsrc").expect("decode");
        assert_eq!(decoded.len(), 2);
    }

    #[test]
    fn mac_roman_encoder_is_exact_and_refuses_unrepresentable_text() {
        let text = "Café “Realmz” Œuvre";
        let encoded = encode_mac_roman_text(text).expect("MacRoman text");

        assert_eq!(decode_mac_roman_text(&encoded), text);
        assert!(encode_mac_roman_text("not in MacRoman: 🐉").is_none());
        assert!(encode_mac_roman_text("NUL\0would decode as a space").is_none());
        assert!(matches!(
            encode_classic_text_payload("Realmz 🐉"),
            Err(ClassicTextResourceError::UnrepresentableText {
                character: '🐉',
                character_index: 7
            })
        ));
    }

    #[test]
    fn no_edit_compile_preserves_the_resource_fork_byte_for_byte() {
        let source = text_fixture();
        let decoded = decode_classic_text_assets(&source, "Scenario.rsrc").expect("decode");
        let (assets, payloads) = imported_assets_and_payloads(decoded);

        let output = compile_classic_text_resource_fork(&assets, &payloads, Some(&source))
            .expect("compile no edit");

        assert_eq!(output, source);
    }

    #[test]
    fn edited_text_owns_only_its_payload_and_preserves_style_and_unrelated_resources() {
        let source = text_fixture();
        let decoded = decode_classic_text_assets(&source, "Scenario.rsrc").expect("decode");
        let (mut assets, mut payloads) = imported_assets_and_payloads(decoded);
        let text = assets
            .iter_mut()
            .find(|asset| asset.kind == "text-resource")
            .expect("TEXT asset");
        let edited = encode_classic_text_payload("Edited café\nSecond line").expect("MacRoman");
        let edited_blob = BlobId("sha256:edited-text".into());
        text.classic_payload_blob = Some(edited_blob.clone());
        text.classic_payload_byte_length = Some(edited.len() as u64);
        text.label = "A label that must not overwrite the imported name".into();
        payloads.insert(edited_blob.0, edited.clone());

        let output = compile_classic_text_resource_fork(&assets, &payloads, Some(&source))
            .expect("compile edit");
        let before = parse_resource_entries_preserving_duplicates(&source).expect("before");
        let after = parse_resource_entries_preserving_duplicates(&output).expect("after");

        assert_eq!(before.len(), after.len());
        for original in before {
            let compiled = after
                .iter()
                .find(|entry| {
                    entry.resource_type == original.resource_type && entry.id == original.id
                })
                .expect("preserved resource identity");
            if original.resource_type == *b"TEXT" && original.id == -200 {
                assert_eq!(compiled.data, edited);
                assert_eq!(compiled.name, "Chronicle");
                assert_eq!(compiled.attributes, 5);
            } else {
                assert_eq!(compiled, &original);
            }
        }
    }

    #[test]
    fn compile_refuses_two_assets_that_claim_the_same_text_resource() {
        let source = text_fixture();
        let decoded = decode_classic_text_assets(&source, "Scenario.rsrc").expect("decode");
        let (mut assets, payloads) = imported_assets_and_payloads(decoded);
        let mut duplicate = assets
            .iter()
            .find(|asset| asset.kind == "text-resource")
            .expect("TEXT asset")
            .clone();
        duplicate.identity = StableId("duplicate-text-owner".into());
        assets.push(duplicate);

        assert!(matches!(
            compile_classic_text_resource_fork(&assets, &payloads, Some(&source)),
            Err(ClassicTextResourceError::DuplicateResourceId(-200))
        ));
    }

    #[test]
    fn mac_roman_resource_names_preserve_ascii_controls_and_classic_punctuation() {
        let name = "Gate\0line\r—";
        let encoded = encode_mac_roman_name(name).expect("MacRoman resource name");
        assert_eq!(
            encoded,
            [b'G', b'a', b't', b'e', 0, b'l', b'i', b'n', b'e', 13, 0xd1]
        );
        assert_eq!(decode_mac_roman_name(&encoded), name);
        assert!(encode_mac_roman_name("🐉").is_none());
    }

    fn text_fixture() -> Vec<u8> {
        write_resource_fork(&[
            ResourceEntry {
                resource_type: *b"TEXT",
                id: -200,
                name: "Chronicle".into(),
                attributes: 5,
                data: b"Original\rline".to_vec(),
            },
            ResourceEntry {
                resource_type: *b"styl",
                id: -200,
                name: "Style companion".into(),
                attributes: 3,
                data: vec![0, 1, 2, 3, 4, 5],
            },
            ResourceEntry {
                resource_type: *b"PICT",
                id: 128,
                name: "Unrelated".into(),
                attributes: 7,
                data: vec![9, 8, 7, 6],
            },
        ])
        .expect("resource fork")
    }

    fn imported_assets_and_payloads(
        decoded: Vec<DecodedClassicTextAsset>,
    ) -> (Vec<AssetDescriptor>, BTreeMap<String, Vec<u8>>) {
        let mut payloads = BTreeMap::new();
        let assets = decoded
            .into_iter()
            .map(|decoded| {
                let mut asset = decoded.asset;
                asset.source = CLASSIC_SCENARIO_RESOURCE_SOURCE.into();
                payloads.insert(
                    asset
                        .classic_payload_blob
                        .as_ref()
                        .expect("Classic blob")
                        .0
                        .clone(),
                    decoded.classic_payload,
                );
                asset
            })
            .collect();
        (assets, payloads)
    }
}

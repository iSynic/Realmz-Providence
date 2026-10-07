use super::super::classic_text_resources::{decode_mac_roman_text, encode_mac_roman_text};
use super::ItemCodecError;

pub(super) struct ItemTextRows {
    pub count: u16,
    pub strings: Vec<Vec<u8>>,
    pub complete: bool,
    residue: Vec<u8>,
}

impl ItemTextRows {
    pub fn empty(count: usize) -> Self {
        Self {
            count: count as u16,
            strings: vec![Vec::new(); count],
            complete: true,
            residue: Vec::new(),
        }
    }

    pub fn parse(bytes: &[u8]) -> Self {
        let Some(header) = bytes.get(..2) else {
            return Self {
                count: 0,
                strings: Vec::new(),
                complete: false,
                residue: bytes.into(),
            };
        };
        let count = u16::from_be_bytes([header[0], header[1]]);
        let mut cursor = 2;
        let mut strings = Vec::new();
        for _ in 0..count {
            let Some(length) = bytes.get(cursor).copied().map(usize::from) else {
                break;
            };
            let end = cursor + 1 + length;
            let Some(row) = bytes.get(cursor + 1..end) else {
                break;
            };
            strings.push(row.into());
            cursor = end;
        }
        Self {
            count,
            complete: strings.len() == usize::from(count),
            strings,
            residue: bytes[cursor..].into(),
        }
    }

    pub fn replace(
        &mut self,
        record: u16,
        field: u8,
        target: &str,
        forced: bool,
    ) -> Result<bool, ItemCodecError> {
        let index = usize::from(record);
        let old = self
            .strings
            .get(index)
            .map(Vec::as_slice)
            .unwrap_or_default();
        if decode_text(old) == target || (!forced && legacy_text(old) == target) {
            return Ok(false);
        }
        if !self.complete && index >= self.strings.len() {
            return Err(ItemCodecError::InvalidDefinition {
                classic_id: 800 + record as i16,
                reason: format!(
                    "STR# {} has no complete text row for this item; its truncated source must be retained",
                    800 + u16::from(field)
                ),
            });
        }
        let replacement = encode_text(target, 800 + record as i16, field)?;
        if index >= self.strings.len() {
            self.strings.resize(index + 1, Vec::new());
            self.count = self.strings.len() as u16;
        }
        self.strings[index] = replacement;
        Ok(true)
    }

    pub fn encode(&self) -> Vec<u8> {
        let mut bytes = self.count.to_be_bytes().to_vec();
        for row in &self.strings {
            bytes.push(row.len() as u8);
            bytes.extend_from_slice(row);
        }
        bytes.extend_from_slice(&self.residue);
        bytes
    }
}

pub(super) fn decode_text(bytes: &[u8]) -> String {
    decode_mac_roman_text(bytes)
}

pub(super) fn encode_text(
    text: &str,
    classic_id: i16,
    field: u8,
) -> Result<Vec<u8>, ItemCodecError> {
    let field = match field {
        0 => "unidentified name",
        1 => "identified name",
        _ => "description",
    };
    let bytes = encode_mac_roman_text(text)
        .ok_or(ItemCodecError::UnsupportedTextCharacter { classic_id, field })?;
    if bytes.len() > 255 {
        return Err(ItemCodecError::TextTooLong { classic_id, field });
    }
    Ok(bytes)
}

// Old portable snapshots may contain this lossy rendering. Ordinary compilation
// preserves its source row; explicit draft edits bypass this equivalence.
fn legacy_text(bytes: &[u8]) -> String {
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
        .into()
}

use super::{contracts::*, identity::scenario_spell_classic_id};

pub(super) fn decode(bytes: &[u8]) -> (Vec<String>, bool) {
    let Some(count) = bytes
        .get(..2)
        .map(|value| u16::from_be_bytes([value[0], value[1]]) as usize)
    else {
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
        names.push(
            crate::codecs::classic_text_resources::decode_mac_roman_text(&bytes[cursor..end]),
        );
        cursor = end;
    }
    (names, true)
}

pub(super) fn encode(names: &[String], level_index: usize) -> Result<Vec<u8>, SpellCodecError> {
    let mut output = Vec::new();
    output.extend_from_slice(&(names.len() as u16).to_be_bytes());
    for (slot_index, name) in names.iter().enumerate() {
        let record_index = level_index * SPELL_NAMES_PER_RESOURCE + slot_index;
        let classic_id =
            scenario_spell_classic_id(record_index as u16).expect("bounded spell name");
        let Some(encoded) = crate::codecs::classic_text_resources::encode_mac_roman_text(name)
        else {
            return Err(SpellCodecError::UnsupportedNameCharacter(classic_id));
        };
        if encoded.len() > 255 {
            return Err(SpellCodecError::NameTooLong(classic_id));
        }
        output.push(encoded.len() as u8);
        output.extend_from_slice(&encoded);
    }
    Ok(output)
}

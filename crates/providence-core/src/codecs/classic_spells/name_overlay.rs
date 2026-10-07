//! A name edit owns one Str255; untouched siblings and payload tails retain their bytes.
use super::{
    contracts::{SPELL_NAME_RESOURCE_MIN_ID, SpellCodecError},
    string_list,
};

pub(super) fn encode(
    names: &[String],
    original: Option<&[u8]>,
    changed: &[usize],
    level: usize,
) -> Result<Vec<u8>, SpellCodecError> {
    let encoded = string_list::encode(names, level)?;
    let Some(original) = original else {
        return Ok(encoded);
    };
    let resource_id = SPELL_NAME_RESOURCE_MIN_ID + level as i16;
    let (mut chunks, tail) =
        split(original).ok_or(SpellCodecError::TruncatedScenarioNameResource(resource_id))?;
    let (replacements, _) = split(&encoded).expect("Encoded spell name list is complete");
    for &slot in changed {
        while chunks.len() <= slot {
            chunks.push(&[0]);
        }
        chunks[slot] = replacements[slot];
    }
    let mut output = (chunks.len() as u16).to_be_bytes().to_vec();
    for chunk in chunks {
        output.extend_from_slice(chunk);
    }
    output.extend_from_slice(tail);
    Ok(output)
}

fn split(bytes: &[u8]) -> Option<(Vec<&[u8]>, &[u8])> {
    let header = bytes.get(..2)?;
    let count = u16::from_be_bytes([header[0], header[1]]) as usize;
    let mut cursor = 2;
    let mut chunks = Vec::new();
    for _ in 0..count {
        let size = usize::from(*bytes.get(cursor)?);
        let end = cursor.checked_add(size + 1)?;
        chunks.push(bytes.get(cursor..end)?);
        cursor = end;
    }
    Some((chunks, &bytes[cursor..]))
}

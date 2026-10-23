use super::NativePlayerMapFacts;
use crate::{
    codecs::{PLAYER_MAP_NOTE_OFFSET, PLAYER_MAP_RECORD_BYTES},
    model::ProjectSnapshot,
};
use std::collections::BTreeSet;

pub(super) fn project(bytes: &[u8], output: &mut Vec<NativePlayerMapFacts>) {
    for (id, row) in bytes.chunks_exact(PLAYER_MAP_RECORD_BYTES).enumerate() {
        output.push(NativePlayerMapFacts {
            id: id as u32,
            words: row[..PLAYER_MAP_NOTE_OFFSET]
                .chunks_exact(2)
                .map(|word| i16::from_be_bytes([word[0], word[1]]))
                .collect(),
            note_bytes: row[PLAYER_MAP_NOTE_OFFSET..].to_vec(),
        });
    }
}

pub(super) fn validate_model(
    snapshot: &ProjectSnapshot,
    original: Option<&[u8]>,
) -> Result<(), String> {
    let ids = snapshot
        .world
        .player_maps
        .iter()
        .map(|row| row.native_id.0)
        .collect::<BTreeSet<_>>();
    let Some(original) = original else {
        return if ids.is_empty() {
            Ok(())
        } else {
            Err("Data MD2 has model records but no native source bytes for v7 publication; families the scenario never shipped must be built from their authored records before finalizing.".into())
        };
    };
    if let Some(id) =
        (0..original.len() / PLAYER_MAP_RECORD_BYTES).find(|id| !ids.contains(&(*id as u32)))
    {
        return Err(format!(
            "Data MD2 supplied native row {id} is absent from this model: a model/import preservation defect. Keep this project and its authored edits; explicitly reimport the source into a separate project for comparison."
        ));
    }
    Ok(())
}

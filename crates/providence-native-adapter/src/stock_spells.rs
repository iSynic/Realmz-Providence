//! Cached application spell definitions stay outside portable authored truth.
use providence_core::{
    codecs::{STANDARD_SPELL_BYTES, decode_standard_spells, hydrate_standard_spell_names},
    model::{BlobId, SpellDefinition},
};
use sha2::{Digest, Sha256};
use std::{fs, path::Path};

#[derive(Debug)]
pub(crate) struct StockSpells {
    pub definitions: Vec<SpellDefinition>,
    pub fingerprint: String,
}

impl StockSpells {
    pub fn open(root: &Path) -> Result<Self, String> {
        let binary = fs::read(root.join("Data S"))
            .map_err(|error| format!("Could not read Stock spells: {error}"))?;
        if binary.len() < STANDARD_SPELL_BYTES {
            return Err("Stock Data S lacks its 420 runtime records.".into());
        }
        let text = fs::read(root.join("Custom Names.rsrc"))
            .map_err(|error| format!("Could not read Stock spell names: {error}"))?;
        let mut rows = decode_standard_spells(&binary, None).spells;
        let text_hash = format!("sha256:{:x}", Sha256::digest(&text));
        hydrate_standard_spell_names(&mut rows, &text, BlobId(text_hash.clone()))
            .map_err(|error| format!("Stock spell names are invalid: {error}"))?;
        let fingerprint = format!(
            "sha256:{:x}",
            Sha256::digest(format!("{:x}\n{text_hash}", Sha256::digest(&binary)))
        );
        Ok(Self {
            definitions: rows.into_iter().map(|row| row.definition).collect(),
            fingerprint,
        })
    }
}

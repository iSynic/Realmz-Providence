//! Read-only application definitions are cached independently of portable project truth.
use providence_core::{
    codecs::decode_standard_item_rules,
    model::{BlobId, ItemRuleDefinition},
};
use sha2::{Digest, Sha256};
use std::{fs, path::Path};

#[derive(Debug)]
pub(crate) struct StockItems {
    pub definitions: Vec<ItemRuleDefinition>,
    pub fingerprint: String,
}

impl StockItems {
    pub fn open(root: &Path) -> Result<Self, String> {
        let binary = fs::read(root.join("Data ID"))
            .map_err(|error| format!("Could not read Stock item definitions: {error}"))?;
        let text = fs::read(root.join("Data ID.rsrc"))
            .map_err(|error| format!("Could not read Stock item names: {error}"))?;
        let binary_hash = format!("sha256:{:x}", Sha256::digest(&binary));
        let text_hash = format!("sha256:{:x}", Sha256::digest(&text));
        let decoded = decode_standard_item_rules(
            &binary,
            &text,
            BlobId(binary_hash.clone()),
            BlobId(text_hash.clone()),
        )
        .map_err(|error| format!("Stock item catalog is invalid: {error}"))?;
        Ok(Self {
            definitions: decoded
                .rules
                .into_iter()
                .map(|rule| rule.definition)
                .collect(),
            fingerprint: format!(
                "sha256:{:x}",
                Sha256::digest(format!("{binary_hash}\n{text_hash}"))
            ),
        })
    }
}

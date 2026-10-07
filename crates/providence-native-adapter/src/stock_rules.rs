//! Read-only rule sources are independent of authored document state.
use providence_core::{
    codecs::{decode_caste_rules, decode_race_rules, decode_rule_name_catalog},
    model::{BlobId, RuleNameCatalog},
    session::rule_authoring::RuleAuthoringBaseline,
};
use sha2::{Digest, Sha256};
use std::{fs, path::Path};

#[derive(Debug)]
pub(crate) struct StockRules {
    pub race: Vec<u8>,
    pub caste: Vec<u8>,
    pub names: RuleNameCatalog,
    pub name_bytes: Vec<u8>,
    pub fingerprint: String,
}

impl StockRules {
    pub fn open(root: &Path) -> Result<Self, String> {
        let read = |name: &str| {
            fs::read(root.join(name)).map_err(|e| format!("Could not read Stock {name}: {e}"))
        };
        let race = read("Data Race")?;
        let caste = read("Data Caste")?;
        let text = read("Custom Names.rsrc")?;
        if decode_race_rules(&race, None).rules.len() != 30
            || decode_caste_rules(&caste, None).rules.len() != 30
        {
            return Err("Stock rules must include all thirty native Race and Caste rows.".into());
        }
        let names = decode_rule_name_catalog(
            &text,
            "Data Files/Custom Names.rsrc".into(),
            BlobId(hash(&text)),
        )
        .map_err(|e| e.to_string())?;
        let fingerprint =
            hash(format!("{}\n{}\n{}", hash(&race), hash(&caste), hash(&text)).as_bytes());
        Ok(Self {
            race,
            caste,
            names,
            name_bytes: text,
            fingerprint,
        })
    }
    pub fn baseline(&self) -> RuleAuthoringBaseline<'_> {
        RuleAuthoringBaseline {
            race: &self.race,
            caste: &self.caste,
            names: &self.names,
            fingerprint: &self.fingerprint,
        }
    }
}

pub(crate) fn hash(bytes: &[u8]) -> String {
    format!("sha256:{:x}", Sha256::digest(bytes))
}

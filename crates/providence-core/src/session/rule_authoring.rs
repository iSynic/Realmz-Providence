//! Rule ownership and allocation are derived reads; Apply owns the complete local draft.
use crate::codecs::{CASTE_RECORD_BYTES, CasteNativeFields, RACE_RECORD_BYTES};
use crate::model::{
    CasteRuleDefinition, ProjectSnapshot, RaceRuleDefinition, RuleNameCatalog, StableId,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

mod commit;
mod eligibility;
mod preparation;
mod review;
mod validation;
pub use review::{empty_rule_edit, retarget_rule_edit, rule_copy_guard, vacant_rule_ids};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RuleKind {
    Race,
    Caste,
}

impl RuleKind {
    pub fn family(self) -> &'static str {
        match self {
            Self::Race => "Data Race",
            Self::Caste => "Data Caste",
        }
    }
    pub fn record_bytes(self) -> usize {
        match self {
            Self::Race => RACE_RECORD_BYTES,
            Self::Caste => CASTE_RECORD_BYTES,
        }
    }
    pub fn custom_start(self) -> u8 {
        match self {
            Self::Race => 20,
            Self::Caste => 21,
        }
    }
    pub fn identity(self, id: u8) -> StableId {
        StableId(format!(
            "classic.{}.{id}",
            if self == Self::Race { "race" } else { "caste" }
        ))
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum RuleOwnership {
    Stock,
    Scenario,
    Vacant,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase", deny_unknown_fields)]
pub enum RuleEdit {
    Race {
        definition: RaceRuleDefinition,
    },
    Caste {
        definition: Box<CasteRuleDefinition>,
        #[serde(rename = "nativeFields")]
        native_fields: CasteNativeFields,
    },
}

impl RuleEdit {
    pub fn kind(&self) -> RuleKind {
        match self {
            Self::Race { .. } => RuleKind::Race,
            Self::Caste { .. } => RuleKind::Caste,
        }
    }
    pub fn classic_id(&self) -> u8 {
        match self {
            Self::Race { definition } => definition.classic_id,
            Self::Caste { definition, .. } => definition.classic_id,
        }
    }
    pub fn identity(&self) -> &StableId {
        match self {
            Self::Race { definition } => &definition.id,
            Self::Caste { definition, .. } => &definition.id,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RuleCopyGuard {
    pub kind: RuleKind,
    pub classic_id: u8,
    pub scope: String,
    pub definition_hash: String,
    pub library_fingerprint: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RuleRecordDraft {
    pub edit: RuleEdit,
    pub expected_family_hash: String,
    pub allocation: bool,
    pub copy_source: Option<RuleCopyGuard>,
}

pub struct RuleAuthoringBaseline<'a> {
    pub race: &'a [u8],
    pub caste: &'a [u8],
    pub names: &'a RuleNameCatalog,
    pub fingerprint: &'a str,
}

pub struct RuleAuthoringSources<'a> {
    pub race: &'a [u8],
    pub caste: &'a [u8],
}

pub fn rule_family_hash(snapshot: &ProjectSnapshot) -> String {
    digest(
        &serde_json::to_vec(&(
            &snapshot.project_id,
            &snapshot.origin,
            &snapshot.classic_sources,
            &snapshot.race_rules,
            &snapshot.caste_rules,
            &snapshot.rule_names,
        ))
        .expect("Rule families serialize"),
    )
}

pub fn rule_ownership(
    snapshot: &ProjectSnapshot,
    kind: RuleKind,
    id: u8,
    sources: &RuleAuthoringSources<'_>,
    baseline: &RuleAuthoringBaseline<'_>,
) -> Result<RuleOwnership, String> {
    ownership(snapshot, kind, id, sources, baseline, None)
}

pub fn rule_catalog_ownership(
    snapshot: &ProjectSnapshot,
    kind: RuleKind,
    sources: &RuleAuthoringSources<'_>,
    baseline: &RuleAuthoringBaseline<'_>,
) -> Result<Vec<RuleOwnership>, String> {
    let encoded = match kind {
        RuleKind::Race => {
            crate::codecs::encode_race_rules(&snapshot.race_rules, Some(baseline.race))
                .map_err(|e| e.to_string())?
        }
        RuleKind::Caste => {
            crate::codecs::encode_caste_rules(&snapshot.caste_rules, Some(baseline.caste))
                .map_err(|e| e.to_string())?
        }
    };
    (1..=30)
        .map(|id| ownership(snapshot, kind, id, sources, baseline, Some(&encoded)))
        .collect()
}

fn ownership(
    snapshot: &ProjectSnapshot,
    kind: RuleKind,
    id: u8,
    sources: &RuleAuthoringSources<'_>,
    baseline: &RuleAuthoringBaseline<'_>,
    encoded: Option<&[u8]>,
) -> Result<RuleOwnership, String> {
    let source_bytes = match kind {
        RuleKind::Race => sources.race,
        RuleKind::Caste => sources.caste,
    };
    let stock_bytes = match kind {
        RuleKind::Race => baseline.race,
        RuleKind::Caste => baseline.caste,
    };
    let row = native_row(kind, id, source_bytes)?;
    let stock = native_row(kind, id, stock_bytes)?;
    let (source, name, note) = record_metadata(snapshot, kind, id);
    let stock_name = catalog_name(baseline.names, kind, id).unwrap_or("");
    let project_name = snapshot
        .rule_names
        .as_ref()
        .and_then(|names| catalog_name(names, kind, id))
        .unwrap_or(name);
    let imported_source = matches!(
        snapshot.origin,
        crate::model::ProjectOrigin::Imported { .. }
    ) && snapshot
        .classic_sources
        .iter()
        .any(|r| r.native_path == kind.family());
    let eligibility_only = kind == RuleKind::Race
        && id >= kind.custom_start()
        && source.starts_with("Scenario Data Race eligibility record ");
    if imported_source
        || (source.starts_with("Scenario ") && !eligibility_only)
        || !same_ownership_row(row, stock, eligibility_only)
        || !note.is_empty()
        || (!project_name.is_empty() && project_name != stock_name)
        || match encoded {
            Some(bytes) => {
                !same_ownership_row(native_row(kind, id, bytes)?, stock, eligibility_only)
            }
            None => definition_changed(snapshot, kind, id, stock_bytes, eligibility_only)?,
        }
    {
        return Ok(RuleOwnership::Scenario);
    }
    Ok(if id < kind.custom_start() {
        RuleOwnership::Stock
    } else {
        RuleOwnership::Vacant
    })
}

fn record_metadata(snapshot: &ProjectSnapshot, kind: RuleKind, id: u8) -> (&str, &str, &str) {
    match kind {
        RuleKind::Race => snapshot
            .race_rules
            .iter()
            .find(|r| r.definition.classic_id == id)
            .map(|r| {
                (
                    r.source.as_str(),
                    r.definition.name.as_str(),
                    r.definition.description.as_str(),
                )
            }),
        RuleKind::Caste => snapshot
            .caste_rules
            .iter()
            .find(|r| r.definition.classic_id == id)
            .map(|r| {
                (
                    r.source.as_str(),
                    r.definition.name.as_str(),
                    r.definition.description.as_str(),
                )
            }),
    }
    .unwrap_or(("", "", ""))
}

fn catalog_name(names: &RuleNameCatalog, kind: RuleKind, id: u8) -> Option<&str> {
    match kind {
        RuleKind::Race => &names.race_names,
        RuleKind::Caste => &names.caste_names,
    }
    .get(usize::from(id - 1))
    .map(String::as_str)
}

fn definition_changed(
    snapshot: &ProjectSnapshot,
    kind: RuleKind,
    id: u8,
    baseline: &[u8],
    eligibility_only: bool,
) -> Result<bool, String> {
    let encoded = match kind {
        RuleKind::Race => snapshot
            .race_rules
            .iter()
            .find(|r| r.definition.classic_id == id)
            .map(|rule| {
                crate::codecs::encode_race_rules(std::slice::from_ref(rule), Some(baseline))
                    .map_err(|e| e.to_string())
            }),
        RuleKind::Caste => snapshot
            .caste_rules
            .iter()
            .find(|r| r.definition.classic_id == id)
            .map(|rule| {
                crate::codecs::encode_caste_rules(std::slice::from_ref(rule), Some(baseline))
                    .map_err(|e| e.to_string())
            }),
    }
    .transpose()?;
    Ok(match encoded.as_deref() {
        Some(bytes) => !same_ownership_row(
            native_row(kind, id, bytes)?,
            native_row(kind, id, baseline)?,
            eligibility_only,
        ),
        None => false,
    })
}

fn same_ownership_row(row: &[u8], stock: &[u8], eligibility_only: bool) -> bool {
    if eligibility_only {
        row[..208] == stock[..208] && row[238..] == stock[238..]
    } else {
        row == stock
    }
}

pub(crate) fn native_row(kind: RuleKind, id: u8, bytes: &[u8]) -> Result<&[u8], String> {
    if !(1..=30).contains(&id) {
        return Err("Choose a fixed rule identity from 1 through 30.".into());
    }
    let start = usize::from(id - 1) * kind.record_bytes();
    bytes
        .get(start..start + kind.record_bytes())
        .ok_or_else(|| {
            format!(
                "{} record {id} is incomplete; its missing bytes cannot be inferred.",
                kind.family()
            )
        })
}

pub(crate) fn digest(bytes: &[u8]) -> String {
    format!("sha256:{:x}", Sha256::digest(bytes))
}

pub use preparation::{PreparedRuleCommit, PreparedRuleWrite, prepare_rule_draft};

#[cfg(test)]
mod tests;

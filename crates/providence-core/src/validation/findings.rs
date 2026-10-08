//! Derived author-facing findings. No paging, transport or durable state lives here.

pub mod callers;
mod grouping;
mod monster_tails;
mod relevance;

use super::{
    Diagnostic, Severity,
    presentation::{FindingImpact, impact},
};
use crate::{
    compatibility::reference_is_resolved_by_application,
    model::{ProjectSnapshot, StableId},
    rebuilt::ApplicationMediaCatalog,
    references::{FieldPath, ReferenceDescriptor},
};
use grouping::{GroupedFindings, row_key};
use serde::Serialize;
use std::collections::{BTreeMap, BTreeSet};

/// Rebuild after any change to the project or effective application catalog.
pub struct Findings {
    all: GroupedFindings,
    actionable: Vec<Diagnostic>,
    detail_keys: BTreeSet<String>,
    application_fallbacks: usize,
    retained_monster_tails: BTreeSet<StableId>,
}

#[derive(Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum Relevance {
    Actionable,
    PreservationDetail,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FindingRow<'a> {
    #[serde(flatten)]
    pub diagnostic: &'a Diagnostic,
    pub relevance: Relevance,
    pub target_impact: FindingImpact,
    pub occurrence_count: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub group_identity: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub preservation_reason: Option<&'static str>,
}

pub struct FindingView<'a> {
    index: &'a Findings,
    rows: &'a [Diagnostic],
    members: bool,
}

pub struct OccurrenceCounts<'a> {
    pub total: [usize; 3],
    pub by_code: BTreeMap<&'a str, [usize; 3]>,
}

impl Findings {
    pub fn derive(
        snapshot: &ProjectSnapshot,
        diagnostics: Vec<Diagnostic>,
        references: &[ReferenceDescriptor],
        media: Option<&ApplicationMediaCatalog>,
    ) -> Self {
        let fallbacks = application_fallbacks(references, media);
        let all = diagnostics
            .into_iter()
            .filter(|finding| {
                !finding
                    .entity
                    .as_ref()
                    .zip(finding.field.as_ref())
                    .is_some_and(|(entity, field)| {
                        fallbacks.contains(&(finding.code.clone(), entity.clone(), field.clone()))
                    })
            })
            .collect::<Vec<_>>();
        let actionable = relevance::actionable(snapshot, &all, references);
        let actionable_keys = actionable.iter().map(row_key).collect::<BTreeSet<_>>();
        let detail_keys = all
            .iter()
            .map(row_key)
            .filter(|key| !actionable_keys.contains(key))
            .collect();
        let targets = references
            .iter()
            .map(|reference| {
                (
                    (reference.source.clone(), reference.field.clone()),
                    reference.target_id.clone(),
                )
            })
            .collect();
        Self {
            all: grouping::group(all, &targets),
            actionable: grouping::group(actionable, &targets).rows,
            detail_keys,
            application_fallbacks: fallbacks.len(),
            retained_monster_tails: monster_tails::uncalled(snapshot, references),
        }
    }

    pub fn view(
        &self,
        show_all: bool,
        group: Option<&str>,
    ) -> Result<FindingView<'_>, &'static str> {
        let members = group.filter(|value| !value.is_empty());
        let rows = if let Some(identity) = members {
            self.all
                .members
                .get(identity)
                .ok_or("Finding group changed; refresh Validate.")?
        } else if show_all {
            &self.all.rows
        } else {
            &self.actionable
        };
        Ok(FindingView {
            index: self,
            rows,
            members: members.is_some(),
        })
    }

    pub fn all_count(&self) -> usize {
        self.all.rows.len()
    }
    pub fn hidden_detail_count(&self) -> usize {
        self.all.rows.len() - self.actionable.len()
    }
    pub fn application_fallbacks(&self) -> usize {
        self.application_fallbacks
    }
}

impl<'a> FindingView<'a> {
    pub fn rows(&self) -> &'a [Diagnostic] {
        self.rows
    }

    pub fn members_match(&self, finding: &Diagnostic, query: &str) -> bool {
        self.index
            .all
            .members_for(finding)
            .is_some_and(|members| members.iter().any(|member| matches_query(member, query)))
    }

    pub fn row<'b>(&'b self, diagnostic: &'b Diagnostic) -> FindingRow<'b> {
        let unused = self.index.detail_keys.contains(&row_key(diagnostic));
        let target_impact = impact(&diagnostic.code, diagnostic.severity, unused, false);
        let group_identity = if self.members {
            None
        } else {
            self.index
                .all
                .identities
                .get(&row_key(diagnostic))
                .map(String::as_str)
        };
        FindingRow {
            diagnostic,
            relevance: if target_impact == FindingImpact::PreservationDetail {
                Relevance::PreservationDetail
            } else {
                Relevance::Actionable
            },
            target_impact,
            occurrence_count: self.occurrences(diagnostic),
            group_identity,
            preservation_reason: (unused && diagnostic.entity.as_ref().is_some_and(|id| self.index.retained_monster_tails.contains(id)))
                .then_some("Retained monster record after the bestiary end marker, with no known callers. Available in Decoded records."),
        }
    }

    pub fn occurrence_counts(&self) -> OccurrenceCounts<'a> {
        let mut total = [0; 3];
        let mut codes = BTreeMap::<&str, [usize; 3]>::new();
        for finding in self.rows {
            let count = self.occurrences(finding);
            let slot = severity_slot(finding.severity);
            total[slot] += count;
            codes.entry(&finding.code).or_default()[slot] += count;
        }
        OccurrenceCounts {
            total,
            by_code: codes,
        }
    }

    fn occurrences(&self, finding: &Diagnostic) -> usize {
        if self.members {
            1
        } else {
            self.index
                .all
                .members_for(finding)
                .map_or(1, <[Diagnostic]>::len)
        }
    }
}

fn application_fallbacks(
    references: &[ReferenceDescriptor],
    media: Option<&ApplicationMediaCatalog>,
) -> BTreeSet<(String, StableId, FieldPath)> {
    references
        .iter()
        .filter(|reference| reference_is_resolved_by_application(reference, media))
        .filter_map(|reference| {
            let kind = serde_json::to_value(&reference.target_kind).ok()?;
            Some((
                format!("reference.{}.missing", kind.as_str()?),
                reference.source.clone(),
                reference.field.clone(),
            ))
        })
        .collect()
}

pub fn matches_query(diagnostic: &Diagnostic, query: &str) -> bool {
    query.is_empty()
        || diagnostic.code.to_lowercase().contains(query)
        || diagnostic.message.to_lowercase().contains(query)
        || diagnostic
            .entity
            .as_ref()
            .is_some_and(|id| id.0.to_lowercase().contains(query))
        || diagnostic
            .field
            .as_ref()
            .is_some_and(|field| field.0.to_lowercase().contains(query))
}

pub fn severity_slot(severity: Severity) -> usize {
    match severity {
        Severity::Error => 0,
        Severity::Warning => 1,
        Severity::Information => 2,
    }
}

pub const CATEGORIES: &[(&str, &str)] = &[
    ("links", "Links"),
    ("resources", "Resources"),
    ("action-settings", "Action settings"),
    ("records", "Encounters and combat"),
    ("other", "Other findings"),
];

pub fn category(code: &str) -> &'static str {
    if let Some(reference) = code.strip_prefix("reference.") {
        let kind = reference.split('.').next().unwrap_or("");
        if matches!(
            kind,
            "icon" | "picture" | "sound" | "text-resource" | "special-land-tile" | "landlook"
        ) {
            "resources"
        } else {
            "links"
        }
    } else if code.starts_with("extra-code.opcode-92.") || code.starts_with("action-settings.") {
        "action-settings"
    } else if [
        "battle.",
        "complex-encounter.",
        "rogue-encounter.",
        "timed-encounter.",
    ]
    .iter()
    .any(|prefix| code.starts_with(prefix))
    {
        "records"
    } else {
        "other"
    }
}

#[cfg(test)]
mod tests;

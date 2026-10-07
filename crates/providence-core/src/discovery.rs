//! Revision-local author discovery. Records and links are derived, never portable truth.
mod catalog;
mod execution;
mod labels;
mod links;
mod quests;
mod settings_links;
mod supplement;
mod trace;
mod trace_cache;

use crate::{model::ProjectSnapshot, references::ReferenceDescriptor};
use serde::Serialize;
use std::collections::BTreeMap;

pub use links::DiscoveryLink;
pub use quests::QuestOccurrence;
pub use trace::{TraceItem, TracePage, TraceQuery};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveryRecord {
    pub identity: String,
    pub kind: String,
    pub native_id: String,
    pub name: String,
    pub scope: String,
    pub root_reason: Option<String>,
    pub fields: Vec<(String, String)>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchHit {
    pub record: DiscoveryRecord,
    pub matched_field: String,
    pub snippet: String,
    pub rank: u8,
}

#[derive(Debug, Default)]
pub struct DiscoveryIndex {
    pub records: Vec<DiscoveryRecord>,
    pub links: Vec<DiscoveryLink>,
    pub quests: Vec<QuestOccurrence>,
    incoming: BTreeMap<(String, String), Vec<usize>>,
    outgoing: BTreeMap<String, Vec<usize>>,
    traces: trace_cache::TraceCache,
}

impl DiscoveryIndex {
    pub fn build(snapshot: &ProjectSnapshot, references: &[ReferenceDescriptor]) -> Self {
        let records = catalog::records(snapshot);
        let links = links::derive(snapshot, references, &records);
        let quests = quests::derive(snapshot, &records);
        let mut index = Self {
            records,
            links,
            quests,
            ..Default::default()
        };
        for (i, link) in index.links.iter().enumerate() {
            let target = if link.target_kind == "action-point" {
                link.target_identity.as_ref().unwrap_or(&link.target_id)
            } else {
                &link.target_id
            };
            index
                .incoming
                .entry((link.target_kind.clone(), target.clone()))
                .or_default()
                .push(i);
            index
                .outgoing
                .entry(link.source.clone())
                .or_default()
                .push(i);
        }
        index
    }

    pub fn incoming(&self, kind: &str, id: &str) -> Vec<&DiscoveryLink> {
        self.incoming
            .get(&(kind.into(), id.into()))
            .into_iter()
            .flatten()
            .map(|i| &self.links[*i])
            .collect()
    }

    pub fn outgoing(&self, source: &str) -> Vec<&DiscoveryLink> {
        if let Some((owner, result)) = source.split_once(":result:") {
            let result = result.parse::<usize>().ok();
            return self
                .outgoing(owner)
                .into_iter()
                .filter(|link| {
                    link.field
                        .split_once("actions[")
                        .and_then(|(_, tail)| tail.split(']').next())
                        .and_then(|value| value.parse::<usize>().ok())
                        .map(|slot| slot / 8)
                        == result
                })
                .collect();
        }
        self.outgoing
            .get(source)
            .into_iter()
            .flatten()
            .map(|i| &self.links[*i])
            .collect()
    }

    pub fn incoming_record(&self, record: &DiscoveryRecord) -> Vec<&DiscoveryLink> {
        let kind = if record.kind == "icon" {
            "monster-appearance"
        } else {
            &record.kind
        };
        let id = if record.kind == "action-point" {
            &record.identity
        } else {
            &record.native_id
        };
        let mut rows = self.incoming(kind, id);
        if record.kind == "icon" {
            rows.extend(self.incoming("icon", id));
            rows.extend(self.incoming("special-land-tile", id));
        }
        rows.retain(|link| {
            link.target_scope
                .as_deref()
                .is_none_or(|scope| scope == record.scope)
                && link
                    .target_identity
                    .as_ref()
                    .is_none_or(|identity| identity == &record.identity)
        });
        rows
    }

    pub fn record(&self, identity: &str) -> Option<&DiscoveryRecord> {
        self.records.iter().find(|r| r.identity == identity)
    }

    pub fn search(&self, query: &str, kind: &str, scope: &str) -> Vec<SearchHit> {
        let query = query.trim().to_lowercase();
        let (family, id) = split_query(&query);
        let mut hits = Vec::new();
        for record in &self.records {
            if !kind.is_empty() && kind != "all" && kind != record.kind {
                continue;
            }
            if !scope.is_empty() && scope != record.scope {
                continue;
            }
            if let Some(hit) = search_record(record, &query, family, id) {
                hits.push(hit);
            }
        }
        hits.sort_by(|a, b| {
            (a.rank, &a.record.kind, &a.record.identity).cmp(&(
                b.rank,
                &b.record.kind,
                &b.record.identity,
            ))
        });
        hits
    }
}

fn split_query(query: &str) -> (&str, &str) {
    let Some((kind, id)) = query.split_once([' ', ':', '#']) else {
        return ("", query);
    };
    (
        match kind {
            "xap" | "macro" => "extra-action-point",
            "ap" => "action-point",
            "string" | "str" => "message",
            "quest" | "flag" => "quest-flag",
            "simple" => "simple-encounter",
            "complex" => "complex-encounter",
            "rogue" => "rogue-encounter",
            "timed" => "timed-encounter",
            other => other,
        },
        id.trim(),
    )
}

fn search_record(
    record: &DiscoveryRecord,
    query: &str,
    family: &str,
    id: &str,
) -> Option<SearchHit> {
    let displayed = crate::rule_presentation::identity_author_number(&record.identity)
        .map(|number| number.to_string())
        .unwrap_or_else(|| record.native_id.clone());
    let exact = displayed == id && (family.is_empty() || family == record.kind);
    let name = record.name.to_lowercase();
    let matching = record
        .fields
        .iter()
        .find(|(_, text)| text.to_lowercase().contains(query));
    let rank = if exact {
        0
    } else if name == query {
        1
    } else if name.starts_with(query) {
        2
    } else if name.contains(query) || record.identity.to_lowercase().contains(query) {
        3
    } else if matching.is_some() {
        4
    } else {
        return None;
    };
    let (field, text) = matching
        .cloned()
        .or_else(|| {
            record
                .fields
                .iter()
                .find(|(field, _)| {
                    matches!(
                        field.as_str(),
                        "text" | "description" | "note" | "displayName"
                    )
                })
                .cloned()
        })
        .unwrap_or_else(|| ("name".into(), record.name.clone()));
    let excerpt = snippet(&text, query);
    // Full text stays in the index; transport carries bounded matched text and identity only.
    let mut summary = record.clone();
    summary.fields.clear();
    summary.name = snippet(&summary.name, "");
    Some(SearchHit {
        record: summary,
        matched_field: field,
        snippet: excerpt,
        rank,
    })
}

pub fn snippet(text: &str, query: &str) -> String {
    let chars: Vec<_> = text.chars().collect();
    let lower = text.to_lowercase();
    let start = lower
        .find(query)
        .map(|byte| lower[..byte].chars().count().saturating_sub(50))
        .unwrap_or(0);
    let mut result: String = chars.iter().skip(start).take(360).collect();
    if start > 0 {
        result.insert(0, '…');
    }
    if start + 360 < chars.len() {
        result.push('…');
    }
    result
}

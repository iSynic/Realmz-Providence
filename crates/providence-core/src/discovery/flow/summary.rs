//! Semantic inspection is independent of graph depth and loaded-edge filters.
mod content;
mod program;
#[cfg(test)]
mod tests;

use super::FlowSelection;
use crate::{
    discovery::{DiscoveryIndex, DiscoveryLink},
    model::ProjectSnapshot,
    rebuilt::ApplicationMediaCatalog,
};
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FlowSummary {
    pub selection: FlowSelection,
    pub title: String,
    pub summary: String,
    pub card_text: String,
    pub program: bool,
    pub used_steps: usize,
    pub unknown_steps: usize,
    pub steps: Vec<program::FlowStep>,
    pub excerpt: String,
    pub excerpt_truncated: bool,
    pub callers: Vec<FlowSelection>,
    pub callers_total: usize,
    pub details: Vec<content::FlowDetail>,
    pub candidates: Vec<content::FlowCandidate>,
    pub candidates_total: usize,
}

pub fn describe_selection(
    snapshot: &ProjectSnapshot,
    index: &DiscoveryIndex,
    application: Option<&ApplicationMediaCatalog>,
    selection: &FlowSelection,
) -> Result<FlowSummary, String> {
    selection.validate()?;
    if selection.identity.starts_with("unresolved:") {
        return content::unresolved(snapshot, selection);
    }
    let record = index
        .records
        .iter()
        .find(|r| r.identity == selection.identity && r.scope == selection.scope)
        .ok_or("The selected summary record is unavailable.")?;
    let steps = program::steps(snapshot, index, application, selection)?;
    let used_steps = steps
        .iter()
        .filter(|step| step.status != "empty" && step.in_range)
        .count();
    let unknown_steps = steps
        .iter()
        .filter(|step| step.status == "unknown" && step.in_range)
        .count();
    let preview = program_preview(&steps, used_steps);
    let excerpt = message_text(snapshot, &selection.identity);
    let (callers, callers_total) = callers(index, selection);
    let content = content::describe(snapshot, selection);
    Ok(FlowSummary {
        selection: selection.clone(),
        title: record.name.clone(),
        summary: if steps.is_empty() {
            content.0.clone()
        } else {
            format!("{used_steps} used steps · {preview}")
        },
        card_text: if steps.is_empty() { content.0 } else { preview },
        program: !steps.is_empty(),
        used_steps,
        unknown_steps,
        steps,
        excerpt: super::graph::bounded(excerpt, 2400),
        excerpt_truncated: excerpt.chars().count() > 2400,
        callers,
        callers_total,
        details: content.1,
        candidates: Vec::new(),
        candidates_total: 0,
    })
}

fn program_preview(steps: &[program::FlowStep], used: usize) -> String {
    let titles: Vec<_> = steps
        .iter()
        .filter(|step| step.status != "empty" && step.in_range)
        .take(3)
        .map(|step| step.card_summary.as_str())
        .collect();
    let text = titles.join("; ");
    if used > titles.len() {
        format!("First {} of {used}: {text}", titles.len())
    } else {
        text
    }
}

fn step_links(
    index: &DiscoveryIndex,
    owner: &str,
    slot: u8,
    selection: &FlowSelection,
) -> Vec<DiscoveryLink> {
    let prefix = format!("actions[{slot}]");
    index
        .outgoing(owner)
        .into_iter()
        .filter(|link| {
            link.field.starts_with(&prefix)
                && link.caller_context.as_ref().is_none_or(|caller| {
                    selection
                        .caller_context
                        .as_ref()
                        .is_none_or(|selected| selected == caller)
                })
        })
        .take(32)
        .cloned()
        .collect()
}

fn callers(index: &DiscoveryIndex, selection: &FlowSelection) -> (Vec<FlowSelection>, usize) {
    let mut callers: Vec<_> = index
        .outgoing(&selection.identity)
        .into_iter()
        .filter_map(|link| link.caller_context.as_ref())
        .map(|caller| {
            let mut value = selection.clone();
            value.caller_context = Some(caller.clone());
            value
        })
        .collect();
    callers.sort();
    callers.dedup();
    let callers_total = callers.len();
    callers.truncate(64);
    (callers, callers_total)
}

fn message_text<'a>(snapshot: &'a ProjectSnapshot, identity: &str) -> &'a str {
    snapshot
        .messages
        .iter()
        .find(|r| r.identity.0 == identity)
        .map(|r| r.text.as_str())
        .unwrap_or("")
}

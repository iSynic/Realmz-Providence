use super::{DiscoveryIndex, DiscoveryLink};
use serde::Serialize;
use std::collections::VecDeque;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TraceItem {
    pub link: DiscoveryLink,
    pub depth: usize,
    pub path: Vec<String>,
    pub cycle: bool,
    pub depth_limited: bool,
    pub caller_position: Option<i16>,
    pub positions: Vec<Option<i16>>,
    pub contexts: Vec<Option<String>>,
    pub caller_context: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TracePage {
    pub items: Vec<TraceItem>,
    pub remaining: usize,
    pub visited: usize,
    pub total: usize,
    pub frontiers: usize,
    pub work_limit: usize,
    pub depth_limit: usize,
    pub work_limited: bool,
    pub batch_token: String,
}

pub struct TraceQuery<'a> {
    pub kind: &'a str,
    pub id: &'a str,
    pub offset: usize,
    pub limit: usize,
    pub depth_limit: usize,
    pub filter: &'a str,
    pub batch_token: Option<&'a str>,
    pub advance_work: bool,
    pub identity: Option<&'a str>,
    pub scope: Option<&'a str>,
    pub ancestors: &'a [String],
    pub required_position: Option<i16>,
    pub ancestor_positions: &'a [Option<i16>],
    pub ancestor_contexts: &'a [Option<String>],
    pub caller_context: Option<&'a str>,
}

#[derive(Debug, Clone)]
pub(super) struct Frontier {
    pub kind: String,
    pub id: String,
    pub path: Vec<String>,
    pub next_edge: usize,
    pub scope: Option<String>,
    pub identity: Option<String>,
    pub base_depth: usize,
    pub required_position: Option<i16>,
    pub positions: Vec<Option<i16>>,
    pub contexts: Vec<Option<String>>,
    pub caller_context: Option<String>,
}

#[derive(Debug, Clone)]
pub(super) struct TraceBatch {
    pub rows: Vec<TraceItem>,
    pub pending: VecDeque<Frontier>,
}

impl DiscoveryIndex {
    pub fn trace(&self, query: TraceQuery<'_>) -> Result<TracePage, String> {
        let depth_limit = query.depth_limit.clamp(1, 32);
        let (batch_token, batch) = self.traces.read(self, &query)?;
        let visited = batch.rows.len();
        let frontiers = batch.rows.iter().filter(|r| r.depth_limited).count();
        let filter = query.filter.to_lowercase();
        let rows: Vec<_> = batch
            .rows
            .into_iter()
            .filter(|r| matches_filter(r, &filter))
            .collect();
        let total = rows.len();
        let limit = query.limit.clamp(1, 128);
        Ok(TracePage {
            items: rows.into_iter().skip(query.offset).take(limit).collect(),
            remaining: total.saturating_sub(query.offset.saturating_add(limit)),
            visited,
            total,
            frontiers,
            work_limit: 4096,
            depth_limit,
            work_limited: !batch.pending.is_empty(),
            batch_token,
        })
    }

    /// Each caller path keeps its own cycle ancestry, independent of other branches.
    pub(super) fn walk_callers(
        &self,
        mut pending: VecDeque<Frontier>,
        depth_limit: usize,
    ) -> TraceBatch {
        let mut rows = Vec::new();
        while let Some(mut frontier) = pending.pop_front() {
            let incoming: Vec<_> = self
                .incoming(&frontier.kind, &frontier.id)
                .into_iter()
                .filter(|link| scoped(link, &frontier))
                .collect();
            for link in incoming.into_iter().skip(frontier.next_edge) {
                if rows.len() == 4096 {
                    pending.push_front(frontier);
                    return TraceBatch { rows, pending };
                }
                frontier.next_edge += 1;
                let source = super::execution::caller_owner(self, link);
                let owner = source.map(|r| r.identity.as_str()).unwrap_or(&link.source);
                let caller_position = super::execution::caller_position(link);
                // Reciprocal permissions describe one combination, not caller execution.
                // Keep their exact owning links visible without expanding the permission matrix.
                let cycle = repeats_state(&frontier, owner, link);
                let expandable = !super::links::eligibility_link(&link.field) && !cycle;
                let mut path = frontier.path.clone();
                path.push(owner.into());
                let mut positions = frontier.positions.clone();
                positions.push(caller_position);
                let mut contexts = frontier.contexts.clone();
                contexts.push(link.caller_context.clone());
                let depth = path.len().saturating_sub(frontier.base_depth);
                let depth_limited = expandable
                    && depth >= depth_limit
                    && source.is_some_and(|s| !self.incoming(&s.kind, &caller_key(s)).is_empty());
                if let Some(source) = source.filter(|_| expandable && !depth_limited) {
                    let child = frontier.child(
                        source,
                        path.clone(),
                        positions.clone(),
                        contexts.clone(),
                        link,
                    );
                    pending.push_back(child);
                }
                rows.push(TraceItem {
                    link: link.clone(),
                    depth,
                    path,
                    cycle,
                    depth_limited,
                    caller_position,
                    positions,
                    contexts,
                    caller_context: link.caller_context.clone(),
                });
            }
        }
        TraceBatch { rows, pending }
    }
}

fn repeats_state(frontier: &Frontier, owner: &str, link: &DiscoveryLink) -> bool {
    let caller_position = super::execution::caller_position(link);
    let context = link.caller_context.as_deref();
    frontier
        .path
        .iter()
        .zip(&frontier.positions)
        .zip(&frontier.contexts)
        .any(|((identity, position), prior)| {
            identity == owner && *position == caller_position && prior.as_deref() == context
        })
}

fn scoped(link: &DiscoveryLink, frontier: &Frontier) -> bool {
    link.code_position
        .is_none_or(|position| (0..8).contains(&position))
        && frontier
            .caller_context
            .as_ref()
            .is_none_or(|owner| link.source == *owner)
        && frontier
            .required_position
            .is_none_or(|required| link.code_position.is_none_or(|entry| entry <= required))
        && frontier.scope.as_ref().is_none_or(|scope| {
            link.target_scope
                .as_ref()
                .is_none_or(|target| target == scope)
        })
        && frontier.identity.as_ref().is_none_or(|identity| {
            link.target_identity
                .as_ref()
                .is_none_or(|target| target == identity)
        })
}

fn matches_filter(row: &TraceItem, filter: &str) -> bool {
    format!(
        "{} {} {} {} {}",
        row.link.source_label,
        row.link.field,
        row.link.target_label,
        row.link.meaning,
        row.link.source
    )
    .to_lowercase()
    .contains(filter)
}

pub(super) fn caller_key(record: &super::DiscoveryRecord) -> String {
    if record.kind == "action-point" {
        record.identity.clone()
    } else {
        record.native_id.clone()
    }
}

impl Frontier {
    fn child(
        &self,
        source: &super::DiscoveryRecord,
        path: Vec<String>,
        positions: Vec<Option<i16>>,
        contexts: Vec<Option<String>>,
        link: &DiscoveryLink,
    ) -> Self {
        Self {
            kind: source.kind.clone(),
            id: caller_key(source),
            path,
            next_edge: 0,
            scope: Some(source.scope.clone()),
            identity: Some(source.identity.clone()),
            base_depth: self.base_depth,
            required_position: super::execution::caller_position(link),
            positions,
            contexts,
            caller_context: link.caller_context.clone(),
        }
    }
}

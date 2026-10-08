//! Bounded, derived relationship views. Graph identities never enter authored truth.
mod graph;
mod quest_edges;
#[cfg(test)]
mod tests;
mod traversal;

use super::{DiscoveryLink, DiscoveryRecord, RelationshipKind};
use crate::references::ResolutionState;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet, VecDeque};

pub const FLOW_PAGE_NODES: usize = 64;
pub const FLOW_PAGE_EDGES: usize = 128;
pub const FLOW_WORK_LIMIT: usize = 4096;
pub const FLOW_NODE_LIMIT: usize = 200;
pub const FLOW_EDGE_LIMIT: usize = 600;

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FlowSelection {
    pub identity: String,
    #[serde(default = "scenario_scope")]
    pub scope: String,
    #[serde(default)]
    pub entry_position: Option<i16>,
    #[serde(default)]
    pub through_position: Option<i16>,
    #[serde(default)]
    pub caller_context: Option<String>,
}

fn scenario_scope() -> String {
    "scenario".into()
}

impl FlowSelection {
    pub fn record(identity: impl Into<String>, scope: impl Into<String>) -> Self {
        Self {
            identity: identity.into(),
            scope: scope.into(),
            entry_position: None,
            through_position: None,
            caller_context: None,
        }
    }

    pub fn node_id(&self) -> String {
        use sha2::{Digest, Sha256};
        format!(
            "flow:{:x}",
            Sha256::digest(serde_json::to_vec(self).unwrap())
        )
    }

    fn key(&self) -> RecordKey {
        (self.scope.clone(), self.identity.clone())
    }

    fn validate(&self) -> Result<(), String> {
        if self.identity.is_empty()
            || self.identity.len() > 512
            || self.scope.len() > 32
            || self.caller_context.as_ref().is_some_and(|v| v.len() > 512)
            || [self.entry_position, self.through_position]
                .into_iter()
                .flatten()
                .any(|value| !(0..8).contains(&value))
            || self
                .entry_position
                .zip(self.through_position)
                .is_some_and(|(a, b)| a > b)
        {
            return Err("Flow selection has an invalid identity or encounter step range.".into());
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum FlowDirection {
    Upstream,
    Downstream,
    #[default]
    Both,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum FlowCategory {
    Calls,
    State,
    References,
}

impl RelationshipKind {
    fn category(self) -> FlowCategory {
        match self {
            Self::Call => FlowCategory::Calls,
            Self::StateCheck | Self::StateChange => FlowCategory::State,
            Self::Reference | Self::Eligibility => FlowCategory::References,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FlowQuery {
    pub root: FlowSelection,
    #[serde(default)]
    pub direction: FlowDirection,
    #[serde(default = "initial_depth")]
    pub depth: u8,
    #[serde(default = "all_categories")]
    pub categories: BTreeSet<FlowCategory>,
}

fn initial_depth() -> u8 {
    2
}
fn all_categories() -> BTreeSet<FlowCategory> {
    [
        FlowCategory::Calls,
        FlowCategory::State,
        FlowCategory::References,
    ]
    .into()
}

impl FlowQuery {
    pub fn new(root: FlowSelection) -> Self {
        Self {
            root,
            direction: FlowDirection::Both,
            depth: 2,
            categories: all_categories(),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FlowNode {
    pub id: String,
    pub selection: FlowSelection,
    pub kind: String,
    pub native_id: String,
    pub author_id: Option<u32>,
    pub label: String,
    pub resolution: ResolutionState,
    pub availability_reason: String,
    pub contextual: bool,
    pub navigable: bool,
    pub depth: i16,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FlowDetails {
    pub condition: String,
    pub effect: String,
    pub branch: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FlowEdge {
    pub id: String,
    pub source: String,
    pub target: String,
    pub relationship: RelationshipKind,
    pub reference: DiscoveryLink,
    pub details: FlowDetails,
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FlowFrontier {
    pub node_id: String,
    pub direction: FlowDirection,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FlowPage {
    pub nodes: Vec<FlowNode>,
    pub edges: Vec<FlowEdge>,
    pub frontiers: Vec<FlowFrontier>,
    pub nodes_total: usize,
    pub edges_total: usize,
    pub inspected: usize,
    pub complete: bool,
    pub work_limited: bool,
    pub limit_reached: bool,
}

/// The adapter supplies exact catalog identities; the core never reads library storage.
#[derive(Debug, Clone, Default)]
pub struct FlowCatalog {
    pub records: Vec<DiscoveryRecord>,
    pub targets: BTreeMap<String, FlowTarget>,
}

#[derive(Debug, Clone)]
pub struct FlowTarget {
    pub identity: Option<String>,
    pub scope: String,
    pub resolution: ResolutionState,
    pub reason: String,
}

type RecordKey = (String, String);

#[derive(Debug, Clone)]
struct Record {
    selection: FlowSelection,
    kind: String,
    native_id: String,
    label: String,
    resolution: ResolutionState,
    reason: String,
    contextual: bool,
    navigable: bool,
}

#[derive(Debug, Clone)]
struct Connection {
    source: RecordKey,
    target: RecordKey,
    link: DiscoveryLink,
    details: FlowDetails,
}

#[derive(Debug, Default)]
pub struct FlowGraph {
    records: BTreeMap<RecordKey, Record>,
    connections: Vec<Connection>,
    incoming: BTreeMap<RecordKey, Vec<usize>>,
    outgoing: BTreeMap<RecordKey, Vec<usize>>,
}

#[derive(Debug, Clone)]
struct Pending {
    selection: FlowSelection,
    direction: FlowDirection,
    depth: u8,
    edge: usize,
}

#[derive(Debug, Clone)]
pub struct FlowTraversal {
    query: FlowQuery,
    pending: VecDeque<Pending>,
    expanded: BTreeMap<(FlowSelection, FlowDirection), u8>,
    nodes: BTreeMap<String, FlowNode>,
    edges: BTreeSet<String>,
    frontiers: BTreeSet<FlowFrontier>,
    first_page: bool,
}

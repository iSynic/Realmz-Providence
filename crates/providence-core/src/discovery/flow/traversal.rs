use super::*;
use crate::discovery::execution::caller_position;

impl FlowGraph {
    pub fn start(&self, query: FlowQuery) -> Result<FlowTraversal, String> {
        query.root.validate()?;
        if !(1..=32).contains(&query.depth) {
            return Err("Flow depth must be between 1 and 32.".into());
        }
        let root = self
            .node(&query.root, 0)
            .ok_or("The selected flow record is unavailable. Refresh the current project.")?;
        if (query.root.entry_position.is_some() || query.root.through_position.is_some())
            && !root.kind.ends_with("-encounter-result")
        {
            return Err("Step bounds belong to an encounter result.".into());
        }
        if query.root.caller_context.is_some() && root.kind != "rogue-encounter" {
            return Err("Caller context belongs to a Rogue Encounter.".into());
        }
        let mut state = FlowTraversal {
            query,
            pending: VecDeque::new(),
            expanded: BTreeMap::new(),
            nodes: [(root.id.clone(), root)].into(),
            edges: BTreeSet::new(),
            frontiers: BTreeSet::new(),
            first_page: true,
        };
        for direction in [FlowDirection::Upstream, FlowDirection::Downstream] {
            if state.query.direction == direction || state.query.direction == FlowDirection::Both {
                state.enqueue(state.query.root.clone(), direction, 0);
            }
        }
        Ok(state)
    }

    pub fn page(&self, state: &mut FlowTraversal) -> FlowPage {
        let mut page = FlowPage {
            nodes: Vec::new(),
            edges: Vec::new(),
            frontiers: Vec::new(),
            nodes_total: 0,
            edges_total: 0,
            inspected: 0,
            complete: false,
            work_limited: false,
            limit_reached: false,
        };
        if state.first_page {
            page.nodes
                .push(state.nodes[&state.query.root.node_id()].clone());
            state.first_page = false;
        }
        while page.inspected < FLOW_WORK_LIMIT {
            let Some(mut pending) = state.pending.pop_front() else {
                break;
            };
            let edges = self.adjacent(&pending);
            let Some(id) = edges.get(pending.edge) else {
                continue;
            };
            let connection = &self.connections[*id];
            page.inspected += 1;
            if state
                .query
                .categories
                .contains(&connection.link.relationship.category())
                && admissible(connection, &pending)
                && !self.append(state, &mut page, &pending, connection)
            {
                state.pending.push_front(pending);
                break;
            }
            pending.edge += 1;
            if pending.edge < edges.len() {
                state.pending.push_back(pending);
            }
        }
        page.nodes_total = state.nodes.len();
        page.edges_total = state.edges.len();
        page.frontiers = state.frontiers.iter().cloned().collect();
        page.work_limited = page.inspected == FLOW_WORK_LIMIT && !state.pending.is_empty();
        page.complete = state.pending.is_empty() && !page.limit_reached;
        page
    }

    fn adjacent(&self, pending: &Pending) -> &[usize] {
        let adjacency = if pending.direction == FlowDirection::Upstream {
            &self.incoming
        } else {
            &self.outgoing
        };
        adjacency
            .get(&pending.selection.key())
            .map(Vec::as_slice)
            .unwrap_or_default()
    }

    fn append(
        &self,
        state: &mut FlowTraversal,
        page: &mut FlowPage,
        pending: &Pending,
        connection: &Connection,
    ) -> bool {
        let next = neighbor(connection, pending);
        let next_id = next.node_id();
        let upstream = pending.direction == FlowDirection::Upstream;
        let (source, target) = if upstream {
            (next_id.clone(), pending.selection.node_id())
        } else {
            (pending.selection.node_id(), next_id.clone())
        };
        let edge = edge(connection, source, target);
        let new_node = !state.nodes.contains_key(&next_id);
        let new_edge = !state.edges.contains(&edge.id);
        if !room(state, page, new_node, new_edge) {
            return false;
        }
        if new_node {
            let depth = i16::from(pending.depth + 1) * if upstream { -1 } else { 1 };
            let node = self
                .node(&next, depth)
                .expect("Flow connection targets are indexed");
            state.nodes.insert(next_id.clone(), node.clone());
            page.nodes.push(node);
        }
        if new_edge {
            state.edges.insert(edge.id.clone());
            page.edges.push(edge);
        }
        let reason = if connection.link.relationship == RelationshipKind::Eligibility {
            Some("eligibility")
        } else if pending.depth + 1 >= state.query.depth {
            Some("depth")
        } else {
            None
        };
        let next_pending = Pending {
            selection: next.clone(),
            direction: pending.direction,
            depth: pending.depth + 1,
            edge: 0,
        };
        if !self.adjacent(&next_pending).is_empty() {
            if let Some(reason) = reason {
                state.frontiers.insert(FlowFrontier {
                    node_id: next_id,
                    direction: pending.direction,
                    reason: reason.into(),
                });
            } else {
                state.enqueue(next, pending.direction, pending.depth + 1);
            }
        }
        true
    }
}

impl FlowTraversal {
    fn enqueue(&mut self, selection: FlowSelection, direction: FlowDirection, depth: u8) {
        let key = (selection.clone(), direction);
        if self.expanded.get(&key).is_some_and(|old| *old <= depth) {
            return;
        }
        self.expanded.insert(key, depth);
        let node_id = selection.node_id();
        self.frontiers
            .retain(|row| row.node_id != node_id || row.direction != direction);
        self.pending.push_back(Pending {
            selection,
            direction,
            depth,
            edge: 0,
        });
    }
}

fn room(state: &FlowTraversal, page: &mut FlowPage, node: bool, edge: bool) -> bool {
    if (node && state.nodes.len() >= FLOW_NODE_LIMIT)
        || (edge && state.edges.len() >= FLOW_EDGE_LIMIT)
    {
        page.limit_reached = true;
        return false;
    }
    !(node && page.nodes.len() >= FLOW_PAGE_NODES || edge && page.edges.len() >= FLOW_PAGE_EDGES)
}

fn admissible(connection: &Connection, pending: &Pending) -> bool {
    let link = &connection.link;
    let current = &pending.selection;
    let at_caller = if link.relationship == RelationshipKind::StateCheck {
        current.key() == connection.target
    } else {
        current.key() == connection.source
    };
    if at_caller {
        if let Some(position) = caller_position(link)
            && (current.entry_position.is_some_and(|start| position < start)
                || current.through_position.is_some_and(|end| position > end))
        {
            return false;
        }
        if let Some(context) = &current.caller_context
            && link
                .caller_context
                .as_ref()
                .is_some_and(|owner| owner != context)
        {
            return false;
        }
    } else if let Some(position) = link.code_position
        && (!(0..8).contains(&position)
            || current.entry_position.is_some_and(|p| p != position)
            || current.through_position.is_some_and(|end| position > end))
    {
        return false;
    }
    if pending.direction == FlowDirection::Upstream
        && current
            .caller_context
            .as_ref()
            .is_some_and(|owner| link.source != *owner)
    {
        return false;
    }
    true
}

fn neighbor(connection: &Connection, pending: &Pending) -> FlowSelection {
    let upstream = pending.direction == FlowDirection::Upstream;
    let key = if upstream {
        &connection.source
    } else {
        &connection.target
    };
    let mut next = FlowSelection::record(&key.1, &key.0);
    let link = &connection.link;
    let caller = if link.relationship == RelationshipKind::StateCheck {
        !upstream
    } else {
        upstream
    };
    if next.identity.contains(":result:") {
        if caller {
            next.through_position = caller_position(link);
        } else {
            next.entry_position = link.code_position;
        }
    }
    if next.identity.starts_with("rogue-encounter:") {
        next.caller_context = if upstream {
            link.caller_context.clone()
        } else if link.source.starts_with("complex-encounter:") {
            Some(link.source.clone())
        } else {
            None
        };
    }
    next
}

fn edge(connection: &Connection, source: String, target: String) -> FlowEdge {
    use sha2::{Digest, Sha256};
    let id = format!(
        "edge:{:x}",
        Sha256::digest(
            serde_json::to_vec(&(&connection.link.occurrence, &source, &target)).unwrap()
        )
    );
    let mut reference = connection.link.clone();
    reference.source_label = graph::bounded(&reference.source_label, 180);
    reference.target_label = graph::bounded(&reference.target_label, 180);
    reference.meaning = graph::bounded(&reference.meaning, 360);
    reference.activity = graph::bounded(&reference.activity, 360);
    FlowEdge {
        id,
        source,
        target,
        relationship: reference.relationship,
        reference,
        details: connection.details.clone(),
    }
}

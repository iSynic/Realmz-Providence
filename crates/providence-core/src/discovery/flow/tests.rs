use super::*;
use crate::discovery::DiscoveryIndex;

mod context;
mod semantics;

fn record(id: &str, kind: &str) -> DiscoveryRecord {
    DiscoveryRecord {
        identity: id.into(),
        kind: kind.into(),
        native_id: id.rsplit(':').next().unwrap().into(),
        name: id.into(),
        scope: "scenario".into(),
        root_reason: None,
        fields: Vec::new(),
    }
}

fn link(source: &str, target: &str, slot: usize) -> DiscoveryLink {
    DiscoveryLink {
        relationship: RelationshipKind::Call,
        contextual: false,
        occurrence: format!("{source}|actions[{slot}]|{target}"),
        source: source.into(),
        field: format!("actions[{slot}].target"),
        target_kind: "extra-action-point".into(),
        target_id: target.rsplit(':').next().unwrap().into(),
        target_identity: Some(target.into()),
        target_scope: Some("scenario".into()),
        source_label: source.into(),
        target_label: target.into(),
        meaning: "Calls a macro".into(),
        resolution: ResolutionState::Resolved,
        root_reason: None,
        activity: "authored".into(),
        code_position: None,
        caller_context: None,
    }
}

fn graph(edges: &[(&str, &str)]) -> FlowGraph {
    let mut index = DiscoveryIndex::default();
    let ids: BTreeSet<_> = edges.iter().flat_map(|(a, b)| [*a, *b]).collect();
    index.records = ids
        .into_iter()
        .map(|id| record(id, "extra-action-point"))
        .collect();
    index.links = edges
        .iter()
        .enumerate()
        .map(|(slot, (a, b))| link(a, b, slot))
        .collect();
    FlowGraph::new(&index, &FlowCatalog::default())
}

fn collect(graph: &FlowGraph, query: FlowQuery) -> (Vec<FlowNode>, Vec<FlowEdge>, FlowPage) {
    let mut traversal = graph.start(query).unwrap();
    let mut nodes = Vec::new();
    let mut edges = Vec::new();
    for _ in 0..100 {
        let page = graph.page(&mut traversal);
        assert!(page.nodes.len() <= FLOW_PAGE_NODES);
        assert!(page.edges.len() <= FLOW_PAGE_EDGES);
        assert!(page.inspected <= FLOW_WORK_LIMIT);
        nodes.extend(page.nodes.clone());
        edges.extend(page.edges.clone());
        if page.complete || page.limit_reached {
            return (nodes, edges, page);
        }
    }
    panic!("Flow failed to finish bounded traversal");
}

fn query(root: &str, direction: FlowDirection, depth: u8) -> FlowQuery {
    let mut query = FlowQuery::new(FlowSelection::record(root, "scenario"));
    query.direction = direction;
    query.depth = depth;
    query
}

#[test]
fn both_directions_stop_at_two_levels_and_expose_frontiers() {
    let graph = graph(&[
        ("a", "b"),
        ("b", "c"),
        ("c", "d"),
        ("d", "e"),
        ("e", "f"),
        ("f", "g"),
    ]);
    let (nodes, edges, page) = collect(&graph, query("d", FlowDirection::Both, 2));
    assert_eq!(
        nodes
            .iter()
            .map(|r| r.selection.identity.as_str())
            .collect::<BTreeSet<_>>(),
        ["b", "c", "d", "e", "f"].into()
    );
    assert_eq!(edges.len(), 4);
    assert_eq!(page.frontiers.len(), 2);
    assert!(page.complete);
    assert!(
        nodes
            .iter()
            .any(|r| r.selection.identity == "b" && r.depth == -2)
    );
    assert!(
        nodes
            .iter()
            .any(|r| r.selection.identity == "f" && r.depth == 2)
    );
}

#[test]
fn diamonds_cycles_self_loops_and_repeated_fields_keep_distinct_edges() {
    let graph = graph(&[
        ("a", "b"),
        ("a", "c"),
        ("b", "d"),
        ("c", "d"),
        ("d", "a"),
        ("a", "a"),
        ("a", "b"),
    ]);
    let q = query("a", FlowDirection::Both, 32);
    let (nodes, edges, page) = collect(&graph, q.clone());
    assert_eq!(nodes.len(), 4);
    assert_eq!(edges.len(), 7);
    assert!(page.complete);
    let (again, links, _) = collect(&graph, q);
    assert_eq!(
        serde_json::to_value((&nodes, &edges)).unwrap(),
        serde_json::to_value((again, links)).unwrap()
    );
}

#[test]
fn continuations_are_lossless_and_do_not_repeat_nodes_or_edges() {
    let names: Vec<_> = (0..160).map(|n| format!("target:{n}")).collect();
    let edges: Vec<_> = names.iter().map(|name| ("root", name.as_str())).collect();
    let graph = graph(&edges);
    let (nodes, edges, page) = collect(&graph, query("root", FlowDirection::Downstream, 2));
    assert_eq!((nodes.len(), edges.len()), (161, 160));
    assert_eq!(
        nodes.iter().map(|r| &r.id).collect::<BTreeSet<_>>().len(),
        nodes.len()
    );
    assert_eq!(
        edges.iter().map(|r| &r.id).collect::<BTreeSet<_>>().len(),
        edges.len()
    );
    assert!(page.complete);
}

#[test]
fn node_and_edge_caps_remain_explicit() {
    let names: Vec<_> = (0..260).map(|n| format!("target:{n}")).collect();
    let pairs: Vec<_> = names.iter().map(|name| ("root", name.as_str())).collect();
    let (_, _, page) = collect(&graph(&pairs), query("root", FlowDirection::Downstream, 2));
    assert_eq!(page.nodes_total, 200);
    assert!(page.limit_reached && !page.complete);
    let pairs = vec![("root", "target"); 750];
    let (_, _, page) = collect(&graph(&pairs), query("root", FlowDirection::Downstream, 2));
    assert_eq!(page.edges_total, 600);
    assert!(page.limit_reached && !page.complete);
}

#[test]
fn filtered_edges_consume_work_budget_and_both_directions_make_progress() {
    let mut index = DiscoveryIndex {
        records: vec![
            record("root", "extra-action-point"),
            record("a", "extra-action-point"),
            record("b", "extra-action-point"),
        ],
        ..Default::default()
    };
    for i in 0..5000 {
        let mut edge = link("root", "a", i);
        edge.relationship = RelationshipKind::Reference;
        index.links.push(edge);
    }
    index.links.push(link("b", "root", 0));
    let graph = FlowGraph::new(&index, &FlowCatalog::default());
    let mut q = query("root", FlowDirection::Both, 2);
    q.categories = [FlowCategory::Calls].into();
    let mut traversal = graph.start(q).unwrap();
    let first = graph.page(&mut traversal);
    assert_eq!(first.inspected, 4096);
    assert!(first.work_limited);
    assert!(first.nodes.iter().any(|r| r.selection.identity == "b"));
    let second = graph.page(&mut traversal);
    assert!(second.complete);
    assert!(second.nodes.is_empty() && second.edges.is_empty());
}

#[test]
fn eligibility_links_show_direct_neighbors_without_expanding_matrix() {
    let mut index = DiscoveryIndex {
        records: vec![
            record("a", "race"),
            record("b", "caste"),
            record("c", "race"),
        ],
        ..Default::default()
    };
    index.links = vec![link("a", "b", 0), link("b", "c", 0)];
    for edge in &mut index.links {
        edge.relationship = RelationshipKind::Eligibility;
    }
    let graph = FlowGraph::new(&index, &FlowCatalog::default());
    let (nodes, _, page) = collect(&graph, query("a", FlowDirection::Downstream, 2));
    assert_eq!(nodes.len(), 2);
    assert_eq!(page.frontiers[0].reason, "eligibility");
    let (nodes, _, _) = collect(&graph, query("b", FlowDirection::Downstream, 1));
    assert!(nodes.iter().any(|r| r.selection.identity == "c"));
}

#[test]
fn invalid_roots_and_step_bounds_are_rejected_without_panics() {
    let graph = graph(&[("a", "b")]);
    assert!(
        graph
            .start(query("missing", FlowDirection::Both, 2))
            .is_err()
    );
    assert!(graph.start(query("a", FlowDirection::Both, 0)).is_err());
    let mut q = query("a", FlowDirection::Both, 2);
    q.root.entry_position = Some(2);
    assert!(graph.start(q).is_err());
}

use super::*;

#[test]
fn difficulty_variants_remain_distinct_and_follow_their_own_dependencies() {
    let mut index = DiscoveryIndex {
        records: vec![
            record("battle:1", "battle"),
            record("death", "extra-action-point"),
        ],
        ..Default::default()
    };
    for set in [-1, 0, 1] {
        let id = format!("monster:{set}:7");
        index.records.push(record(&id, "monster"));
        index.links.push(link(&id, "death", 0));
    }
    let mut selected = link("battle:1", "7", 0);
    selected.target_kind = "monster".into();
    selected.target_identity = None;
    index.links.push(selected);
    let graph = FlowGraph::new(&index, &FlowCatalog::default());
    let (nodes, edges, _) = collect(&graph, query("battle:1", FlowDirection::Downstream, 3));
    assert_eq!(nodes.iter().filter(|n| n.kind == "monster").count(), 3);
    assert_eq!(
        edges
            .iter()
            .filter(|e| e.reference.field == "difficultyVariant")
            .count(),
        3
    );
    assert_eq!(
        edges
            .iter()
            .filter(|e| e.reference.target_identity.as_deref() == Some("death"))
            .count(),
        3
    );
    assert!(
        !nodes
            .iter()
            .find(|n| n.kind == "runtime-monster")
            .unwrap()
            .navigable
    );
}

#[test]
fn rogue_returns_follow_only_the_selected_complex_caller() {
    let mut index = DiscoveryIndex {
        records: vec![record("rogue-encounter:1", "rogue-encounter")],
        ..Default::default()
    };
    for id in [4, 5] {
        let owner = format!("complex-encounter:{id}");
        let result = format!("{owner}:result:0");
        index.records.push(record(&owner, "complex-encounter"));
        index
            .records
            .push(record(&result, "complex-encounter-result"));
        let mut edge = link("rogue-encounter:1", &result, id);
        edge.field = "successResult".into();
        edge.caller_context = Some(owner);
        index.links.push(edge);
    }
    let graph = FlowGraph::new(&index, &FlowCatalog::default());
    let mut q = query("rogue-encounter:1", FlowDirection::Downstream, 1);
    q.root.caller_context = Some("complex-encounter:4".into());
    let (nodes, edges, _) = collect(&graph, q);
    assert_eq!(edges.len(), 1);
    assert!(
        nodes
            .iter()
            .any(|n| n.selection.identity == "complex-encounter:4:result:0")
    );
    assert!(
        !nodes
            .iter()
            .any(|n| n.selection.identity == "complex-encounter:5:result:0")
    );
}

#[test]
fn invalid_step_ranges_are_rejected_without_clamping() {
    let mut index = DiscoveryIndex::default();
    index.records.push(record(
        "simple-encounter:1:result:0",
        "simple-encounter-result",
    ));
    let graph = FlowGraph::new(&index, &FlowCatalog::default());
    for (entry, through) in [(Some(-1), None), (Some(8), None), (Some(5), Some(4))] {
        let mut q = query("simple-encounter:1:result:0", FlowDirection::Both, 2);
        q.root.entry_position = entry;
        q.root.through_position = through;
        assert!(graph.start(q).is_err());
    }
}

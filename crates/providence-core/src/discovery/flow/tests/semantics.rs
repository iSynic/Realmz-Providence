use super::*;
use crate::{
    model::{
        ClassicAction, ExtraActionPoint, ExtraCodeRow, NativeRecordId, ProjectSnapshot, StableId,
    },
    session::EditorSession,
};

fn xap(id: u32, actions: &[(i16, i16)]) -> ExtraActionPoint {
    ExtraActionPoint {
        identity: StableId(format!("extra-action-point:{id}")),
        native_id: NativeRecordId(id),
        classic_door_id: id as i32,
        post_action_level: 0,
        post_action_x: 0,
        post_action_y: 0,
        chance_percent: 100,
        actions: actions
            .iter()
            .enumerate()
            .map(|(slot, (opcode, target))| ClassicAction {
                slot: slot as u8,
                raw_opcode: *opcode,
                target_native_id: *target,
            })
            .collect(),
    }
}

#[test]
fn quest_changes_and_checks_have_opposite_directions_and_exact_owners() {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("quest-flow".into()));
    snapshot.extra_action_points = vec![xap(40, &[(47, 9)]), xap(88, &[(46, 1)])];
    snapshot.extra_codes.push(ExtraCodeRow {
        native_id: NativeRecordId(1),
        values: [9, 1, 0, 40, 0],
    });
    let session = EditorSession::new(snapshot);
    let graph = FlowGraph::new(session.discovery(), &FlowCatalog::default());
    let (nodes, edges, _) = collect(&graph, query("quest:9", FlowDirection::Both, 1));
    let keys: BTreeMap<_, _> = nodes
        .iter()
        .map(|n| (n.id.as_str(), n.selection.identity.as_str()))
        .collect();
    let changes = edges
        .iter()
        .find(|e| e.relationship == RelationshipKind::StateChange)
        .unwrap();
    let checks = edges
        .iter()
        .find(|e| e.relationship == RelationshipKind::StateCheck)
        .unwrap();
    assert_eq!(
        (keys[changes.source.as_str()], keys[changes.target.as_str()]),
        ("extra-action-point:40", "quest:9")
    );
    assert_eq!(
        (keys[checks.source.as_str()], keys[checks.target.as_str()]),
        ("quest:9", "extra-action-point:88")
    );
    assert_eq!(changes.reference.field, "actions[0].target");
    assert_eq!(checks.reference.source, "extra-action-point:88");
    assert_eq!(checks.details.condition, "Quest is set (nonzero)");
}

#[test]
fn encounter_entry_bounds_and_result_owners_do_not_merge_paths() {
    let mut index = DiscoveryIndex {
        records: vec![
            record("simple-encounter:1", "simple-encounter"),
            record("simple-encounter:1:result:0", "simple-encounter-result"),
            record("early", "extra-action-point"),
            record("late", "extra-action-point"),
        ],
        ..Default::default()
    };
    index.links = vec![
        link("simple-encounter:1", "early", 1),
        link("simple-encounter:1", "late", 5),
    ];
    let graph = FlowGraph::new(&index, &FlowCatalog::default());
    let mut q = query("simple-encounter:1:result:0", FlowDirection::Downstream, 1);
    q.root.entry_position = Some(4);
    let (nodes, edges, _) = collect(&graph, q);
    assert_eq!(edges.len(), 1);
    assert!(nodes.iter().any(|n| n.selection.identity == "late"));
    assert!(!nodes.iter().any(|n| n.selection.identity == "early"));
    let (_, edges, _) = collect(
        &graph,
        query("simple-encounter:1", FlowDirection::Downstream, 1),
    );
    assert!(edges.is_empty());
}

#[test]
fn missing_ambiguous_and_contextual_targets_never_fall_through_to_a_record() {
    let mut index = DiscoveryIndex {
        records: vec![
            record("source", "extra-action-point"),
            record("target", "picture"),
        ],
        ..Default::default()
    };
    for (slot, resolution, contextual) in [
        (0, ResolutionState::Missing, false),
        (1, ResolutionState::Ambiguous, false),
        (2, ResolutionState::Resolved, true),
    ] {
        let mut edge = link("source", "target", slot);
        edge.target_kind = "picture".into();
        edge.resolution = resolution;
        edge.contextual = contextual;
        index.links.push(edge);
    }
    let graph = FlowGraph::new(&index, &FlowCatalog::default());
    let (nodes, edges, _) = collect(&graph, query("source", FlowDirection::Downstream, 2));
    assert_eq!(edges.len(), 3);
    assert!(
        nodes
            .iter()
            .filter(|n| n.selection.identity != "source")
            .all(|n| !n.navigable)
    );
    assert!(!nodes.iter().any(|n| n.selection.identity == "target"));
}

#[test]
fn catalog_resolution_preserves_exact_scope_and_never_overrides_scenario_ambiguity() {
    let mut index = DiscoveryIndex {
        records: vec![
            record("source", "extra-action-point"),
            record("scenario-picture", "picture"),
        ],
        ..Default::default()
    };
    let mut stock = record("stock-picture", "picture");
    stock.scope = "stock".into();
    let mut first = link("source", "stock-picture", 0);
    first.target_kind = "picture".into();
    first.target_identity = None;
    first.resolution = ResolutionState::StockFallback;
    let mut second = first.clone();
    second.occurrence = "ambiguous".into();
    second.resolution = ResolutionState::Ambiguous;
    index.links = vec![first.clone(), second.clone()];
    let resolved = FlowTarget {
        identity: Some("stock-picture".into()),
        scope: "stock".into(),
        resolution: ResolutionState::Resolved,
        reason: String::new(),
    };
    let catalog = FlowCatalog {
        records: vec![stock],
        targets: [
            (first.occurrence, resolved.clone()),
            (second.occurrence, resolved),
        ]
        .into(),
    };
    let graph = FlowGraph::new(&index, &catalog);
    let (nodes, edges, _) = collect(&graph, query("source", FlowDirection::Downstream, 2));
    assert!(
        nodes
            .iter()
            .any(|n| n.selection.identity == "stock-picture" && n.selection.scope == "stock")
    );
    assert_eq!(
        edges
            .iter()
            .filter(|e| e.reference.resolution == ResolutionState::Ambiguous)
            .count(),
        1
    );
}

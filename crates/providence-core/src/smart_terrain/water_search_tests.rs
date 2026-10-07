use super::*;

#[test]
fn grouped_support_preserves_every_candidate_edge_combination() {
    let all = (1 << PIECES.len()) - 1;
    for a in 0..PIECES.len() {
        for b in 0..PIECES.len() {
            for domain in [1 << a, (1 << a) | (1 << b), all & !(1 << a)] {
                for d in 0..4 {
                    let expected = candidates(domain).fold(0, |mask, i| {
                        mask | matching_edge((d + 2) % 4, PIECES[i].edges[d])
                    });
                    assert_eq!(water_domains::support(domain, d), expected);
                    let wet = candidates(domain)
                        .filter(|&i| PIECES[i].edges[d] != 0)
                        .fold(0, |mask, i| {
                            mask | matching_edge((d + 2) % 4, PIECES[i].edges[d])
                        });
                    assert_eq!(water_domains::wet_support(domain, d), wet);
                }
            }
        }
    }
}

#[test]
fn contracted_parallel_contacts_survive_branch_rollback() {
    let neighbors = vec![
        [None, Some(1), Some(2), None],
        [None, None, Some(3), Some(0)],
        [Some(0), Some(3), None, None],
        [Some(1), None, None, Some(2)],
    ];
    let original = vec![
        matching_edge(2, 15),
        matching_edge(2, 15),
        matching_edge(0, 15),
        matching_edge(0, 15),
    ];
    let mut domains = Domains {
        values: original.clone(),
        trail: vec![],
    };
    let mut budget = Budget::new(4);
    let topology =
        water_connectivity::Topology::new(&neighbors, &domains.values, &mut budget, &mut || false)
            .unwrap();
    assert!(
        topology
            .bridges(&domains.values, &mut budget, &mut || false)
            .unwrap()
            .is_empty()
    );
    let checkpoint = domains.trail.len();
    domains.set(0, original[0] & matching_edge(1, 0));
    domains.set(1, original[1] & matching_edge(3, 0));
    assert_eq!(
        topology
            .bridges(&domains.values, &mut budget, &mut || false)
            .unwrap(),
        vec![(2, 3, 1)]
    );
    domains.set(2, original[2] & matching_edge(1, 0));
    domains.set(3, original[3] & matching_edge(3, 0));
    assert_eq!(
        topology.bridges(&domains.values, &mut budget, &mut || false),
        Err(Failure::Impossible)
    );
    domains.restore(checkpoint);
    assert_eq!(domains.values, original);
    assert!(
        topology
            .bridges(&domains.values, &mut budget, &mut || false)
            .unwrap()
            .is_empty()
    );
    assert_eq!(
        topology.bridges(&domains.values, &mut budget, &mut || true),
        Err(Failure::Canceled)
    );
}

#[test]
fn exhausting_work_returns_no_partial_solution() {
    let mut budget = Budget::new(32);
    assert_eq!(budget.charge(200_000 + 32 * 256), Ok(()));
    assert_eq!(budget.charge(1), Err(Failure::Budget));
}

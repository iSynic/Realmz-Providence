use super::*;

#[test]
fn incremental_closure_matches_accepted_fixed_point_after_every_prefix() {
    let mut fast = RandomRegionClosure::default();
    let mut naive = RandomRegionClosure::default();
    let mut fast_edges = BTreeSet::new();
    let mut naive_edges = BTreeSet::new();
    let bounds = [-32768, -1, 0, 1, 3, 32767];
    for step in 0..160 {
        let values = [0, 4, 100, bounds[(step / 6) % 6], bounds[step % 6]];
        let context = EncounterContext {
            simple: Some((step % 3) as u32),
            complex: Some((step % 2) as u32),
        };
        let write = (
            StableId(format!("xap:{}", step % 4)),
            "actions[0]".into(),
            values,
            context,
        );
        let native = if step < 80 { [-7, 8] } else { [2, 4] };
        fast.advance(native, write.clone(), |w, r| {
            fast_edges.insert((w.clone(), r));
        });
        naive.advance_naive(native, write.clone(), |w, r| {
            naive_edges.insert((w.clone(), r));
        });
        assert_eq!(fast.ranges, naive.ranges, "prefix {step}");
        assert!(fast.writes == naive.writes);
        assert!(fast_edges == naive_edges, "prefix {step}");
        let pairs = fast.pairs;
        fast.advance(native, write, |_, _| {
            panic!("duplicate write must be inert")
        });
        assert_eq!(fast.pairs, pairs);
    }
    assert_eq!(fast.pairs, fast.writes.len() * fast.ranges.len());
    assert!(naive.pairs > fast.pairs * 20);
}

#[test]
#[ignore = "bounded external snapshot benchmark; set PROVIDENCE_REACHABILITY_SNAPSHOT and PROVIDENCE_REACHABILITY_MODE"]
fn external_snapshot_equivalence_probe() {
    use std::time::Instant;
    let path = std::env::var("PROVIDENCE_REACHABILITY_SNAPSHOT").expect("snapshot path");
    let mode = std::env::var("PROVIDENCE_REACHABILITY_MODE").expect("naive or incremental");
    let bytes = std::fs::read(path).unwrap();
    let snapshot = serde_json::from_slice(&bytes).unwrap();
    let mut builder = ReachabilityBuilder::new(&snapshot).unwrap();
    builder.naive_random_regions = mode == "naive";
    let started = Instant::now();
    builder.add_roots();
    builder.run();
    let milliseconds = started.elapsed().as_millis();
    let pairs: usize = builder.random_regions.values().map(|r| r.pairs).sum();
    let writes: usize = builder
        .random_regions
        .values()
        .map(|r| r.writes.len())
        .sum();
    let ranges: usize = builder
        .random_regions
        .values()
        .map(|r| r.ranges.len())
        .sum();
    let report = builder.finish();
    let output = std::env::var("PROVIDENCE_REACHABILITY_REPORT").expect("report path");
    std::fs::write(output, serde_json::to_vec(&report).unwrap()).unwrap();
    println!(
        "REACHABILITY_PROBE {}",
        serde_json::json!({"mode":mode,"milliseconds":milliseconds,"pairs":pairs,"writes":writes,"ranges":ranges,"programs":report.reachable_program_ids.len(),"references":report.references.len()})
    );
}

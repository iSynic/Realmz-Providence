use super::*;

#[test]
fn resource_diff_accepts_only_the_declared_unique_identity() {
    let source = ownership_source();
    let edited = merge_resource_entries(
        &source,
        vec![ResourceEntry {
            resource_type: *b"PICT",
            id: 30_000,
            name: "New Gate".into(),
            attributes: 5,
            data: vec![9, 8, 7, 6],
        }],
    )
    .unwrap();
    let owned = BTreeSet::from([ResourceIdentity {
        resource_type: *b"PICT",
        id: 30_000,
    }]);
    let report = inspect_resource_fork_diff(&source, &edited, &owned).unwrap();

    assert!(!report.exact_container_bytes);
    assert_eq!(report.before_entries, 2);
    assert_eq!(report.after_entries, 2);
    assert_eq!(report.changed_resource_count, 1);
    assert_eq!(report.declared_owned_change_count, 1);
    assert_eq!(report.unexpected_change_count, 0);
    assert_eq!(report.ambiguous_owned_change_count, 0);
    assert!(report.within_declared_ownership);
    assert_eq!(report.changed_resources[0].resource_type, "PICT");
    assert_eq!(report.changed_resources[0].resource_id, 30_000);
    assert_eq!(report.changed_resources[0].before.payload_byte_lengths, [3]);
    assert_eq!(report.changed_resources[0].after.payload_byte_lengths, [4]);

    let changed_unowned = merge_resource_entries(
        &edited,
        vec![ResourceEntry {
            resource_type: *b"TEXT",
            id: 42,
            name: "Evidence".into(),
            attributes: 3,
            data: b"changed".to_vec(),
        }],
    )
    .unwrap();
    let rejected = inspect_resource_fork_diff(&source, &changed_unowned, &owned).unwrap();
    assert_eq!(rejected.changed_resource_count, 2);
    assert_eq!(rejected.unexpected_change_count, 1);
    assert!(!rejected.within_declared_ownership);
}

#[test]
fn resource_diff_refuses_to_certify_an_ambiguous_owned_identity() {
    let source = write_resource_fork_preserving_duplicates(&[
        ResourceEntry {
            resource_type: *b"cicn",
            id: 451,
            name: "First".into(),
            attributes: 1,
            data: vec![1],
        },
        ResourceEntry {
            resource_type: *b"cicn",
            id: 451,
            name: "Second".into(),
            attributes: 2,
            data: vec![2],
        },
    ])
    .unwrap();
    let edited = write_resource_fork_preserving_duplicates(&[
        ResourceEntry {
            resource_type: *b"cicn",
            id: 451,
            name: "First".into(),
            attributes: 1,
            data: vec![9],
        },
        ResourceEntry {
            resource_type: *b"cicn",
            id: 451,
            name: "Second".into(),
            attributes: 2,
            data: vec![2],
        },
    ])
    .unwrap();
    let owned = BTreeSet::from([ResourceIdentity {
        resource_type: *b"cicn",
        id: 451,
    }]);
    let report = inspect_resource_fork_diff(&source, &edited, &owned).unwrap();

    assert_eq!(report.declared_owned_change_count, 1);
    assert_eq!(report.ambiguous_owned_change_count, 1);
    assert!(!report.within_declared_ownership);
}

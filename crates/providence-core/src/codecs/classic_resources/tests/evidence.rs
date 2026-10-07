use super::*;

#[test]
fn resource_fork_path_candidates_share_native_and_slimmer_precedence() {
    assert_eq!(
        classic_resource_fork_candidate_paths("Scenario.rsrc"),
        [
            "Scenario.rsrc",
            "Scenario.rsf",
            "._Scenario",
            ".rsrc/Scenario"
        ]
    );
    assert!(classic_resource_fork_candidate_paths("Data BD").is_empty());
}

#[test]
fn selected_resource_evidence_keeps_native_metadata_and_fork_relative_offsets() {
    let payload: Vec<u8> = (0..40).collect();
    let fork = write_resource_fork(&[ResourceEntry {
        resource_type: *b"cicn",
        id: -189,
        name: "Café".into(),
        attributes: 32,
        data: payload.clone(),
    }])
    .unwrap();
    let identity = ResourceIdentity {
        resource_type: *b"cicn",
        id: -189,
    };
    let evidence = inspect_resource_entry(&fork, &identity).unwrap().unwrap();
    assert_eq!(evidence.name, "Café");
    assert_eq!(evidence.attributes, 32);
    assert_eq!(evidence.fork_offset, 20);
    assert_eq!(evidence.byte_length, 40);
    assert_eq!(evidence.preview, payload[..20]);
    assert_eq!(evidence.sha256, format!("{:x}", Sha256::digest(&payload)));
    let wrapped = apple_double(&fork, b"finder-info");
    assert_eq!(
        inspect_resource_entry(&wrapped, &identity).unwrap(),
        Some(evidence)
    );
    assert_eq!(parse_resource_entries(&wrapped).unwrap()[0].data, payload);
    assert!(
        inspect_resource_entry(
            &fork,
            &ResourceIdentity {
                resource_type: *b"cicn",
                id: 189
            }
        )
        .unwrap()
        .is_none()
    );
}

#[test]
fn selected_resource_evidence_rejects_duplicate_or_malformed_sources() {
    let entry = ResourceEntry {
        resource_type: *b"cicn",
        id: 7,
        name: String::new(),
        attributes: 0,
        data: vec![1],
    };
    let duplicate = write_resource_fork_preserving_duplicates(&[entry.clone(), entry]).unwrap();
    let identity = ResourceIdentity {
        resource_type: *b"cicn",
        id: 7,
    };
    assert!(matches!(
        inspect_resource_entry(&duplicate, &identity),
        Err(ResourceForkError::DuplicateResource { .. })
    ));
    assert!(inspect_resource_entry(&duplicate[..20], &identity).is_err());
}

use super::*;

#[test]
fn no_edit_merge_preserves_the_container_byte_for_byte() {
    let fork = write_resource_fork(&[ResourceEntry {
        resource_type: *b"TEXT",
        id: 42,
        name: "Evidence".into(),
        attributes: 7,
        data: b"preserve me".to_vec(),
    }])
    .unwrap();
    let apple_double = apple_double(&fork, b"finder-info");
    let entry = parse_resource_entries(&apple_double).unwrap().remove(0);

    assert_eq!(
        merge_resource_entries(&apple_double, vec![entry]).unwrap(),
        apple_double
    );
}

#[test]
fn resource_names_round_trip_mac_roman_without_loss() {
    let name = "Western Gate — Café\0";
    let fork = write_resource_fork(&[ResourceEntry {
        resource_type: *b"PICT",
        id: 30_000,
        name: name.into(),
        attributes: 0,
        data: vec![1],
    }])
    .unwrap();
    assert_eq!(parse_resource_entries(&fork).unwrap()[0].name, name);

    let error = write_resource_fork(&[ResourceEntry {
        resource_type: *b"PICT",
        id: 30_001,
        name: "Dragon 🐉".into(),
        attributes: 0,
        data: vec![1],
    }])
    .unwrap_err();
    assert_eq!(error, ResourceForkError::UnencodableResourceName);
}

#[test]
fn edited_appledouble_resource_preserves_other_entries_and_resource_metadata() {
    let fork = write_resource_fork(&[
        ResourceEntry {
            resource_type: *b"STR#",
            id: 800,
            name: "Items".into(),
            attributes: 7,
            data: vec![0, 0],
        },
        ResourceEntry {
            resource_type: *b"TEXT",
            id: 42,
            name: "Evidence".into(),
            attributes: 3,
            data: b"preserve me".to_vec(),
        },
    ])
    .unwrap();
    let original = apple_double(&fork, b"finder-info");
    let output = merge_resource_entries(
        &original,
        vec![ResourceEntry {
            resource_type: *b"STR#",
            id: 800,
            name: "Items".into(),
            attributes: 7,
            data: vec![0, 1, 3, b'N', b'e', b'w'],
        }],
    )
    .unwrap();

    let entries = parse_resource_entries(&output).unwrap();
    assert!(entries.iter().any(|entry| {
        entry.resource_type == *b"TEXT"
            && entry.id == 42
            && entry.name == "Evidence"
            && entry.attributes == 3
            && entry.data == b"preserve me"
    }));
    assert_eq!(apple_double_entry(&output, 9), b"finder-info");
}

#[test]
fn targeted_merge_preserves_duplicate_unowned_resource_identities() {
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
        ResourceEntry {
            resource_type: *b"STR#",
            id: -102,
            name: "Map Names".into(),
            attributes: 0,
            data: vec![0, 0],
        },
    ])
    .unwrap();
    assert!(matches!(
        parse_resource_entries(&source),
        Err(ResourceForkError::DuplicateResource {
            resource_type: [b'c', b'i', b'c', b'n'],
            id: 451
        })
    ));

    let output = merge_resource_entries_preserving_unowned_duplicates(
        &source,
        vec![ResourceEntry {
            resource_type: *b"STR#",
            id: -102,
            name: "Map Names".into(),
            attributes: 0,
            data: vec![0, 1, 3, b'N', b'e', b'w'],
        }],
    )
    .unwrap();
    let entries = parse_resource_entries_preserving_duplicates(&output).unwrap();
    let duplicate_data = entries
        .iter()
        .filter(|entry| entry.resource_type == *b"cicn" && entry.id == 451)
        .map(|entry| entry.data.clone())
        .collect::<Vec<_>>();
    assert_eq!(duplicate_data, [vec![1], vec![2]]);
}

#[test]
fn targeted_removal_deletes_all_owned_occurrences_and_preserves_container_metadata() {
    let fork = write_resource_fork_preserving_duplicates(&[
        ResourceEntry {
            resource_type: *b"cicn",
            id: 392,
            name: "Giant Frog".into(),
            attributes: 1,
            data: vec![1, 2, 3],
        },
        ResourceEntry {
            resource_type: *b"cicn",
            id: 392,
            name: "Duplicate Giant Frog".into(),
            attributes: 2,
            data: vec![4, 5, 6],
        },
        ResourceEntry {
            resource_type: *b"TEXT",
            id: 42,
            name: "Evidence".into(),
            attributes: 3,
            data: b"preserve me".to_vec(),
        },
    ])
    .unwrap();
    let original = apple_double(&fork, b"finder-info");
    let removals = BTreeSet::from([ResourceIdentity {
        resource_type: *b"cicn",
        id: 392,
    }]);

    let output = remove_resource_entries_preserving_container(&original, &removals).unwrap();
    let entries = parse_resource_entries_preserving_duplicates(&output).unwrap();

    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0].resource_type, *b"TEXT");
    assert_eq!(entries[0].id, 42);
    assert_eq!(entries[0].name, "Evidence");
    assert_eq!(entries[0].attributes, 3);
    assert_eq!(entries[0].data, b"preserve me");
    assert_eq!(apple_double_entry(&output, 9), b"finder-info");
}

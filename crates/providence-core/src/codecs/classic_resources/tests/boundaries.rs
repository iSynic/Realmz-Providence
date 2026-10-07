use super::*;

fn entry(id: i16, name: &str, data: &[u8]) -> ResourceEntry {
    ResourceEntry {
        resource_type: *b"TEXT",
        id,
        name: name.into(),
        attributes: 3,
        data: data.to_vec(),
    }
}

#[test]
fn writer_retains_exact_native_header_reference_name_and_payload_geometry() {
    let expected = [
        0, 0, 0, 16, 0, 0, 0, 22, 0, 0, 0, 6, 0, 0, 0, 52, 0, 0, 0, 2, 1, 2, 0, 0, 0, 16, 0, 0, 0,
        22, 0, 0, 0, 6, 0, 0, 0, 52, 0, 0, 0, 0, 0, 0, 0, 0, 0, 28, 0, 50, 0, 0, b'T', b'E', b'X',
        b'T', 0, 0, 0, 10, 0, 7, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 1, b'S',
    ];
    let resource = entry(7, "S", &[1, 2]);
    assert_eq!(
        write_resource_fork(std::slice::from_ref(&resource)).unwrap(),
        expected
    );
    assert_eq!(parse_resource_entries(&expected).unwrap(), [resource]);
    assert_eq!(
        inspect_resource_entry(
            &expected,
            &ResourceIdentity {
                resource_type: *b"TEXT",
                id: 7,
            }
        )
        .unwrap()
        .unwrap()
        .fork_offset,
        20
    );
}

#[test]
fn duplicate_identity_precedes_a_malformed_second_reference() {
    let mut fork = write_resource_fork_preserving_duplicates(&[
        entry(7, "First", &[1]),
        entry(7, "Second", &[2]),
    ])
    .unwrap();
    let map_offset = u32::from_be_bytes(fork[4..8].try_into().unwrap()) as usize;
    let second_reference = map_offset + 28 + 10 + 12;
    fork[second_reference + 2..second_reference + 4].copy_from_slice(&i16::MAX.to_be_bytes());
    assert!(matches!(
        parse_resource_entries(&fork),
        Err(ResourceForkError::DuplicateResource {
            resource_type: [b'T', b'E', b'X', b'T'],
            id: 7
        })
    ));
    assert_eq!(
        parse_resource_entries_preserving_duplicates(&fork),
        Err(ResourceForkError::Malformed)
    );
}

#[test]
fn writer_checks_identities_then_layout_then_name_encoding() {
    let duplicate = [entry(7, "Dragon 🐉", &[]), entry(7, "", &[])];
    assert!(matches!(
        write_resource_fork(&duplicate),
        Err(ResourceForkError::DuplicateResource { .. })
    ));
    let mut oversized = (0..5461).map(|id| entry(id, "", &[])).collect::<Vec<_>>();
    oversized[0].name = "Dragon 🐉".into();
    assert_eq!(
        write_resource_fork(&oversized),
        Err(ResourceForkError::TypeOrReferenceListTooLarge)
    );
    assert_eq!(
        write_resource_fork(&[entry(0, "Dragon 🐉", &[])]),
        Err(ResourceForkError::UnencodableResourceName)
    );
    assert_eq!(
        write_resource_fork(&[entry(0, &"a".repeat(256), &[])]),
        Err(ResourceForkError::ResourceNameTooLong)
    );
}

fn wrapped_fork(fork: &[u8], magic: u32) -> Vec<u8> {
    let mut bytes = vec![0u8; 50];
    bytes[..4].copy_from_slice(&magic.to_be_bytes());
    bytes[4..8].copy_from_slice(&0x0002_0000u32.to_be_bytes());
    bytes[24..26].copy_from_slice(&2u16.to_be_bytes());
    bytes[26..30].copy_from_slice(&9u32.to_be_bytes());
    bytes[30..34].copy_from_slice(&50u32.to_be_bytes());
    bytes[34..38].copy_from_slice(&4u32.to_be_bytes());
    bytes[38..42].copy_from_slice(&2u32.to_be_bytes());
    bytes[42..46].copy_from_slice(&54u32.to_be_bytes());
    bytes[46..50].copy_from_slice(&(fork.len() as u32).to_be_bytes());
    bytes.extend_from_slice(b"info");
    bytes.extend_from_slice(fork);
    bytes.extend_from_slice(b"unowned trailing residue");
    bytes
}

#[test]
fn no_edit_preserves_container_residue_and_owned_edit_preserves_other_payloads() {
    let original_entry = entry(7, "S", &[1, 2]);
    let fork = write_resource_fork(std::slice::from_ref(&original_entry)).unwrap();
    for magic in [0x0005_1600, 0x0005_1607] {
        let original = wrapped_fork(&fork, magic);
        assert_eq!(
            merge_resource_entries(&original, vec![original_entry.clone()]).unwrap(),
            original
        );
        let edited = merge_resource_entries(&original, vec![entry(7, "S", &[3])]).unwrap();
        assert_eq!(&edited[..30], &original[..30]);
        assert_eq!(&edited[50..54], b"info");
        assert_eq!(
            parse_resource_entries(&edited).unwrap(),
            [entry(7, "S", &[3])]
        );
    }
}

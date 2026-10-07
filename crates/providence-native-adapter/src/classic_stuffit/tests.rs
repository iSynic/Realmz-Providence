use super::*;
use providence_core::{codecs::NativeFileFamily, model::BlobId};

fn fixture() -> NativeManifest {
    let mut manifest = NativeManifest::default();
    manifest.insert_generated("Café", NativeFileFamily::ScenarioStartup, vec![0x42; 40]);
    manifest.insert_preserved("Data NI", BlobId("ni".into()), vec![1, 2, 3]);
    manifest.insert_preserved("Data NI.rsrc", BlobId("ni-fork".into()), vec![4, 5, 6]);
    manifest.insert_preserved(
        "Scenario.rsrc",
        BlobId("scenario-fork".into()),
        vec![7, 8, 9],
    );
    manifest.insert_preserved("Empty", BlobId("empty".into()), Vec::new());
    manifest
}

#[test]
fn pairs_forks_without_leaking_sidecars_or_mutating_the_manifest() {
    let manifest = fixture();
    let digest = manifest.deterministic_sha256();
    let prepared = prepare(&manifest, "ignored").unwrap();
    assert_eq!(prepared.entries.len(), 5);
    assert_eq!(prepared.entries[0].name, "Café");
    let ni = prepared
        .entries
        .iter()
        .find(|entry| entry.name == "Café/Data NI")
        .unwrap();
    assert_eq!(ni.data_fork, [1, 2, 3]);
    assert_eq!(ni.resource_fork, [4, 5, 6]);
    let scenario = prepared
        .entries
        .iter()
        .find(|entry| entry.name == "Café/Scenario")
        .unwrap();
    assert!(scenario.data_fork.is_empty());
    assert_eq!(scenario.resource_fork, [7, 8, 9]);
    let bytes = serialize(&prepared).unwrap();
    assert_eq!(&bytes[..6], b"SIT!\0\x01");
    assert_eq!(bytes.len(), 22 + 6 * 112 + 49);
    assert_eq!(bytes, serialize(&prepared).unwrap());
    classic_format::archive(&bytes, &prepared.entries).unwrap();
    assert_eq!(manifest.deterministic_sha256(), digest);
}

#[test]
fn authentic_hax_archive_header_checksum_covers_the_complete_header() {
    let header = [
        b"StuffIt (c)1997-1998 Aladdin Systems, Inc., http://www.aladdinsys.com/StuffIt/\r\n"
            .as_slice(),
        b"\x1a\0\x05\x10\0\x0d\xf6\x9d\0\0\0\x72\0\x01\0\0\0\x72\x1f\x1a",
        b"\x0d\xa5\xa5Reserved\xa5\xa5\0",
    ]
    .concat();
    assert_eq!(header.len(), 114);
    verify::check_archive_crc(&header).unwrap();
    let mut copied = header.clone();
    copied[98..100].copy_from_slice(&0x009bu16.to_be_bytes());
    assert!(verify::check_archive_crc(&copied).is_err());
    assert!(verify::check_archive_crc(&header[..100]).is_err());
}

#[test]
fn authentic_metadata_checksum_includes_the_resource_descriptor() {
    for (hex, expected, resource) in [
        (
            "000067ec00c602210232038a05000003017001070001ffcfc14000008000000000000000",
            0x67ec,
            false,
        ),
        (
            "0001170054455854546f795305000005ffed0000000000000000000080000000000000000000278e0000049e000000000f00",
            0x1700,
            true,
        ),
    ] {
        let bytes: Vec<u8> = hex
            .as_bytes()
            .chunks_exact(2)
            .map(|chunk| u8::from_str_radix(std::str::from_utf8(chunk).unwrap(), 16).unwrap())
            .collect();
        assert_eq!(verify::metadata_crc(&bytes, 0, resource).unwrap(), expected);
        let mut changed = bytes.clone();
        *changed.last_mut().unwrap() ^= 1;
        assert_ne!(
            verify::metadata_crc(&changed, 0, resource).unwrap(),
            expected
        );
        if resource {
            assert!(verify::metadata_crc(&bytes[..36], 0, true).is_err());
            assert_ne!(verify::metadata_crc(&bytes, 0, false).unwrap(), expected);
        }
    }
}

#[test]
fn corrupt_names_pointers_forks_or_metadata_cannot_pass_verification() {
    let prepared = prepare(&fixture(), "ignored").unwrap();
    let bytes = serialize(&prepared).unwrap();
    for index in [
        0,
        4,
        6,
        14,
        22,
        24,
        25,
        22 + 110,
        22 + 112 + 66,
        246,
        bytes.len() - 1,
    ] {
        let mut corrupt = bytes.clone();
        corrupt[index] ^= 0x55;
        assert!(
            classic_format::archive(&corrupt, &prepared.entries).is_err(),
            "index {index}"
        );
    }
    for length in [0, 21, 22, 133, 246, bytes.len() - 112, bytes.len() - 1] {
        assert!(classic_format::archive(&bytes[..length], &prepared.entries).is_err());
    }
    let mut trailing = bytes;
    trailing.push(0);
    assert!(classic_format::archive(&trailing, &prepared.entries).is_err());
}

#[test]
fn classic_stored_reader_restores_finder_fields_dates_and_both_forks() {
    let mut prepared = prepare(&fixture(), "ignored").unwrap();
    let entry = prepared
        .entries
        .iter_mut()
        .find(|entry| entry.name.ends_with("/Data NI"))
        .unwrap();
    entry.file_type = *b"RSRC";
    entry.creator = *b" RLM";
    entry.finder_flags = 0xfc00;
    entry.creation_date = 3_029_529_600;
    entry.modification_date = 3_029_529_601;
    let bytes = serialize(&prepared).unwrap();
    let decoded = stuffit::SitArchive::parse(&bytes).unwrap();
    let actual = decoded
        .entries
        .iter()
        .find(|entry| entry.name.ends_with("/Data NI"))
        .unwrap();
    assert_eq!(actual.file_type, *b"RSRC");
    assert_eq!(actual.creator, *b" RLM");
    assert_eq!(actual.finder_flags, 0xfc00);
    assert_eq!(actual.creation_date, 3_029_529_600);
    assert_eq!(actual.modification_date, 3_029_529_601);
    assert_eq!(
        actual.decompressed_forks().unwrap(),
        (vec![1, 2, 3], vec![4, 5, 6])
    );
}

#[test]
fn invalid_names_and_hfs_collisions_fail_without_renaming() {
    for name in [
        "😀",
        "a/b",
        "a:b",
        "../bad",
        "a\\b",
        "................................",
    ] {
        let mut manifest = fixture();
        manifest.insert_preserved(name, BlobId("invalid".into()), vec![1]);
        assert!(prepare(&manifest, "ignored").is_err(), "{name}");
    }
    let mut manifest = fixture();
    manifest.insert_preserved("data ni", BlobId("collision".into()), vec![4]);
    assert!(matches!(prepare(&manifest,"ignored"), Err(message) if message.contains("collision")));
}

fn apple_double(entries: &[(u32, &[u8])]) -> Vec<u8> {
    let mut bytes = vec![0u8; 26 + entries.len() * 12];
    bytes[..4].copy_from_slice(&0x00051607u32.to_be_bytes());
    bytes[4..8].copy_from_slice(&0x00020000u32.to_be_bytes());
    bytes[24..26].copy_from_slice(&(entries.len() as u16).to_be_bytes());
    for (index, (id, payload)) in entries.iter().enumerate() {
        let row = 26 + index * 12;
        let start = bytes.len() as u32;
        bytes[row..row + 4].copy_from_slice(&id.to_be_bytes());
        bytes[row + 4..row + 8].copy_from_slice(&start.to_be_bytes());
        bytes[row + 8..row + 12].copy_from_slice(&(payload.len() as u32).to_be_bytes());
        bytes.extend_from_slice(payload);
    }
    bytes
}

#[test]
fn apple_double_unwraps_resource_and_preserves_supported_finder_metadata() {
    let finder = b"RSRC RLM\xfc\x00";
    let wrapped = apple_double(&[(2, b"fork payload"), (9, finder)]);
    let parts = forks::decode(Some(&wrapped)).unwrap();
    assert_eq!(parts.resource, b"fork payload");
    assert_eq!(&parts.file_type, b"RSRC");
    assert_eq!(&parts.creator, b" RLM");
    assert_eq!(parts.flags, 0xfc00);
    let mut labelled_finder = finder.to_vec();
    labelled_finder[9] = 4;
    let labelled = apple_double(&[(2, b"fork payload"), (9, &labelled_finder)]);
    let labelled_parts = forks::decode(Some(&labelled)).unwrap();
    assert_eq!(labelled_parts.flags, 0xfc00);
    assert!(labelled_parts.omitted_metadata);
    for broken in [
        apple_double(&[(2, b"one"), (2, b"two")]),
        apple_double(&[(9, b"short")]),
        wrapped[..30].to_vec(),
    ] {
        assert!(forks::decode(Some(&broken)).is_err());
    }
}

#[test]
fn archive_publication_is_verified_and_no_clobber() {
    let temporary = tempfile::tempdir().unwrap();
    let prepared = prepare(&fixture(), "ignored").unwrap();
    let path = temporary.path().join("example.sit");
    let receipt = publish(&prepared, &path, 7).unwrap();
    assert_eq!(receipt["revision"], 7);
    assert_eq!(receipt["fileCount"], 4);
    assert_eq!(receipt["forksVerified"], true);
    assert_eq!(receipt["format"], "stuffit-classic");
    let original = std::fs::read(&path).unwrap();
    assert!(publish(&prepared, &path, 7).is_err());
    assert_eq!(std::fs::read(&path).unwrap(), original);
    assert!(publish(&prepared, &temporary.path().join("wrong.zip"), 7).is_err());
    assert!(publish(&prepared, &temporary.path().join("missing/out.sit"), 7).is_err());
    assert_eq!(std::fs::read_dir(temporary.path()).unwrap().count(), 1);
}

#[test]
fn plan_pages_logical_fork_pairs_without_payloads() {
    let manifest = fixture();
    let first = plan(&manifest, 9, "ignored", json!({"limit": 2})).unwrap();
    let second = plan(&manifest, 9, "ignored", json!({"offset": 2, "limit": 2})).unwrap();
    assert_eq!(first["files"]["total"], 4);
    assert_eq!(first["files"]["truncated"], true);
    assert_eq!(second["files"]["truncated"], false);
    let rows = first["files"]["items"]
        .as_array()
        .unwrap()
        .iter()
        .chain(second["files"]["items"].as_array().unwrap());
    let paths: Vec<_> = rows.map(|row| row["path"].as_str().unwrap()).collect();
    assert_eq!(
        paths,
        ["Café/Café", "Café/Data NI", "Café/Empty", "Café/Scenario"]
    );
    assert!(!first.to_string().contains("ni-fork"));
    assert!(plan(&manifest, 9, "ignored", json!({"offset": -1})).is_err());
}

#[test]
fn apple_double_dates_and_overlapping_entries_are_not_guessed() {
    let mut dates = vec![0u8; 16];
    dates[4..8].copy_from_slice(&i32::MIN.to_be_bytes());
    let wrapped = apple_double(&[(2, b"resource"), (8, &dates)]);
    let parts = forks::decode(Some(&wrapped)).unwrap();
    assert_eq!(parts.created, 3_029_529_600);
    assert_eq!(parts.modified, 0);
    let mut overlapping = wrapped.clone();
    overlapping[42..46].copy_from_slice(&50u32.to_be_bytes());
    assert!(forks::decode(Some(&overlapping)).is_err());
    let mut version_one = wrapped;
    version_one[4..8].copy_from_slice(&0x00010000u32.to_be_bytes());
    assert!(forks::decode(Some(&version_one)).is_err());
    assert!(
        forks::decode(Some(&apple_double(&[
            (1, b"unowned data"),
            (2, b"resource")
        ])))
        .is_err()
    );
}

#[test]
fn stored_route_requires_revision_and_preserves_a_persistent_project() {
    let temporary = tempfile::tempdir().unwrap();
    let mut session = providence_core::session::EditorSession::new(crate::demo::demo_snapshot());
    crate::dispatch_result(&mut session, "action-reference.retarget", json!({
        "expectedRevision": 0, "source": "action-point:land:0:17", "slot": 0, "targetNativeId": 47
    })).unwrap();
    let store = providence_storage::ProjectStore::create(
        temporary.path().join("project"),
        session.snapshot(),
    )
    .unwrap();
    let plan = crate::dispatch_result_with_store(
        &mut session,
        Some(&store),
        "project.inspect-classic-stuffit",
        json!({}),
    )
    .unwrap();
    let path = temporary.path().join("demo.sit");
    for params in [
        json!({"path":path}),
        json!({"path":path,"expectedRevision":99}),
        json!({"path":path,"expectedRevision":1,"manifestSha256":"changed"}),
    ] {
        assert!(
            crate::dispatch_result_with_store(
                &mut session,
                Some(&store),
                "project.compile-classic-stuffit",
                params
            )
            .is_err()
        );
        assert!(!path.exists());
    }
    let result = crate::dispatch_result_with_store(
        &mut session,
        Some(&store),
        "project.compile-classic-stuffit",
        json!({"path":path,"expectedRevision":1,"manifestSha256":plan["manifestSha256"]}),
    )
    .unwrap();
    assert_eq!(result["manifestSha256"], plan["manifestSha256"]);
    assert_eq!(session.revision().0, 1);
}

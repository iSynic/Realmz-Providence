use super::*;
use crate::{limits::*, manifest::validate_manifest_contract};
use providence_core::{
    model::{BlobId, ProjectOrigin},
    rebuilt::{
        REBUILT_V3_REQUIRED_DOCUMENTS, REBUILT_V4_SCHEMA_SHA256, REBUILT_V5_SCHEMA_SHA256,
        RebuiltV3FileInput, RebuiltV3FileIntegrity, compile_rebuilt_v4_manifest,
    },
};
use serde_json::{Value, json};
use std::io::{Cursor, Read};
use zip::{CompressionMethod, ZipArchive};
mod fixtures;
use fixtures::*;
mod failures;
mod legacy_item_texts;
mod scenario_read;

#[test]
fn archive_is_byte_deterministic_sorted_compact_and_manifest_exact() {
    let documents = [
        ("content.json", b"{\"content\":true}".as_slice()),
        ("world.json", b"{\"world\":true}".as_slice()),
        ("scenario.json", b"{\"scenario\":true}".as_slice()),
        ("assets/index.json", b"{\"assets\":[]}".as_slice()),
    ];
    let files = files(&documents);
    let manifest = fixture_manifest(&files);

    let first = write_rebuilt_v3_archive(Cursor::new(Vec::new()), &manifest, &files)
        .expect("first archive")
        .into_inner();
    let second = write_rebuilt_v3_archive(Cursor::new(Vec::new()), &manifest, &files)
        .expect("second archive")
        .into_inner();
    assert_eq!(first, second);

    let mut archive = ZipArchive::new(Cursor::new(first)).expect("read archive");
    let names = archive.file_names().map(str::to_string).collect::<Vec<_>>();
    assert_eq!(
        names,
        [
            "assets/index.json",
            "content.json",
            "manifest.json",
            "scenario.json",
            "world.json",
        ]
    );
    for index in 0..archive.len() {
        let file = archive.by_index(index).expect("entry");
        assert_eq!(
            file.compression(),
            if file.name().ends_with(".json") {
                CompressionMethod::Deflated
            } else {
                CompressionMethod::Stored
            }
        );
        assert_eq!(file.unix_mode(), Some(0o100644));
        assert_eq!(file.last_modified(), Some(zip::DateTime::default()));
    }
    let mut manifest_bytes = Vec::new();
    archive
        .by_name("manifest.json")
        .expect("manifest entry")
        .read_to_end(&mut manifest_bytes)
        .expect("read manifest");
    assert_eq!(manifest_bytes, manifest.canonical_json);
}

#[test]
fn archive_revalidates_the_manifest_inventory_at_the_write_boundary() {
    let documents = [
        ("content.json", b"content".as_slice()),
        ("world.json", b"world".as_slice()),
        ("scenario.json", b"scenario".as_slice()),
        ("assets/index.json", b"assets".as_slice()),
    ];
    let files = files(&documents);
    let manifest = fixture_manifest(&files);

    assert!(matches!(
        write_rebuilt_v3_archive(Cursor::new(Vec::new()), &manifest, &files[..3]),
        Err(RebuiltV3ArchiveError::MissingFile(_))
    ));
    let duplicate = [files[0].clone(), files[0].clone()];
    assert!(matches!(
        write_rebuilt_v3_archive(Cursor::new(Vec::new()), &manifest, &duplicate),
        Err(RebuiltV3ArchiveError::DuplicatePath(_))
    ));
    let unexpected = [RebuiltV3FileInput {
        path: "extra.json",
        bytes: b"extra",
    }];
    assert!(matches!(
        write_rebuilt_v3_archive(Cursor::new(Vec::new()), &manifest, &unexpected),
        Err(RebuiltV3ArchiveError::UnexpectedFile(_))
    ));
    let mut mismatched = files.clone();
    mismatched[0].bytes = b"changed";
    assert!(matches!(
        write_rebuilt_v3_archive(Cursor::new(Vec::new()), &manifest, &mismatched),
        Err(RebuiltV3ArchiveError::FileIntegrityMismatch(_))
    ));
}

#[test]
fn archive_inspection_revalidates_hashes_and_reimports_typed_documents() {
    let documents = reimportable_documents();
    let files = borrowed_files(&documents);
    let manifest = fixture_manifest(&files);
    let bytes = write_rebuilt_v3_archive(Cursor::new(Vec::new()), &manifest, &files)
        .expect("archive")
        .into_inner();

    let inspected = inspect_rebuilt_v3_archive(Cursor::new(bytes)).expect("inspect archive");

    assert_eq!(inspected.manifest, manifest.manifest);
    assert_eq!(inspected.archive_file_count, 5);
    assert_eq!(inspected.media_file_count, 0);
    assert_eq!(inspected.content.campaign.id.0, "archive-fixture");
    assert_eq!(inspected.world.maps[0].id.0, "land:0");
    assert!(inspected.scenario.programs.is_empty());
    assert!(inspected.asset_index.assets.is_empty());
}

#[test]
fn archive_inspection_accepts_imported_extended_schemas_with_exact_hashes_and_headers() {
    for version in [4, 5] {
        let mut documents = reimportable_documents();
        for (_, bytes) in &mut documents {
            let mut document: Value = serde_json::from_slice(bytes).expect("document JSON");
            document["schemaVersion"] = json!(version);
            if version == 5 && document["kind"] == "realmz2.scenario" {
                document["extraCodeTail"] = json!({"rowId": 2463, "availableBytes": 6});
            }
            *bytes = serde_json::to_vec(&document).expect("canonical object serialization");
        }
        let files = borrowed_files(&documents);
        let mut imported = snapshot();
        imported.origin = ProjectOrigin::Imported {
            compatibility_annex: BlobId(format!("sha256:{}", "a".repeat(64))),
        };
        let compile = if version == 4 {
            compile_rebuilt_v4_manifest
        } else {
            providence_core::rebuilt::compile_rebuilt_v5_manifest
        };
        let manifest = compile(&imported, &compiler(), &[], &files)
            .expect("extended manifest for imported project");
        let bytes = write_rebuilt_v3_archive(Cursor::new(Vec::new()), &manifest, &files)
            .expect("v4 archive")
            .into_inner();

        let inspected = inspect_rebuilt_v3_archive(Cursor::new(bytes)).expect("inspect v4 archive");
        assert_eq!(inspected.manifest.schema_version, version);
        assert_eq!(
            inspected.manifest.schema_hash,
            if version == 4 {
                REBUILT_V4_SCHEMA_SHA256
            } else {
                REBUILT_V5_SCHEMA_SHA256
            }
        );
        assert_eq!(inspected.content.schema_version, version);
        assert_eq!(inspected.world.schema_version, version);
        assert_eq!(inspected.scenario.schema_version, version);
        assert_eq!(inspected.asset_index.schema_version, version);
    }
}

#[test]
fn archive_inspection_rejects_noncanonical_document_bytes() {
    let mut documents = reimportable_documents();
    let value: Value = serde_json::from_slice(&documents[0].1).unwrap();
    documents[0].1 = serde_json::to_vec_pretty(&value).unwrap();
    let files = borrowed_files(&documents);
    let manifest = fixture_manifest(&files);
    let bytes = write_rebuilt_v3_archive(Cursor::new(Vec::new()), &manifest, &files)
        .expect("archive")
        .into_inner();

    assert!(matches!(
        inspect_rebuilt_v3_archive(Cursor::new(bytes)),
        Err(RebuiltV3ArchiveError::NonCanonicalJson(path)) if path == "content.json"
    ));
}

#[test]
fn archive_inspection_recomputes_the_package_hash() {
    let documents = reimportable_documents();
    let files = borrowed_files(&documents);
    let mut manifest = fixture_manifest(&files);
    manifest.manifest.package_hash = "0".repeat(64);
    let manifest_value = serde_json::to_value(&manifest.manifest).unwrap();
    manifest.canonical_json = serde_json::to_vec(&manifest_value).unwrap();
    let bytes = write_rebuilt_v3_archive(Cursor::new(Vec::new()), &manifest, &files)
        .expect("archive")
        .into_inner();

    assert!(matches!(
        inspect_rebuilt_v3_archive(Cursor::new(bytes)),
        Err(RebuiltV3ArchiveError::PackageHashMismatch { expected, .. })
            if expected == "0".repeat(64)
    ));
}

#[test]
fn manifest_refuses_an_oversized_aggregate_without_reading_payloads() {
    let documents = reimportable_documents();
    let files = borrowed_files(&documents);
    let mut manifest = fixture_manifest(&files).manifest;
    for integrity in manifest.files.values_mut() {
        integrity.bytes = MAX_ENTRY_BYTES;
    }
    let digest = "1".repeat(64);
    manifest.files.insert(
        format!("assets/media/{digest}.png"),
        RebuiltV3FileIntegrity {
            bytes: MAX_ENTRY_BYTES,
            sha256: digest,
        },
    );

    assert!(matches!(
        validate_manifest_contract(&manifest),
        Err(RebuiltV3ArchiveError::InvalidManifest(reason))
            if reason.contains("payload") && reason.contains("inspection limit")
    ));
}

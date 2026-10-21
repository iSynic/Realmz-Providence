use super::*;
use sha2::{Digest, Sha256};
use zip::{ZipWriter, write::SimpleFileOptions};

fn source_documents(mixed_role: bool) -> (Vec<(String, Vec<u8>)>, String) {
    let payload = vec![0x5a; 259];
    let digest = format!("{:x}", Sha256::digest(&payload));
    let path = format!("assets/media/{digest}.bin");
    let source = json!({"id":format!("classic-source-{digest}"), "label":"Retained source",
        "kind":"classic-source", "mimeType":"application/octet-stream", "bytes":payload.len(),
        "sha256":digest,"path":path});
    let mut assets = vec![source.clone()];
    if mixed_role {
        let mut media = source;
        media["id"] = json!("media-alias");
        media["kind"] = json!("sound");
        assets.push(media);
    }
    let mut documents = reimportable_documents();
    let mut index: Value = serde_json::from_slice(&documents[3].1).unwrap();
    index["assets"] = json!(assets);
    documents[3].1 = serde_json::to_vec(&index).unwrap();
    documents.push((path.clone(), payload));
    (documents, path)
}

fn archive(documents: &[(String, Vec<u8>)], force_deflate: Option<&str>) -> Vec<u8> {
    let inputs = borrowed_files(documents);
    let manifest = fixture_manifest(&inputs);
    if force_deflate.is_none() {
        return write_rebuilt_v3_archive(Cursor::new(Vec::new()), &manifest, &inputs)
            .unwrap()
            .into_inner();
    }
    let mut entries = documents
        .iter()
        .cloned()
        .collect::<std::collections::BTreeMap<_, _>>();
    entries.insert("manifest.json".into(), manifest.canonical_json);
    let mut writer = ZipWriter::new(Cursor::new(Vec::new()));
    for (path, bytes) in entries {
        let method = if path.ends_with(".json") || force_deflate == Some(path.as_str()) {
            CompressionMethod::Deflated
        } else {
            CompressionMethod::Stored
        };
        let options = SimpleFileOptions::default()
            .compression_method(method)
            .last_modified_time(zip::DateTime::default())
            .system(zip::System::Unix)
            .unix_permissions(0o644);
        writer.start_file(path, options).unwrap();
        std::io::Write::write_all(&mut writer, &bytes).unwrap();
    }
    writer.finish().unwrap().into_inner()
}

#[test]
fn exact_source_only_payload_is_deflated_and_round_trips_through_inspection() {
    let (documents, path) = source_documents(false);
    let bytes = archive(&documents, None);
    let mut zip = ZipArchive::new(Cursor::new(&bytes)).unwrap();
    assert_eq!(
        zip.by_name(&path).unwrap().compression(),
        CompressionMethod::Deflated
    );
    let inspected = inspect_rebuilt_v3_archive(Cursor::new(&bytes)).unwrap();
    assert_eq!(inspected.media_file_count, 1);
    let mut payload = Vec::new();
    zip.by_name(&path)
        .unwrap()
        .read_to_end(&mut payload)
        .unwrap();
    assert_eq!(payload, vec![0x5a; 259]);
}

#[test]
fn a_media_alias_disqualifies_source_compression_in_writer_and_inspector() {
    let (documents, path) = source_documents(true);
    let bytes = archive(&documents, None);
    let mut zip = ZipArchive::new(Cursor::new(&bytes)).unwrap();
    assert_eq!(
        zip.by_name(&path).unwrap().compression(),
        CompressionMethod::Stored
    );
    inspect_rebuilt_v3_archive(Cursor::new(&bytes)).unwrap();
    assert!(
        matches!(inspect_rebuilt_v3_archive(Cursor::new(archive(&documents, Some(&path)))),
        Err(RebuiltV3ArchiveError::NondeterministicEntryMetadata(actual)) if actual == path)
    );
}

use super::*;

fn documents_with_legacy_texts(value: Option<Value>) -> Vec<(String, Vec<u8>)> {
    let mut documents = reimportable_documents();
    let (_, bytes) = documents
        .iter_mut()
        .find(|(path, _)| path == "content.json")
        .unwrap();
    let mut content: Value = serde_json::from_slice(bytes).unwrap();
    if let Some(value) = value {
        content["itemTexts"] = value;
    } else {
        content.as_object_mut().unwrap().remove("itemTexts");
    }
    *bytes = serde_json::to_vec(&content).unwrap();
    documents
}

#[test]
fn legacy_item_text_arrays_reimport_without_becoming_item_definitions() {
    let legacy = json!([
        {"id": "classic.item.901", "name": "Legacy duplicate"},
        null, 7, "text", {}, [1, 2]
    ]);
    let documents = documents_with_legacy_texts(Some(legacy.clone()));
    let files = borrowed_files(&documents);
    let manifest = fixture_manifest(&files);
    let bytes = write_rebuilt_v3_archive(Cursor::new(Vec::new()), &manifest, &files)
        .unwrap()
        .into_inner();
    let inspected = inspect_rebuilt_v3_archive(Cursor::new(bytes)).unwrap();
    assert_eq!(inspected.manifest, manifest.manifest);
    assert!(inspected.content.items.is_empty());
    assert_eq!(
        serde_json::to_value(inspected.content).unwrap()["itemTexts"],
        legacy
    );
}

#[test]
fn legacy_item_text_field_still_requires_an_array() {
    for invalid in [
        None,
        Some(Value::Null),
        Some(json!({})),
        Some(json!("text")),
        Some(json!(7)),
    ] {
        let documents = documents_with_legacy_texts(invalid);
        let files = borrowed_files(&documents);
        let manifest = fixture_manifest(&files);
        let bytes = write_rebuilt_v3_archive(Cursor::new(Vec::new()), &manifest, &files)
            .unwrap()
            .into_inner();
        assert!(matches!(
            inspect_rebuilt_v3_archive(Cursor::new(bytes)),
            Err(RebuiltV3ArchiveError::InvalidJson { path, .. }) if path == "content.json"
        ));
    }
}

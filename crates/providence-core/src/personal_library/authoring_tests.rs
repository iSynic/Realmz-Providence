use super::*;

fn asset() -> PersonalAsset {
    PersonalAsset {
        identity: StableId("personal:one".into()),
        name: "Token".into(),
        collection: None,
        original: BlobId(format!("sha256:{}", "a".repeat(64))),
        byte_length: 5,
        mime_type: "image/png".into(),
        media: None,
        import_kind: None,
    }
}

#[test]
fn visible_metadata_form_is_one_history_entry_and_rejects_atomically() {
    let mut library = PersonalLibrary::default();
    let entry = asset();
    library
        .apply(0, LibraryCommand::Import((entry.clone()).into()))
        .unwrap();
    library
        .apply(
            1,
            LibraryCommand::CreateCollection {
                identity: StableId("forest".into()),
                name: "Forest".into(),
            },
        )
        .unwrap();
    let before = library.clone();
    assert_eq!(
        library.apply(
            2,
            LibraryCommand::Update {
                identity: entry.identity.clone(),
                name: "Changed".into(),
                collection: Some(StableId("missing".into())),
            }
        ),
        Err(LibraryError::MissingCollection)
    );
    assert_eq!(library, before);
    library
        .apply(
            2,
            LibraryCommand::Update {
                identity: entry.identity.clone(),
                name: "Trail".into(),
                collection: Some(StableId("forest".into())),
            },
        )
        .unwrap();
    library.apply(3, LibraryCommand::Undo).unwrap();
    assert_eq!(library.asset(&entry.identity), Some(&entry));
    assert_eq!(library.history_counts(), (2, 1));
    let bytes = serde_json::to_vec(&library).unwrap();
    let mut reopened: PersonalLibrary = serde_json::from_slice(&bytes).unwrap();
    reopened.validate().unwrap();
    reopened.apply(4, LibraryCommand::Redo).unwrap();
    assert_eq!(reopened.asset(&entry.identity).unwrap().name, "Trail");
    assert_eq!(
        reopened.asset(&entry.identity).unwrap().collection,
        Some(StableId("forest".into()))
    );
}

#[test]
fn history_restores_removed_original_and_branches_without_replaying_redo() {
    let mut library = PersonalLibrary::default();
    let entry = asset();
    library
        .apply(0, LibraryCommand::Import((entry.clone()).into()))
        .unwrap();
    library
        .apply(
            1,
            LibraryCommand::Remove {
                identity: entry.identity.clone(),
            },
        )
        .unwrap();
    library.apply(2, LibraryCommand::Undo).unwrap();
    assert_eq!(library.asset(&entry.identity), Some(&entry));
    library
        .apply(
            3,
            LibraryCommand::Rename {
                identity: entry.identity,
                name: "New branch".into(),
            },
        )
        .unwrap();
    let before = library.clone();
    assert_eq!(
        library.apply(4, LibraryCommand::Redo),
        Err(LibraryError::NoHistory)
    );
    assert_eq!(library, before);
}

#[test]
fn version_one_library_opens_without_rewriting_originals() {
    let mut library = PersonalLibrary::default();
    library
        .apply(0, LibraryCommand::Import((asset()).into()))
        .unwrap();
    let mut value = serde_json::to_value(&library).unwrap();
    value["formatVersion"] = serde_json::json!(1);
    value.as_object_mut().unwrap().remove("history");
    let old: PersonalLibrary = serde_json::from_value(value).unwrap();
    old.validate().unwrap();
    assert_eq!(old.history_counts(), (0, 0));
    assert_eq!(old.asset(&asset().identity), Some(&asset()));
}

#[test]
fn forged_history_is_rejected_before_it_can_restore_content() {
    let mut library = PersonalLibrary::default();
    library
        .apply(0, LibraryCommand::Import((asset()).into()))
        .unwrap();
    let mut value = serde_json::to_value(&library).unwrap();
    value["history"]["undo"][0]["Asset"]["after"]["name"] = serde_json::json!("Forged");
    let corrupt: PersonalLibrary = serde_json::from_value(value).unwrap();
    assert_eq!(corrupt.validate(), Err(LibraryError::InvalidManifest));
}

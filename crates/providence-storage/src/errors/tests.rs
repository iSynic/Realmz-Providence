use super::StoreError;

#[test]
fn path_errors_keep_their_diagnostic_context() {
    let cases = [
        (
            StoreError::MissingSnapshot("project".into()),
            "portable snapshot is missing at project",
        ),
        (
            StoreError::MissingApplicationMediaCatalog("project".into()),
            "Classic application media catalog is missing at project",
        ),
        (
            StoreError::MissingReferenceCatalog("project".into()),
            "reference catalog is missing at project",
        ),
        (
            StoreError::MissingMonsterLibraryCatalog("project".into()),
            "portable Monster Library catalog is missing at project",
        ),
        (
            StoreError::MonsterLibraryDirectoryNotEmpty("project".into()),
            "refusing to create a Monster Library in non-empty directory project",
        ),
        (
            StoreError::ReferenceCatalogDirectoryNotEmpty("project".into()),
            "refusing to create a reference catalog in non-empty directory project",
        ),
        (
            StoreError::ProjectDirectoryNotEmpty("project".into()),
            "refusing to create a Providence project in non-empty directory project",
        ),
        (
            StoreError::ProjectDestinationExists("project".into()),
            "refusing to replace existing Save As destination project",
        ),
        (
            StoreError::ProjectDestinationInsideSource("project".into()),
            "Save As destination must be outside the open project: project",
        ),
        (
            StoreError::InvalidProjectDestination("project".into()),
            "Save As destination must name a project directory whose parent already exists: project",
        ),
    ];
    for (error, expected) in cases {
        assert_eq!(error.to_string(), expected);
    }
}

#[test]
fn payload_errors_distinguish_runtime_classic_and_source_lengths() {
    let cases = [
        (
            StoreError::InvalidBlobId("bad".into()),
            "invalid content-addressed blob id bad",
        ),
        (
            StoreError::BlobDigestMismatch(providence_core::model::BlobId("bad".into())),
            "stored blob bad does not match its digest",
        ),
        (
            StoreError::AssetBlobLengthMismatch {
                asset: "a".into(),
                expected: 2,
                actual: 3,
            },
            "asset 'a' declares 2 bytes but its blob contains 3",
        ),
        (
            StoreError::AssetClassicPayloadLengthMismatch {
                asset: "a".into(),
                expected: 2,
                actual: 3,
            },
            "asset 'a' declares 2 Classic payload bytes but its blob contains 3",
        ),
        (
            StoreError::SourceBlobLengthMismatch {
                native_path: "a".into(),
                expected: 2,
                actual: 3,
            },
            "Classic source 'a' declares 2 bytes but its blob contains 3",
        ),
    ];
    for (error, expected) in cases {
        assert_eq!(error.to_string(), expected);
    }
}

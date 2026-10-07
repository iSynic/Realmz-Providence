use providence_core::{
    compatibility::{classify_classic_slice, classify_classic_slice_with_application},
    compiler::{
        ClassicCompatibilitySources, certify_classic_no_edit_manifest_with_asset_payloads,
        certify_classic_owned_edit_manifest_with_asset_payloads,
    },
    rebuilt::ApplicationMediaCatalog,
    session::EditorSession,
};
use serde_json::{Value, json};
use std::collections::BTreeMap;

pub(super) fn no_edit(
    session: &EditorSession,
    sources: ClassicCompatibilitySources<'_>,
    asset_payloads: &BTreeMap<String, Vec<u8>>,
    source_bytes: &BTreeMap<String, Vec<u8>>,
    application_media: Option<&ApplicationMediaCatalog>,
) -> Result<Value, String> {
    let manifest = certify_classic_no_edit_manifest_with_asset_payloads(
        session.snapshot(),
        sources,
        asset_payloads,
        source_bytes,
    )
    .map_err(|error| error.to_string())?;
    let classification = application_media.map_or_else(
        || classify_classic_slice(session.snapshot()),
        |application_media| {
            classify_classic_slice_with_application(session.snapshot(), application_media)
        },
    );
    let mut blocker_counts = BTreeMap::<String, usize>::new();
    for blocker in classification.blockers {
        *blocker_counts.entry(blocker.code).or_default() += 1;
    }
    let files = manifest
        .files()
        .map(|(name, entry)| {
            let source_blob = session
                .snapshot()
                .classic_sources
                .iter()
                .find(|source| source.native_path == name)
                .map(|source| source.blob.clone());
            json!({
                "name": name,
                "bytes": entry.bytes.len(),
                "sourceBlob": source_blob,
            })
        })
        .collect::<Vec<_>>();
    Ok(json!({
        "revision": session.revision(),
        "exact": true,
        "manifestSha256": manifest.deterministic_sha256(),
        "files": files,
        "publishStatus": classification.status,
        "publishBlockerCounts": blocker_counts,
    }))
}

pub(super) fn owned_edit(
    session: &EditorSession,
    sources: ClassicCompatibilitySources<'_>,
    asset_payloads: &BTreeMap<String, Vec<u8>>,
    source_bytes: &BTreeMap<String, Vec<u8>>,
    application_media: Option<&ApplicationMediaCatalog>,
    params: &Value,
) -> Result<Value, String> {
    let certification = certify_classic_owned_edit_manifest_with_asset_payloads(
        session.snapshot(),
        sources,
        asset_payloads,
        source_bytes,
    )
    .map_err(|error| error.to_string())?;
    let classification = application_media.map_or_else(
        || classify_classic_slice(session.snapshot()),
        |application_media| {
            classify_classic_slice_with_application(session.snapshot(), application_media)
        },
    );
    let mut blocker_counts = BTreeMap::<String, usize>::new();
    for blocker in classification.blockers {
        *blocker_counts.entry(blocker.code).or_default() += 1;
    }
    let limit = params
        .get("limit")
        .and_then(Value::as_u64)
        .unwrap_or(64)
        .clamp(1, 128) as usize;
    let changed_files_total = certification.changed_files.len();
    let changed_files = certification
        .changed_files
        .iter()
        .take(limit)
        .collect::<Vec<_>>();
    Ok(json!({
        "revision": session.revision(),
        "withinDeclaredOwnership": true,
        "manifestSha256": certification.manifest.deterministic_sha256(),
        "fileCount": certification.manifest.files().len(),
        "exactFileCount": certification.exact_file_count,
        "changedFiles": changed_files,
        "changedFilesTotal": changed_files_total,
        "changedFilesTruncated": changed_files_total > limit,
        "fileTransitions": certification.file_transitions.iter().take(limit).collect::<Vec<_>>(),
        "fileTransitionsTotal": certification.file_transitions.len(),
        "resourceEdits": certification.resource_edits.iter().take(limit).collect::<Vec<_>>(),
        "resourceEditsTotal": certification.resource_edits.len(),
        "publishStatus": classification.status,
        "publishBlockerCounts": blocker_counts,
    }))
}

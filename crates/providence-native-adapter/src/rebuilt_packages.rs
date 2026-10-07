use serde::Deserialize;
use std::path::PathBuf;

use crate::rebuilt_export_plan;
use crate::rebuilt_publication::compile_stored_rebuilt_package;
use crate::rebuilt_publication::encode_rebuilt_archive;
use crate::rebuilt_publication::write_rebuilt_archive_bytes;
use crate::rebuilt_publication::write_rebuilt_archive_file;
use providence_application_library::slim::{
    ApplicationPackageIdentity, FinalizedScenarioPackage, PackageFinalizationContext,
    finalize_package_archive,
};
use providence_core::build_identity::asserted_compiler_identity;
use providence_core::compatibility::CompatibilityStatus;
use providence_core::compatibility::classify_rebuilt_v3;
use providence_core::compatibility::classify_rebuilt_v3_with_application;
use providence_core::rebuilt::ApplicationMediaCatalog;
use providence_core::rebuilt::compile_rebuilt_v3_world;
use providence_core::rebuilt::compile_rebuilt_v3_world_with_application;
use providence_core::session::EditorSession;
use providence_core::session::Revision;
use providence_storage::ProjectStore;
use providence_storage::ReferenceLibraryStore;
use serde_json::Value;
use serde_json::json;
use std::collections::BTreeMap;
use std::fs;
use std::path::Path;

pub(crate) fn inspect_rebuilt_package(
    session: &EditorSession,
    store: &ProjectStore,
    configured_application_media: Option<&ApplicationMediaCatalog>,
    params: Value,
) -> Result<Value, String> {
    let params: RebuiltPackageInspection = serde_json::from_value(params)
        .map_err(|error| format!("invalid Rebuilt package inspection parameters: {error}"))?;
    let identity = asserted_compiler_identity(
        params.compiler_commit.as_deref(),
        params.minimum_engine_version.clone(),
    )?;
    with_package_application_media(
        params.application_library_root.as_deref(),
        configured_application_media,
        params.package_finalization.as_ref(),
        |application_media| {
            let selection = crate::classic_rule_selection::prepare(
                session,
                store,
                application_media,
                params.package_finalization.as_ref(),
            )?;
            let snapshot = selection.as_ref().map_or(session.snapshot(), |selection| {
                &selection.effective_snapshot
            });
            let readiness = application_media.map_or_else(
                || classify_rebuilt_v3(snapshot),
                |application_media| {
                    classify_rebuilt_v3_with_application(snapshot, application_media)
                },
            );
            let package = compile_stored_rebuilt_package(
                session,
                store,
                application_media,
                &identity,
                selection.as_ref(),
            )?;
            let finalized = finalize_compiled_package(
                session,
                store,
                application_media,
                &identity,
                params.package_finalization.as_ref(),
                &package,
                &store.root().join(".package-finalization"),
            )?;
            inspection_projection(
                session.revision(),
                &params,
                &package,
                finalized.as_ref(),
                &readiness,
            )
        },
    )
}

fn inspection_projection(
    revision: Revision,
    params: &RebuiltPackageInspection,
    package: &crate::rebuilt_publication::StoredRebuiltPackage,
    finalized: Option<&FinalizedScenarioPackage>,
    readiness: &providence_core::compatibility::TargetCompatibility,
) -> Result<Value, String> {
    let artifact = &package.artifact;
    let manifest = finalized
        .as_ref()
        .map(|package| &package.manifest)
        .unwrap_or(&artifact.manifest.manifest);
    let manifest_bytes = finalized
        .as_ref()
        .map_or(artifact.manifest.canonical_json.len(), |package| {
            package.manifest_bytes.len()
        });
    let files =
        rebuilt_export_plan::page(&manifest.files, manifest_bytes, params.offset, params.limit);
    let document_bytes = |path: &str, compiled_size: usize| {
        manifest
            .files
            .get(path)
            .map_or(compiled_size as u64, |file| file.bytes)
    };
    Ok(json!({
        "revision": revision,
        "kind": manifest.kind,
        "schemaVersion": manifest.schema_version,
        "campaignId": manifest.campaign_id,
        "contentId": manifest.content_id,
        "packageHash": manifest.package_hash,
        "manifestBytes": manifest_bytes,
        "documentBytes": {
            "content.json": document_bytes("content.json", artifact.content.canonical_json.len()),
            "world.json": document_bytes("world.json", artifact.world.canonical_json.len()),
            "scenario.json": document_bytes("scenario.json", artifact.scenario_json.len()),
            "assets/index.json": document_bytes("assets/index.json", artifact.asset_index_json.len()),
        },
        "fileCount": manifest.files.len(),
        "archiveFileCount": manifest.files.len() + 1,
        "files": files,
        "mediaFileCount": manifest.files.keys().filter(|path| path.starts_with("assets/media/")).count(),
        "capabilities": manifest.capabilities,
        "readinessStatus": readiness.status,
        "warningCount": readiness.warnings.len(),
        "finalization": finalized.as_ref().map(|package| package.report.clone()),
    }))
}

pub(crate) fn compile_rebuilt_package(
    session: &EditorSession,
    store: &ProjectStore,
    configured_application_media: Option<&ApplicationMediaCatalog>,
    params: Value,
) -> Result<Value, String> {
    let params: RebuiltPackageCompilation = serde_json::from_value(params)
        .map_err(|error| format!("invalid Rebuilt package compilation parameters: {error}"))?;
    validate_compile_revision(session, params.expected_revision)?;
    let identity = asserted_compiler_identity(
        params.compiler_commit.as_deref(),
        params.minimum_engine_version.clone(),
    )?;
    with_package_application_media(
        params.application_library_root.as_deref(),
        configured_application_media,
        params.package_finalization.as_ref(),
        |application_media| {
            let selection = crate::classic_rule_selection::prepare(
                session,
                store,
                application_media,
                params.package_finalization.as_ref(),
            )?;
            let snapshot = selection.as_ref().map_or(session.snapshot(), |selection| {
                &selection.effective_snapshot
            });
            let readiness = application_media.map_or_else(
                || classify_rebuilt_v3(snapshot),
                |application_media| {
                    classify_rebuilt_v3_with_application(snapshot, application_media)
                },
            );
            require_export_ready(&readiness)?;
            let package = compile_stored_rebuilt_package(
                session,
                store,
                application_media,
                &identity,
                selection.as_ref(),
            )?;
            let finalized = finalize_compiled_package(
                session,
                store,
                application_media,
                &identity,
                params.package_finalization.as_ref(),
                &package,
                params.path.parent().unwrap_or_else(|| Path::new(".")),
            )?;
            publish_package(
                session.revision(),
                &params,
                &package,
                finalized.as_ref(),
                &readiness,
            )
        },
    )
}

fn require_export_ready(
    readiness: &providence_core::compatibility::TargetCompatibility,
) -> Result<(), String> {
    if readiness.status == CompatibilityStatus::Blocked {
        return Err(format!(
            "Rebuilt package compilation is blocked by: {}",
            readiness
                .blockers
                .iter()
                .map(|finding| format!("{}: {}", finding.code, finding.message))
                .collect::<Vec<_>>()
                .join("\n")
        ));
    }
    Ok(())
}

fn validate_compile_revision(
    session: &EditorSession,
    expected_revision: Option<u64>,
) -> Result<(), String> {
    if session.snapshot().classic_rule_selection.is_some() && expected_revision.is_none() {
        return Err(
            "Selected Classic rules require expectedRevision for Rebuilt compilation".into(),
        );
    }
    if let Some(expected_revision) = expected_revision
        && session.revision() != Revision(expected_revision)
    {
        return Err(format!(
            "revision conflict: expected {}, current {}",
            expected_revision,
            session.revision().0
        ));
    }
    Ok(())
}

fn publish_package(
    revision: Revision,
    params: &RebuiltPackageCompilation,
    package: &crate::rebuilt_publication::StoredRebuiltPackage,
    finalized: Option<&FinalizedScenarioPackage>,
    readiness: &providence_core::compatibility::TargetCompatibility,
) -> Result<Value, String> {
    let artifact = &package.artifact;
    let media = &package.media;
    let final_manifest = finalized
        .as_ref()
        .map(|package| &package.manifest)
        .unwrap_or(&artifact.manifest.manifest);
    let output_bytes = if let Some(finalized) = &finalized {
        write_rebuilt_archive_bytes(&params.path, &finalized.bytes)?
    } else {
        write_rebuilt_archive_file(&params.path, artifact, media)?
    };
    Ok(json!({
        "path": params.path,
        "campaignId": final_manifest.campaign_id,
        "contentId": final_manifest.content_id,
        "packageHash": final_manifest.package_hash,
        "bytes": output_bytes,
        "fileCount": final_manifest.files.len() + 1,
        "revision": revision,
        "readinessStatus": readiness.status,
        "warningCount": readiness.warnings.len(),
        "warnings": readiness.warnings.iter().map(|finding| &finding.message).collect::<Vec<_>>(),
        "finalization": finalized.as_ref().map(|package| package.report.clone()),
    }))
}

pub(crate) fn with_application_media<T>(
    explicit_root: Option<&Path>,
    configured: Option<&ApplicationMediaCatalog>,
    callback: impl FnOnce(Option<&ApplicationMediaCatalog>) -> Result<T, String>,
) -> Result<T, String> {
    if let Some(root) = explicit_root {
        let (_, catalog) = ReferenceLibraryStore::open(root).map_err(|error| error.to_string())?;
        callback(Some(&catalog))
    } else {
        callback(configured)
    }
}

pub(crate) fn with_package_application_media<T>(
    explicit_root: Option<&Path>,
    configured: Option<&ApplicationMediaCatalog>,
    finalization: Option<&PackageFinalizationOptions>,
    callback: impl FnOnce(Option<&ApplicationMediaCatalog>) -> Result<T, String>,
) -> Result<T, String> {
    let Some(options) = finalization else {
        return with_application_media(explicit_root, configured, callback);
    };
    let Some(path) = &options.application_media_catalog_path else {
        return with_application_media(explicit_root, configured, callback);
    };
    let catalog: ApplicationMediaCatalog =
        serde_json::from_slice(&fs::read(path).map_err(|error| {
            format!(
                "could not read finalization media catalog {}: {error}",
                path.display()
            )
        })?)
        .map_err(|error| {
            format!(
                "invalid finalization media catalog {}: {error}",
                path.display()
            )
        })?;
    if catalog.library_id.0 != options.application_campaign_id {
        return Err("application package and media catalog library IDs differ".into());
    }
    // Resolve stock references against the destination package's catalog before compilation.
    // The finalizer cannot rewrite application references that have no scenario descriptor.
    callback(Some(&catalog))
}

fn finalize_compiled_package(
    session: &EditorSession,
    store: &ProjectStore,
    application_media: Option<&ApplicationMediaCatalog>,
    identity: &providence_core::rebuilt::RebuiltV3CompilerIdentity,
    options: Option<&PackageFinalizationOptions>,
    package: &crate::rebuilt_publication::StoredRebuiltPackage,
    staging_parent: &Path,
) -> Result<Option<FinalizedScenarioPackage>, String> {
    let Some(options) = options else {
        return Ok(None);
    };
    let context =
        package_finalization_context(session, store, application_media, identity, options)?;
    let source_archive = encode_rebuilt_archive(&package.artifact, &package.media)?;
    let finalize = if session.snapshot().classic_rule_selection.is_some() {
        providence_application_library::slim::finalize_package_archive_with_selected_rules
    } else {
        finalize_package_archive
    };
    finalize(
        &source_archive,
        &context,
        staging_parent,
        "compiled Rebuilt package",
        "finalized Rebuilt package",
    )
    .map(Some)
}

fn package_finalization_context(
    session: &EditorSession,
    store: &ProjectStore,
    application_media: Option<&ApplicationMediaCatalog>,
    identity: &providence_core::rebuilt::RebuiltV3CompilerIdentity,
    options: &PackageFinalizationOptions,
) -> Result<PackageFinalizationContext, String> {
    let configured_media = application_media.ok_or_else(|| {
        "package finalization was requested but no installed application media catalog is available; configure the matching application library".to_string()
    })?;
    let media_catalog = if let Some(path) = &options.application_media_catalog_path {
        let bytes = fs::read(path).map_err(|error| {
            format!(
                "could not read finalization media catalog {}: {error}",
                path.display()
            )
        })?;
        serde_json::from_slice::<ApplicationMediaCatalog>(&bytes).map_err(|error| {
            format!(
                "invalid finalization media catalog {}: {error}",
                path.display()
            )
        })?
    } else {
        configured_media.clone()
    };
    let application_package = fs::read(&options.application_package).map_err(|error| {
        format!(
            "could not read finalization application package {}: {error}",
            options.application_package.display()
        )
    })?;
    let data_caste_path = options
        .classic_application_data_directory
        .join("Data Caste");
    let data_caste = fs::read(&data_caste_path).map_err(|error| {
        format!(
            "package finalization requires Classic application Data Caste at {}: {error}",
            data_caste_path.display()
        )
    })?;
    let scenario_sources = captured_finalization_sources(session, store)?;
    Ok(PackageFinalizationContext {
        application_package,
        application_identity: ApplicationPackageIdentity {
            campaign_id: options.application_campaign_id.clone(),
            package_hash: options.application_package_hash.clone(),
        },
        media_catalog: media_catalog.clone(),
        classic_application_data: BTreeMap::from([("Data Caste".into(), data_caste)]),
        scenario_sources,
        compiler_commit: identity.commit.clone(),
    })
}

fn captured_finalization_sources(
    session: &EditorSession,
    store: &ProjectStore,
) -> Result<BTreeMap<String, Vec<u8>>, String> {
    let mut scenario_sources = BTreeMap::new();
    for source in &session.snapshot().classic_sources {
        let bytes = store.read_blob(&source.blob).map_err(|error| {
            format!(
                "could not read captured Classic source {}: {error}",
                source.native_path
            )
        })?;
        if scenario_sources
            .insert(source.native_path.clone(), bytes)
            .is_some()
        {
            return Err(format!(
                "package finalization found duplicate captured Classic source path '{}'",
                source.native_path
            ));
        }
    }
    Ok(scenario_sources)
}

pub(crate) fn inspect_rebuilt_world_projection(
    snapshot: &providence_core::model::ProjectSnapshot,
    application_media: Option<&ApplicationMediaCatalog>,
) -> Result<Value, String> {
    let artifact = application_media
        .map_or_else(
            || compile_rebuilt_v3_world(snapshot),
            |catalog| compile_rebuilt_v3_world_with_application(snapshot, catalog),
        )
        .map_err(|error| error.to_string())?;
    let document = &artifact.document;
    Ok(json!({
        "kind": document.kind,
        "schemaVersion": document.schema_version,
        "canonicalBytes": artifact.canonical_json.len(),
        "sha256": artifact.sha256,
        "counts": {
            "battleTerrainSets": document.battle_terrain_sets.len(),
            "maps": document.maps.len(),
            "cells": document.maps.iter().map(|map| map.cells.len()).sum::<usize>(),
            "randomRectangles": document.maps.iter().map(|map| map.random_rectangles.len()).sum::<usize>(),
            "triggers": document.triggers.len(),
            "transitions": document.transitions.len(),
            "landLayout": usize::from(document.land_layout.is_some()),
            "playerMaps": document.player_maps.len(),
            "timedEncounters": document.timed_encounters.len(),
        },
        "intentionalEmptySections": [],
    }))
}
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RebuiltPackageInspection {
    pub(crate) compiler_commit: Option<String>,
    pub(crate) minimum_engine_version: String,
    #[serde(default)]
    pub(crate) application_library_root: Option<PathBuf>,
    #[serde(default)]
    pub(crate) package_finalization: Option<PackageFinalizationOptions>,
    #[serde(default)]
    pub(crate) offset: usize,
    #[serde(default = "crate::rebuilt_export_plan::default_limit")]
    pub(crate) limit: usize,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RebuiltPackageCompilation {
    pub(crate) path: PathBuf,
    pub(crate) compiler_commit: Option<String>,
    pub(crate) minimum_engine_version: String,
    #[serde(default)]
    pub(crate) expected_revision: Option<u64>,
    #[serde(default)]
    pub(crate) application_library_root: Option<PathBuf>,
    #[serde(default)]
    pub(crate) package_finalization: Option<PackageFinalizationOptions>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PackageFinalizationOptions {
    pub(crate) application_package: PathBuf,
    pub(crate) application_campaign_id: String,
    pub(crate) application_package_hash: String,
    #[serde(default)]
    pub(crate) application_media_catalog_path: Option<PathBuf>,
    pub(crate) classic_application_data_directory: PathBuf,
}

#[cfg(test)]
mod package_catalog_tests {
    use super::*;
    use providence_core::model::StableId;

    #[test]
    fn compilation_uses_the_explicit_destination_catalog_and_rejects_wrong_library() {
        let temporary = tempfile::tempdir().unwrap();
        let path = temporary.path().join("media.json");
        let editor = ApplicationMediaCatalog::empty(StableId("editor".into()));
        let destination = ApplicationMediaCatalog::empty(StableId("runtime".into()));
        fs::write(&path, serde_json::to_vec(&destination).unwrap()).unwrap();
        let mut options = PackageFinalizationOptions {
            application_package: temporary.path().join("application.realmz2"),
            application_campaign_id: "runtime".into(),
            application_package_hash: "unused-in-catalog-selection".into(),
            application_media_catalog_path: Some(path),
            classic_application_data_directory: temporary.path().into(),
        };
        let selected =
            with_package_application_media(None, Some(&editor), Some(&options), |catalog| {
                Ok(catalog.unwrap().library_id.0.clone())
            })
            .unwrap();
        assert_eq!(selected, "runtime");
        options.application_campaign_id = "different-runtime".into();
        let error =
            with_package_application_media::<()>(None, Some(&editor), Some(&options), |_| {
                panic!("A mismatched catalog must not reach compilation")
            })
            .unwrap_err();
        assert!(error.contains("library IDs differ"));
    }

    #[test]
    fn absent_context_retains_canonical_editor_catalog() {
        let editor = ApplicationMediaCatalog::empty(StableId("editor".into()));
        let selected = with_package_application_media(None, Some(&editor), None, |catalog| {
            Ok(catalog.unwrap().library_id.0.clone())
        })
        .unwrap();
        assert_eq!(selected, "editor");
    }
}

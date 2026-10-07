use providence_core::rebuilt::ApplicationMediaCatalog;
use providence_core::rebuilt::RebuiltV3CompilerIdentity;
use providence_core::rebuilt::RebuiltV3DocumentSetArtifact;
use providence_core::rebuilt::RebuiltV3FileInput;
use providence_core::rebuilt::RebuiltV3ManifestArtifact;
use providence_core::rebuilt::compile_rebuilt_v3_document_set;
use providence_core::rebuilt::compile_rebuilt_v3_document_set_with_application;
use providence_core::rebuilt::project_rebuilt_v3_asset_index;
use providence_core::rebuilt::project_rebuilt_v3_reachable_media_with_application;
use providence_core::rebuilt::project_rebuilt_v3_reachable_runtime;
use providence_core::session::EditorSession;
use providence_rebuilt_package::write_rebuilt_v3_archive;
use providence_storage::ProjectStore;
use std::collections::BTreeMap;
use std::io::Cursor;
use std::path::Path;
use tempfile::NamedTempFile;

pub(crate) fn compile_stored_rebuilt_package(
    session: &EditorSession,
    store: &ProjectStore,
    application_media: Option<&ApplicationMediaCatalog>,
    identity: &RebuiltV3CompilerIdentity,
    selection: Option<&providence_core::rebuilt::ResolvedClassicRules>,
) -> Result<StoredRebuiltPackage, String> {
    let snapshot = selection.map_or(session.snapshot(), |selection| {
        &selection.effective_snapshot
    });
    let selected_assets = if let Some(application_media) = application_media {
        let runtime =
            project_rebuilt_v3_reachable_runtime(snapshot).map_err(|error| error.to_string())?;
        project_rebuilt_v3_reachable_media_with_application(
            snapshot,
            application_media,
            &runtime.scenario,
            &runtime.item_spells.items,
            &runtime.item_spells.spells,
            &runtime.combat.monsters,
            &runtime.rogue_encounters,
            !runtime.combat.battles.is_empty(),
        )
        .map_err(|error| error.to_string())?
        .assets
    } else {
        project_rebuilt_v3_asset_index(snapshot).map_err(|error| error.to_string())?
    };
    let media = read_rebuilt_media_index(store, &selected_assets)?;
    let media_inputs = media
        .iter()
        .map(|(path, bytes)| RebuiltV3FileInput { path, bytes })
        .collect::<Vec<_>>();
    let artifact = if let Some(selection) = selection {
        providence_core::rebuilt::compile_rebuilt_document_set_with_selected_rules(
            selection,
            application_media.ok_or("selected Classic rules require application media")?,
            identity,
            &media_inputs,
        )
    } else if let Some(application_media) = application_media {
        compile_rebuilt_v3_document_set_with_application(
            snapshot,
            application_media,
            identity,
            &media_inputs,
        )
    } else {
        compile_rebuilt_v3_document_set(snapshot, identity, &media_inputs)
    }
    .map_err(|error| error.to_string())?;
    Ok(StoredRebuiltPackage { artifact, media })
}

pub(crate) fn write_rebuilt_archive_file(
    path: &Path,
    artifact: &RebuiltV3DocumentSetArtifact,
    media: &[(String, Vec<u8>)],
) -> Result<u64, String> {
    let mut inputs = vec![
        RebuiltV3FileInput {
            path: "content.json",
            bytes: &artifact.content.canonical_json,
        },
        RebuiltV3FileInput {
            path: "world.json",
            bytes: &artifact.world.canonical_json,
        },
        RebuiltV3FileInput {
            path: "scenario.json",
            bytes: &artifact.scenario_json,
        },
        RebuiltV3FileInput {
            path: "assets/index.json",
            bytes: &artifact.asset_index_json,
        },
    ];
    inputs.extend(
        media
            .iter()
            .map(|(path, bytes)| RebuiltV3FileInput { path, bytes }),
    );

    publish_rebuilt_archive(path, &artifact.manifest, &inputs)
}

pub(crate) fn encode_rebuilt_archive(
    artifact: &RebuiltV3DocumentSetArtifact,
    media: &[(String, Vec<u8>)],
) -> Result<Vec<u8>, String> {
    let mut inputs = vec![
        RebuiltV3FileInput {
            path: "content.json",
            bytes: &artifact.content.canonical_json,
        },
        RebuiltV3FileInput {
            path: "world.json",
            bytes: &artifact.world.canonical_json,
        },
        RebuiltV3FileInput {
            path: "scenario.json",
            bytes: &artifact.scenario_json,
        },
        RebuiltV3FileInput {
            path: "assets/index.json",
            bytes: &artifact.asset_index_json,
        },
    ];
    inputs.extend(
        media
            .iter()
            .map(|(path, bytes)| RebuiltV3FileInput { path, bytes }),
    );
    write_rebuilt_v3_archive(Cursor::new(Vec::new()), &artifact.manifest, &inputs)
        .map(|archive| archive.into_inner())
        .map_err(|error| error.to_string())
}

pub(crate) fn write_rebuilt_archive_bytes(path: &Path, bytes: &[u8]) -> Result<u64, String> {
    if !path
        .extension()
        .and_then(|value| value.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("realmz2"))
    {
        return Err("Rebuilt package output path must end in .realmz2".into());
    }
    if path.exists() {
        return Err(format!(
            "refusing to overwrite existing Rebuilt package {}",
            path.display()
        ));
    }
    let parent = path
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new("."));
    if !parent.is_dir() {
        return Err(format!(
            "Rebuilt package output directory does not exist for {}",
            path.display()
        ));
    }
    let temporary = NamedTempFile::new_in(parent).map_err(|error| {
        format!(
            "could not create temporary Rebuilt package beside {}: {error}",
            path.display()
        )
    })?;
    let mut file = temporary.reopen().map_err(|error| error.to_string())?;
    std::io::Write::write_all(&mut file, bytes).map_err(|error| error.to_string())?;
    file.sync_all().map_err(|error| error.to_string())?;
    drop(file);
    temporary.persist_noclobber(path).map_err(|error| {
        format!(
            "could not publish Rebuilt package {}: {}",
            path.display(),
            error.error
        )
    })?;
    path.metadata()
        .map(|metadata| metadata.len())
        .map_err(|error| error.to_string())
}

pub(crate) fn publish_rebuilt_archive(
    path: &Path,
    manifest: &RebuiltV3ManifestArtifact,
    inputs: &[RebuiltV3FileInput<'_>],
) -> Result<u64, String> {
    if !path
        .extension()
        .and_then(|value| value.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("realmz2"))
    {
        return Err("Rebuilt package output path must end in .realmz2".into());
    }
    if path.exists() {
        return Err(format!(
            "refusing to overwrite existing Rebuilt package {}",
            path.display()
        ));
    }
    let parent = path
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new("."));
    if !parent.is_dir() {
        return Err(format!(
            "Rebuilt package output directory does not exist for {}",
            path.display()
        ));
    }

    let temporary = NamedTempFile::new_in(parent).map_err(|error| {
        format!(
            "could not create temporary Rebuilt package beside {}: {error}",
            path.display()
        )
    })?;
    let file = temporary.reopen().map_err(|error| error.to_string())?;
    let file =
        write_rebuilt_v3_archive(file, manifest, inputs).map_err(|error| error.to_string())?;
    file.sync_all().map_err(|error| error.to_string())?;
    drop(file);
    temporary.persist_noclobber(path).map_err(|error| {
        format!(
            "could not publish Rebuilt package {}: {}",
            path.display(),
            error.error
        )
    })?;
    path.metadata()
        .map(|metadata| metadata.len())
        .map_err(|error| error.to_string())
}

pub(crate) fn read_rebuilt_media_index(
    store: &ProjectStore,
    asset_index: &providence_core::rebuilt::RebuiltV3AssetIndex,
) -> Result<Vec<(String, Vec<u8>)>, String> {
    let mut media = BTreeMap::new();
    for asset in &asset_index.assets {
        media.entry(asset.path.clone()).or_insert_with(|| {
            store.read_blob(&providence_core::model::BlobId(format!(
                "sha256:{}",
                asset.sha256
            )))
        });
    }
    media
        .into_iter()
        .map(|(path, bytes)| {
            bytes
                .map(|bytes| (path, bytes))
                .map_err(|error| error.to_string())
        })
        .collect()
}
pub(crate) struct StoredRebuiltPackage {
    pub(crate) artifact: RebuiltV3DocumentSetArtifact,
    pub(crate) media: Vec<(String, Vec<u8>)>,
}

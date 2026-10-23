//! Source payloads and effective facts are attached only after canonical compilation.
use std::collections::BTreeMap;

use providence_core::{
    compiler::compile_missing_native_family_files,
    model::{BlobId, ClassicSourceBlob, ProjectOrigin, ProjectSnapshot},
    rebuilt::{
        RebuiltV3AssetIndex, RebuiltV3CompilerIdentity, RebuiltV3DocumentSetArtifact,
        RebuiltV3FileInput, ResolvedClassicRules,
        finalize_rebuilt_v7_document_set_with_rule_sources,
        project_rebuilt_v3_native_source_assets, recompile_rebuilt_manifest,
    },
};
use providence_storage::ProjectStore;

use crate::built_native_files::BuiltNativeFile;

pub(super) fn finalize_sources(
    snapshot: &ProjectSnapshot,
    store: &ProjectStore,
    identity: &RebuiltV3CompilerIdentity,
    artifact: &mut RebuiltV3DocumentSetArtifact,
    media: &mut Vec<(String, Vec<u8>)>,
    selection: Option<&ResolvedClassicRules>,
) -> Result<Vec<BuiltNativeFile>, String> {
    let mut source_bytes = read_sources(&snapshot.classic_sources, store)?;
    let (published, built) = with_built_families(snapshot, &mut source_bytes)?;
    let snapshot = published.as_ref();
    if !snapshot.classic_sources.is_empty() {
        attach_sources(snapshot, &source_bytes, artifact, media)?;
        let inputs = document_inputs(artifact, media);
        artifact.manifest =
            recompile_rebuilt_manifest(&artifact.manifest.manifest, identity, &inputs)
                .map_err(|error| error.to_string())?;
    }
    if matches!(snapshot.origin, ProjectOrigin::Imported { .. }) {
        let prepared_rules = read_prepared_rules(snapshot, store)?;
        let inputs = media
            .iter()
            .map(|(path, bytes)| RebuiltV3FileInput { path, bytes })
            .collect::<Vec<_>>();
        finalize_rebuilt_v7_document_set_with_rule_sources(
            artifact,
            snapshot,
            identity,
            &source_bytes,
            &inputs,
            selection,
            &prepared_rules,
        )
        .map_err(|error| error.to_string())?;
    }
    Ok(built)
}

// An imported family the author populated without an original file is built by Classic export's
// encoders and published like a retained file; the project's own source list is unchanged.
fn with_built_families<'a>(
    snapshot: &'a ProjectSnapshot,
    source_bytes: &mut BTreeMap<String, Vec<u8>>,
) -> Result<(std::borrow::Cow<'a, ProjectSnapshot>, Vec<BuiltNativeFile>), String> {
    let mut published = std::borrow::Cow::Borrowed(snapshot);
    if !matches!(snapshot.origin, ProjectOrigin::Imported { .. }) {
        return Ok((published, Vec::new()));
    }
    let sources =
        crate::classic_compilation::compatibility_sources(snapshot, source_bytes, None, None);
    let generated = compile_missing_native_family_files(snapshot, sources)
        .map_err(|error| error.to_string())?;
    let mut built = Vec::with_capacity(generated.len());
    for (path, bytes) in generated {
        let file = BuiltNativeFile::new(path.clone(), &bytes);
        let sources = &mut published.to_mut().classic_sources;
        sources.push(ClassicSourceBlob {
            native_path: path.clone(),
            blob: BlobId(format!("sha256:{}", file.sha256)),
            byte_length: file.byte_length,
        });
        sources.sort_by(|left, right| left.native_path.cmp(&right.native_path));
        built.push(file);
        source_bytes.insert(path, bytes);
    }
    Ok((published, built))
}

fn read_prepared_rules(
    snapshot: &ProjectSnapshot,
    store: &ProjectStore,
) -> Result<BTreeMap<String, Vec<u8>>, String> {
    let mut prepared = BTreeMap::new();
    for (path, blobs) in [
        (
            "Data Race",
            snapshot
                .race_rules
                .iter()
                .filter_map(|row| row.source_blob.as_ref())
                .collect::<std::collections::BTreeSet<_>>(),
        ),
        (
            "Data Caste",
            snapshot
                .caste_rules
                .iter()
                .filter_map(|row| row.source_blob.as_ref())
                .collect(),
        ),
    ] {
        let Some(original) = snapshot
            .classic_sources
            .iter()
            .find(|source| source.native_path == path)
        else {
            continue;
        };
        if blobs.iter().any(|blob| **blob != original.blob) {
            if blobs.len() != 1 {
                return Err(format!("{path} has inconsistent canonical source blobs"));
            }
            let blob = blobs.first().expect("changed family source");
            prepared.insert(
                path.into(),
                store.read_blob(blob).map_err(|error| error.to_string())?,
            );
        }
    }
    Ok(prepared)
}

fn read_sources(
    sources: &[ClassicSourceBlob],
    store: &ProjectStore,
) -> Result<BTreeMap<String, Vec<u8>>, String> {
    let mut bytes = BTreeMap::new();
    for source in sources {
        let payload = store
            .read_blob(&source.blob)
            .map_err(|error| error.to_string())?;
        if bytes.insert(source.native_path.clone(), payload).is_some() {
            return Err(format!(
                "Classic source path {} appears more than once",
                source.native_path
            ));
        }
    }
    Ok(bytes)
}

fn attach_sources(
    snapshot: &ProjectSnapshot,
    source_bytes: &BTreeMap<String, Vec<u8>>,
    artifact: &mut RebuiltV3DocumentSetArtifact,
    media: &mut Vec<(String, Vec<u8>)>,
) -> Result<(), String> {
    let mut assets: RebuiltV3AssetIndex = serde_json::from_slice(&artifact.asset_index_json)
        .map_err(|error| format!("compiled asset index could not be read: {error}"))?;
    let retained = project_rebuilt_v3_native_source_assets(snapshot, source_bytes, &assets.assets)?;
    assets.assets.extend(retained.descriptors);
    assets
        .assets
        .sort_by(|left, right| left.id.0.cmp(&right.id.0));
    if let Some(pair) = assets
        .assets
        .windows(2)
        .find(|pair| pair[0].id == pair[1].id)
    {
        return Err(format!(
            "retained Classic source asset identity {} collides with another package asset",
            pair[0].id.0
        ));
    }
    let value = serde_json::to_value(&assets).map_err(|error| error.to_string())?;
    artifact.asset_index_json = serde_json::to_vec(&value).map_err(|error| error.to_string())?;
    let mut by_path = media.iter().cloned().collect::<BTreeMap<_, _>>();
    for (path, bytes) in retained.payloads {
        if let Some(previous) = by_path.insert(path.clone(), bytes.clone())
            && previous != bytes
        {
            return Err(format!(
                "package media path {path} resolves to different retained payload bytes"
            ));
        }
    }
    *media = by_path.into_iter().collect();
    Ok(())
}

fn document_inputs<'a>(
    artifact: &'a RebuiltV3DocumentSetArtifact,
    media: &'a [(String, Vec<u8>)],
) -> Vec<RebuiltV3FileInput<'a>> {
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
    inputs
}

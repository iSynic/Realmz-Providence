use super::{documents, encoding};
use providence_core::{
    model::{BlobId, ProjectSnapshot},
    rebuilt::{
        RebuiltV3AssetIndex, RebuiltV3CompilerIdentity, RebuiltV3ContentDocument,
        RebuiltV3FileInput, compile_rebuilt_v3_manifest,
    },
};
use providence_rebuilt_package::{inspect_rebuilt_v3_archive, write_rebuilt_v3_archive};
use std::{collections::BTreeMap, io::Cursor};

pub(super) struct Archive {
    pub bytes: Vec<u8>,
    pub package_hash: String,
    pub content_id: String,
}

pub(super) fn build(
    snapshot: &ProjectSnapshot,
    content: &RebuiltV3ContentDocument,
    assets: &RebuiltV3AssetIndex,
    payloads: &BTreeMap<BlobId, Vec<u8>>,
    commit: &str,
) -> Result<Archive, String> {
    let owned_files = owned_files(content, assets, payloads)?;
    let inputs = file_inputs(&owned_files);
    let capabilities = vec![
        "realmz.core.classic-rules-v1".into(),
        "realmz.presentation.content-addressed-media-v1".into(),
        "realmz.presentation.tileset-atlases-v1".into(),
        "realmz.scenario.classic-vm-v1".into(),
        "realmz.world.topology-v2".into(),
    ];
    let manifest = compile_rebuilt_v3_manifest(
        snapshot,
        &RebuiltV3CompilerIdentity {
            version: env!("CARGO_PKG_VERSION").into(),
            commit: commit.to_owned(),
            minimum_engine_version: "0.1.0".into(),
        },
        &capabilities,
        &inputs,
    )
    .map_err(|error| error.to_string())?;
    let archive = write_rebuilt_v3_archive(Cursor::new(Vec::new()), &manifest, &inputs)
        .map_err(|error| error.to_string())?
        .into_inner();
    let inspection = inspect_rebuilt_v3_archive(Cursor::new(&archive))
        .map_err(|error| format!("generated archive failed self-inspection: {error}"))?;
    if inspection.manifest.package_hash != manifest.manifest.package_hash {
        return Err("archive self-inspection changed the package hash".into());
    }
    Ok(Archive {
        bytes: archive,
        package_hash: manifest.manifest.package_hash,
        content_id: manifest.manifest.content_id,
    })
}

fn owned_files(
    content: &RebuiltV3ContentDocument,
    assets: &RebuiltV3AssetIndex,
    payloads: &BTreeMap<BlobId, Vec<u8>>,
) -> Result<Vec<(String, Vec<u8>)>, String> {
    let content_json = encoding::canonical(content)?;
    let world_json = encoding::canonical(&documents::application_world())?;
    let scenario_json = encoding::canonical(&documents::scenario())?;
    let asset_index_json = encoding::canonical(assets)?;
    let mut owned_files = vec![
        ("content.json".to_string(), content_json),
        ("world.json".to_string(), world_json),
        ("scenario.json".to_string(), scenario_json),
        ("assets/index.json".to_string(), asset_index_json),
    ];
    add_media(&mut owned_files, assets, payloads)?;
    owned_files.sort_by(|left, right| left.0.cmp(&right.0));
    Ok(owned_files)
}

fn add_media(
    owned_files: &mut Vec<(String, Vec<u8>)>,
    assets: &RebuiltV3AssetIndex,
    payloads: &BTreeMap<BlobId, Vec<u8>>,
) -> Result<(), String> {
    let asset_paths = assets
        .assets
        .iter()
        .map(|asset| (asset.sha256.as_str(), asset.path.as_str()))
        .collect::<BTreeMap<_, _>>();
    for (blob, payload) in payloads {
        let digest = blob
            .0
            .strip_prefix("sha256:")
            .ok_or("invalid runtime blob")?;
        let path = asset_paths
            .get(digest)
            .ok_or_else(|| format!("runtime blob {digest} has no asset path"))?;
        owned_files.push(((*path).to_string(), payload.clone()));
    }

    Ok(())
}

fn file_inputs(files: &[(String, Vec<u8>)]) -> Vec<RebuiltV3FileInput<'_>> {
    files
        .iter()
        .map(|(path, bytes)| RebuiltV3FileInput {
            path: path.as_str(),
            bytes,
        })
        .collect()
}

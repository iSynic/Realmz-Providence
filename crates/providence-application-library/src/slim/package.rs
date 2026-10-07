use super::{
    archive::{read_archive_files, validate_legacy_files},
    encoding::canonical,
    native_sources::{read, write},
};
use providence_core::rebuilt::{
    RebuiltV3AssetIndex, RebuiltV3CompilerIdentity, RebuiltV3FileInput, RebuiltV3Manifest,
    recompile_rebuilt_manifest,
};
use providence_rebuilt_package::write_rebuilt_v3_archive;
use serde::de::DeserializeOwned;
use serde_json::Value;
use std::{
    collections::{BTreeMap, BTreeSet},
    io::Cursor,
    path::Path,
};

pub(super) struct ScenarioPackage {
    pub(super) source_bytes: Vec<u8>,
    pub(super) source_manifest: RebuiltV3Manifest,
    pub(super) files: BTreeMap<String, Vec<u8>>,
    pub(super) content: Value,
    pub(super) assets: RebuiltV3AssetIndex,
    pub(super) world: Value,
    pub(super) scenario: Value,
}

impl ScenarioPackage {
    pub(super) fn read(source_path: &Path, application_id: &str) -> Result<Self, String> {
        let source_bytes = read(source_path)?;
        let mut files = read_archive_files(&source_bytes)?;
        let manifest_bytes = files
            .remove("manifest.json")
            .ok_or_else(|| format!("{} has no manifest.json", source_path.display()))?;
        let source_manifest: RebuiltV3Manifest =
            serde_json::from_slice(&manifest_bytes).map_err(|error| {
                format!("{} has an invalid manifest: {error}", source_path.display())
            })?;
        validate_legacy_files(&source_manifest, &files)?;
        if source_manifest.campaign_id.0 == application_id {
            return Err(format!(
                "{} is an application package",
                source_path.display()
            ));
        }
        let content = json_member(&files, "content.json")?;
        let assets = json_member(&files, "assets/index.json")?;
        let world = json_member(&files, "world.json")?;
        let scenario = json_member(&files, "scenario.json")?;
        Ok(Self {
            source_bytes,
            source_manifest,
            files,
            content,
            assets,
            world,
            scenario,
        })
    }

    pub(super) fn write(
        &mut self,
        output_path: &Path,
        commit: &str,
    ) -> Result<Publication, String> {
        let retained_media_paths = self.encode_members()?;
        let removed_media_payloads = self.prune_unreferenced_media(&retained_media_paths);
        let inputs = self
            .files
            .iter()
            .map(|(path, bytes)| RebuiltV3FileInput { path, bytes })
            .collect::<Vec<_>>();
        let manifest = recompile_rebuilt_manifest(
            &self.source_manifest,
            &RebuiltV3CompilerIdentity {
                version: env!("CARGO_PKG_VERSION").into(),
                commit: commit.into(),
                minimum_engine_version: self.source_manifest.engine.minimum_version.clone(),
            },
            &inputs,
        )
        .map_err(|error| error.to_string())?;
        let output = write_rebuilt_v3_archive(Cursor::new(Vec::new()), &manifest, &inputs)
            .map_err(|error| error.to_string())?
            .into_inner();
        let mut output_files = read_archive_files(&output)?;
        let output_manifest_bytes = output_files
            .remove("manifest.json")
            .ok_or_else(|| "slimmed archive has no manifest.json".to_string())?;
        if output_manifest_bytes != manifest.canonical_json {
            return Err("slimmed archive changed manifest.json".into());
        }
        validate_legacy_files(&manifest.manifest, &output_files)?;
        write(output_path, &output)?;
        Ok(Publication {
            output,
            manifest: manifest.manifest,
            media_payloads: retained_media_paths.len(),
            removed_media_payloads,
        })
    }

    fn encode_members(&mut self) -> Result<BTreeSet<String>, String> {
        self.files
            .insert("content.json".into(), canonical(&self.content)?);
        self.files
            .insert("world.json".into(), canonical(&self.world)?);
        self.files
            .insert("scenario.json".into(), canonical(&self.scenario)?);
        self.files
            .insert("assets/index.json".into(), canonical(&self.assets)?);
        Ok(self
            .assets
            .assets
            .iter()
            .map(|asset| asset.path.clone())
            .collect())
    }

    fn prune_unreferenced_media(&mut self, retained: &BTreeSet<String>) -> usize {
        let prior_media = self
            .files
            .keys()
            .filter(|path| path.starts_with("assets/media/"))
            .cloned()
            .collect::<Vec<_>>();
        let mut removed = 0;
        for path in prior_media {
            if !retained.contains(&path) {
                self.files.remove(&path);
                removed += 1;
            }
        }
        removed
    }
}

fn json_member<T: DeserializeOwned>(
    files: &BTreeMap<String, Vec<u8>>,
    path: &str,
) -> Result<T, String> {
    let bytes = files
        .get(path)
        .ok_or_else(|| format!("source package has no {path}"))?;
    serde_json::from_slice(bytes).map_err(|error| format!("source {path} is invalid: {error}"))
}

pub(super) struct Publication {
    pub(super) output: Vec<u8>,
    pub(super) manifest: RebuiltV3Manifest,
    pub(super) media_payloads: usize,
    pub(super) removed_media_payloads: usize,
}

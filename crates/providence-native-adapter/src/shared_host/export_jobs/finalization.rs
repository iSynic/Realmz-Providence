//! Explicit support is copied from bounded reads, never rediscovered during compilation.
use crate::rebuilt_packages::PackageFinalizationOptions;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::Read,
    path::{Path, PathBuf},
};

pub(super) struct Captured {
    options: PackageFinalizationOptions,
    files: Vec<Input>,
}
struct Input {
    path: PathBuf,
    name: &'static str,
    bytes: Vec<u8>,
    limit: usize,
}

impl Captured {
    pub fn read(params: &Value) -> Result<Option<Self>, String> {
        let Some(value) = params.get("packageFinalization") else {
            return Ok(None);
        };
        let options: PackageFinalizationOptions = serde_json::from_value(value.clone())
            .map_err(|error| format!("invalid-input: package finalization: {error}"))?;
        let mut files = vec![
            input(
                &options.application_package,
                "application.realmz2",
                128 * 1024 * 1024,
            )?,
            input(
                &options
                    .classic_application_data_directory
                    .join("Data Caste"),
                "Data Caste",
                1024 * 1024,
            )?,
        ];
        if let Some(path) = &options.application_media_catalog_path {
            files.push(input(path, "media.json", 16 * 1024 * 1024)?);
        }
        Ok(Some(Self { options, files }))
    }
    pub fn provenance(&self) -> Value {
        json!({"applicationCampaignId":self.options.application_campaign_id,
            "applicationPackageHash":self.options.application_package_hash,
            "files":self.files.iter().map(|file| json!({"path":file.path,"bytes":file.bytes.len(),
                "sha256":format!("{:x}",Sha256::digest(&file.bytes))})).collect::<Vec<_>>()})
    }
    pub fn stage(&self, root: &Path) -> Result<PackageFinalizationOptions, String> {
        let root = root.join("support");
        fs::create_dir(&root).map_err(|error| error.to_string())?;
        for file in &self.files {
            fs::write(root.join(file.name), &file.bytes).map_err(|error| error.to_string())?;
        }
        let mut options = self.options.clone();
        options.application_package = root.join("application.realmz2");
        options.classic_application_data_directory = root.clone();
        options.application_media_catalog_path = options
            .application_media_catalog_path
            .map(|_| root.join("media.json"));
        Ok(options)
    }
    pub fn check_current(&self) -> Result<(), String> {
        for original in &self.files {
            let current = input(&original.path, original.name, original.limit)?;
            if current.bytes != original.bytes {
                return Err("application-support-changed: explicit finalization input changed; no publication attempted".into());
            }
        }
        Ok(())
    }
}
fn input(path: &Path, name: &'static str, limit: usize) -> Result<Input, String> {
    let metadata =
        fs::symlink_metadata(path).map_err(|error| format!("finalization-input: {error}"))?;
    if !metadata.file_type().is_file() || metadata.len() > limit as u64 {
        return Err(format!(
            "finalization-input: {name} must be a regular file within {limit} bytes"
        ));
    }
    let mut bytes = Vec::new();
    fs::File::open(path)
        .map_err(|error| error.to_string())?
        .take(limit as u64 + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| error.to_string())?;
    if bytes.len() > limit {
        return Err("finalization-input: input grew beyond its byte limit".into());
    }
    Ok(Input {
        path: path.into(),
        name,
        bytes,
        limit,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn staged_support_is_exact_and_changed_source_blocks_publication() {
        let root = tempfile::tempdir().unwrap();
        fs::write(root.path().join("app.realmz2"), b"archive").unwrap();
        fs::write(root.path().join("Data Caste"), b"caste").unwrap();
        fs::write(root.path().join("catalog.json"), b"catalog").unwrap();
        let params = json!({"packageFinalization":{
            "applicationPackage":root.path().join("app.realmz2"),
            "applicationCampaignId":"library","applicationPackageHash":"a".repeat(64),
            "applicationMediaCatalogPath":root.path().join("catalog.json"),
            "classicApplicationDataDirectory":root.path()
        }});
        let captured = Captured::read(&params).unwrap().unwrap();
        captured.check_current().unwrap();
        let stage = tempfile::tempdir().unwrap();
        let options = captured.stage(stage.path()).unwrap();
        assert_eq!(fs::read(options.application_package).unwrap(), b"archive");
        assert_eq!(captured.provenance()["files"].as_array().unwrap().len(), 3);
        fs::write(root.path().join("app.realmz2"), b"changed").unwrap();
        assert!(
            captured
                .check_current()
                .unwrap_err()
                .contains("application-support-changed")
        );
        assert_eq!(
            fs::read(stage.path().join("support/application.realmz2")).unwrap(),
            b"archive"
        );
    }
    #[test]
    fn support_input_limits_and_closed_options_are_enforced() {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("too-large");
        fs::File::create(&path).unwrap().set_len(9).unwrap();
        assert!(input(&path, "bounded", 8).is_err());
        assert!(Captured::read(&json!({"packageFinalization":{"unknown":true}})).is_err());
        assert!(Captured::read(&json!({})).unwrap().is_none());
    }
}

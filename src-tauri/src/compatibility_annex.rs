use crate::error::{IoPath, ProvidenceError, Result};
use crate::importer::RAW_SOURCES_DIR;
use crate::project::ProvidenceProject;
use std::collections::BTreeMap;
use std::fs;
use std::path::{Component, Path, PathBuf};
use walkdir::WalkDir;

#[derive(Debug)]
pub(crate) struct CompatibilityAnnex {
    root: PathBuf,
}

#[derive(Debug, Default)]
pub(crate) struct CompatibilityAnnexSnapshot {
    files: BTreeMap<String, Vec<u8>>,
}

impl CompatibilityAnnex {
    pub(crate) fn for_project(
        project_dir: &Path,
        project: &ProvidenceProject,
    ) -> Result<Option<Self>> {
        if !project.source.requires_compatibility_annex() {
            return Ok(None);
        }
        let directory = if project.source.raw_sources_dir.trim().is_empty() {
            RAW_SOURCES_DIR
        } else {
            project.source.raw_sources_dir.as_str()
        };
        let root = project_dir.join(directory);
        if !root.is_dir() {
            return Err(ProvidenceError::message(format!(
                "Missing raw source snapshot: {}",
                root.display()
            )));
        }
        Ok(Some(Self { root }))
    }

    #[cfg(test)]
    pub(crate) fn from_root(root: impl Into<PathBuf>) -> Self {
        Self { root: root.into() }
    }

    pub(crate) fn snapshot(&self) -> Result<CompatibilityAnnexSnapshot> {
        let mut files = BTreeMap::new();
        for entry in WalkDir::new(&self.root).min_depth(1) {
            let entry = entry.map_err(|error| ProvidenceError::message(error.to_string()))?;
            if entry.file_type().is_file() {
                let path = entry.path();
                let relative = path
                    .strip_prefix(&self.root)
                    .map_err(|error| ProvidenceError::message(error.to_string()))?;
                let key = normalize_relative_path(&relative.to_string_lossy())?;
                files.insert(key, fs::read(path).with_path(path)?);
            }
        }
        Ok(CompatibilityAnnexSnapshot { files })
    }
}

impl CompatibilityAnnexSnapshot {
    pub(crate) fn contains(&self, relative_path: &str) -> Result<bool> {
        Ok(self
            .files
            .contains_key(&normalize_relative_path(relative_path)?))
    }

    pub(crate) fn read(&self, relative_path: &str) -> Result<Option<Vec<u8>>> {
        Ok(self
            .files
            .get(&normalize_relative_path(relative_path)?)
            .cloned())
    }

    pub(crate) fn top_level_files(&self) -> Vec<(String, Vec<u8>)> {
        self.files
            .iter()
            .filter(|(name, _)| !name.contains('/'))
            .map(|(name, bytes)| (name.clone(), bytes.clone()))
            .collect()
    }
}

fn normalize_relative_path(relative_path: &str) -> Result<String> {
    let relative = Path::new(relative_path);
    if relative.components().any(|component| {
        matches!(
            component,
            Component::ParentDir | Component::RootDir | Component::Prefix(_)
        )
    }) {
        return Err(ProvidenceError::message(format!(
            "Compatibility annex path must stay relative: {relative_path}"
        )));
    }
    Ok(relative
        .components()
        .filter_map(|component| match component {
            Component::Normal(value) => Some(value.to_string_lossy()),
            _ => None,
        })
        .collect::<Vec<_>>()
        .join("/"))
}

#[cfg(test)]
mod tests {
    use super::CompatibilityAnnex;

    #[test]
    fn rejects_paths_outside_the_annex_root() {
        let temp = tempfile::tempdir().unwrap();
        let annex = CompatibilityAnnex::from_root(temp.path());
        let snapshot = annex.snapshot().unwrap();

        let error = snapshot
            .read("../outside")
            .expect_err("annex traversal must be rejected");

        assert!(error
            .to_string()
            .contains("Compatibility annex path must stay relative"));
    }
}

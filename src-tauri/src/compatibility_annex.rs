use crate::error::{IoPath, ProvidenceError, Result};
use crate::importer::RAW_SOURCES_DIR;
use crate::project::ProvidenceProject;
use std::fs;
use std::path::{Component, Path, PathBuf};
use walkdir::WalkDir;

#[derive(Debug)]
pub(crate) struct CompatibilityAnnex {
    root: PathBuf,
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

    fn path(&self, relative_path: &str) -> Result<PathBuf> {
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
        Ok(self.root.join(relative))
    }

    pub(crate) fn contains(&self, relative_path: &str) -> Result<bool> {
        Ok(self.path(relative_path)?.is_file())
    }

    pub(crate) fn read(&self, relative_path: &str) -> Result<Option<Vec<u8>>> {
        let path = self.path(relative_path)?;
        if !path.is_file() {
            return Ok(None);
        }
        fs::read(&path).with_path(&path).map(Some)
    }

    pub(crate) fn top_level_files(&self) -> Result<Vec<(String, Vec<u8>)>> {
        let mut files = Vec::new();
        for entry in WalkDir::new(&self.root).max_depth(1).min_depth(1) {
            let entry = entry.map_err(|error| ProvidenceError::message(error.to_string()))?;
            if entry.file_type().is_file() {
                let path = entry.path();
                files.push((
                    entry.file_name().to_string_lossy().to_string(),
                    fs::read(path).with_path(path)?,
                ));
            }
        }
        files.sort_by(|left, right| left.0.cmp(&right.0));
        Ok(files)
    }
}

#[cfg(test)]
mod tests {
    use super::CompatibilityAnnex;

    #[test]
    fn rejects_paths_outside_the_annex_root() {
        let temp = tempfile::tempdir().unwrap();
        let annex = CompatibilityAnnex::from_root(temp.path());

        let error = annex
            .read("../outside")
            .expect_err("annex traversal must be rejected");

        assert!(error
            .to_string()
            .contains("Compatibility annex path must stay relative"));
    }
}

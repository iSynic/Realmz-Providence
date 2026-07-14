use crate::error::{IoPath, ProvidenceError, Result};
use crate::importer::{open_project, save_project, scenario_id};
use crate::project::ProvidenceProject;
use std::collections::HashSet;
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use zip::{CompressionMethod, ZipArchive};

const MAX_PACKAGE_BYTES: u64 = 512 * 1024 * 1024;
const MAX_PACKAGE_ENTRIES: usize = 100_000;

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenedProjectPackage {
    pub project_dir: String,
    pub project: ProvidenceProject,
}

#[derive(Debug)]
struct PackageEntry {
    relative_path: PathBuf,
    bytes: Vec<u8>,
}

pub fn open_project_package(
    package_path: impl AsRef<Path>,
    project_root: impl AsRef<Path>,
) -> Result<OpenedProjectPackage> {
    let package_path = package_path.as_ref();
    let project_root = project_root.as_ref();
    let metadata = fs::metadata(package_path).with_path(package_path)?;
    if metadata.len() > MAX_PACKAGE_BYTES {
        return Err(ProvidenceError::message(format!(
            "{} is too large to be a Providence project package",
            package_path.display()
        )));
    }

    let (root_name, entries) = read_project_package(package_path)?;
    fs::create_dir_all(project_root).with_path(project_root)?;
    let project_dir = project_root.join(&root_name);
    if project_dir.exists() {
        return Err(ProvidenceError::message(format!(
            "A project already exists at {}. Open its project.json, or move it before reopening this package.",
            project_dir.display()
        )));
    }

    let temporary_dir = create_temporary_project_dir(project_root)?;
    let result = (|| {
        for entry in entries {
            let target = temporary_dir.join(&entry.relative_path);
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent).with_path(parent)?;
            }
            fs::write(&target, entry.bytes).with_path(&target)?;
        }

        let mut project = open_project(&temporary_dir)?;
        if project.scenario.id.trim().is_empty() {
            project.scenario.id = scenario_id(&project.scenario.name);
        }
        project.scenario.project_path = project_dir.to_string_lossy().to_string();
        save_project(&temporary_dir, &project)?;
        fs::rename(&temporary_dir, &project_dir).with_path(&project_dir)?;
        Ok(OpenedProjectPackage {
            project_dir: project_dir.to_string_lossy().to_string(),
            project,
        })
    })();

    if result.is_err() {
        let _ = fs::remove_dir_all(&temporary_dir);
    }
    result
}

fn create_temporary_project_dir(project_root: &Path) -> Result<PathBuf> {
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    for attempt in 0..100 {
        let candidate = project_root.join(format!(
            ".providence-import-{}-{nonce}-{attempt}",
            std::process::id()
        ));
        match fs::create_dir(&candidate) {
            Ok(()) => return Ok(candidate),
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(source) => {
                return Err(ProvidenceError::Io {
                    path: candidate,
                    source,
                })
            }
        }
    }
    Err(ProvidenceError::message(
        "Unable to allocate a temporary project-package directory",
    ))
}

fn read_project_package(package_path: &Path) -> Result<(String, Vec<PackageEntry>)> {
    let package = fs::File::open(package_path).with_path(package_path)?;
    let mut archive = ZipArchive::new(package)
        .map_err(|error| package_error(format!("Invalid ZIP package: {error}")))?;
    if archive.is_empty() || archive.len() > MAX_PACKAGE_ENTRIES {
        return Err(package_error("The ZIP has an invalid entry count"));
    }

    let mut root_name: Option<String> = None;
    let mut entries = Vec::new();
    let mut paths = HashSet::new();
    let mut found_project_json = false;
    let mut extracted_bytes = 0u64;

    for index in 0..archive.len() {
        let mut entry = archive
            .by_index(index)
            .map_err(|error| package_error(format!("Unable to read ZIP entry: {error}")))?;
        let package_path = std::str::from_utf8(entry.name_raw())
            .map_err(|_| package_error("Project package paths must be UTF-8"))?
            .to_string();
        if entry.enclosed_name().is_none() {
            return Err(package_error("The ZIP contains an unsafe path"));
        }
        let (entry_root, relative_path) = validate_package_path(&package_path)?;
        if let Some(existing) = &root_name {
            if !existing.eq_ignore_ascii_case(&entry_root) {
                return Err(package_error(
                    "A Providence project package must contain one .providence root folder",
                ));
            }
        } else {
            root_name = Some(entry_root);
        }
        let Some(relative_path) = relative_path else {
            continue;
        };

        if entry.encrypted() {
            return Err(package_error("Encrypted ZIP entries are not supported"));
        }
        if entry.is_symlink() {
            return Err(package_error("ZIP symlink entries are not supported"));
        }
        if entry.compression() != CompressionMethod::Stored {
            return Err(package_error(
                "Providence project packages must use stored ZIP entries",
            ));
        }
        extracted_bytes = extracted_bytes
            .checked_add(entry.size())
            .ok_or_else(|| package_error("The project package is too large"))?;
        if extracted_bytes > MAX_PACKAGE_BYTES {
            return Err(package_error("The project package is too large"));
        }

        let path_key = relative_path.to_string_lossy().to_ascii_lowercase();
        if !paths.insert(path_key) {
            return Err(package_error(format!(
                "Project package contains duplicate path '{}'",
                relative_path.display()
            )));
        }
        if relative_path == Path::new("project.json") {
            found_project_json = true;
        }
        let mut entry_bytes = Vec::with_capacity(entry.size() as usize);
        entry.read_to_end(&mut entry_bytes).map_err(|error| {
            package_error(format!(
                "Unable to read ZIP entry '{package_path}': {error}"
            ))
        })?;
        if entry_bytes.len() as u64 != entry.size() {
            return Err(package_error(format!(
                "ZIP entry '{package_path}' has an invalid size"
            )));
        }
        entries.push(PackageEntry {
            relative_path,
            bytes: entry_bytes,
        });
    }

    let root_name = root_name.ok_or_else(|| package_error("The ZIP is empty"))?;
    if !root_name.to_ascii_lowercase().ends_with(".providence") || !found_project_json {
        return Err(package_error(
            "This ZIP is not a Providence project package; project.json was not found under a .providence root folder",
        ));
    }
    Ok((root_name, entries))
}

fn validate_package_path(path: &str) -> Result<(String, Option<PathBuf>)> {
    if path.is_empty() || path.starts_with('/') || path.contains('\\') || path.contains('\0') {
        return Err(package_error("The ZIP contains an unsafe path"));
    }
    let is_directory = path.ends_with('/');
    let trimmed = path.trim_end_matches('/');
    let parts = trimmed.split('/').collect::<Vec<_>>();
    if parts.is_empty()
        || parts
            .iter()
            .any(|part| part.is_empty() || *part == "." || *part == ".." || part.contains(':'))
    {
        return Err(package_error("The ZIP contains an unsafe path"));
    }
    let root = parts[0].to_string();
    if parts.len() == 1 {
        if is_directory {
            return Ok((root, None));
        }
        return Err(package_error(
            "Project package files must be inside a .providence root folder",
        ));
    }
    if is_directory {
        return Ok((root, None));
    }
    let mut relative_path = PathBuf::new();
    for part in &parts[1..] {
        relative_path.push(part);
    }
    Ok((root, Some(relative_path)))
}

fn package_error(message: impl Into<String>) -> ProvidenceError {
    ProvidenceError::message(message)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::importer::create_project;
    use std::io::{Cursor, Write};
    use zip::write::SimpleFileOptions;
    use zip::ZipWriter;

    #[test]
    fn opens_stored_project_package_without_overwriting_existing_projects() {
        let temp = tempfile::tempdir().expect("tempdir");
        let source_dir = temp.path().join("source.providence");
        create_project("Packaged Project".to_string(), &source_dir).expect("create project");
        let project_json = fs::read(source_dir.join("project.json")).expect("project json");
        let package = stored_zip(&[(
            "Packaged Project.providence/project.json",
            project_json.as_slice(),
        )]);
        let package_path = temp.path().join("Packaged Project.providence.zip");
        fs::write(&package_path, package).expect("write package");
        let project_root = temp.path().join("projects");

        let opened = open_project_package(&package_path, &project_root).expect("open package");
        assert_eq!(opened.project.scenario.name, "Packaged Project");
        assert!(Path::new(&opened.project_dir)
            .join("project.json")
            .is_file());
        assert_eq!(opened.project.scenario.project_path, opened.project_dir);

        let error = open_project_package(&package_path, &project_root)
            .expect_err("existing project should not be overwritten");
        assert!(error.to_string().contains("already exists"));
    }

    #[test]
    fn rejects_non_project_and_traversal_packages() {
        let temp = tempfile::tempdir().expect("tempdir");
        let package_path = temp.path().join("candidate.zip");
        let non_project = stored_zip(&[("Exported Scenario/Data LD", b"not a project")]);
        fs::write(&package_path, non_project).expect("write package");
        let error = read_project_package(&package_path).expect_err("non-project zip");
        assert!(error
            .to_string()
            .contains("not a Providence project package"));

        let traversal = stored_zip(&[
            ("Bad.providence/project.json", b"{}"),
            ("Bad.providence/../escape.txt", b"escape"),
        ]);
        fs::write(&package_path, traversal).expect("replace package");
        let error = read_project_package(&package_path).expect_err("traversal zip");
        assert!(error.to_string().contains("unsafe path"));
    }

    #[test]
    fn opens_configured_project_package_fixture() {
        let Some(package_path) = std::env::var_os("PROVIDENCE_PROJECT_PACKAGE_FIXTURE") else {
            eprintln!(
                "Skipping project-package fixture; PROVIDENCE_PROJECT_PACKAGE_FIXTURE is unset."
            );
            return;
        };
        let temp = tempfile::tempdir().expect("tempdir");
        let opened =
            open_project_package(PathBuf::from(package_path), temp.path().join("projects"))
                .expect("open configured project package");
        assert!(!opened.project.scenario.name.trim().is_empty());
        assert!(Path::new(&opened.project_dir)
            .join("project.json")
            .is_file());
    }

    fn stored_zip(entries: &[(&str, &[u8])]) -> Vec<u8> {
        let mut writer = ZipWriter::new(Cursor::new(Vec::new()));
        let options = SimpleFileOptions::default().compression_method(CompressionMethod::Stored);
        for (path, bytes) in entries {
            writer.start_file(*path, options).expect("start ZIP entry");
            writer.write_all(bytes).expect("write ZIP entry");
        }
        writer.finish().expect("finish ZIP").into_inner()
    }
}

use crate::error::{IoPath, Result};
use crate::resource_fork::{parse_resource_fork_entries, ResourceForkEntry};
use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

pub(crate) fn roots() -> Vec<PathBuf> {
    let mut roots = vec![
        Path::new("public")
            .join("bundled-libraries")
            .join("realmz-reference"),
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("public")
            .join("bundled-libraries")
            .join("realmz-reference"),
        Path::new("bundled-libraries").join("realmz-reference"),
    ];
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            roots.push(parent.join("bundled-libraries").join("realmz-reference"));
            roots.push(
                parent
                    .join("resources")
                    .join("bundled-libraries")
                    .join("realmz-reference"),
            );
        }
    }
    let mut seen = BTreeSet::new();
    roots
        .into_iter()
        .filter(|path| seen.insert(path.to_string_lossy().to_string()))
        .collect()
}

pub(crate) fn resources(
    resource_type: &str,
    wanted: &BTreeSet<i16>,
) -> Result<BTreeMap<i16, ResourceForkEntry>> {
    let mut found = BTreeMap::new();
    if wanted.is_empty() {
        return Ok(found);
    }
    for root in roots() {
        if !root.is_dir() {
            continue;
        }
        let mut files = WalkDir::new(&root)
            .into_iter()
            .filter_map(std::result::Result::ok)
            .filter(|entry| entry.file_type().is_file())
            .map(|entry| entry.into_path())
            .collect::<Vec<_>>();
        files.sort();
        for path in files {
            let bytes = fs::read(&path).with_path(&path)?;
            for resource in parse_resource_fork_entries(&bytes) {
                if resource.resource_type == resource_type
                    && wanted.contains(&resource.id)
                    && !found.contains_key(&resource.id)
                {
                    found.insert(resource.id, resource);
                }
            }
            if found.len() == wanted.len() {
                return Ok(found);
            }
        }
    }
    Ok(found)
}

pub(crate) fn resource_ids(resource_type: &str, wanted: &BTreeSet<i16>) -> Result<BTreeSet<i16>> {
    Ok(resources(resource_type, wanted)?.into_keys().collect())
}

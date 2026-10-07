use super::encoding::sha256;
use providence_core::{
    codecs::parse_resource_entries_preserving_duplicates, model::ClassicResourceKey,
};
use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    path::Path,
};

pub(super) fn read(path: &Path) -> Result<Vec<u8>, String> {
    fs::read(path).map_err(|error| format!("could not read {}: {error}", path.display()))
}

pub(super) fn write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    if path.exists() {
        return Err(format!("refusing to overwrite {}", path.display()));
    }
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("could not create {}: {error}", parent.display()))?;
    }
    fs::write(path, bytes).map_err(|error| format!("could not write {}: {error}", path.display()))
}

pub(super) fn read_native_files(root: &Path) -> Result<BTreeMap<String, Vec<u8>>, String> {
    fn visit(
        root: &Path,
        directory: &Path,
        depth: usize,
        files: &mut BTreeMap<String, Vec<u8>>,
    ) -> Result<(), String> {
        if depth > 8 {
            return Err(format!(
                "Classic source nesting exceeds the limit: {}",
                root.display()
            ));
        }
        let mut entries = fs::read_dir(directory)
            .map_err(|error| format!("could not read {}: {error}", directory.display()))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| error.to_string())?;
        entries.sort_by_key(|entry| entry.file_name());
        for entry in entries {
            let kind = entry.file_type().map_err(|error| error.to_string())?;
            if kind.is_symlink() {
                return Err(format!(
                    "Classic source contains a symbolic link: {}",
                    entry.path().display()
                ));
            }
            if kind.is_dir() {
                visit(root, &entry.path(), depth + 1, files)?;
            } else if kind.is_file() {
                let relative = entry
                    .path()
                    .strip_prefix(root)
                    .map_err(|error| error.to_string())?
                    .to_str()
                    .ok_or_else(|| {
                        format!(
                            "Classic source path is not portable: {}",
                            entry.path().display()
                        )
                    })?
                    .to_string();
                files.insert(relative, read(&entry.path())?);
            } else {
                return Err(format!(
                    "unsupported Classic source type: {}",
                    entry.path().display()
                ));
            }
        }
        Ok(())
    }

    let mut files = BTreeMap::new();
    visit(root, root, 0, &mut files)?;
    Ok(files)
}

pub(super) fn scenario_resource_keys(
    path: &Path,
) -> Result<(BTreeSet<ClassicResourceKey>, Option<String>), String> {
    if !path.is_file() {
        return Ok((BTreeSet::new(), None));
    }
    let bytes = read(path)?;
    let keys = resource_keys_from_bytes(&bytes)
        .map_err(|error| format!("could not inspect {}: {error}", path.display()))?;
    Ok((keys, Some(sha256(&bytes))))
}

pub(super) fn resource_keys_from_bytes(
    bytes: &[u8],
) -> Result<BTreeSet<ClassicResourceKey>, String> {
    let entries =
        parse_resource_entries_preserving_duplicates(bytes).map_err(|error| error.to_string())?;
    Ok(entries
        .into_iter()
        .map(|entry| ClassicResourceKey {
            resource_type: String::from_utf8_lossy(&entry.resource_type).into_owned(),
            resource_id: entry.id.into(),
        })
        .collect())
}

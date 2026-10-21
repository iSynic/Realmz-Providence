use std::collections::{BTreeMap, BTreeSet};

use providence_core::model::{BlobId, ClassicSourceBlob, ProjectOrigin, ProjectSnapshot};
use providence_storage::ProjectStore;
use serde_json::{Map, Value, json};

const ANNEX_FORMAT: &str = "providence-classic-source-annex-v1";

#[cfg(test)]
mod tests;

// Only full scenario capture establishes completeness. Partial imports may retain
// that evidence, but cannot remove captured paths or manufacture absence proof.
pub(crate) fn store_source_annex(
    snapshot: &ProjectSnapshot,
    store: &ProjectStore,
    sources: &[ClassicSourceBlob],
) -> Result<BlobId, String> {
    let next = source_index(sources)?;
    let mut annex = existing_annex(snapshot, store)?;
    if annex.get("sourceInventoryVersion").and_then(Value::as_u64) == Some(2)
        && snapshot
            .classic_sources
            .iter()
            .any(|source| !next.contains_key(source.native_path.as_str()))
    {
        return Err("partial Classic import cannot remove a captured source path".into());
    }
    annex.insert("format".into(), json!(ANNEX_FORMAT));
    annex.insert("files".into(), json!(sources));
    let bytes = serde_json::to_vec(&annex)
        .map_err(|error| format!("could not encode compatibility annex: {error}"))?;
    store.put_blob(&bytes).map_err(|error| error.to_string())
}

fn existing_annex(
    snapshot: &ProjectSnapshot,
    store: &ProjectStore,
) -> Result<Map<String, Value>, String> {
    let ProjectOrigin::Imported {
        compatibility_annex,
    } = &snapshot.origin
    else {
        return Ok(Map::new());
    };
    let bytes = store
        .read_blob(compatibility_annex)
        .map_err(|error| error.to_string())?;
    let Ok(Value::Object(annex)) = serde_json::from_slice(&bytes) else {
        return Ok(Map::new());
    };
    if annex.get("format").and_then(Value::as_str) != Some(ANNEX_FORMAT) {
        return Ok(Map::new());
    }
    let files: Vec<ClassicSourceBlob> = serde_json::from_value(
        annex.get("files").cloned().unwrap_or(Value::Null),
    )
    .map_err(|error| format!("Classic source annex has an invalid file inventory: {error}"))?;
    if source_index(&files)? != source_index(&snapshot.classic_sources)? {
        return Err(
            "Classic source annex file inventory does not match captured project sources".into(),
        );
    }
    Ok(annex)
}

fn source_index(
    sources: &[ClassicSourceBlob],
) -> Result<BTreeMap<&str, &ClassicSourceBlob>, String> {
    let mut indexed = BTreeMap::new();
    for source in sources {
        if indexed
            .insert(source.native_path.as_str(), source)
            .is_some()
        {
            return Err(format!(
                "Classic source inventory repeats {}",
                source.native_path
            ));
        }
    }
    Ok(indexed)
}

// Callers decide which native families are replaced; omitted families remain untouched.
pub(crate) fn replace_sources(
    existing: &[ClassicSourceBlob],
    store: &ProjectStore,
    replacements: &[(&str, &[u8])],
) -> Result<Vec<ClassicSourceBlob>, String> {
    let paths = replacements
        .iter()
        .map(|(path, _)| *path)
        .collect::<BTreeSet<_>>();
    let mut sources = existing
        .iter()
        .filter(|source| !paths.contains(source.native_path.as_str()))
        .cloned()
        .collect::<Vec<_>>();
    for (native_path, bytes) in replacements {
        sources.push(ClassicSourceBlob {
            native_path: (*native_path).into(),
            blob: store.put_blob(bytes).map_err(|error| error.to_string())?,
            byte_length: bytes.len() as u64,
        });
    }
    sources.sort_by(|left, right| left.native_path.cmp(&right.native_path));
    Ok(sources)
}

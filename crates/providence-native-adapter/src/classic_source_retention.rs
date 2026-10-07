use std::collections::BTreeSet;

use providence_core::model::ClassicSourceBlob;
use providence_storage::ProjectStore;

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

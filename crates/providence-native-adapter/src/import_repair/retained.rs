use providence_core::model::ProjectSnapshot;
use providence_storage::ProjectStore;
use std::collections::BTreeMap;

pub(super) fn read(
    snapshot: &ProjectSnapshot,
    store: &ProjectStore,
) -> Result<BTreeMap<String, Vec<u8>>, String> {
    let mut files = BTreeMap::new();
    for source in &snapshot.classic_sources {
        let bytes = store.read_blob(&source.blob).map_err(|error| {
            format!(
                "Repair requires retained {} source {}: {error}",
                source.native_path, source.blob.0
            )
        })?;
        if bytes.len() as u64 != source.byte_length {
            return Err(format!(
                "Retained {} source length does not match its captured identity.",
                source.native_path
            ));
        }
        if files.insert(source.native_path.clone(), bytes).is_some() {
            return Err(format!(
                "Retained source path {} has competing owners.",
                source.native_path
            ));
        }
    }
    Ok(files)
}

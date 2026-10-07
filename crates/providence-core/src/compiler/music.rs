use super::{ClassicCompatibilitySources, ClassicSliceCompileError, NativeManifest};
use crate::{
    codecs::{
        SCENARIO_MUSIC_FILES, ScenarioMusicError, compile_scenario_music_files,
        scenario_music_asset,
    },
    model::{ProjectOrigin, ProjectSnapshot},
};
use std::collections::BTreeMap;

pub(super) fn compile(
    snapshot: &ProjectSnapshot,
    sources: ClassicCompatibilitySources<'_>,
    payloads: &BTreeMap<String, Vec<u8>>,
    manifest: &mut NativeManifest,
) -> Result<(), ClassicSliceCompileError> {
    for (path, blob, bytes) in compile_scenario_music_files(&snapshot.assets, payloads)
        .map_err(ClassicSliceCompileError::ScenarioMusic)?
    {
        manifest.insert_preserved(&path, blob, bytes);
    }
    if !matches!(snapshot.origin, ProjectOrigin::Imported { .. }) {
        return Ok(());
    }
    for (index, path) in SCENARIO_MUSIC_FILES.iter().enumerate() {
        if manifest.get(path).is_some() {
            continue;
        }
        let Some(retained) = snapshot
            .classic_sources
            .iter()
            .find(|source| source.native_path == *path)
        else {
            continue;
        };
        let source = sources.scenario_music[index]
            .ok_or_else(|| failure(path, "retained source bytes are unavailable"))?;
        if source.blob != &retained.blob || source.bytes.len() as u64 != retained.byte_length {
            return Err(failure(path, "retained source provenance disagrees"));
        }
        // Valid music without a current asset was explicitly removed. Quarantined
        // optional imports have no runtime asset and must still round-trip exactly.
        if scenario_music_asset((index + 1) as u8, source.bytes, retained.blob.clone()).is_err() {
            manifest.insert_preserved(*path, retained.blob.clone(), source.bytes.to_vec());
        }
    }
    Ok(())
}

fn failure(path: &str, reason: &str) -> ClassicSliceCompileError {
    ClassicSliceCompileError::ScenarioMusic(ScenarioMusicError(format!("{path}: {reason}")))
}

#[cfg(test)]
mod tests;

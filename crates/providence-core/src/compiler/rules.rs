use super::{ClassicCompatibilitySources, ClassicSliceCompileError, NativeManifest};
use crate::{
    codecs::{NativeFileFamily, encode_caste_rules, encode_race_rules},
    model::ProjectSnapshot,
};
#[cfg(test)]
mod tests;

impl From<crate::codecs::RaceCodecError> for ClassicSliceCompileError {
    fn from(error: crate::codecs::RaceCodecError) -> Self {
        Self::Races(error)
    }
}

pub(super) fn compile_rules(
    snapshot: &ProjectSnapshot,
    sources: ClassicCompatibilitySources<'_>,
    manifest: &mut NativeManifest,
) -> Result<(), ClassicSliceCompileError> {
    if !snapshot.race_rules.is_empty() {
        let scenario_source = sources
            .data_race
            .filter(|bytes| bytes.len() >= 30 * crate::codecs::RACE_RECORD_BYTES);
        let source = sources
            .current_data_race
            .or(scenario_source)
            .or(sources.application_data_race);
        let bytes = encode_race_rules(&snapshot.race_rules, source)?;
        if scenario_source.is_some()
            || sources.current_data_race.is_some()
            || source.is_none()
            || source.is_some_and(|s| s != bytes.as_slice())
        {
            manifest.insert_generated("Data Race", NativeFileFamily::RaceRules, bytes);
        }
    }
    if !snapshot.caste_rules.is_empty() {
        let source = sources
            .current_data_caste
            .or(sources.data_caste)
            .or(sources.application_data_caste);
        let bytes = encode_caste_rules(&snapshot.caste_rules, source)?;
        if sources.data_caste.is_some()
            || sources.current_data_caste.is_some()
            || source.is_none()
            || source.is_some_and(|s| s != bytes.as_slice())
        {
            manifest.insert_generated("Data Caste", NativeFileFamily::CasteRules, bytes);
        }
    }
    Ok(())
}

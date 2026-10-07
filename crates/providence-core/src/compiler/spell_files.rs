use super::{ClassicCompatibilitySources, ClassicSliceCompileError, NativeManifest};
use crate::codecs::{
    NativeFileFamily, encode_scenario_spell_name_resources, encode_scenario_spells,
};
use crate::model::ProjectSnapshot;

pub(super) fn compile(
    snapshot: &ProjectSnapshot,
    sources: ClassicCompatibilitySources<'_>,
    manifest: &mut NativeManifest,
) -> Result<(), ClassicSliceCompileError> {
    if !snapshot.scenario_spells.is_empty() {
        manifest.insert_generated(
            "Data Spell",
            NativeFileFamily::ScenarioSpellDefinitions,
            encode_scenario_spells(&snapshot.scenario_spells, sources.data_spell)?,
        );
        let name_source = sources.data_spell_names;
        if name_source.is_some()
            || snapshot
                .scenario_spells
                .iter()
                .any(|spell| spell.name_authored || spell.source_blob.is_none())
        {
            manifest.insert_generated(
                name_source
                    .map(|source| source.native_path)
                    .unwrap_or("Data Spell.rsrc"),
                NativeFileFamily::ScenarioSpellNames,
                encode_scenario_spell_name_resources(
                    &snapshot.scenario_spells,
                    name_source.map(|source| source.bytes),
                )?,
            );
        }
    }
    Ok(())
}

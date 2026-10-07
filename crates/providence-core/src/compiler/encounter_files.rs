use super::{ClassicCompatibilitySources, ClassicSliceCompileError, NativeManifest};
use crate::codecs::{
    NativeFileFamily, encode_complex_encounters, encode_extra_action_points, encode_extra_codes,
    encode_global_macro_hooks, encode_rogue_encounters, encode_simple_encounters,
    encode_timed_encounters,
};
use crate::model::ProjectSnapshot;

pub(super) fn compile(
    snapshot: &ProjectSnapshot,
    sources: ClassicCompatibilitySources<'_>,
    manifest: &mut NativeManifest,
) -> Result<(), ClassicSliceCompileError> {
    encounters(snapshot, sources, manifest)?;
    programs(snapshot, sources, manifest)
}

fn encounters(
    snapshot: &ProjectSnapshot,
    sources: ClassicCompatibilitySources<'_>,
    manifest: &mut NativeManifest,
) -> Result<(), ClassicSliceCompileError> {
    if !snapshot.simple_encounters.is_empty() {
        manifest.insert_generated(
            "Data ED",
            NativeFileFamily::SimpleEncounters,
            encode_simple_encounters(&snapshot.simple_encounters, sources.data_ed)?,
        );
    }
    if !snapshot.complex_encounters.is_empty() {
        manifest.insert_generated(
            "Data ED2",
            NativeFileFamily::ComplexEncounters,
            encode_complex_encounters(&snapshot.complex_encounters, sources.data_ed2)?,
        );
    }
    if !snapshot.rogue_encounters.is_empty() {
        manifest.insert_generated(
            "Data TD2",
            NativeFileFamily::RogueEncounters,
            encode_rogue_encounters(&snapshot.rogue_encounters, sources.data_td2)?,
        );
    }
    if !snapshot.timed_encounters.is_empty() {
        manifest.insert_generated(
            "Data TD3",
            NativeFileFamily::TimedEncounters,
            encode_timed_encounters(&snapshot.timed_encounters, sources.data_td3)?,
        );
    }
    Ok(())
}

fn programs(
    snapshot: &ProjectSnapshot,
    sources: ClassicCompatibilitySources<'_>,
    manifest: &mut NativeManifest,
) -> Result<(), ClassicSliceCompileError> {
    if !snapshot.extra_action_points.is_empty() {
        manifest.insert_generated(
            "Data ED3",
            NativeFileFamily::ExtraActionPoints,
            encode_extra_action_points(&snapshot.extra_action_points, sources.data_ed3)?,
        );
    }
    if !snapshot.extra_codes.is_empty() {
        manifest.insert_generated(
            "Data EDCD",
            NativeFileFamily::ExtraCodes,
            encode_extra_codes(&snapshot.extra_codes, sources.data_edcd)?,
        );
    }
    // Import records an empty hook contract even when the optional Global file is absent.
    if let Some(contract) = &snapshot.scenario_application
        && (sources.global.is_some()
            || !matches!(
                snapshot.origin,
                crate::model::ProjectOrigin::Imported { .. }
            )
            || contract != &crate::model::ScenarioApplicationContract::default())
    {
        manifest.insert_generated(
            "Global",
            NativeFileFamily::GlobalMacroHooks,
            encode_global_macro_hooks(contract, sources.global)?,
        );
    }
    Ok(())
}

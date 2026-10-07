use super::{ClassicCompatibilitySources, ClassicSliceCompileError, NativeManifest};
use crate::codecs::validate_scenario_support;

pub(super) fn compile(
    sources: ClassicCompatibilitySources<'_>,
    manifest: &mut NativeManifest,
) -> Result<(), ClassicSliceCompileError> {
    if let Some(source) = sources.scenario_support {
        validate_scenario_support(source.bytes)?;
        manifest.insert_preserved("Scenario", source.blob.clone(), source.bytes.to_vec());
    }
    Ok(())
}

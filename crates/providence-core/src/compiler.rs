mod owned_certification;
#[cfg(test)]
use owned_certification::certify_classic_manifest_owned_edits;
pub use owned_certification::certify_classic_owned_edit_manifest_with_asset_payloads;
mod combat_files;
mod economy_files;
mod encounter_files;
mod errors;
pub mod export_trim;
mod item_files;
mod manifest;
mod music;
mod reimport;
mod resources;
mod retained;
mod rules;
mod scenario;
mod sources;
mod spell_files;
mod support;
mod text_files;
mod world_files;

pub use errors::{
    ClassicNoEditCertificationError, ClassicOwnedEditCertification,
    ClassicOwnedEditCertificationError, ClassicOwnedFileTransition, ClassicOwnedResourceEdit,
    ClassicSliceCompileError,
};
pub use manifest::{ManifestEntry, ManifestSource, NativeManifest};
pub use reimport::{ClassicSliceSemantics, reimport_classic_slice};
pub use sources::{
    ClassicCompatibilitySources, NamedCompatibilitySource, PreservedCompatibilitySource,
};

use crate::compatibility::{
    CompatibilityStatus, classify_classic_slice, classify_classic_slice_with_application,
};
use crate::model::ProjectSnapshot;
use crate::rebuilt::ApplicationMediaCatalog;
use std::collections::BTreeMap;

pub fn compile_classic_slice(
    snapshot: &ProjectSnapshot,
    sources: ClassicCompatibilitySources<'_>,
) -> Result<NativeManifest, ClassicSliceCompileError> {
    compile_classic_slice_with_asset_payloads(snapshot, sources, &BTreeMap::new())
}

pub fn compile_classic_slice_with_asset_payloads(
    snapshot: &ProjectSnapshot,
    sources: ClassicCompatibilitySources<'_>,
    asset_payloads: &BTreeMap<String, Vec<u8>>,
) -> Result<NativeManifest, ClassicSliceCompileError> {
    compile_classic_slice_with_application_and_asset_payloads(
        snapshot,
        sources,
        asset_payloads,
        None,
    )
}

pub fn compile_classic_slice_with_application_and_asset_payloads(
    snapshot: &ProjectSnapshot,
    sources: ClassicCompatibilitySources<'_>,
    asset_payloads: &BTreeMap<String, Vec<u8>>,
    application_media: Option<&ApplicationMediaCatalog>,
) -> Result<NativeManifest, ClassicSliceCompileError> {
    let classification = application_media.map_or_else(
        || classify_classic_slice(snapshot),
        |application_media| classify_classic_slice_with_application(snapshot, application_media),
    );
    if classification.status == CompatibilityStatus::Blocked {
        return Err(ClassicSliceCompileError::Compatibility(
            classification
                .blockers
                .into_iter()
                .map(|blocker| blocker.code)
                .collect(),
        ));
    }
    compile_classic_slice_manifest(snapshot, sources, asset_payloads)
}

pub fn certify_classic_no_edit_manifest_with_asset_payloads(
    snapshot: &ProjectSnapshot,
    sources: ClassicCompatibilitySources<'_>,
    asset_payloads: &BTreeMap<String, Vec<u8>>,
    expected_sources: &BTreeMap<String, Vec<u8>>,
) -> Result<NativeManifest, ClassicNoEditCertificationError> {
    let manifest = compile_classic_slice_manifest(snapshot, sources, asset_payloads)
        .map_err(ClassicNoEditCertificationError::Compile)?;
    let missing = expected_sources
        .keys()
        .filter(|path| manifest.get(path).is_none())
        .cloned()
        .collect::<Vec<_>>();
    let unexpected = manifest
        .files()
        .map(|(path, _)| path)
        .filter(|path| !expected_sources.contains_key(*path))
        .map(str::to_owned)
        .collect::<Vec<_>>();
    if !missing.is_empty() || !unexpected.is_empty() {
        return Err(ClassicNoEditCertificationError::FileSet {
            missing,
            unexpected,
        });
    }
    let differences = expected_sources
        .iter()
        .filter_map(|(path, expected)| {
            manifest
                .get(path)
                .filter(|entry| entry.bytes.as_slice() != expected.as_slice())
                .map(|_| path.clone())
        })
        .collect::<Vec<_>>();
    if !differences.is_empty() {
        return Err(ClassicNoEditCertificationError::ByteDifferences(
            differences,
        ));
    }
    Ok(manifest)
}

fn compile_classic_slice_manifest(
    snapshot: &ProjectSnapshot,
    sources: ClassicCompatibilitySources<'_>,
    asset_payloads: &BTreeMap<String, Vec<u8>>,
) -> Result<NativeManifest, ClassicSliceCompileError> {
    let mut manifest = NativeManifest::default();
    // Stage order preserves the first native-family failure and fork overlays.
    music::compile(snapshot, sources, asset_payloads, &mut manifest)?;
    scenario::compile(snapshot, sources, &mut manifest)?;
    support::compile(sources, &mut manifest)?;
    world_files::compile(snapshot, sources, &mut manifest)?;
    text_files::compile(snapshot, sources, &mut manifest)?;
    spell_files::compile(snapshot, sources, &mut manifest)?;
    encounter_files::compile(snapshot, sources, &mut manifest)?;
    combat_files::compile(snapshot, sources, &mut manifest)?;
    economy_files::compile(snapshot, sources, &mut manifest)?;
    rules::compile_rules(snapshot, sources, &mut manifest)?;
    item_files::compile(snapshot, sources, &mut manifest)?;
    world_files::special_land_solidity(snapshot, sources, &mut manifest)?;
    resources::compile(snapshot, sources, asset_payloads, &mut manifest)?;
    retained::preserve_unprojected(snapshot, sources, &mut manifest)?;
    Ok(manifest)
}

#[cfg(test)]
mod tests;

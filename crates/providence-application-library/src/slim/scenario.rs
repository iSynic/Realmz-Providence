use super::{
    battle_atlas::normalize_legacy_battle_atlas,
    catalog_ownership::retain_non_application,
    native_sources::scenario_resource_keys,
    overlays::{restore_land_overlay_references, rewrite_strings},
    package::ScenarioPackage,
    report::{RemovedCounts, SlimScenario, Transformation, scenario_report},
    rule_ownership, scenario_media,
};
use providence_core::{
    codecs::classic_resource_fork_candidate_paths, model::ClassicResourceKey,
    rebuilt::ApplicationMediaCatalog,
};
use serde_json::Value;
use std::{collections::BTreeSet, path::Path};

pub(super) struct Inputs<'a> {
    pub(super) application: &'a Value,
    pub(super) media_catalog: &'a ApplicationMediaCatalog,
    pub(super) application_data: &'a Path,
    pub(super) scenario_directory: &'a Path,
    pub(super) commit: &'a str,
    pub(super) selected_rules: bool,
}

pub(super) fn finalize(
    source_path: &Path,
    output_path: &Path,
    inputs: Inputs<'_>,
) -> Result<SlimScenario, String> {
    let mut package = ScenarioPackage::read(source_path, &inputs.media_catalog.library_id.0)?;
    let mut summary = transform(&mut package, &inputs)?;
    // Ownership and migration must succeed before any package is published.
    let publication = package.write(output_path, inputs.commit)?;
    summary.removed.media_payloads = publication.removed_media_payloads;
    scenario_report(
        source_path,
        output_path,
        &package,
        &publication,
        inputs.scenario_directory,
        summary,
    )
}

fn transform(package: &mut ScenarioPackage, inputs: &Inputs<'_>) -> Result<Transformation, String> {
    let (keys, media) = ownership_sources(inputs)?;
    let (races, castes, race_overrides, caste_overrides) = rule_ownership::retain(
        &mut package.content,
        inputs.application,
        package.source_manifest.compiler.project_origin == "imported",
        inputs.selected_rules,
        inputs.application_data,
        inputs.scenario_directory,
    )?;
    let mut removed = RemovedCounts {
        items: retain_non_application(&mut package.content, inputs.application, "items", &keys)?,
        spells: retain_non_application(&mut package.content, inputs.application, "spells", &keys)?,
        races,
        castes,
        ..RemovedCounts::default()
    };
    normalize_legacy_battle_atlas(&mut package.assets, &keys, inputs.media_catalog)?;
    let migration = scenario_media::migrate(
        &mut package.assets,
        &mut package.files,
        inputs.media_catalog,
        &media,
    )?;
    removed.media_descriptors = migration.removed_descriptors;
    let rewritten = rewrite_strings(&mut package.content, &migration.asset_identity_rewrites)
        + rewrite_strings(&mut package.world, &migration.asset_identity_rewrites)
        + rewrite_strings(&mut package.scenario, &migration.asset_identity_rewrites)
        + restore_land_overlay_references(&mut package.world, &migration.scenario_cicn_identities)?;
    Ok(Transformation {
        removed,
        rewritten_asset_references: rewritten,
        media: migration,
        resource_sha256: media.sha256,
        race_override_count: race_overrides,
        caste_override_count: caste_overrides,
    })
}

fn ownership_sources(
    inputs: &Inputs<'_>,
) -> Result<(BTreeSet<ClassicResourceKey>, scenario_media::Source), String> {
    if !inputs.scenario_directory.is_dir() {
        return Err(format!(
            "Classic ownership source is missing: {}",
            inputs.scenario_directory.display()
        ));
    }
    let resource_path = classic_resource_fork_candidate_paths("Scenario.rsrc")
        .into_iter()
        .map(|candidate| inputs.scenario_directory.join(candidate))
        .find(|candidate| candidate.is_file())
        .unwrap_or_else(|| inputs.scenario_directory.join("Scenario.rsrc"));
    let (keys, _) = scenario_resource_keys(&resource_path)?;
    let media = scenario_media::inspect(&resource_path)?;
    Ok((keys, media))
}

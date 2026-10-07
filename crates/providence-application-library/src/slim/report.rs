use providence_core::model::StableId;
use serde::Serialize;
use serde_json::Value;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct SlimLock {
    pub(super) kind: &'static str,
    pub(super) format_version: u8,
    pub(super) compiler_commit: String,
    pub(super) application_package_sha256: String,
    pub(super) application_package_hash: String,
    pub(super) application_media_catalog_sha256: String,
    pub(super) scenarios: Vec<Value>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct SlimScenario {
    pub(super) name: String,
    pub(super) campaign_id: StableId,
    pub(super) source_file: String,
    pub(super) source_bytes: u64,
    pub(super) source_sha256: String,
    pub(super) output_file: String,
    pub(super) output_bytes: u64,
    pub(super) output_sha256: String,
    pub(super) package_hash: String,
    pub(super) content_id: String,
    pub(super) rewritten_asset_references: usize,
    pub(super) refreshed_scenario_media: usize,
    pub(super) added_scenario_media_descriptors: usize,
    pub(super) preserved_unrefreshable_scenario_media: usize,
    pub(super) ownership_source: OwnershipSource,
    pub(super) removed: RemovedCounts,
    pub(super) retained: RetainedCounts,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct OwnershipSource {
    pub(super) scenario_directory: String,
    pub(super) scenario_resources_sha256: Option<String>,
    pub(super) race_overrides: usize,
    pub(super) caste_overrides: usize,
}

#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct RemovedCounts {
    pub(super) items: usize,
    pub(super) spells: usize,
    pub(super) races: usize,
    pub(super) castes: usize,
    pub(super) media_descriptors: usize,
    pub(super) media_payloads: usize,
}

#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct RetainedCounts {
    pub(super) items: usize,
    pub(super) spells: usize,
    pub(super) races: usize,
    pub(super) castes: usize,
    pub(super) media_descriptors: usize,
    pub(super) media_payloads: usize,
}

pub(super) struct Transformation {
    pub(super) removed: RemovedCounts,
    pub(super) rewritten_asset_references: usize,
    pub(super) media: super::scenario_media::Migration,
    pub(super) resource_sha256: Option<String>,
    pub(super) race_override_count: usize,
    pub(super) caste_override_count: usize,
}

pub(super) fn scenario_report(
    source_path: &std::path::Path,
    output_path: &std::path::Path,
    package: &super::package::ScenarioPackage,
    publication: &super::package::Publication,
    scenario_directory: &std::path::Path,
    summary: Transformation,
) -> Result<SlimScenario, String> {
    Ok(SlimScenario {
        name: publication.manifest.name.clone(),
        campaign_id: publication.manifest.campaign_id.clone(),
        source_file: source_path.display().to_string(),
        source_bytes: package.source_bytes.len() as u64,
        source_sha256: super::encoding::sha256(&package.source_bytes),
        output_file: output_path.display().to_string(),
        output_bytes: publication.output.len() as u64,
        output_sha256: super::encoding::sha256(&publication.output),
        package_hash: publication.manifest.package_hash.clone(),
        content_id: publication.manifest.content_id.clone(),
        rewritten_asset_references: summary.rewritten_asset_references,
        refreshed_scenario_media: summary.media.refreshed,
        added_scenario_media_descriptors: summary.media.added_descriptors,
        preserved_unrefreshable_scenario_media: summary.media.preserved_unrefreshable,
        ownership_source: OwnershipSource {
            scenario_directory: scenario_directory.display().to_string(),
            scenario_resources_sha256: summary.resource_sha256,
            race_overrides: summary.race_override_count,
            caste_overrides: summary.caste_override_count,
        },
        removed: summary.removed,
        retained: RetainedCounts {
            items: array_len(&package.content, "items")?,
            spells: array_len(&package.content, "spells")?,
            races: array_len(&package.content, "races")?,
            castes: array_len(&package.content, "castes")?,
            media_descriptors: package.assets.assets.len(),
            media_payloads: publication.media_payloads,
        },
    })
}

fn array_len(content: &Value, section: &str) -> Result<usize, String> {
    content
        .get(section)
        .and_then(Value::as_array)
        .map(Vec::len)
        .ok_or_else(|| format!("content has no {section} array"))
}

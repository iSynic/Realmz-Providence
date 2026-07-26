mod assets;
mod comparison;
mod documents;
mod portable;
mod rule_selection;

pub use comparison::{
    compare_remake_bundles, RemakeBundleComparison, RemakeBundleMismatch, RemakeBundleMismatchKind,
};

use crate::error::{IoPath, JsonPath, ProvidenceError, Result};
use crate::project::{LevelType, ProvidenceProject};
use assets::package_assets;
use documents::{build_documents, contract_files};
use portable::assert_portable_value;
use serde::Serialize;
use serde_json::{json, Value};
use std::fs::{self, File};
use std::io::{BufWriter, Write};
use std::path::{Path, PathBuf};

pub const REMAKE_CLASSIC_FORMAT: &str = "realmz-remake-classic-campaign";
pub const REMAKE_CLASSIC_FORMAT_VERSION: u32 = 1;

const CLASSIC_DIR: &str = "classic";
const LIMITATIONS: [&str; 4] = [
    "Scenario-owned PICT, cicn, and snd resources include derived PNG or WAV runtime media; unsupported image or sound variants block export rather than producing an incomplete portable bundle. Scrolling TEXT is decoded for runtime use, and matching styl resources become portable rich-text presentation runs rather than binary payloads.",
    "Providence schema version 5 authors a land start; the v1 bundle can also represent dungeon starts when the canonical model gains that distinction.",
    "Legacy scenario-icon and monster-icon override payloads are excluded unless they are canonical scenario-managed assets.",
    "Negative cicn special-land-tile identities use the additive v1 assets.catalog.specialLandTiles collection because ordinary v1 icon identities are non-negative.",
];

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RemakeExportCounts {
    pub maps: usize,
    pub land_maps: usize,
    pub dungeon_maps: usize,
    pub triggers: usize,
    pub active_triggers: usize,
    pub extra_codes: usize,
    pub messages: usize,
    pub battles: usize,
    pub monsters: usize,
    pub scenario_items: usize,
    pub item_texts: usize,
    pub treasures: usize,
    pub shops: usize,
    pub simple_encounters: usize,
    pub complex_encounters: usize,
    pub thief_encounters: usize,
    pub timed_encounters: usize,
    pub managed_assets: usize,
    pub packaged_asset_payloads: usize,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RemakeExportReport {
    pub output_dir: PathBuf,
    pub written_files: Vec<String>,
    pub counts: RemakeExportCounts,
    pub limitations: Vec<String>,
}

pub fn export_remake_campaign(
    project: &ProvidenceProject,
    project_dir: impl AsRef<Path>,
    output_dir: impl AsRef<Path>,
) -> Result<RemakeExportReport> {
    let project_dir = project_dir.as_ref();
    let output_dir = output_dir.as_ref();
    prepare_output_dir(output_dir)?;
    let classic_dir = output_dir.join(CLASSIC_DIR);
    fs::create_dir_all(&classic_dir).with_path(&classic_dir)?;

    let packaged_assets = package_assets(project, project_dir, output_dir)?;
    let limitations = limitations_for_project(project);
    let mut counts = project_counts(project);
    counts.managed_assets = packaged_assets.managed_assets.len();
    counts.packaged_asset_payloads = packaged_assets.written_files.len();
    let files = contract_files();
    let documents = build_documents(project, &packaged_assets, project_dir)?;
    let manifest = campaign_manifest(project, &counts, &files, &limitations);
    assert_portable_value(&manifest, project_dir, "campaign.json")?;

    let mut written_files = packaged_assets.written_files.clone();
    write_json(&output_dir.join("campaign.json"), &manifest)?;
    written_files.push("campaign.json".to_string());
    for (name, document) in documents {
        let relative_path = format!("{CLASSIC_DIR}/{name}");
        assert_portable_value(&document, project_dir, &relative_path)?;
        write_json(&output_dir.join(&relative_path), &document)?;
        written_files.push(relative_path);
    }
    written_files.sort();

    Ok(RemakeExportReport {
        output_dir: output_dir.to_path_buf(),
        written_files,
        counts,
        limitations,
    })
}

fn prepare_output_dir(output_dir: &Path) -> Result<()> {
    if output_dir.exists() {
        if !output_dir.is_dir() {
            return Err(ProvidenceError::message(format!(
                "{} is not a directory",
                output_dir.display()
            )));
        }
        if fs::read_dir(output_dir)
            .with_path(output_dir)?
            .next()
            .is_some()
        {
            return Err(ProvidenceError::message(format!(
                "Refusing to overwrite non-empty output directory {}",
                output_dir.display()
            )));
        }
    } else {
        fs::create_dir_all(output_dir).with_path(output_dir)?;
    }
    Ok(())
}

fn write_json(path: &Path, value: &impl Serialize) -> Result<()> {
    let file = File::create(path).with_path(path)?;
    let mut writer = BufWriter::new(file);
    serde_json::to_writer(&mut writer, value).with_json_path(path)?;
    writer.write_all(b"\n").with_path(path)?;
    writer.flush().with_path(path)
}

fn project_counts(project: &ProvidenceProject) -> RemakeExportCounts {
    RemakeExportCounts {
        maps: project.maps.len(),
        land_maps: project
            .maps
            .iter()
            .filter(|map| matches!(map.level_type, LevelType::Land))
            .count(),
        dungeon_maps: project
            .maps
            .iter()
            .filter(|map| matches!(map.level_type, LevelType::Dungeon))
            .count(),
        triggers: project.triggers.len(),
        active_triggers: project
            .triggers
            .iter()
            .filter(|trigger| trigger.active)
            .count(),
        extra_codes: project.extracodes.len(),
        messages: project.messages.len(),
        battles: project.battles.len(),
        monsters: project.monsters.len(),
        scenario_items: project.scenario_items.len(),
        item_texts: project.item_texts.len(),
        treasures: project.treasures.len(),
        shops: project.shops.len(),
        simple_encounters: project.simple_encounters.len(),
        complex_encounters: project.complex_encounters.len(),
        thief_encounters: project.thief_encounters.len(),
        timed_encounters: project.timed_encounters.len(),
        managed_assets: 0,
        packaged_asset_payloads: 0,
    }
}

fn campaign_manifest(
    project: &ProvidenceProject,
    counts: &RemakeExportCounts,
    files: &std::collections::BTreeMap<&str, &str>,
    limitations: &[String],
) -> Value {
    let start = project.scenario.shell.as_ref().map_or_else(
        || json!({ "levelType": "land", "levelIndex": 0, "x": 0, "y": 0 }),
        |shell| {
            json!({
                "levelType": "land",
                "levelIndex": shell.land_level,
                "x": shell.look_x,
                "y": shell.look_y,
            })
        },
    );
    json!({
        "format": REMAKE_CLASSIC_FORMAT,
        "formatVersion": REMAKE_CLASSIC_FORMAT_VERSION,
        "campaignKind": "classic-compiled",
        "compatibilityProfile": "realmz-7.1",
        "id": portable_campaign_id(&project.scenario.id, &project.scenario.name),
        "name": &project.scenario.name,
        "start": start,
        "files": files,
        "producer": {
            "name": "Providence",
            "projectSchemaVersion": project.schema_version,
            "providenceVersion": &project.app_version,
            "projectOrigin": project.source.resolved_origin(),
        },
        "counts": counts,
        "capabilities": {
            "semanticScenarioData": "canonical-project-projection",
            "classicResourcePayloads": "packaged-classic-resource-data",
            "generatedGdscript": false,
        },
        "limitations": limitations,
    })
}

fn limitations_for_project(project: &ProvidenceProject) -> Vec<String> {
    let mut limitations = LIMITATIONS
        .iter()
        .map(|text| (*text).to_string())
        .collect::<Vec<_>>();
    let music_assets = project
        .assets
        .iter()
        .filter(|asset| {
            matches!(asset.kind, crate::project::ManagedAssetKind::Music)
                && !matches!(
                    asset.library_scope,
                    Some(crate::project::ManagedAssetLibraryScope::CustomLibrary)
                )
        })
        .count();
    if music_assets > 0 {
        limitations.push(format!(
            "{music_assets} canonical scenario music asset(s) were omitted: Classic bundle v1 has no scenario-music playlist contract. Native Realmz exports still carry their original MOD payloads."
        ));
    }
    limitations
}

pub(crate) fn portable_campaign_id(id: &str, name: &str) -> String {
    let candidate = if id.trim().is_empty() { name } else { id };
    let mut result = String::new();
    let mut separator_pending = false;
    for character in candidate.chars() {
        if character.is_ascii_alphanumeric() {
            if separator_pending && !result.is_empty() {
                result.push('-');
            }
            result.push(character.to_ascii_lowercase());
            separator_pending = false;
        } else {
            separator_pending = true;
        }
    }
    if result.is_empty() {
        "classic-scenario".to_string()
    } else {
        result
    }
}

#[cfg(test)]
mod tests;

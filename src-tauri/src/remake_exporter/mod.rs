mod assets;
mod comparison;
mod documents;
mod evidence;
mod portable;
mod rule_selection;
pub(crate) mod scripting;

pub use comparison::{
    compare_remake_bundles, RemakeBundleComparison, RemakeBundleMismatch, RemakeBundleMismatchKind,
};

use crate::error::{IoPath, JsonPath, ProvidenceError, Result};
use crate::project::{LevelType, ProvidenceProject};
use assets::{package_assets, update_scenario_icon_assets};
use documents::{build_documents, contract_files};
use portable::assert_portable_value;
use serde::Serialize;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::fs::{self, File};
use std::io::{BufWriter, Write};
use std::path::{Path, PathBuf};

pub const REMAKE_CLASSIC_FORMAT: &str = "realmz-remake-scenario";
pub const REMAKE_CLASSIC_FORMAT_VERSION: u32 = 3;
pub const REMAKE_DOCUMENT_SCHEMA_VERSION: u32 = 2;

const CLASSIC_DIR: &str = "classic";
const LIMITATIONS: [&str; 3] = [
    "Scenario-owned PICT, cicn, and snd resources include derived PNG or WAV runtime media; unsupported image or sound variants block export rather than producing an incomplete portable bundle. Scrolling TEXT is decoded for runtime use, and matching styl resources become portable rich-text presentation runs rather than binary payloads.",
    "Providence schema version 7 authors a land start; the v3 bundle can also represent dungeon starts when the canonical model gains that distinction.",
    "Negative cicn special-land-tile identities use the additive assets.catalog.specialLandTiles collection because ordinary icon identities are non-negative.",
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

#[derive(Debug, Clone)]
pub struct RemakeIconUpdateReport {
    pub output_dir: PathBuf,
    pub written_files: Vec<String>,
    pub packaged_asset_payloads: usize,
}

pub fn export_remake_campaign(
    project: &ProvidenceProject,
    project_dir: impl AsRef<Path>,
    output_dir: impl AsRef<Path>,
) -> Result<RemakeExportReport> {
    let project_dir = project_dir.as_ref();
    let output_dir = output_dir.as_ref();
    let runtime_errors = crate::remake_extension_catalog::validate_remake_runtime(project);
    if !runtime_errors.is_empty() {
        return Err(ProvidenceError::message(format!(
            "Realmz Remake runtime contract is invalid:\n- {}",
            runtime_errors.join("\n- ")
        )));
    }
    prepare_output_dir(output_dir)?;
    let classic_dir = output_dir.join(CLASSIC_DIR);
    fs::create_dir_all(&classic_dir).with_path(&classic_dir)?;

    let packaged_assets = package_assets(project, project_dir, output_dir)?;
    let script_bundle = scripting::compile_project_scripts(project)?;
    let script_source_files =
        scripting::write_script_sources(output_dir, &script_bundle.source_files)?;
    let limitations = limitations_for_project(project);
    let mut counts = project_counts(project);
    counts.managed_assets = packaged_assets.managed_assets.len();
    counts.packaged_asset_payloads = packaged_assets.written_files.len();
    let files = contract_files();
    let documents = build_documents(
        project,
        &packaged_assets,
        project_dir,
        script_bundle.document,
    )?;

    let mut written_files = packaged_assets.written_files.clone();
    written_files.extend(script_source_files);
    for (name, document) in documents {
        let relative_path = if name == "runtime.json" || name.starts_with("remake/") {
            name.to_string()
        } else {
            format!("{CLASSIC_DIR}/{name}")
        };
        assert_portable_value(&document, project_dir, &relative_path)?;
        write_json(&output_dir.join(&relative_path), &document)?;
        written_files.push(relative_path);
    }
    let integrity = bundle_integrity(output_dir)?;
    let mut manifest = campaign_manifest(project, &counts, &files, &limitations, &integrity);
    set_package_hash(&mut manifest)?;
    assert_portable_value(&manifest, project_dir, "campaign.json")?;
    write_json(&output_dir.join("campaign.json"), &manifest)?;
    written_files.push("campaign.json".to_string());
    written_files.sort();

    Ok(RemakeExportReport {
        output_dir: output_dir.to_path_buf(),
        written_files,
        counts,
        limitations,
    })
}

pub fn update_remake_campaign_icons(
    project: &ProvidenceProject,
    output_dir: impl AsRef<Path>,
) -> Result<RemakeIconUpdateReport> {
    let output_dir = output_dir.as_ref();
    let assets_path = output_dir.join(CLASSIC_DIR).join("assets.json");
    let manifest_path = output_dir.join("campaign.json");
    let assets_bytes = fs::read(&assets_path).with_path(&assets_path)?;
    let assets_multiline = json_is_multiline(&assets_bytes);
    let mut assets_document: Value =
        serde_json::from_slice(&assets_bytes).with_json_path(&assets_path)?;
    let written_files = update_scenario_icon_assets(project, output_dir, &mut assets_document)?;
    assert_portable_value(&assets_document, output_dir, "classic/assets.json")?;
    write_json_with_style(&assets_path, &assets_document, assets_multiline)?;

    let manifest_bytes = fs::read(&manifest_path).with_path(&manifest_path)?;
    let manifest_multiline = json_is_multiline(&manifest_bytes);
    let mut manifest: Value =
        serde_json::from_slice(&manifest_bytes).with_json_path(&manifest_path)?;
    let packaged_asset_payloads = count_packaged_asset_files(output_dir)?;
    manifest["counts"]["packagedAssetPayloads"] = json!(packaged_asset_payloads);
    if let Some(limitations) = manifest
        .get_mut("limitations")
        .and_then(Value::as_array_mut)
    {
        limitations.retain(|limitation| {
            !limitation
                .as_str()
                .is_some_and(|text| text.contains("monster-icon override payloads are excluded"))
        });
    }
    manifest["integrity"] = bundle_integrity(output_dir)?;
    set_package_hash(&mut manifest)?;
    assert_portable_value(&manifest, output_dir, "campaign.json")?;
    write_json_with_style(&manifest_path, &manifest, manifest_multiline)?;
    Ok(RemakeIconUpdateReport {
        output_dir: output_dir.to_path_buf(),
        written_files,
        packaged_asset_payloads,
    })
}

fn count_packaged_asset_files(output_dir: &Path) -> Result<usize> {
    let mut count = 0;
    for relative_root in [Path::new("assets").join("managed"), PathBuf::from("media")] {
        let root = output_dir.join(relative_root);
        if !root.is_dir() {
            continue;
        }
        let mut pending = vec![root];
        while let Some(directory) = pending.pop() {
            for entry in fs::read_dir(&directory).with_path(&directory)? {
                let entry = entry.with_path(&directory)?;
                let entry_path = entry.path();
                let file_type = entry.file_type().with_path(&entry_path)?;
                if file_type.is_dir() {
                    pending.push(entry_path);
                } else if file_type.is_file() {
                    count += 1;
                }
            }
        }
    }
    Ok(count)
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
    write_json_with_style(path, value, false)
}

fn write_json_with_style(path: &Path, value: &impl Serialize, multiline: bool) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).with_path(parent)?;
    }
    let file = File::create(path).with_path(path)?;
    let mut writer = BufWriter::new(file);
    if multiline {
        serde_json::to_writer_pretty(&mut writer, value).with_json_path(path)?;
    } else {
        serde_json::to_writer(&mut writer, value).with_json_path(path)?;
    }
    writer.write_all(b"\n").with_path(path)?;
    writer.flush().with_path(path)
}

fn json_is_multiline(bytes: &[u8]) -> bool {
    String::from_utf8_lossy(bytes).trim().contains('\n')
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
    integrity: &Value,
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
        "integrity": integrity,
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
            "scriptExecutionTiers": ["safe", "sandboxed"],
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
            "{music_assets} canonical scenario music asset(s) were omitted: scenario format v3 has no scenario-music playlist contract yet. Native Realmz exports still carry their original MOD payloads."
        ));
    }
    limitations
}

fn bundle_integrity(output_dir: &Path) -> Result<Value> {
    let mut entries = BTreeMap::new();
    let mut pending = vec![output_dir.to_path_buf()];
    while let Some(directory) = pending.pop() {
        for entry in fs::read_dir(&directory).with_path(&directory)? {
            let entry = entry.with_path(&directory)?;
            let path = entry.path();
            let file_type = entry.file_type().with_path(&path)?;
            if file_type.is_dir() {
                pending.push(path);
                continue;
            }
            if !file_type.is_file() {
                continue;
            }
            let relative = path
                .strip_prefix(output_dir)
                .map_err(|_| ProvidenceError::message("Bundle file escaped its output directory"))?
                .to_string_lossy()
                .replace('\\', "/");
            if relative == "campaign.json" {
                continue;
            }
            let bytes = fs::read(&path).with_path(&path)?;
            entries.insert(
                relative,
                json!({
                    "bytes": bytes.len(),
                    "sha256": sha256_hex(&bytes),
                }),
            );
        }
    }
    Ok(json!({
        "algorithm": "sha256",
        "files": entries,
    }))
}

fn set_package_hash(manifest: &mut Value) -> Result<()> {
    let integrity = manifest
        .get_mut("integrity")
        .and_then(Value::as_object_mut)
        .ok_or_else(|| ProvidenceError::message("Campaign manifest has no integrity object"))?;
    integrity.remove("packageHash");
    let canonical = serde_json::to_vec(&canonical_json_value(manifest)).map_err(|error| {
        ProvidenceError::message(format!(
            "Could not serialize canonical campaign manifest: {error}"
        ))
    })?;
    manifest["integrity"]["packageHash"] = Value::String(sha256_hex(&canonical));
    Ok(())
}

fn canonical_json_value(value: &Value) -> Value {
    match value {
        Value::Array(values) => {
            Value::Array(values.iter().map(canonical_json_value).collect::<Vec<_>>())
        }
        Value::Object(object) => {
            let mut sorted = BTreeMap::new();
            for (key, child) in object {
                sorted.insert(key.clone(), canonical_json_value(child));
            }
            Value::Object(sorted.into_iter().collect())
        }
        _ => value.clone(),
    }
}

fn sha256_hex(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    format!("{:x}", hasher.finalize())
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

use super::{
    ClassicCompatibilitySources, ClassicOwnedEditCertification, ClassicOwnedEditCertificationError,
    ClassicOwnedFileTransition, ManifestSource, NativeManifest, compile_classic_slice_manifest,
};
use crate::codecs::{CODEC_REGISTRY, NativeFileFamily, inspect_owned_byte_diff};
use crate::model::ProjectSnapshot;
use std::collections::BTreeMap;

mod rule_authoring;
mod scenario_resources;
mod spell_authoring;
#[cfg(test)]
mod tests;

struct ScenarioBaseline {
    files: BTreeMap<String, Vec<u8>>,
    transitions: Vec<ClassicOwnedFileTransition>,
    startup_path: Option<String>,
}

pub fn certify_classic_owned_edit_manifest_with_asset_payloads(
    snapshot: &ProjectSnapshot,
    sources: ClassicCompatibilitySources<'_>,
    asset_payloads: &BTreeMap<String, Vec<u8>>,
    expected_sources: &BTreeMap<String, Vec<u8>>,
) -> Result<ClassicOwnedEditCertification, ClassicOwnedEditCertificationError> {
    let startup_path = sources
        .scenario_startup
        .map(|source| source.native_path.to_string());
    let manifest = compile_classic_slice_manifest(snapshot, sources, asset_payloads)
        .map_err(ClassicOwnedEditCertificationError::Compile)?;
    let ScenarioBaseline {
        files: mut expected,
        mut transitions,
        startup_path: effective_startup,
    } = scenario_baseline(
        snapshot,
        &manifest,
        expected_sources,
        startup_path.as_deref(),
    )?;
    spell_authoring::allocate_binary(snapshot, &manifest, &mut expected, &mut transitions)?;
    rule_authoring::allocate_tables(
        snapshot,
        sources,
        &manifest,
        &mut expected,
        &mut transitions,
    )?;
    let mut resource_edits =
        scenario_resources::certify(snapshot, &manifest, &mut expected, asset_payloads)?;
    resource_edits.extend(spell_authoring::certify_names(
        snapshot,
        &manifest,
        &mut expected,
        &mut transitions,
    )?);
    let mut certification =
        certify_classic_manifest_owned_edits(manifest, &expected, effective_startup.as_deref())?;
    certification.file_transitions = transitions;
    certification.exact_file_count -= resource_edits.len();
    certification.resource_edits = resource_edits;
    Ok(certification)
}

pub(super) fn certify_classic_manifest_owned_edits(
    manifest: NativeManifest,
    expected_sources: &BTreeMap<String, Vec<u8>>,
    startup_path: Option<&str>,
) -> Result<ClassicOwnedEditCertification, ClassicOwnedEditCertificationError> {
    validate_file_set(&manifest, expected_sources)?;

    let mut exact_file_count = 0;
    let mut changed_files = Vec::new();
    let mut unregistered = Vec::new();
    let mut outside_ownership = Vec::new();
    for (path, expected) in expected_sources {
        let entry = manifest
            .get(path)
            .expect("file-set validation guarantees every expected path");
        if entry.bytes.as_slice() == expected.as_slice() {
            exact_file_count += 1;
            continue;
        }
        let family = if matches!(
            entry.source,
            ManifestSource::Generated {
                family: NativeFileFamily::ScenarioSecurityStartup
            }
        ) {
            Some(NativeFileFamily::ScenarioSecurityStartup)
        } else {
            fixed_record_family_for_native_path(path, startup_path)
        };
        let Some(family) = family else {
            unregistered.push(path.clone());
            continue;
        };
        let report = inspect_owned_byte_diff(family, expected, &entry.bytes, 64);
        if !report.within_declared_ownership {
            outside_ownership.push(path.clone());
        }
        changed_files.push(report);
    }
    if !unregistered.is_empty() {
        return Err(ClassicOwnedEditCertificationError::UnregisteredChangedFiles(unregistered));
    }
    if !outside_ownership.is_empty() {
        return Err(
            ClassicOwnedEditCertificationError::OutsideDeclaredOwnership(outside_ownership),
        );
    }
    Ok(ClassicOwnedEditCertification {
        manifest,
        exact_file_count,
        changed_files,
        file_transitions: Vec::new(),
        resource_edits: Vec::new(),
    })
}

// Only explicit Scenario authoring may alter this file set. The ordinary byte-ownership gate
// still compares the renamed marker, every retained backup byte, and every unrelated file.
fn scenario_baseline(
    snapshot: &ProjectSnapshot,
    manifest: &NativeManifest,
    expected: &BTreeMap<String, Vec<u8>>,
    startup_path: Option<&str>,
) -> Result<ScenarioBaseline, ClassicOwnedEditCertificationError> {
    let mut baseline = expected.clone();
    let mut transitions = Vec::new();
    let mut effective_startup = startup_path.map(str::to_owned);
    allocate_scenario_metadata(snapshot, manifest, &mut baseline, &mut transitions)?;
    let Some(authoring) = snapshot.startup_authoring.as_ref() else {
        return Ok(ScenarioBaseline {
            files: baseline,
            transitions,
            startup_path: effective_startup,
        });
    };
    if let Some(source) = authoring.original_source.as_ref()
        && source.native_path != authoring.marker_filename
    {
        if startup_path != Some(source.native_path.as_str())
            || baseline.contains_key(&authoring.marker_filename)
            || manifest.get(&source.native_path).is_some()
        {
            return Err(
                ClassicOwnedEditCertificationError::UnregisteredChangedFiles(vec![
                    authoring.marker_filename.clone(),
                ]),
            );
        }
        let bytes = baseline.remove(&source.native_path).ok_or_else(|| {
            ClassicOwnedEditCertificationError::UnregisteredChangedFiles(vec![
                source.native_path.clone(),
            ])
        })?;
        let length = bytes.len();
        baseline.insert(authoring.marker_filename.clone(), bytes);
        effective_startup = Some(authoring.marker_filename.clone());
        transitions.push(ClassicOwnedFileTransition {
            from_path: Some(source.native_path.clone()),
            to_path: authoring.marker_filename.clone(),
            before_bytes: length,
            after_bytes: length,
        });
    }
    if let Some(security) = authoring.security.as_ref() {
        backup_allocation(&mut baseline, manifest, security, &mut transitions)?;
    }
    Ok(ScenarioBaseline {
        files: baseline,
        transitions,
        startup_path: effective_startup,
    })
}

fn allocate_scenario_metadata(
    snapshot: &ProjectSnapshot,
    manifest: &NativeManifest,
    baseline: &mut BTreeMap<String, Vec<u8>>,
    transitions: &mut Vec<ClassicOwnedFileTransition>,
) -> Result<(), ClassicOwnedEditCertificationError> {
    let Some(campaign) = snapshot.campaign.as_ref() else {
        return Ok(());
    };
    let families = [
        ("Data RI", NativeFileFamily::ScenarioRestrictions, true),
        (
            "Data CI",
            NativeFileFamily::ScenarioContactInfo,
            campaign.contact_provenance == crate::model::CampaignContactProvenance::Authored,
        ),
    ];
    for (path, family, authored) in families {
        if baseline.contains_key(path) || !authored {
            continue;
        }
        let Some(output) = manifest.get(path) else {
            continue;
        };
        let descriptor = CODEC_REGISTRY
            .iter()
            .find(|row| row.family == family)
            .expect("registered Scenario codec");
        if !matches!(output.source, ManifestSource::Generated {family: output_family} if output_family == family)
            || output.bytes.len() != descriptor.record_bytes
        {
            return Err(
                ClassicOwnedEditCertificationError::OutsideDeclaredOwnership(vec![path.into()]),
            );
        }
        transitions.push(ClassicOwnedFileTransition {
            from_path: None,
            to_path: path.into(),
            before_bytes: 0,
            after_bytes: output.bytes.len(),
        });
        baseline.insert(path.into(), vec![0; output.bytes.len()]);
    }
    Ok(())
}

fn backup_allocation(
    baseline: &mut BTreeMap<String, Vec<u8>>,
    manifest: &NativeManifest,
    security: &crate::model::ScenarioSecurityAuthoring,
    transitions: &mut Vec<ClassicOwnedFileTransition>,
) -> Result<(), ClassicOwnedEditCertificationError> {
    let before = baseline.get("Data CS").map_or(0, Vec::len);
    let source_length = security
        .backup_source
        .as_ref()
        .map(|source| source.byte_length as usize);
    if (baseline.contains_key("Data CS") && source_length != Some(before))
        || (!baseline.contains_key("Data CS") && source_length.is_some())
    {
        return Err(
            ClassicOwnedEditCertificationError::OutsideDeclaredOwnership(vec!["Data CS".into()]),
        );
    }
    if before >= 316 {
        return Ok(());
    }
    if source_length.is_some() && !security.repair_backup {
        return Err(
            ClassicOwnedEditCertificationError::OutsideDeclaredOwnership(vec!["Data CS".into()]),
        );
    }
    let Some(output) = manifest.get("Data CS") else {
        return Err(
            ClassicOwnedEditCertificationError::UnregisteredChangedFiles(vec!["Data CS".into()]),
        );
    };
    if output.bytes.len() != 316
        || !matches!(
            output.source,
            ManifestSource::Generated {
                family: NativeFileFamily::ScenarioSecurityBackup
            }
        )
    {
        return Err(
            ClassicOwnedEditCertificationError::OutsideDeclaredOwnership(vec!["Data CS".into()]),
        );
    }
    let mut expected = baseline.get("Data CS").cloned().unwrap_or_default();
    expected.resize(316, 0);
    if output.bytes != expected {
        return Err(
            ClassicOwnedEditCertificationError::OutsideDeclaredOwnership(vec!["Data CS".into()]),
        );
    }
    transitions.push(ClassicOwnedFileTransition {
        from_path: baseline.contains_key("Data CS").then(|| "Data CS".into()),
        to_path: "Data CS".into(),
        before_bytes: before,
        after_bytes: 316,
    });
    baseline.insert("Data CS".into(), expected);
    Ok(())
}

fn fixed_record_family_for_native_path(
    native_path: &str,
    startup_path: Option<&str>,
) -> Option<NativeFileFamily> {
    if startup_path == Some(native_path) {
        return Some(NativeFileFamily::ScenarioStartup);
    }
    if matches!(
        native_path,
        "Data Custom 1 BD" | "Data Custom 2 BD" | "Data Custom 3 BD"
    ) {
        return Some(NativeFileFamily::CustomLandlookMetadata);
    }
    CODEC_REGISTRY
        .iter()
        .find(|descriptor| descriptor.native_path == native_path)
        .map(|descriptor| descriptor.family)
}

fn validate_file_set(
    manifest: &NativeManifest,
    expected_sources: &BTreeMap<String, Vec<u8>>,
) -> Result<(), ClassicOwnedEditCertificationError> {
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
        return Err(ClassicOwnedEditCertificationError::FileSet {
            missing,
            unexpected,
        });
    }

    Ok(())
}

use crate::error::Result;
use crate::project::{ProjectOrigin, ProvidenceProject, SourceFile, SourceFileRole};
use crate::realmz::{CASTE_BYTES, CASTE_OVERRIDE_RECORDS, RACE_BYTES, RACE_OVERRIDE_RECORDS};
use crate::resource_fork::parse_resource_fork_entries;
use crate::rule_compiler::rule_compiler_baseline_bytes;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::collections::BTreeSet;
use std::fs;
use std::path::{Component, Path, PathBuf};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RuleTableSelection {
    races: RuleTableEvidence,
    castes: RuleTableEvidence,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct RuleTableEvidence {
    source: RuleTableSource,
    #[serde(skip_serializing_if = "Option::is_none")]
    changed_record_ids: Option<Vec<usize>>,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "kebab-case")]
enum RuleTableSource {
    Shared,
    ScenarioLocal,
    Unresolved,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ImportedScenarioKind {
    BuiltIn,
    ThirdParty,
    Unresolved,
}

pub(crate) fn rule_table_selection(
    project: &ProvidenceProject,
    project_dir: &Path,
) -> Result<RuleTableSelection> {
    let imported_kind = if project.source.resolved_origin() == ProjectOrigin::Imported {
        imported_scenario_kind(project, project_dir)
    } else {
        ImportedScenarioKind::Unresolved
    };
    Ok(RuleTableSelection {
        races: table_evidence(
            project,
            project_dir,
            imported_kind,
            "Data Race",
            RACE_BYTES,
            RACE_OVERRIDE_RECORDS,
            project.race_overrides.iter().map(|record| record.id),
        )?,
        castes: table_evidence(
            project,
            project_dir,
            imported_kind,
            "Data Caste",
            CASTE_BYTES,
            CASTE_OVERRIDE_RECORDS,
            project.caste_overrides.iter().map(|record| record.id),
        )?,
    })
}

fn table_evidence(
    project: &ProvidenceProject,
    project_dir: &Path,
    imported_kind: ImportedScenarioKind,
    source_name: &str,
    record_bytes: usize,
    record_count: usize,
    record_ids: impl Iterator<Item = usize>,
) -> Result<RuleTableEvidence> {
    let record_ids = record_ids.collect::<BTreeSet<_>>();
    if project.source.resolved_origin() == ProjectOrigin::Authored {
        return Ok(if record_ids.is_empty() {
            shared()
        } else {
            scenario_local(Some(record_ids.into_iter().collect()))
        });
    }

    let Some(source_file) = source_file(project, source_name) else {
        return Ok(if record_ids.is_empty() {
            shared()
        } else {
            unresolved()
        });
    };
    match imported_kind {
        ImportedScenarioKind::BuiltIn => Ok(shared()),
        ImportedScenarioKind::Unresolved => Ok(unresolved()),
        ImportedScenarioKind::ThirdParty => {
            if record_ids.is_empty() {
                return Ok(unresolved());
            }
            let Some(source_bytes) = preserved_file_bytes(project, project_dir, source_file) else {
                return Ok(unresolved());
            };
            let baseline = rule_compiler_baseline_bytes(source_name, record_bytes, record_count)?;
            let changed_record_ids = record_ids
                .into_iter()
                .filter(|record_id| {
                    let start = record_id.saturating_mul(record_bytes);
                    let end = start.saturating_add(record_bytes);
                    end > source_bytes.len()
                        || end > baseline.len()
                        || source_bytes[start..end] != baseline[start..end]
                })
                .collect();
            Ok(scenario_local(Some(changed_record_ids)))
        }
    }
}

fn imported_scenario_kind(project: &ProvidenceProject, project_dir: &Path) -> ImportedScenarioKind {
    let Some(source_file) = project.source.files.iter().find(|file| {
        matches!(file.role, SourceFileRole::ResourceFork)
            && source_file_name(file).eq_ignore_ascii_case("Scenario.rsrc")
    }) else {
        return ImportedScenarioKind::Unresolved;
    };
    let Some(bytes) = preserved_file_bytes(project, project_dir, source_file) else {
        return ImportedScenarioKind::Unresolved;
    };
    if parse_resource_fork_entries(&bytes)
        .iter()
        .any(|entry| entry.resource_type == "RLMZ")
    {
        ImportedScenarioKind::BuiltIn
    } else {
        ImportedScenarioKind::ThirdParty
    }
}

fn source_file<'a>(project: &'a ProvidenceProject, name: &str) -> Option<&'a SourceFile> {
    project
        .source
        .files
        .iter()
        .find(|file| source_file_name(file).eq_ignore_ascii_case(name))
}

fn source_file_name(file: &SourceFile) -> &str {
    Path::new(&file.relative_path)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or(&file.name)
}

fn preserved_file_bytes(
    project: &ProvidenceProject,
    project_dir: &Path,
    source_file: &SourceFile,
) -> Option<Vec<u8>> {
    let raw_sources_dir = if project.source.raw_sources_dir.trim().is_empty() {
        PathBuf::from("raw-sources")
    } else {
        safe_relative_path(&project.source.raw_sources_dir)?
    };
    let relative_path = safe_relative_path(&source_file.relative_path)?;
    let bytes = fs::read(project_dir.join(raw_sources_dir).join(relative_path)).ok()?;
    if !source_file.sha256.trim().is_empty()
        && !hex::encode(Sha256::digest(&bytes)).eq_ignore_ascii_case(&source_file.sha256)
    {
        return None;
    }
    Some(bytes)
}

fn safe_relative_path(value: &str) -> Option<PathBuf> {
    let path = Path::new(value);
    if value.trim().is_empty()
        || path.is_absolute()
        || path.components().any(|component| {
            matches!(
                component,
                Component::ParentDir | Component::RootDir | Component::Prefix(_)
            )
        })
    {
        return None;
    }
    Some(path.to_path_buf())
}

fn shared() -> RuleTableEvidence {
    RuleTableEvidence {
        source: RuleTableSource::Shared,
        changed_record_ids: None,
    }
}

fn scenario_local(changed_record_ids: Option<Vec<usize>>) -> RuleTableEvidence {
    RuleTableEvidence {
        source: RuleTableSource::ScenarioLocal,
        changed_record_ids,
    }
}

fn unresolved() -> RuleTableEvidence {
    RuleTableEvidence {
        source: RuleTableSource::Unresolved,
        changed_record_ids: None,
    }
}

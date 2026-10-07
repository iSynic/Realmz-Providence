use crate::{
    execute,
    rebuilt_packages::PackageFinalizationOptions,
    request_params::{required_string, required_u64, required_value},
};
use providence_core::{
    codecs::{decode_string_list_resource, parse_resource_entries_preserving_duplicates},
    model::{
        ClassicRuleSelectionContextV1, ClassicRuleSelectionEvidence, ProjectSnapshot,
        classic_source_set_sha256,
    },
    rebuilt::{
        ApplicationMediaCatalog, ClassicRuleNameOverrides, RebuiltV3RuleCatalog,
        ResolvedClassicRules, resolve_classic_rules,
    },
    session::{EditorCommand, EditorSession},
};
use providence_storage::ProjectStore;
use serde_json::{Value, json};
use std::{fs, io::Cursor};

pub(crate) fn options(params: &Value) -> Result<Option<PackageFinalizationOptions>, String> {
    params
        .get("packageFinalization")
        .filter(|value| !value.is_null())
        .map(|value| {
            serde_json::from_value(value.clone())
                .map_err(|error| format!("invalid application package context: {error}"))
        })
        .transpose()
}

pub(crate) fn blocked(
    snapshot: &ProjectSnapshot,
    message: String,
) -> providence_core::compatibility::TargetCompatibility {
    use providence_core::compatibility::{
        CompatibilityBlocker, CompatibilityStatus, TargetCompatibility, classify_rebuilt_v3,
    };
    TargetCompatibility {
        target: classify_rebuilt_v3(snapshot).target,
        status: CompatibilityStatus::Blocked,
        blockers: vec![CompatibilityBlocker {
            code: "rebuilt.rule-selection.unresolved".into(),
            message,
            entity: Some(snapshot.project_id.clone()),
            group: None,
        }],
        warnings: Vec::new(),
    }
}

pub(crate) fn dispatch(
    session: &mut EditorSession,
    method: &str,
    params: Value,
) -> Result<Value, String> {
    let source_digest = classic_source_set_sha256(session.snapshot())?;
    let current = session.snapshot().classic_rule_selection.as_ref();
    if method == "classic-rule-selection.open" {
        return Ok(
            json!({"revision":session.revision(), "projectId":session.snapshot().project_id, "context":current,
            "contextIdentity":current.map(|context| context.identity()),
            "sourceSetSha256":source_digest,
            "policy":current.map(|context| context.policy()),
            "imported":matches!(session.snapshot().origin, providence_core::model::ProjectOrigin::Imported { .. })}),
        );
    }
    guard_destination(session, &params)?;
    let previous: Option<String> =
        serde_json::from_value(required_value(&params, "expectedPreviousIdentity")?.clone())
            .map_err(|error| format!("invalid previous context identity: {error}"))?;
    let expected_digest = required_value(&params, "expectedSourceSetSha256")?
        .as_str()
        .ok_or("expectedSourceSetSha256 must be text")?
        .to_string();
    let command = match method {
        "classic-rule-selection.set" => {
            let selection = required_value(&params, "nativeMenuSelection")?
                .as_u64()
                .and_then(|value| u16::try_from(value).ok())
                .ok_or("nativeMenuSelection must be a positive native menu integer")?;
            EditorCommand::ClassicRuleSelection(
                providence_core::session::ClassicRuleSelectionCommand::Set {
                    context: ClassicRuleSelectionContextV1 {
                        record_version: 1,
                        project_id: session.snapshot().project_id.clone(),
                        captured_source_set_sha256: source_digest,
                        native_menu_selection: selection,
                        evidence_origin: ClassicRuleSelectionEvidence::OwnerConfigured,
                    },
                    expected_previous_identity: previous,
                    expected_source_set_sha256: expected_digest,
                },
            )
        }
        "classic-rule-selection.clear" => EditorCommand::ClassicRuleSelection(
            providence_core::session::ClassicRuleSelectionCommand::Clear {
                expected_previous_identity: previous,
                expected_source_set_sha256: expected_digest,
            },
        ),
        _ => return Err(format!("unknown method {method}")),
    };
    execute(session, &params, command)
}

pub(crate) fn guard_destination(session: &EditorSession, params: &Value) -> Result<(), String> {
    let expected = required_u64(params, "expectedRevision")?;
    if expected != session.revision().0 {
        return Err(format!(
            "revision conflict: expected {expected}, current {}",
            session.revision().0
        ));
    }
    if required_string(params, "expectedProjectId")? != session.snapshot().project_id.0 {
        return Err("Classic rule choice belongs to a different project".into());
    }
    let identity: Option<String> =
        serde_json::from_value(required_value(params, "expectedPreviousIdentity")?.clone())
            .map_err(|error| format!("invalid previous context identity: {error}"))?;
    if identity
        != session
            .snapshot()
            .classic_rule_selection
            .as_ref()
            .map(|context| context.identity())
    {
        return Err("Classic rule choice changed; reload the saved choice before applying".into());
    }
    if required_string(params, "expectedSourceSetSha256")?
        != classic_source_set_sha256(session.snapshot())?
    {
        return Err("Classic rule choice is stale: captured scenario sources changed".into());
    }
    Ok(())
}

pub(crate) fn prepare(
    session: &EditorSession,
    store: &ProjectStore,
    media: Option<&ApplicationMediaCatalog>,
    options: Option<&PackageFinalizationOptions>,
) -> Result<Option<ResolvedClassicRules>, String> {
    prepare_snapshot(session.snapshot(), store, media, options)
}

pub(crate) fn prepare_snapshot(
    snapshot: &ProjectSnapshot,
    store: &ProjectStore,
    media: Option<&ApplicationMediaCatalog>,
    options: Option<&PackageFinalizationOptions>,
) -> Result<Option<ResolvedClassicRules>, String> {
    if snapshot.classic_rule_selection.is_none() {
        if snapshot
            .startup_authoring
            .as_ref()
            .and_then(|value| value.original_source.as_ref())
            .is_some()
        {
            return Err("Classic rule selection is unresolved; open Scenario and configure the intended Castle execution selection".into());
        }
        return Ok(None);
    }
    store
        .validate_source_blobs(snapshot)
        .map_err(|error| error.to_string())?;
    let options = options
        .ok_or("Classic rule selection requires the pinned Rebuilt application package context")?;
    validate_race_absence(snapshot, store)?;
    let media =
        media.ok_or("Classic rule selection requires the pinned application media catalog")?;
    let bytes = fs::read(&options.application_package)
        .map_err(|error| format!("could not read selected application package: {error}"))?;
    let application = providence_rebuilt_package::inspect_rebuilt_v3_archive(Cursor::new(bytes))
        .map_err(|error| error.to_string())?;
    if application.manifest.campaign_id.0 != options.application_campaign_id
        || application.manifest.package_hash != options.application_package_hash
        || media.library_id.0 != options.application_campaign_id
    {
        return Err("Classic rule selection application package/catalog identity does not match its pinned context".into());
    }
    let names = scenario_names(snapshot, store)?;
    resolve_classic_rules(
        snapshot,
        &RebuiltV3RuleCatalog {
            races: application.content.races,
            castes: application.content.castes,
        },
        &names,
    )
    .map(Some)
}

pub(crate) fn validate_race_absence(
    snapshot: &ProjectSnapshot,
    store: &ProjectStore,
) -> Result<(), String> {
    let Some(context) = &snapshot.classic_rule_selection else {
        return Ok(());
    };
    if context.native_menu_selection < 20
        || snapshot
            .classic_sources
            .iter()
            .any(|source| source.native_path == "Data Race")
        || snapshot.race_rules.iter().any(|rule| {
            rule.source_blob.is_none() || rule.source.starts_with("Scenario Data Race ")
        })
    {
        return Ok(());
    }
    let providence_core::model::ProjectOrigin::Imported {
        compatibility_annex,
    } = &snapshot.origin
    else {
        return Ok(());
    };
    let bytes = store
        .read_blob(compatibility_annex)
        .map_err(|error| error.to_string())?;
    let inventory: Value = serde_json::from_slice(&bytes)
        .map_err(|error| format!("Classic source inventory is unreadable: {error}"))?;
    if inventory
        .get("sourceInventoryVersion")
        .and_then(Value::as_u64)
        == Some(2)
    {
        return Ok(());
    }
    Err("This project's original source inventory cannot establish whether Data Race is absent. Reimport the scenario before selecting scenario rules; the saved original remains intact.".into())
}

fn scenario_names(
    snapshot: &ProjectSnapshot,
    store: &ProjectStore,
) -> Result<ClassicRuleNameOverrides, String> {
    let mut names = ClassicRuleNameOverrides {
        races: None,
        castes: None,
    };
    let Some(source) = snapshot
        .classic_sources
        .iter()
        .find(|source| source.native_path == "Scenario.rsrc")
    else {
        return Ok(names);
    };
    let bytes = store
        .read_blob(&source.blob)
        .map_err(|error| error.to_string())?;
    let entries = parse_resource_entries_preserving_duplicates(&bytes)
        .map_err(|error| format!("scenario rule-name resource fork: {error}"))?;
    for (id, destination) in [(129, &mut names.races), (131, &mut names.castes)] {
        if entries
            .iter()
            .filter(|entry| entry.resource_type == *b"STR#" && entry.id == id)
            .count()
            > 1
        {
            return Err(format!("scenario rule-name STR# {id} is ambiguous"));
        }
        *destination =
            decode_string_list_resource(&bytes, id).map_err(|error| error.to_string())?;
    }
    Ok(names)
}

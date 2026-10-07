use crate::{
    execute,
    request_params::{required_string, required_u64},
};
use providence_core::{
    codecs::{decode_scenario_security, security_backup_mask},
    model::{CampaignMetadata, ClassicSourceBlob, ScenarioSecurityAuthoring},
    registration::{RegistrationInput, registration_variants},
    session::EditorSession,
};
use providence_storage::ProjectStore;
use serde_json::{Value, json};

struct SecuritySources {
    startup: Option<Vec<u8>>,
    backup: Option<Vec<u8>>,
    backup_source: Option<ClassicSourceBlob>,
    source_selection_required: bool,
}

fn sources(
    session: &EditorSession,
    store: Option<&ProjectStore>,
    selected: Option<&ClassicSourceBlob>,
) -> Result<SecuritySources, String> {
    let snapshot = session.snapshot();
    let established = snapshot
        .startup_authoring
        .as_ref()
        .and_then(|value| value.original_source.as_ref());
    if let Some(selected) = selected {
        if established.is_some_and(|source| source != selected) {
            return Err("The original startup source is already established.".into());
        }
        let matching = snapshot
            .classic_sources
            .iter()
            .filter(|source| source.native_path == selected.native_path)
            .collect::<Vec<_>>();
        if matching.len() != 1 || matching[0] != selected || selected.byte_length < 316 {
            return Err("The selected original startup source changed or is incomplete.".into());
        }
        providence_core::codecs::validate_marker_filename(&selected.native_path)?;
    }
    let original = established.or(selected);
    let source_selection_required = matches!(
        snapshot.origin,
        providence_core::model::ProjectOrigin::Imported { .. }
    ) && snapshot.campaign.is_some()
        && original.is_none();
    let name = if source_selection_required {
        None
    } else {
        original
            .map(|source| source.native_path.as_str())
            .or_else(|| {
                snapshot
                    .campaign
                    .as_ref()
                    .map(|campaign| campaign.name.as_str())
            })
    };
    let (startup_source, startup) = read_source(snapshot, store, name)?;
    if original.is_some_and(|identity| startup_source.as_ref() != Some(identity)) {
        return Err("The retained startup source no longer matches its original identity.".into());
    }
    let (backup_source, backup) = read_source(snapshot, store, Some("Data CS"))?;
    Ok(SecuritySources {
        startup,
        backup,
        backup_source,
        source_selection_required,
    })
}

pub(crate) fn read(session: &EditorSession, store: Option<&ProjectStore>) -> Result<Value, String> {
    read_with_source(session, store, None)
}

fn read_with_source(
    session: &EditorSession,
    store: Option<&ProjectStore>,
    selected: Option<&ClassicSourceBlob>,
) -> Result<Value, String> {
    let sources = sources(session, store, selected)?;
    let snapshot = session.snapshot();
    let authored = snapshot
        .startup_authoring
        .as_ref()
        .and_then(|value| value.security.as_ref());
    let decoded = if let Some(security) = authored {
        Ok((security.segment1.clone(), security.segment2.clone()))
    } else if let Some(bytes) = sources.startup.as_deref() {
        decode_scenario_security(bytes, sources.backup.as_deref())
            .map_err(|error| error.to_string())
    } else {
        Ok((String::new(), String::new()))
    };
    let (first, second, reason) = if sources.source_selection_required {
        (String::new(), String::new(), Some("Choose the original startup file before editing Security. The selection stays in this draft until Apply.".into()))
    } else {
        match decoded {
            Ok((first, second)) => (first, second, None),
            Err(reason) => (String::new(), String::new(), Some(reason)),
        }
    };
    let neutral = CampaignMetadata::neutral();
    let campaign = snapshot.campaign.as_ref().unwrap_or(&neutral);
    let title = snapshot
        .startup_authoring
        .as_ref()
        .map(|value| value.marker_filename.as_str())
        .unwrap_or(&campaign.name);
    Ok(
        json!({ "revision": session.revision(), "policy": "explicit-authoring", "editable": true,
            "segment1": first, "segment2": second, "decodingAvailable": reason.is_none(), "reason": reason,
            "runtimeTitle": title, "scenarioSlot": providence_core::registration::official_scenario_slot(title),
            "recommendedLevel": campaign.recommended_party_levels, "maximumLevel": campaign.maximum_party_levels,
            "backupSource": sources.backup_source, "backupPresent": sources.backup.is_some(),
            "backupNeedsRepair": sources.backup.as_ref().is_some_and(|bytes| bytes.len() < 316),
            "backupRepairAccepted": authored.is_some_and(|value| value.repair_backup),
            "sourceSelectionRequired": sources.source_selection_required, "selectedSource": selected,
            "sourceCandidates": source_page(session, "", 0)["items"],
        }),
    )
}

pub(crate) fn dispatch(
    session: &mut EditorSession,
    store: Option<&ProjectStore>,
    method: &str,
    params: &Value,
) -> Result<Value, String> {
    let expected = required_u64(params, "expectedRevision")?;
    if expected != session.revision().0 {
        return Err("Scenario changed. Reload before continuing.".into());
    }
    match method {
        "scenario-security.validate" => {
            let error = providence_core::codecs::validate_security_segments(
                &required_string(params, "segment1")?,
                &required_string(params, "segment2")?,
            )
            .err()
            .map(|error| error.to_string());
            Ok(json!({"revision": session.revision(), "valid": error.is_none(), "error": error}))
        }
        "scenario-security.repair-preview" => repair_preview(session, store),
        "scenario-security.source-list" => Ok(source_page(
            session,
            params.get("search").and_then(Value::as_str).unwrap_or(""),
            params.get("offset").and_then(Value::as_u64).unwrap_or(0) as usize,
        )),
        "scenario-security.source-preview" => {
            let source: ClassicSourceBlob = serde_json::from_value(
                crate::request_params::required_value(params, "startupSource")?.clone(),
            )
            .map_err(|error| error.to_string())?;
            read_with_source(session, store, Some(&source))
        }
        "scenario-security.update" => update(session, store, params),
        "scenario-registration.generate" => generate(session, params),
        _ => Err(format!("unknown method {method}")),
    }
}

fn source_page(session: &EditorSession, search: &str, offset: usize) -> Value {
    let needle = search.trim().to_lowercase();
    let candidates = session
        .snapshot()
        .classic_sources
        .iter()
        .filter(|source| {
            source.byte_length >= 316
                && providence_core::codecs::validate_marker_filename(&source.native_path).is_ok()
                && (needle.is_empty() || source.native_path.to_lowercase().contains(&needle))
        })
        .collect::<Vec<_>>();
    let total = candidates.len();
    let offset = offset.min(total.saturating_sub(1) / 64 * 64);
    json!({"revision": session.revision(), "items": candidates.into_iter().skip(offset).take(64).collect::<Vec<_>>(),
        "total": total, "offset": offset, "limit": 64})
}

fn repair_preview(session: &EditorSession, store: Option<&ProjectStore>) -> Result<Value, String> {
    let sources = sources(session, store, None)?;
    let actual = sources.backup.as_ref().map(Vec::len).unwrap_or(0);
    Ok(
        json!({ "revision": session.revision(), "backupSource": sources.backup_source,
        "operation": if sources.backup.is_none() { "create" } else if actual < 316 { "extend" } else { "preserve" },
        "beforeBytes": actual, "afterBytes": actual.max(316), "initializedBytes": 316_usize.saturating_sub(actual),
        "description": "Existing backup bytes and the original source remain intact. Only missing bytes are initialized to zero." }),
    )
}

fn update(
    session: &mut EditorSession,
    store: Option<&ProjectStore>,
    params: &Value,
) -> Result<Value, String> {
    let startup_source: Option<ClassicSourceBlob> = params
        .get("startupSource")
        .map(|value| serde_json::from_value(value.clone()).map_err(|error| error.to_string()))
        .transpose()?;
    let sources = sources(session, store, startup_source.as_ref())?;
    if sources.source_selection_required {
        return Err("Choose the original startup file before applying Security.".into());
    }
    let repair = sources
        .backup
        .as_ref()
        .is_some_and(|bytes| bytes.len() < 316);
    if repair {
        let receipt = params
            .get("repairPreview")
            .ok_or("Review the incomplete backup allocation first.")?;
        if receipt.get("revision").and_then(Value::as_u64) != Some(session.revision().0)
            || receipt.get("backupSource")
                != Some(
                    &serde_json::to_value(&sources.backup_source)
                        .map_err(|error| error.to_string())?,
                )
        {
            return Err("The reviewed backup allocation is stale.".into());
        }
    }
    let security = ScenarioSecurityAuthoring {
        segment1: required_string(params, "segment1")?,
        segment2: required_string(params, "segment2")?,
        backup_mask: sources
            .backup
            .as_deref()
            .map(security_backup_mask)
            .unwrap_or([0; 20]),
        backup_source: sources.backup_source,
        repair_backup: repair,
    };
    execute(
        session,
        params,
        providence_core::session::ScenarioAuthoringEdit::Security {
            security,
            startup_source,
        }
        .into(),
    )
}

fn generate(session: &EditorSession, params: &Value) -> Result<Value, String> {
    let snapshot = session.snapshot();
    let neutral = CampaignMetadata::neutral();
    let campaign = snapshot.campaign.as_ref().unwrap_or(&neutral);
    let input = RegistrationInput {
        scenario_name: snapshot
            .startup_authoring
            .as_ref()
            .map(|value| value.marker_filename.clone())
            .unwrap_or_else(|| campaign.name.clone()),
        segment1: required_string(params, "segment1")?,
        segment2: required_string(params, "segment2")?,
        registration_name: required_string(params, "registrationName")?,
        serial_number: required_string(params, "serialNumber")?,
        recommended_level: campaign.recommended_party_levels,
        maximum_level: campaign.maximum_party_levels,
    };
    Ok(
        json!({ "revision": session.revision(), "runtimeTitle": input.scenario_name,
        "variants": registration_variants(&input)?, "mutatesProject": false }),
    )
}

fn read_source(
    snapshot: &providence_core::model::ProjectSnapshot,
    store: Option<&ProjectStore>,
    path: Option<&str>,
) -> Result<(Option<ClassicSourceBlob>, Option<Vec<u8>>), String> {
    let matches = snapshot
        .classic_sources
        .iter()
        .filter(|source| Some(source.native_path.as_str()) == path)
        .collect::<Vec<_>>();
    if matches.len() > 1 {
        return Err(format!("Source {} is ambiguous.", path.unwrap_or_default()));
    }
    let source = matches.first().copied().cloned();
    let bytes = source
        .as_ref()
        .map(|source| {
            store
                .ok_or("Open a persistent project to inspect retained security bytes.")?
                .read_blob(&source.blob)
                .map_err(|error| error.to_string())
        })
        .transpose()?;
    Ok((source, bytes))
}

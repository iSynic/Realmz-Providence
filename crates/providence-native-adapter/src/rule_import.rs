use crate::execute;
use crate::request_params::required_string;
use providence_core::codecs::RACE_RECORD_BYTES;
use providence_core::codecs::decode_caste_rules;
use providence_core::codecs::decode_race_rules;
use providence_core::codecs::decode_rule_name_catalog;
use providence_core::codecs::decode_scenario_item_rules;
use providence_core::codecs::decode_standard_item_rules;
use providence_core::codecs::derive_caste_eligibility;
use providence_core::codecs::encode_caste_rules;
use providence_core::codecs::encode_race_rules;
use providence_core::codecs::encode_scenario_item_rules;
use providence_core::codecs::encode_standard_item_rules;
use providence_core::session::EditorCommand;
use providence_core::session::EditorSession;
use providence_storage::ProjectStore;
use serde_json::Value;
use serde_json::json;
use std::fs;

pub(crate) fn import_race_rules(
    session: &mut EditorSession,
    store: Option<&ProjectStore>,
    params: Value,
) -> Result<Value, String> {
    let store = store.ok_or_else(|| {
        "race-rules.import requires serve-project so Data Race bytes have a durable blob store"
            .to_string()
    })?;
    let path = required_string(&params, "path")?;
    let bytes = fs::read(&path).map_err(|error| format!("could not read Data Race: {error}"))?;
    let blob = store.put_blob(&bytes).map_err(|error| error.to_string())?;
    let decoded = decode_race_rules(&bytes, Some(blob));
    if decoded.rules.len() != 30 {
        return Err(format!(
            "Data Race must contain at least 30 complete {RACE_RECORD_BYTES}-byte records; found {} records and {} trailing bytes",
            decoded.rules.len(),
            decoded.trailing_bytes.len()
        ));
    }
    let round_trip = encode_race_rules(&decoded.rules, Some(&bytes))
        .map_err(|error| format!("Data Race failed native validation: {error}"))?;
    if round_trip != bytes {
        return Err("Data Race failed exact no-edit round-trip validation".into());
    }
    let trailing_bytes = decoded.trailing_bytes.len();
    let mut result = execute(
        session,
        &params,
        EditorCommand::ReplaceRaceRules {
            rules: decoded.rules,
        },
    )?;
    if let Some(object) = result.as_object_mut() {
        object.insert("trailingBytes".into(), json!(trailing_bytes));
        object.insert(
            "trailingDisposition".into(),
            json!(if trailing_bytes == 0 {
                "none"
            } else {
                "preserved-source-bytes"
            }),
        );
    }
    Ok(result)
}

pub(crate) fn import_caste_rules(
    session: &mut EditorSession,
    store: Option<&ProjectStore>,
    params: Value,
) -> Result<Value, String> {
    let store = store.ok_or_else(|| {
        "caste-rules.import requires serve-project so Data Caste bytes have a durable blob store"
            .to_string()
    })?;
    if session.snapshot().race_rules.len() != 30 {
        return Err(
            "caste-rules.import requires the complete 30-record race table for reciprocal eligibility"
                .into(),
        );
    }
    let path = required_string(&params, "path")?;
    let bytes = fs::read(&path).map_err(|error| format!("could not read Data Caste: {error}"))?;
    let blob = store.put_blob(&bytes).map_err(|error| error.to_string())?;
    let mut decoded = decode_caste_rules(&bytes, Some(blob));
    if decoded.rules.len() != 30 || !decoded.trailing_bytes.is_empty() {
        return Err(format!(
            "Data Caste must contain exactly 30 576-byte records; found {} records and {} trailing bytes",
            decoded.rules.len(),
            decoded.trailing_bytes.len()
        ));
    }
    let round_trip = encode_caste_rules(&decoded.rules, Some(&bytes))
        .map_err(|error| format!("Data Caste failed native validation: {error}"))?;
    if round_trip != bytes {
        return Err("Data Caste failed exact no-edit round-trip validation".into());
    }
    derive_caste_eligibility(&session.snapshot().race_rules, &mut decoded.rules)
        .map_err(|error| format!("Data Caste eligibility is invalid: {error}"))?;
    execute(
        session,
        &params,
        EditorCommand::ReplaceCasteRules {
            rules: decoded.rules,
        },
    )
}

pub(crate) fn import_rule_names(
    session: &mut EditorSession,
    store: Option<&ProjectStore>,
    params: Value,
) -> Result<Value, String> {
    let store = store.ok_or_else(|| {
        "rule-names.import requires serve-project so Custom Names bytes have a durable blob store"
            .to_string()
    })?;
    let path = required_string(&params, "path")?;
    let bytes = fs::read(&path).map_err(|error| format!("could not read Custom Names: {error}"))?;
    let blob = store.put_blob(&bytes).map_err(|error| error.to_string())?;
    let source = params
        .get("source")
        .and_then(Value::as_str)
        .unwrap_or("Data Files/Custom Names.rsrc")
        .to_string();
    let catalog = decode_rule_name_catalog(&bytes, source, blob)
        .map_err(|error| format!("Custom Names failed native validation: {error}"))?;
    execute(
        session,
        &params,
        EditorCommand::SetRuleNameCatalog { catalog },
    )
}

pub(crate) fn import_standard_items(
    session: &mut EditorSession,
    store: Option<&ProjectStore>,
    params: Value,
) -> Result<Value, String> {
    let store = store.ok_or_else(|| {
        "item-rules.import-standard requires serve-project so Data ID sources have a durable blob store"
            .to_string()
    })?;
    let path = required_string(&params, "path")?;
    let text_path = required_string(&params, "textPath")?;
    let bytes = fs::read(&path).map_err(|error| format!("could not read Data ID: {error}"))?;
    let text_bytes = fs::read(&text_path)
        .map_err(|error| format!("could not read Data ID text resource: {error}"))?;
    let blob = store.put_blob(&bytes).map_err(|error| error.to_string())?;
    let text_blob = store
        .put_blob(&text_bytes)
        .map_err(|error| error.to_string())?;
    let decoded = decode_standard_item_rules(&bytes, &text_bytes, blob, text_blob)
        .map_err(|error| format!("standard item catalog failed native validation: {error}"))?;
    let round_trip = encode_standard_item_rules(&decoded.rules, &bytes)
        .map_err(|error| format!("standard item catalog failed native validation: {error}"))?;
    if round_trip != bytes {
        return Err("Data ID failed exact no-edit round-trip validation".into());
    }
    let warnings = decoded.warnings.clone();
    let mut result = execute(
        session,
        &params,
        EditorCommand::ReplaceItemRules {
            rules: decoded.rules,
        },
    )?;
    if let Some(object) = result.as_object_mut() {
        object.insert("sourceWarnings".into(), json!(warnings));
    }
    Ok(result)
}

pub(crate) fn import_scenario_items(
    session: &mut EditorSession,
    store: Option<&ProjectStore>,
    params: Value,
) -> Result<Value, String> {
    let store = store.ok_or_else(|| {
        "item-rules.import-scenario requires serve-project so Data NI sources have a durable blob store"
            .to_string()
    })?;
    let path = required_string(&params, "path")?;
    let text_path = params.get("textPath").and_then(Value::as_str);
    let bytes = fs::read(&path).map_err(|error| format!("could not read Data NI: {error}"))?;
    let text_bytes = text_path
        .map(|path| {
            fs::read(path)
                .map_err(|error| format!("could not read scenario item text resource: {error}"))
        })
        .transpose()?;
    let blob = store.put_blob(&bytes).map_err(|error| error.to_string())?;
    let text_blob = text_bytes
        .as_ref()
        .map(|bytes| store.put_blob(bytes).map_err(|error| error.to_string()))
        .transpose()?;
    let decoded = decode_scenario_item_rules(&bytes, text_bytes.as_deref(), blob, text_blob)
        .map_err(|error| format!("scenario item catalog failed native validation: {error}"))?;
    let round_trip = encode_scenario_item_rules(&decoded.rules, &bytes)
        .map_err(|error| format!("scenario item catalog failed native validation: {error}"))?;
    if round_trip != bytes {
        return Err("Data NI failed exact no-edit round-trip validation".into());
    }
    let warnings = decoded.warnings.clone();
    let mut result = execute(
        session,
        &params,
        EditorCommand::ReplaceScenarioItemRules {
            rules: decoded.rules,
        },
    )?;
    if let Some(object) = result.as_object_mut() {
        object.insert("sourceWarnings".into(), json!(warnings));
    }
    Ok(result)
}

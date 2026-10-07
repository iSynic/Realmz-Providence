use crate::request_params::required_string;
use providence_core::codecs::encode_scenario_item_rules;
use providence_core::codecs::encode_scenario_item_text_resources;
use providence_core::codecs::encode_scenario_spell_name_resources;
use providence_core::codecs::encode_scenario_spells;
use providence_core::session::EditorSession;
use providence_storage::ProjectStore;
use serde_json::Value;
use serde_json::json;
use std::fs;
use std::path::PathBuf;

pub(crate) fn compile_scenario_items(
    session: &EditorSession,
    store: Option<&ProjectStore>,
    params: Value,
) -> Result<Value, String> {
    let store = store.ok_or_else(|| {
        "project.compile-data-ni requires serve-project so compatibility source bytes are available"
            .to_string()
    })?;
    let first = item_catalog_source(session)?;
    let compatibility_source = store
        .read_blob(&first.source_blob)
        .map_err(|error| error.to_string())?;
    let output = encode_scenario_item_rules(
        &session.snapshot().scenario_item_rules,
        &compatibility_source,
    )
    .map_err(|error| format!("Data NI compile failed: {error}"))?;
    let has_item_text = session.snapshot().scenario_item_rules.iter().any(|rule| {
        !rule.definition.unidentified_name.is_empty()
            || !rule.definition.name.is_empty()
            || !rule.definition.description.is_empty()
    });
    let text_path = params
        .get("textPath")
        .and_then(Value::as_str)
        .map(PathBuf::from);
    if (first.text_source_blob.is_some() || has_item_text) && text_path.is_none() {
        return Err(
            "project.compile-data-ni requires textPath when the scenario item catalog owns text"
                .into(),
        );
    }
    let text_output = text_path
        .as_ref()
        .map(|_| compile_item_text(session, store, first))
        .transpose()?;
    let path = PathBuf::from(required_string(&params, "path")?);
    fs::write(&path, &output)
        .map_err(|error| format!("could not write {}: {error}", path.display()))?;
    if let (Some(text_path), Some(text_output)) = (&text_path, &text_output) {
        fs::write(text_path, text_output)
            .map_err(|error| format!("could not write {}: {error}", text_path.display()))?;
    }
    let mut result = json!({
        "revision": session.revision(),
        "path": path,
        "bytes": output.len(),
    });
    if let (Some(text_path), Some(text_output)) = (text_path, text_output) {
        result["textPath"] = json!(text_path);
        result["textBytes"] = json!(text_output.len());
    }
    Ok(result)
}

pub(crate) fn compile_data_spell(
    session: &EditorSession,
    store: Option<&ProjectStore>,
    params: Value,
) -> Result<Value, String> {
    let store = store.ok_or_else(|| {
        "project.compile-data-spell requires serve-project so compatibility source bytes are available"
            .to_string()
    })?;
    if session.snapshot().scenario_spells.is_empty() {
        return Err("Create or import Custom spells before compiling Data Spell".into());
    }
    let compatibility_source = crate::spell_drafts::binary_source(session, store)?;
    let output = encode_scenario_spells(
        &session.snapshot().scenario_spells,
        compatibility_source.as_deref(),
    )
    .map_err(|error| format!("Data Spell compile failed: {error}"))?;
    let text_output = compile_spell_names(session, store)?;
    let path = PathBuf::from(required_string(&params, "path")?);
    let text_path = PathBuf::from(required_string(&params, "textPath")?);
    fs::write(&path, &output)
        .map_err(|error| format!("could not write {}: {error}", path.display()))?;
    fs::write(&text_path, &text_output)
        .map_err(|error| format!("could not write {}: {error}", text_path.display()))?;
    Ok(json!({
        "revision": session.revision(),
        "path": path,
        "bytes": output.len(),
        "textPath": text_path,
        "textBytes": text_output.len(),
    }))
}

fn item_catalog_source(
    session: &EditorSession,
) -> Result<&providence_core::model::SourcedScenarioItemRule, String> {
    let first = session
        .snapshot()
        .scenario_item_rules
        .first()
        .ok_or_else(|| {
            "project.compile-data-ni requires an imported Data NI catalog".to_string()
        })?;
    if session
        .snapshot()
        .scenario_item_rules
        .iter()
        .any(|rule| rule.source_blob != first.source_blob)
    {
        return Err("Data NI catalog has inconsistent binary source identities".into());
    }
    if session
        .snapshot()
        .scenario_item_rules
        .iter()
        .any(|rule| rule.text_source_blob != first.text_source_blob)
    {
        return Err("Data NI catalog has inconsistent text source identities".into());
    }
    Ok(first)
}

fn compile_spell_names(session: &EditorSession, store: &ProjectStore) -> Result<Vec<u8>, String> {
    let text_source_blob = session.snapshot().scenario_spells[0]
        .text_source_blob
        .as_ref();
    if session
        .snapshot()
        .scenario_spells
        .iter()
        .any(|spell| spell.text_source_blob.as_ref() != text_source_blob)
    {
        return Err("Data Spell catalog has inconsistent name-source identities".into());
    }
    let compatibility_text = text_source_blob
        .map(|blob| store.read_blob(blob).map_err(|error| error.to_string()))
        .transpose()?;
    let text_output = encode_scenario_spell_name_resources(
        &session.snapshot().scenario_spells,
        compatibility_text.as_deref(),
    )
    .map_err(|error| format!("Data Spell name compile failed: {error}"))?;
    Ok(text_output)
}

fn compile_item_text(
    session: &EditorSession,
    store: &ProjectStore,
    first: &providence_core::model::SourcedScenarioItemRule,
) -> Result<Vec<u8>, String> {
    let compatibility_text = first
        .text_source_blob
        .as_ref()
        .map(|blob| store.read_blob(blob).map_err(|error| error.to_string()))
        .transpose()?;
    encode_scenario_item_text_resources(
        &session.snapshot().scenario_item_rules,
        compatibility_text.as_deref(),
    )
    .map_err(|error| format!("Data NI text compile failed: {error}"))
}

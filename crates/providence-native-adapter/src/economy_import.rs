use crate::classic_source_retention::replace_sources;
use crate::execute;
use crate::request_params::required_string;
use providence_core::codecs::OPTION_LABEL_RECORD_BYTES;
use providence_core::codecs::SHOP_RECORD_BYTES;
use providence_core::codecs::TREASURE_RECORD_BYTES;
use providence_core::codecs::decode_option_labels;
use providence_core::codecs::decode_shops;
use providence_core::codecs::decode_treasures;
use providence_core::codecs::encode_option_labels;
use providence_core::codecs::encode_shops;
use providence_core::codecs::encode_treasures;
use providence_core::session::EditorCommand;
use providence_core::session::EditorSession;
use providence_storage::ProjectStore;
use serde_json::Value;
use serde_json::json;
use std::fs;
use std::path::{Path, PathBuf};

pub(crate) fn import_classic_treasures(
    session: &mut EditorSession,
    store: Option<&ProjectStore>,
    params: Value,
) -> Result<Value, String> {
    let store = store.ok_or_else(|| {
        "project.import-classic-treasures requires serve-project so source bytes are durable"
            .to_string()
    })?;
    let directory = PathBuf::from(required_string(&params, "directory")?);
    let path = directory.join("Data TD");
    if !path.is_file() {
        return Err(format!("{} is required", path.display()));
    }
    let bytes =
        fs::read(&path).map_err(|error| format!("could not read {}: {error}", path.display()))?;
    if bytes.len() < TREASURE_RECORD_BYTES {
        return Err(format!(
            "Data TD must contain at least one complete {TREASURE_RECORD_BYTES}-byte record"
        ));
    }
    let decoded = decode_treasures(&bytes);
    if encode_treasures(&decoded.records, Some(&bytes)).map_err(|error| error.to_string())? != bytes
    {
        return Err("Data TD failed exact no-edit round-trip validation".into());
    }

    let sources = replace_sources(
        &session.snapshot().classic_sources,
        store,
        &[("Data TD", &bytes)],
    )?;
    let annex_bytes = serde_json::to_vec(&json!({
        "format": "providence-classic-source-annex-v1",
        "files": sources,
    }))
    .map_err(|error| format!("could not encode compatibility annex: {error}"))?;
    let annex_blob = store
        .put_blob(&annex_bytes)
        .map_err(|error| error.to_string())?;
    let count = decoded.records.len();
    let trailing_bytes = decoded.trailing_bytes.len();
    let mut result = execute(
        session,
        &params,
        EditorCommand::ImportClassicTreasureSlice {
            annex_blob,
            sources,
            treasures: decoded.records,
        },
    )?;
    if let Some(object) = result.as_object_mut() {
        object.insert("count".into(), json!(count));
        object.insert("trailingBytes".into(), json!(trailing_bytes));
    }
    Ok(result)
}

pub(crate) fn import_classic_shops(
    session: &mut EditorSession,
    store: Option<&ProjectStore>,
    params: Value,
) -> Result<Value, String> {
    let store = store.ok_or_else(|| {
        "project.import-classic-shops requires serve-project so source bytes are durable"
            .to_string()
    })?;
    let directory = PathBuf::from(required_string(&params, "directory")?);
    let bytes = read_shop_source(&directory)?;
    let decoded = decode_shops(&bytes);
    let quarantined = decoded
        .quarantined_records
        .iter()
        .take(32)
        .map(|row| json!({"nativeId":row.native_id, "reason":row.reason}))
        .collect::<Vec<_>>();
    let quarantined_count = decoded.quarantined_records.len();
    if encode_shops(&decoded.records, Some(&bytes)).map_err(|error| error.to_string())? != bytes {
        return Err("Data SD failed exact no-edit round-trip validation".into());
    }
    let sources = replace_sources(
        &session.snapshot().classic_sources,
        store,
        &[("Data SD", &bytes)],
    )?;
    let annex_bytes = serde_json::to_vec(
        &json!({"format": "providence-classic-source-annex-v1", "files": sources}),
    )
    .map_err(|error| format!("could not encode compatibility annex: {error}"))?;
    let annex_blob = store
        .put_blob(&annex_bytes)
        .map_err(|error| error.to_string())?;
    let count = decoded.records.len();
    let trailing_bytes = decoded.trailing_bytes.len();
    let mut result = execute(
        session,
        &params,
        EditorCommand::ImportClassicShopSlice {
            annex_blob,
            sources,
            shops: decoded.records,
        },
    )?;
    if let Some(object) = result.as_object_mut() {
        object.insert("count".into(), json!(count));
        object.insert("trailingBytes".into(), json!(trailing_bytes));
        object.insert("quarantinedRecords".into(), json!(quarantined));
        object.insert("quarantinedCount".into(), json!(quarantined_count));
    }
    Ok(result)
}

pub(crate) fn import_classic_option_labels(
    session: &mut EditorSession,
    store: Option<&ProjectStore>,
    params: Value,
) -> Result<Value, String> {
    let store = store.ok_or_else(|| {
        "project.import-classic-option-labels requires serve-project so source bytes are durable"
            .to_string()
    })?;
    let directory = PathBuf::from(required_string(&params, "directory")?);
    let path = directory.join("Data OD");
    if !path.is_file() {
        return Err(format!("{} is required", path.display()));
    }
    let bytes =
        fs::read(&path).map_err(|error| format!("could not read {}: {error}", path.display()))?;
    if bytes.len() < OPTION_LABEL_RECORD_BYTES {
        return Err(format!(
            "Data OD must contain at least one complete {OPTION_LABEL_RECORD_BYTES}-byte record"
        ));
    }
    let decoded = decode_option_labels(&bytes);
    if encode_option_labels(&decoded.records, Some(&bytes)).map_err(|error| error.to_string())?
        != bytes
    {
        return Err("Data OD failed exact no-edit round-trip validation".into());
    }
    let sources = replace_sources(
        &session.snapshot().classic_sources,
        store,
        &[("Data OD", &bytes)],
    )?;
    let annex_bytes = serde_json::to_vec(
        &json!({"format": "providence-classic-source-annex-v1", "files": sources}),
    )
    .map_err(|error| format!("could not encode compatibility annex: {error}"))?;
    let annex_blob = store
        .put_blob(&annex_bytes)
        .map_err(|error| error.to_string())?;
    let count = decoded.records.len();
    let trailing_bytes = decoded.trailing_bytes.len();
    let mut result = execute(
        session,
        &params,
        EditorCommand::ImportClassicOptionLabelSlice {
            annex_blob,
            sources,
            option_labels: decoded.records,
        },
    )?;
    if let Some(object) = result.as_object_mut() {
        object.insert("count".into(), json!(count));
        object.insert("trailingBytes".into(), json!(trailing_bytes));
    }
    Ok(result)
}

fn read_shop_source(directory: &Path) -> Result<Vec<u8>, String> {
    let path = directory.join("Data SD");
    if !path.is_file() {
        return Err(format!("{} is required", path.display()));
    }
    let bytes =
        fs::read(&path).map_err(|error| format!("could not read {}: {error}", path.display()))?;
    if bytes.len() < SHOP_RECORD_BYTES {
        return Err(format!(
            "Data SD must contain at least one complete {SHOP_RECORD_BYTES}-byte record"
        ));
    }
    Ok(bytes)
}

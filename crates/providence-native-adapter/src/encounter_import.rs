use crate::classic_source_retention::replace_sources;
use crate::execute;
use crate::request_params::required_string;
use providence_core::codecs::COMPLEX_ENCOUNTER_RECORD_BYTES;
use providence_core::codecs::ROGUE_ENCOUNTER_RECORD_BYTES;
use providence_core::codecs::TIMED_ENCOUNTER_RECORD_BYTES;
use providence_core::codecs::decode_complex_encounters;
use providence_core::codecs::decode_rogue_encounters;
use providence_core::codecs::decode_timed_encounters;
use providence_core::codecs::encode_complex_encounters;
use providence_core::codecs::encode_rogue_encounters;
use providence_core::codecs::encode_timed_encounters;
use providence_core::session::EditorCommand;
use providence_core::session::EditorSession;
use providence_storage::ProjectStore;
use serde_json::Value;
use serde_json::json;
use std::fs;
use std::path::PathBuf;

pub(crate) fn import_classic_complex_encounters(
    session: &mut EditorSession,
    store: Option<&ProjectStore>,
    params: Value,
) -> Result<Value, String> {
    let store = store.ok_or_else(|| {
        "project.import-classic-complex-encounters requires serve-project so source bytes are durable"
            .to_string()
    })?;
    let directory = PathBuf::from(required_string(&params, "directory")?);
    let (bytes, decoded) = read_complex_encounters(&directory)?;
    let imported = read_complex_encounter_sources(&directory, &bytes)?;
    let replacements = imported
        .iter()
        .map(|(path, bytes)| (path.as_str(), bytes.as_slice()))
        .collect::<Vec<_>>();
    let sources = replace_sources(&session.snapshot().classic_sources, store, &replacements)?;
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
    let has_rogue_source = sources
        .iter()
        .any(|source| source.native_path == "Data TD2");
    let mut result = execute(
        session,
        &params,
        EditorCommand::ImportClassicComplexEncounterSlice {
            annex_blob,
            sources,
            complex_encounters: decoded.records,
        },
    )?;
    if let Some(object) = result.as_object_mut() {
        object.insert("count".into(), json!(count));
        object.insert("trailingBytes".into(), json!(trailing_bytes));
        object.insert("hasRogueSource".into(), json!(has_rogue_source));
    }
    Ok(result)
}

pub(crate) fn import_classic_rogue_encounters(
    session: &mut EditorSession,
    store: Option<&ProjectStore>,
    params: Value,
) -> Result<Value, String> {
    let store = store.ok_or_else(|| {
        "project.import-classic-rogue-encounters requires serve-project so source bytes are durable"
            .to_string()
    })?;
    let directory = PathBuf::from(required_string(&params, "directory")?);
    let path = directory.join("Data TD2");
    if !path.is_file() {
        return Err(format!("{} is required", path.display()));
    }
    let bytes =
        fs::read(&path).map_err(|error| format!("could not read {}: {error}", path.display()))?;
    if bytes.len() < ROGUE_ENCOUNTER_RECORD_BYTES {
        return Err(format!(
            "Data TD2 must contain at least one complete {ROGUE_ENCOUNTER_RECORD_BYTES}-byte record"
        ));
    }
    let decoded = decode_rogue_encounters(&bytes);
    if encode_rogue_encounters(&decoded.records, Some(&bytes)).map_err(|error| error.to_string())?
        != bytes
    {
        return Err("Data TD2 failed exact no-edit round-trip validation".into());
    }

    let sources = replace_sources(
        &session.snapshot().classic_sources,
        store,
        &[("Data TD2", &bytes)],
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
        EditorCommand::ImportClassicRogueEncounterSlice {
            annex_blob,
            sources,
            rogue_encounters: decoded.records,
        },
    )?;
    if let Some(object) = result.as_object_mut() {
        object.insert("count".into(), json!(count));
        object.insert("trailingBytes".into(), json!(trailing_bytes));
    }
    Ok(result)
}

pub(crate) fn import_classic_timed_encounters(
    session: &mut EditorSession,
    store: Option<&ProjectStore>,
    params: Value,
) -> Result<Value, String> {
    let store = store.ok_or_else(|| "project.import-classic-timed-encounters requires serve-project so source bytes are durable".to_string())?;
    let directory = PathBuf::from(required_string(&params, "directory")?);
    let path = directory.join("Data TD3");
    if !path.is_file() {
        return Err(format!("{} is required", path.display()));
    }
    let bytes =
        fs::read(&path).map_err(|error| format!("could not read {}: {error}", path.display()))?;
    if bytes.len() < TIMED_ENCOUNTER_RECORD_BYTES {
        return Err(format!(
            "Data TD3 must contain at least one complete {TIMED_ENCOUNTER_RECORD_BYTES}-byte record"
        ));
    }
    let decoded = decode_timed_encounters(&bytes);
    if encode_timed_encounters(&decoded.records, Some(&bytes)).map_err(|error| error.to_string())?
        != bytes
    {
        return Err("Data TD3 failed exact no-edit round-trip validation".into());
    }
    let sources = replace_sources(
        &session.snapshot().classic_sources,
        store,
        &[("Data TD3", &bytes)],
    )?;
    let annex_bytes = serde_json::to_vec(
        &json!({ "format": "providence-classic-source-annex-v1", "files": sources }),
    )
    .map_err(|error| error.to_string())?;
    let annex_blob = store
        .put_blob(&annex_bytes)
        .map_err(|error| error.to_string())?;
    let count = decoded.records.len();
    let trailing_bytes = decoded.trailing_bytes.len();
    let mut result = execute(
        session,
        &params,
        EditorCommand::ImportClassicTimedEncounterSlice {
            annex_blob,
            sources,
            timed_encounters: decoded.records,
        },
    )?;
    if let Some(object) = result.as_object_mut() {
        object.insert("count".into(), json!(count));
        object.insert("trailingBytes".into(), json!(trailing_bytes));
    }
    Ok(result)
}

fn read_complex_encounter_sources(
    directory: &std::path::Path,
    bytes: &[u8],
) -> Result<Vec<(String, Vec<u8>)>, String> {
    let mut imported = vec![("Data ED2".to_string(), bytes.to_vec())];
    let rogue_path = directory.join("Data TD2");
    if rogue_path.is_file() {
        imported.push((
            "Data TD2".to_string(),
            fs::read(&rogue_path)
                .map_err(|error| format!("could not read {}: {error}", rogue_path.display()))?,
        ));
    }
    Ok(imported)
}

fn read_complex_encounters(
    directory: &std::path::Path,
) -> Result<
    (
        Vec<u8>,
        providence_core::codecs::DecodedComplexEncounterFile,
    ),
    String,
> {
    let path = directory.join("Data ED2");
    if !path.is_file() {
        return Err(format!("{} is required", path.display()));
    }
    let bytes =
        fs::read(&path).map_err(|error| format!("could not read {}: {error}", path.display()))?;
    if bytes.len() < COMPLEX_ENCOUNTER_RECORD_BYTES {
        return Err(format!(
            "Data ED2 must contain at least one complete {COMPLEX_ENCOUNTER_RECORD_BYTES}-byte record"
        ));
    }
    let decoded = decode_complex_encounters(&bytes);
    if encode_complex_encounters(&decoded.records, Some(&bytes))
        .map_err(|error| error.to_string())?
        != bytes
    {
        return Err("Data ED2 failed exact no-edit round-trip validation".into());
    }

    Ok((bytes, decoded))
}

use crate::classic_source_retention::replace_sources;
use crate::execute;
use crate::request_params::required_string;
use crate::scenario_preflight::resolve_classic_native_file;
use providence_core::codecs::PLAYER_MAP_AVAILABLE_NAMES_RESOURCE_ID;
use providence_core::codecs::PLAYER_MAP_RECORD_BYTES;
use providence_core::codecs::PLAYER_MAP_UNAVAILABLE_NAMES_RESOURCE_ID;
use providence_core::codecs::decode_player_map_name_string_list;
use providence_core::codecs::decode_player_maps;
use providence_core::codecs::encode_player_map_name_resources;
use providence_core::codecs::encode_player_maps;
use providence_core::codecs::validate_player_map_name_catalog;
use providence_core::model::ClassicSourceBlob;
use providence_core::model::PlayerMapNameCatalog;
use providence_core::session::EditorCommand;
use providence_core::session::EditorSession;
use providence_storage::ProjectStore;
use serde_json::Value;
use serde_json::json;
use std::fs;
use std::path::PathBuf;

pub(crate) fn import_classic_player_maps(
    session: &mut EditorSession,
    store: Option<&ProjectStore>,
    params: Value,
) -> Result<Value, String> {
    let store = store.ok_or_else(|| {
        "project.import-classic-player-maps requires serve-project so source bytes are durable"
            .to_string()
    })?;
    let directory = PathBuf::from(required_string(&params, "directory")?);
    let path = directory.join("Data MD2");
    if !path.is_file() {
        return Err(format!("{} is required", path.display()));
    }
    let bytes =
        fs::read(&path).map_err(|error| format!("could not read {}: {error}", path.display()))?;
    let decoded = decode_checked_player_maps(&bytes)?;
    let sources = replace_sources(
        &session.snapshot().classic_sources,
        store,
        &[("Data MD2", &bytes)],
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
    let runtime_addressable = decoded
        .records
        .iter()
        .filter(|record| record.native_id.0 < 20)
        .count();
    let mut result = execute(
        session,
        &params,
        EditorCommand::ImportClassicPlayerMapSlice {
            annex_blob,
            sources,
            player_maps: decoded.records,
        },
    )?;
    if let Some(object) = result.as_object_mut() {
        object.insert("count".into(), json!(count));
        object.insert("runtimeAddressable".into(), json!(runtime_addressable));
        object.insert("trailingBytes".into(), json!(trailing_bytes));
    }
    Ok(result)
}

pub(crate) fn import_classic_player_map_names(
    session: &mut EditorSession,
    store: Option<&ProjectStore>,
    params: Value,
) -> Result<Value, String> {
    let store = store.ok_or_else(|| {
        "project.import-classic-player-map-names requires serve-project so source bytes are durable"
            .to_string()
    })?;
    let directory = PathBuf::from(required_string(&params, "directory")?);
    let Some(path) = resolve_classic_native_file(&directory, "Scenario.rsrc") else {
        return Ok(json!({
            "sourcePresent": false,
            "availableCount": 0,
            "unavailableCount": 0,
            "warning": "Scenario.rsrc is absent; Player Map names were not imported",
        }));
    };
    let bytes =
        fs::read(&path).map_err(|error| format!("could not read {}: {error}", path.display()))?;
    let blob = store.put_blob(&bytes).map_err(|error| error.to_string())?;
    let available_names =
        decode_player_map_name_string_list(&bytes, PLAYER_MAP_AVAILABLE_NAMES_RESOURCE_ID)
            .map_err(|error| error.to_string())?;
    let unavailable_names =
        decode_player_map_name_string_list(&bytes, PLAYER_MAP_UNAVAILABLE_NAMES_RESOURCE_ID)
            .map_err(|error| error.to_string())?;
    if available_names.is_none() && unavailable_names.is_none() {
        return Ok(json!({
            "sourcePresent": true,
            "availableCount": 0,
            "unavailableCount": 0,
            "warning": "Scenario.rsrc contains no Player Map name resources; no names were imported",
        }));
    }
    let complete_name_pair = available_names.is_some() && unavailable_names.is_some();
    let catalog = PlayerMapNameCatalog {
        source_blob: Some(blob.clone()),
        available_names: available_names.unwrap_or_default(),
        unavailable_names: unavailable_names.unwrap_or_default(),
    };
    validate_imported_name_pair(&catalog, &bytes, complete_name_pair)?;
    let (sources, annex_blob) = retain_name_source(session, store, blob, bytes.len())?;
    let available_count = catalog.available_names.len();
    let unavailable_count = catalog.unavailable_names.len();
    let mut result = execute(
        session,
        &params,
        EditorCommand::ImportClassicPlayerMapNames {
            annex_blob,
            sources,
            catalog,
        },
    )?;
    set_name_import_counts(&mut result, available_count, unavailable_count);
    Ok(result)
}

fn set_name_import_counts(result: &mut Value, available: usize, unavailable: usize) {
    if let Some(object) = result.as_object_mut() {
        object.insert("sourcePresent".into(), json!(true));
        object.insert("availableCount".into(), json!(available));
        object.insert("unavailableCount".into(), json!(unavailable));
    }
}

fn decode_checked_player_maps(
    bytes: &[u8],
) -> Result<providence_core::codecs::DecodedPlayerMapFile, String> {
    if bytes.len() < PLAYER_MAP_RECORD_BYTES {
        return Err(format!(
            "Data MD2 must contain at least one complete {PLAYER_MAP_RECORD_BYTES}-byte record"
        ));
    }
    let decoded = decode_player_maps(bytes);
    if encode_player_maps(&decoded.records, Some(bytes)).map_err(|error| error.to_string())?
        != bytes
    {
        return Err("Data MD2 failed exact no-edit round-trip validation".into());
    }
    Ok(decoded)
}

fn retain_name_source(
    session: &EditorSession,
    store: &ProjectStore,
    blob: providence_core::model::BlobId,
    length: usize,
) -> Result<(Vec<ClassicSourceBlob>, providence_core::model::BlobId), String> {
    let mut sources = session
        .snapshot()
        .classic_sources
        .iter()
        .filter(|source| source.native_path != "Scenario.rsrc")
        .cloned()
        .collect::<Vec<_>>();
    sources.push(ClassicSourceBlob {
        native_path: "Scenario.rsrc".into(),
        blob,
        byte_length: length as u64,
    });
    sources.sort_by(|left, right| left.native_path.cmp(&right.native_path));
    let annex_bytes = serde_json::to_vec(
        &json!({"format": "providence-classic-source-annex-v1", "files": sources}),
    )
    .map_err(|error| format!("could not encode compatibility annex: {error}"))?;
    let annex_blob = store
        .put_blob(&annex_bytes)
        .map_err(|error| error.to_string())?;
    Ok((sources, annex_blob))
}

fn validate_imported_name_pair(
    catalog: &PlayerMapNameCatalog,
    bytes: &[u8],
    complete_name_pair: bool,
) -> Result<(), String> {
    validate_player_map_name_catalog(catalog).map_err(|error| error.to_string())?;
    if complete_name_pair
        && encode_player_map_name_resources(catalog, Some(bytes))
            .map_err(|error| error.to_string())?
            != bytes
    {
        return Err("Scenario.rsrc Player Map names failed exact no-edit validation".into());
    }
    Ok(())
}

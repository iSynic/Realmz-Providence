use crate::execute;
use crate::request_params::required_string;
use crate::request_params::required_u64;
use providence_core::codecs::ACTION_POINT_LEVEL_BYTES;
use providence_core::codecs::RANDOM_LEVEL_RECORD_BYTES;
use providence_core::codecs::decode_dungeon_action_points;
use providence_core::codecs::decode_dungeon_maps;
use providence_core::codecs::decode_dungeon_random_levels;
use providence_core::codecs::encode_dungeon_action_points;
use providence_core::codecs::encode_dungeon_maps;
use providence_core::codecs::encode_dungeon_random_levels;
use providence_core::model::ClassicSourceBlob;
use providence_core::session::EditorCommand;
use providence_core::session::EditorSession;
use providence_core::session::Revision;
use providence_storage::ProjectStore;
use serde_json::Value;
use serde_json::json;
use std::collections::BTreeMap;
use std::fs;
use std::path::PathBuf;

use providence_core::codecs::MAP_LEVEL_BYTES;
use providence_core::model::{ActionPoint, BlobId, MapLevel};

pub(crate) fn import_classic_dungeon_slice(
    session: &mut EditorSession,
    store: Option<&ProjectStore>,
    params: Value,
) -> Result<Value, String> {
    let store = store.ok_or_else(|| {
        "project.import-classic-dungeon-slice requires serve-project so native sources have a durable blob store"
            .to_string()
    })?;
    let expected_revision = Revision(required_u64(&params, "expectedRevision")?);
    if expected_revision != session.revision() {
        return Err(format!(
            "revision conflict: expected {}, current revision is {}",
            expected_revision.0,
            session.revision().0
        ));
    }
    let directory = PathBuf::from(required_string(&params, "directory")?);
    let inputs = read_dungeon_sources(&directory)?;
    let mut maps = decode_maps(&inputs)?;
    let action_points = decode_actions(&inputs, maps.len())?;
    join_random_levels(&mut maps, &inputs)?;
    let sources = retain_sources(session, store, &inputs)?;
    attach_runtime_source(&sources, &mut maps);
    let annex_blob = store_annex(store, &sources)?;
    let counts = json!({
        "maps": maps.len(),
        "actionPoints": action_points.len(),
        "randomLevelRecords": maps.len(),
    });
    let mut result = execute(
        session,
        &params,
        EditorCommand::ImportClassicDungeonSlice {
            annex_blob,
            sources,
            maps,
            action_points,
        },
    )?;
    if let Some(object) = result.as_object_mut() {
        object.insert("counts".into(), counts);
    }
    Ok(result)
}
fn read_dungeon_sources(directory: &std::path::Path) -> Result<BTreeMap<String, Vec<u8>>, String> {
    let mut inputs = BTreeMap::new();
    for native_path in ["Data DL", "Data DDD", "Data RDD"] {
        let path = directory.join(native_path);
        let bytes = fs::read(&path)
            .map_err(|error| format!("could not read {}: {error}", path.display()))?;
        inputs.insert(native_path.to_string(), bytes);
    }

    Ok(inputs)
}

fn decode_maps(inputs: &BTreeMap<String, Vec<u8>>) -> Result<Vec<MapLevel>, String> {
    let data_dl = &inputs["Data DL"];
    let maps = decode_dungeon_maps(data_dl);
    if maps.records.is_empty() || !maps.trailing_bytes.is_empty() {
        return Err(format!(
            "Data DL must contain one or more complete {MAP_LEVEL_BYTES}-byte dungeon levels"
        ));
    }
    if encode_dungeon_maps(&maps.records, Some(data_dl)).map_err(|error| error.to_string())?
        != *data_dl
    {
        return Err("Data DL failed exact no-edit round-trip validation".into());
    }

    Ok(maps.records)
}

fn decode_actions(
    inputs: &BTreeMap<String, Vec<u8>>,
    map_count: usize,
) -> Result<Vec<ActionPoint>, String> {
    let data_ddd = &inputs["Data DDD"];
    let action_points = decode_dungeon_action_points(data_ddd);
    if !action_points.trailing_bytes.is_empty()
        || data_ddd.len() != map_count * ACTION_POINT_LEVEL_BYTES
    {
        return Err("Data DDD must contain exactly 100 records for every Data DL level".into());
    }
    if encode_dungeon_action_points(&action_points.records, map_count, Some(data_ddd))
        .map_err(|error| error.to_string())?
        != *data_ddd
    {
        return Err("Data DDD failed exact no-edit round-trip validation".into());
    }

    Ok(action_points.records)
}

fn join_random_levels(
    maps: &mut [MapLevel],
    inputs: &BTreeMap<String, Vec<u8>>,
) -> Result<(), String> {
    let data_rdd = &inputs["Data RDD"];
    let random_levels = decode_dungeon_random_levels(data_rdd);
    if !random_levels.trailing_bytes.is_empty()
        || data_rdd.len() != maps.len() * RANDOM_LEVEL_RECORD_BYTES
    {
        return Err(
            "Data RDD must contain exactly one 644-byte record for every Data DL level".into(),
        );
    }
    for (map, runtime) in maps.iter_mut().zip(random_levels.records) {
        if map.native_index != runtime.native_index {
            return Err("Data RDD record order does not match Data DL level order".into());
        }
        map.runtime = Some(runtime.runtime);
    }
    if encode_dungeon_random_levels(maps, Some(data_rdd)).map_err(|error| error.to_string())?
        != *data_rdd
    {
        return Err("Data RDD failed exact no-edit round-trip validation".into());
    }

    Ok(())
}

fn retain_sources(
    session: &EditorSession,
    store: &ProjectStore,
    inputs: &BTreeMap<String, Vec<u8>>,
) -> Result<Vec<ClassicSourceBlob>, String> {
    let mut sources = session
        .snapshot()
        .classic_sources
        .iter()
        .filter(|source| !inputs.contains_key(&source.native_path))
        .cloned()
        .collect::<Vec<_>>();
    for (native_path, bytes) in inputs {
        sources.push(ClassicSourceBlob {
            native_path: native_path.clone(),
            blob: store.put_blob(bytes).map_err(|error| error.to_string())?,
            byte_length: bytes.len() as u64,
        });
    }
    sources.sort_by(|left, right| left.native_path.cmp(&right.native_path));
    Ok(sources)
}

fn attach_runtime_source(sources: &[ClassicSourceBlob], maps: &mut [MapLevel]) {
    let runtime_blob = sources
        .iter()
        .find(|source| source.native_path == "Data RDD")
        .expect("Data RDD source was inserted")
        .blob
        .clone();
    for map in maps {
        map.runtime
            .as_mut()
            .expect("Data RDD records were joined")
            .source_blob = Some(runtime_blob.clone());
    }
}

fn store_annex(store: &ProjectStore, sources: &[ClassicSourceBlob]) -> Result<BlobId, String> {
    let annex_bytes = serde_json::to_vec(&json!({
        "format": "providence-classic-source-annex-v1",
        "files": sources,
    }))
    .map_err(|error| format!("could not encode compatibility annex: {error}"))?;
    let annex_blob = store
        .put_blob(&annex_bytes)
        .map_err(|error| error.to_string())?;
    Ok(annex_blob)
}

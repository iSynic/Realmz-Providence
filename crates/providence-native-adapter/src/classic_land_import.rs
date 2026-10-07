use crate::execute;
use crate::request_params::required_string;
use crate::request_params::required_u64;
use providence_core::codecs::ACTION_POINT_LEVEL_BYTES;
use providence_core::codecs::GLOBAL_MACRO_HOOK_BYTES;
use providence_core::codecs::RANDOM_LEVEL_RECORD_BYTES;
use providence_core::codecs::certified_extra_action_point_extent;
use providence_core::codecs::decode_extra_action_points;
use providence_core::codecs::decode_extra_codes;
use providence_core::codecs::decode_global_macro_hooks;
use providence_core::codecs::decode_land_action_points;
use providence_core::codecs::decode_land_layout;
use providence_core::codecs::decode_land_maps;
use providence_core::codecs::decode_land_random_levels;
use providence_core::codecs::decode_messages;
use providence_core::codecs::decode_simple_encounters;
use providence_core::codecs::encode_extra_action_points;
use providence_core::codecs::encode_extra_codes;
use providence_core::codecs::encode_global_macro_hooks;
use providence_core::codecs::encode_land_action_points;
use providence_core::codecs::encode_land_layout;
use providence_core::codecs::encode_land_maps;
use providence_core::codecs::encode_land_random_levels;
use providence_core::codecs::encode_messages;
use providence_core::codecs::encode_simple_encounters;
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

use providence_core::codecs::{EXTRA_ACTION_POINT_RECORD_BYTES, MAP_LEVEL_BYTES};
use providence_core::model::{
    ActionPoint, BlobId, ExtraActionPoint, ExtraCodeRow, LandLayout, MapLevel,
    ScenarioApplicationContract, ScenarioMessage, SimpleEncounter,
};

pub(crate) fn import_classic_land_slice(
    session: &mut EditorSession,
    store: Option<&ProjectStore>,
    params: Value,
) -> Result<Value, String> {
    let store = store.ok_or_else(|| {
        "project.import-classic-land-slice requires serve-project so native sources have a durable blob store"
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
    let inputs = read_land_sources(&directory)?;
    let (command, counts) = prepare_land_import(session, store, &inputs)?;
    let mut result = execute(session, &params, command)?;
    if let Some(object) = result.as_object_mut() {
        object.insert("counts".into(), counts);
    }
    Ok(result)
}
fn read_land_sources(directory: &std::path::Path) -> Result<BTreeMap<String, Vec<u8>>, String> {
    let mut inputs = BTreeMap::new();
    for native_path in ["Data DD", "Data ED", "Data LD", "Data SD2"] {
        read_source(directory, native_path, &mut inputs)?;
    }
    for native_path in ["Data EDCD", "Data ED3", "Global", "Data RD", "Layout"] {
        if directory.join(native_path).is_file() {
            read_source(directory, native_path, &mut inputs)?;
        }
    }
    Ok(inputs)
}

fn read_source(
    directory: &std::path::Path,
    native_path: &str,
    inputs: &mut BTreeMap<String, Vec<u8>>,
) -> Result<(), String> {
    let path = directory.join(native_path);
    let bytes =
        fs::read(&path).map_err(|error| format!("could not read {}: {error}", path.display()))?;
    inputs.insert(native_path.to_string(), bytes);
    Ok(())
}

fn decode_maps(inputs: &BTreeMap<String, Vec<u8>>) -> Result<Vec<MapLevel>, String> {
    let data_ld = &inputs["Data LD"];
    let maps = decode_land_maps(data_ld);
    if maps.records.is_empty() || !maps.trailing_bytes.is_empty() {
        return Err(format!(
            "Data LD must contain one or more complete {MAP_LEVEL_BYTES}-byte land levels"
        ));
    }
    if encode_land_maps(&maps.records, Some(data_ld)).map_err(|error| error.to_string())?
        != *data_ld
    {
        return Err("Data LD failed exact no-edit round-trip validation".into());
    }
    Ok(maps.records)
}

fn join_random_levels(
    maps: &mut [MapLevel],
    inputs: &BTreeMap<String, Vec<u8>>,
) -> Result<(), String> {
    if let Some(data_rd) = inputs.get("Data RD") {
        let random_levels = decode_land_random_levels(data_rd);
        if !random_levels.trailing_bytes.is_empty()
            || data_rd.len() != maps.len() * RANDOM_LEVEL_RECORD_BYTES
        {
            return Err(
                "Data RD must contain exactly one 644-byte record for every Data LD level".into(),
            );
        }
        for (map, runtime) in maps.iter_mut().zip(random_levels.records) {
            if map.native_index != runtime.native_index {
                return Err("Data RD record order does not match Data LD level order".into());
            }
            map.runtime = Some(runtime.runtime);
        }
        if encode_land_random_levels(maps, Some(data_rd)).map_err(|error| error.to_string())?
            != *data_rd
        {
            return Err("Data RD failed exact no-edit round-trip validation".into());
        }
    }
    Ok(())
}

fn decode_layout(inputs: &BTreeMap<String, Vec<u8>>) -> Result<Option<LandLayout>, String> {
    let land_layout = if let Some(layout_bytes) = inputs.get("Layout") {
        let layout = decode_land_layout(layout_bytes).map_err(|error| error.to_string())?;
        if encode_land_layout(&layout, Some(layout_bytes)).map_err(|error| error.to_string())?
            != *layout_bytes
        {
            return Err("Layout failed exact no-edit round-trip validation".into());
        }
        Some(layout)
    } else {
        None
    };

    Ok(land_layout)
}

fn decode_actions(
    inputs: &BTreeMap<String, Vec<u8>>,
    map_count: usize,
) -> Result<Vec<ActionPoint>, String> {
    let data_dd = &inputs["Data DD"];
    let action_points = decode_land_action_points(data_dd);
    if !action_points.trailing_bytes.is_empty()
        || data_dd.len() != map_count * ACTION_POINT_LEVEL_BYTES
    {
        return Err("Data DD must contain exactly 100 records for every Data LD level".into());
    }
    if encode_land_action_points(&action_points.records, map_count, Some(data_dd))
        .map_err(|error| error.to_string())?
        != *data_dd
    {
        return Err("Data DD failed exact no-edit round-trip validation".into());
    }

    Ok(action_points.records)
}

fn decode_land_messages(
    inputs: &BTreeMap<String, Vec<u8>>,
) -> Result<Vec<ScenarioMessage>, String> {
    let data_sd2 = &inputs["Data SD2"];
    let messages = decode_messages(data_sd2);
    if encode_messages(&messages.messages, Some(data_sd2)).map_err(|error| error.to_string())?
        != *data_sd2
    {
        return Err("Data SD2 failed exact no-edit round-trip validation".into());
    }

    Ok(messages.messages)
}

fn decode_encounters(inputs: &BTreeMap<String, Vec<u8>>) -> Result<Vec<SimpleEncounter>, String> {
    let data_ed = &inputs["Data ED"];
    let encounters = decode_simple_encounters(data_ed);
    if encode_simple_encounters(&encounters.records, Some(data_ed))
        .map_err(|error| error.to_string())?
        != *data_ed
    {
        return Err("Data ED failed exact no-edit round-trip validation".into());
    }

    Ok(encounters.records)
}

fn decode_land_extra_codes(
    inputs: &BTreeMap<String, Vec<u8>>,
) -> Result<Vec<ExtraCodeRow>, String> {
    let extra_codes = if let Some(data_edcd) = inputs.get("Data EDCD") {
        let decoded = decode_extra_codes(data_edcd);
        if encode_extra_codes(&decoded.rows, Some(data_edcd)).map_err(|error| error.to_string())?
            != *data_edcd
        {
            return Err("Data EDCD failed exact no-edit round-trip validation".into());
        }
        decoded.rows
    } else {
        Vec::new()
    };
    Ok(extra_codes)
}

fn decode_land_extra_actions(
    inputs: &BTreeMap<String, Vec<u8>>,
) -> Result<Vec<ExtraActionPoint>, String> {
    let extra_action_points = if let Some(data_ed3) = inputs.get("Data ED3") {
        let decoded = decode_extra_action_points(data_ed3);
        if !decoded.trailing_bytes.is_empty()
            && certified_extra_action_point_extent(data_ed3).is_none()
        {
            return Err(format!(
                "Data ED3 must contain only complete {EXTRA_ACTION_POINT_RECORD_BYTES}-byte rows"
            ));
        }
        if encode_extra_action_points(&decoded.records, Some(data_ed3))
            .map_err(|error| error.to_string())?
            != *data_ed3
        {
            return Err("Data ED3 failed exact no-edit round-trip validation".into());
        }
        decoded.records
    } else {
        Vec::new()
    };
    Ok(extra_action_points)
}

fn decode_hooks(
    inputs: &BTreeMap<String, Vec<u8>>,
) -> Result<Option<ScenarioApplicationContract>, String> {
    let global_macro_hooks = if let Some(global) = inputs.get("Global") {
        if global.len() != GLOBAL_MACRO_HOOK_BYTES {
            return Err(format!(
                "Global must contain exactly {GLOBAL_MACRO_HOOK_BYTES} bytes"
            ));
        }
        let decoded = decode_global_macro_hooks(global);
        if encode_global_macro_hooks(&decoded.contract, Some(global))
            .map_err(|error| error.to_string())?
            != *global
        {
            return Err("Global failed exact no-edit round-trip validation".into());
        }
        Some(decoded.contract)
    } else {
        Some(ScenarioApplicationContract::default())
    };

    Ok(global_macro_hooks)
}

fn retain_sources(
    session: &EditorSession,
    store: &ProjectStore,
    inputs: &BTreeMap<String, Vec<u8>>,
) -> Result<Vec<ClassicSourceBlob>, String> {
    let owned_paths = [
        "Data DD",
        "Data ED",
        "Data ED3",
        "Data EDCD",
        "Data LD",
        "Data RD",
        "Data SD2",
        "Global",
        "Layout",
    ];
    let mut sources = session
        .snapshot()
        .classic_sources
        .iter()
        .filter(|source| !owned_paths.contains(&source.native_path.as_str()))
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

fn attach_runtime_sources(
    session: &EditorSession,
    inputs: &BTreeMap<String, Vec<u8>>,
    sources: &[ClassicSourceBlob],
    maps: &mut [MapLevel],
) {
    if inputs.contains_key("Data RD") {
        let runtime_blob = sources
            .iter()
            .find(|source| source.native_path == "Data RD")
            .expect("Data RD source was inserted")
            .blob
            .clone();
        for map in maps {
            let runtime = map.runtime.as_mut().expect("Data RD records were joined");
            runtime.source_blob = Some(runtime_blob.clone());
            if let Some(catalog) = session
                .snapshot()
                .landlook_catalogs
                .iter()
                .find(|catalog| runtime.landlook == Some(catalog.landlook))
            {
                runtime.base_tile = Some(catalog.base_tile);
                runtime.base_scale = Some(catalog.base_scale);
            }
        }
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

fn prepare_land_import(
    session: &EditorSession,
    store: &ProjectStore,
    inputs: &BTreeMap<String, Vec<u8>>,
) -> Result<(EditorCommand, Value), String> {
    let mut maps = decode_maps(inputs)?;
    join_random_levels(&mut maps, inputs)?;
    let land_layout = decode_layout(inputs)?;
    let action_points = decode_actions(inputs, maps.len())?;
    let messages = decode_land_messages(inputs)?;
    let encounters = decode_encounters(inputs)?;
    let extra_codes = decode_land_extra_codes(inputs)?;
    let extra_action_points = decode_land_extra_actions(inputs)?;
    let global_macro_hooks = decode_hooks(inputs)?;
    let sources = retain_sources(session, store, inputs)?;
    attach_runtime_sources(session, inputs, &sources, &mut maps);
    let annex_blob = store_annex(store, &sources)?;
    let counts = json!({
        "maps": maps.len(),
        "actionPoints": action_points.len(),
        "messages": messages.len(),
        "simpleEncounters": encounters.len(),
        "extraCodes": extra_codes.len(),
        "extraActionPoints": extra_action_points.len(),
        "globalMacroHooks": global_macro_hooks.is_some(),
        "landLayout": land_layout.is_some(),
        "randomLevelRecords": usize::from(inputs.contains_key("Data RD")) * maps.len(),
    });
    let command = EditorCommand::ImportClassicLandSlice {
        annex_blob,
        sources,
        maps,
        action_points,
        messages,
        simple_encounters: encounters,
        extra_codes,
        extra_action_points,
        global_macro_hooks: global_macro_hooks.map(Box::new),
        land_layout,
    };
    Ok((command, counts))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn absent_global_imports_an_explicit_empty_application_contract() {
        let contract = decode_hooks(&BTreeMap::new())
            .expect("absent optional Global is valid")
            .expect("import still emits an explicit hook contract");
        assert_eq!(contract, ScenarioApplicationContract::default());
    }

    #[test]
    fn extra_code_import_keeps_complete_rows_without_padding_a_partial_tail() {
        let mut source = vec![0; 10];
        source.extend_from_slice(&[0x12, 0x34, 0xff, 0xfe, 0, 3]);
        let inputs = BTreeMap::from([("Data EDCD".into(), source.clone())]);
        let rows = decode_land_extra_codes(&inputs).expect("partial tail is source evidence");
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].native_id.0, 0);
        assert_eq!(encode_extra_codes(&rows, Some(&source)).unwrap(), source);
    }
}

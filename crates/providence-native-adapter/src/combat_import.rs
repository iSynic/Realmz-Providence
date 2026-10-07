use crate::classic_source_retention::replace_sources;
use crate::execute;
use crate::request_params::required_string;
use providence_core::codecs::BATTLE_RECORD_BYTES;
use providence_core::codecs::MONSTER_DESCRIPTION_RECORD_BYTES;
use providence_core::codecs::MONSTER_RECORD_BYTES;
use providence_core::codecs::decode_battles;
use providence_core::codecs::decode_monster_descriptions;
use providence_core::codecs::decode_monster_set;
use providence_core::codecs::encode_battles;
use providence_core::codecs::encode_monster_descriptions;
use providence_core::codecs::encode_monster_set;
use providence_core::model::ClassicSourceBlob;
use providence_core::model::MonsterSet;
use providence_core::session::EditorCommand;
use providence_core::session::EditorSession;
use providence_storage::ProjectStore;
use serde_json::Value;
use serde_json::json;
use std::collections::BTreeMap;
use std::fs;
use std::path::PathBuf;

struct ImportedMonsterSets {
    sets: Vec<MonsterSet>,
    source_bytes: BTreeMap<String, Vec<u8>>,
}

pub(crate) fn import_classic_monsters(
    session: &mut EditorSession,
    store: Option<&ProjectStore>,
    params: Value,
) -> Result<Value, String> {
    let store = store.ok_or_else(|| {
        "project.import-classic-monsters requires serve-project so source bytes are durable"
            .to_string()
    })?;
    let directory = PathBuf::from(required_string(&params, "directory")?);
    let ImportedMonsterSets {
        sets: monster_sets,
        source_bytes: mut imported_bytes,
    } = read_monster_sets(&directory)?;
    let monster_descriptions = read_monster_descriptions(&directory, &mut imported_bytes)?;

    let mut sources = session
        .snapshot()
        .classic_sources
        .iter()
        .filter(|source| !imported_bytes.contains_key(&source.native_path))
        .cloned()
        .collect::<Vec<_>>();
    for (native_path, bytes) in &imported_bytes {
        sources.push(ClassicSourceBlob {
            native_path: native_path.clone(),
            blob: store.put_blob(bytes).map_err(|error| error.to_string())?,
            byte_length: bytes.len() as u64,
        });
    }
    sources.sort_by(|left, right| left.native_path.cmp(&right.native_path));
    let annex_bytes = serde_json::to_vec(&json!({
        "format": "providence-classic-source-annex-v1",
        "files": sources,
    }))
    .map_err(|error| format!("could not encode compatibility annex: {error}"))?;
    let annex_blob = store
        .put_blob(&annex_bytes)
        .map_err(|error| error.to_string())?;
    let counts = json!({
        "sets": monster_sets.len(),
        "monsters": monster_sets.iter().map(|set| set.monsters.len()).sum::<usize>(),
        "descriptions": monster_descriptions.len(),
    });
    let mut result = execute(
        session,
        &params,
        EditorCommand::ImportClassicMonsterSlice {
            annex_blob,
            sources,
            monster_sets,
            monster_descriptions,
        },
    )?;
    if let Some(object) = result.as_object_mut() {
        object.insert("counts".into(), counts);
    }
    Ok(result)
}

pub(crate) fn import_classic_battles(
    session: &mut EditorSession,
    store: Option<&ProjectStore>,
    params: Value,
) -> Result<Value, String> {
    let store = store.ok_or_else(|| {
        "project.import-classic-battles requires serve-project so source bytes are durable"
            .to_string()
    })?;
    let directory = PathBuf::from(required_string(&params, "directory")?);
    let path = directory.join("Data BD");
    if !path.is_file() {
        return Err(format!("{} is required", path.display()));
    }
    let bytes =
        fs::read(&path).map_err(|error| format!("could not read {}: {error}", path.display()))?;
    if bytes.len() < BATTLE_RECORD_BYTES {
        return Err(format!(
            "Data BD must contain at least one complete {BATTLE_RECORD_BYTES}-byte record"
        ));
    }
    let decoded = decode_battles(&bytes);
    if encode_battles(&decoded.records, Some(&bytes)).map_err(|error| error.to_string())? != bytes {
        return Err("Data BD failed exact no-edit round-trip validation".into());
    }

    let sources = replace_sources(
        &session.snapshot().classic_sources,
        store,
        &[("Data BD", &bytes)],
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
        EditorCommand::ImportClassicBattleSlice {
            annex_blob,
            sources,
            battles: decoded.records,
        },
    )?;
    if let Some(object) = result.as_object_mut() {
        object.insert("count".into(), json!(count));
        object.insert("trailingBytes".into(), json!(trailing_bytes));
    }
    Ok(result)
}

fn read_monster_sets(directory: &std::path::Path) -> Result<ImportedMonsterSets, String> {
    let definitions = [
        ("Data MD", 0_i16, true),
        ("Data MD1", 1_i16, false),
        ("Data MD-1", -1_i16, false),
    ];
    let mut monster_sets = Vec::new();
    let mut imported_bytes = BTreeMap::new();
    for (native_path, set_id, required) in definitions {
        let path = directory.join(native_path);
        if !path.is_file() {
            if required {
                return Err(format!("{} is required", path.display()));
            }
            continue;
        }
        let bytes = fs::read(&path)
            .map_err(|error| format!("could not read {}: {error}", path.display()))?;
        if bytes.len() < MONSTER_RECORD_BYTES {
            return Err(format!(
                "{native_path} must contain at least one complete {MONSTER_RECORD_BYTES}-byte record"
            ));
        }
        let set = decode_monster_set(&bytes, native_path, set_id);
        if encode_monster_set(&set, Some(&bytes)).map_err(|error| error.to_string())? != bytes {
            return Err(format!(
                "{native_path} failed exact no-edit round-trip validation"
            ));
        }
        monster_sets.push(set);
        imported_bytes.insert(native_path.to_string(), bytes);
    }

    Ok(ImportedMonsterSets {
        sets: monster_sets,
        source_bytes: imported_bytes,
    })
}

fn read_monster_descriptions(
    directory: &std::path::Path,
    imported_bytes: &mut BTreeMap<String, Vec<u8>>,
) -> Result<Vec<providence_core::model::MonsterDescription>, String> {
    let description_path = directory.join("Data DES");
    let monster_descriptions = if description_path.is_file() {
        let bytes = fs::read(&description_path)
            .map_err(|error| format!("could not read {}: {error}", description_path.display()))?;
        if bytes.len() < MONSTER_DESCRIPTION_RECORD_BYTES {
            return Err(format!(
                "Data DES must contain at least one complete {MONSTER_DESCRIPTION_RECORD_BYTES}-byte record"
            ));
        }
        let decoded = decode_monster_descriptions(&bytes);
        if encode_monster_descriptions(&decoded.records, Some(&bytes))
            .map_err(|error| error.to_string())?
            != bytes
        {
            return Err("Data DES failed exact no-edit round-trip validation".into());
        }
        imported_bytes.insert("Data DES".into(), bytes);
        decoded.records
    } else {
        Vec::new()
    };

    Ok(monster_descriptions)
}

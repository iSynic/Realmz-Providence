use crate::execute;
use crate::request_params::required_string;
use providence_core::codecs::SCENARIO_SPELL_BYTES;
use providence_core::codecs::STANDARD_SPELL_BYTES;
use providence_core::codecs::STANDARD_SPELL_RECORDS;
use providence_core::codecs::decode_scenario_spells;
use providence_core::codecs::decode_standard_spells;
use providence_core::codecs::encode_scenario_spell_name_resources;
use providence_core::codecs::encode_scenario_spells;
use providence_core::codecs::hydrate_scenario_spell_names;
use providence_core::codecs::hydrate_standard_spell_names;
use providence_core::model::ClassicSourceBlob;
use providence_core::model::ProjectSnapshot;
use providence_core::model::StableId;
use providence_core::rebuilt::project_rebuilt_v3_standard_spell_catalog;
use providence_core::session::EditorCommand;
use providence_core::session::EditorSession;
use providence_storage::ProjectStore;
use serde_json::Value;
use serde_json::json;
use std::fs;
use std::path::Path;
use std::path::PathBuf;

use providence_core::codecs::DecodedSpellFile;
use providence_core::model::{BlobId, SourcedSpellDefinition};

pub(crate) fn import_classic_spells(
    session: &mut EditorSession,
    store: Option<&ProjectStore>,
    params: Value,
) -> Result<Value, String> {
    let store = store.ok_or_else(|| {
        "project.import-classic-spells requires serve-project so source bytes are durable"
            .to_string()
    })?;
    let path = PathBuf::from(required_string(&params, "path")?);
    let (mut decoded, source) = read_scenario_spell_source(store, &path)?;
    let (text_source, warnings) =
        prepare_scenario_spell_names(store, &params, &mut decoded.spells)?;

    let previous_text_blobs = session
        .snapshot()
        .scenario_spells
        .iter()
        .filter_map(|spell| spell.text_source_blob.as_ref())
        .collect::<std::collections::BTreeSet<_>>();
    let mut sources = session
        .snapshot()
        .classic_sources
        .iter()
        .filter(|source| {
            source.native_path != "Data Spell" && !previous_text_blobs.contains(&source.blob)
        })
        .cloned()
        .collect::<Vec<_>>();
    sources.push(source);
    if let Some(text_source) = text_source {
        sources.push(text_source);
    }
    sources.sort_by(|left, right| left.native_path.cmp(&right.native_path));
    let annex_bytes = serde_json::to_vec(
        &json!({ "format": "providence-classic-source-annex-v1", "files": sources }),
    )
    .map_err(|error| error.to_string())?;
    let annex_blob = store
        .put_blob(&annex_bytes)
        .map_err(|error| error.to_string())?;
    let trailing_bytes = decoded.trailing_bytes.len();
    let mut result = execute(
        session,
        &params,
        EditorCommand::ImportClassicSpellSlice {
            annex_blob,
            sources,
            spells: decoded.spells,
        },
    )?;
    if let Some(object) = result.as_object_mut() {
        object.insert("count".into(), json!(105));
        object.insert("trailingBytes".into(), json!(trailing_bytes));
        object.insert("sourceWarnings".into(), json!(warnings));
    }
    Ok(result)
}

pub(crate) fn import_standard_spells(
    session: &mut EditorSession,
    store: Option<&ProjectStore>,
    params: Value,
) -> Result<Value, String> {
    let store = store.ok_or_else(|| {
        "spell-rules.import-standard requires serve-project so Data S and Custom Names remain durable"
            .to_string()
    })?;
    let path = PathBuf::from(required_string(&params, "path")?);
    let text_path = PathBuf::from(required_string(&params, "textPath")?);
    let bytes =
        fs::read(&path).map_err(|error| format!("could not read {}: {error}", path.display()))?;
    let text_bytes = fs::read(&text_path)
        .map_err(|error| format!("could not read {}: {error}", text_path.display()))?;
    if bytes.len() < STANDARD_SPELL_BYTES {
        return Err(format!(
            "Data S must contain the four 105-record runtime classes ({STANDARD_SPELL_BYTES} bytes)"
        ));
    }
    let blob = store.put_blob(&bytes).map_err(|error| error.to_string())?;
    let text_blob = store
        .put_blob(&text_bytes)
        .map_err(|error| error.to_string())?;
    let decoded = validate_standard_spells(&bytes, blob.clone(), &text_bytes, text_blob.clone())?;

    let trailing_bytes = decoded.trailing_bytes.len();
    let sources = vec![
        ClassicSourceBlob {
            native_path: "Data S".into(),
            blob,
            byte_length: bytes.len() as u64,
        },
        ClassicSourceBlob {
            native_path: "Custom Names".into(),
            blob: text_blob,
            byte_length: text_bytes.len() as u64,
        },
    ];
    let mut result = execute(
        session,
        &params,
        EditorCommand::ImportStandardSpellCatalog {
            sources,
            spells: decoded.spells,
        },
    )?;
    if let Some(object) = result.as_object_mut() {
        object.insert("count".into(), json!(STANDARD_SPELL_RECORDS));
        object.insert("trailingBytes".into(), json!(trailing_bytes));
    }
    Ok(result)
}

fn read_scenario_spell_source(
    store: &ProjectStore,
    path: &Path,
) -> Result<(DecodedSpellFile, ClassicSourceBlob), String> {
    let bytes =
        fs::read(path).map_err(|error| format!("could not read {}: {error}", path.display()))?;
    if bytes.len() < SCENARIO_SPELL_BYTES {
        return Err(format!(
            "Data Spell must contain all 105 records ({SCENARIO_SPELL_BYTES} bytes)"
        ));
    }
    let blob = store.put_blob(&bytes).map_err(|error| error.to_string())?;
    let decoded = decode_scenario_spells(&bytes, Some(blob.clone()));
    if decoded.spells.len() != 105 {
        return Err("Data Spell did not decode all 105 scenario spell records".into());
    }
    if encode_scenario_spells(&decoded.spells, Some(&bytes)).map_err(|error| error.to_string())?
        != bytes
    {
        return Err("Data Spell failed exact no-edit round-trip validation".into());
    }

    Ok((
        decoded,
        ClassicSourceBlob {
            native_path: "Data Spell".into(),
            blob,
            byte_length: bytes.len() as u64,
        },
    ))
}

fn prepare_scenario_spell_names(
    store: &ProjectStore,
    params: &Value,
    spells: &mut [SourcedSpellDefinition],
) -> Result<(Option<ClassicSourceBlob>, Vec<String>), String> {
    let text_path = params.get("textPath").and_then(Value::as_str);
    let text_bytes = text_path
        .map(|path| {
            fs::read(path)
                .map_err(|error| format!("could not read Data Spell name resource: {error}"))
        })
        .transpose()?;
    let text_blob = text_bytes
        .as_ref()
        .map(|bytes| store.put_blob(bytes).map_err(|error| error.to_string()))
        .transpose()?;
    let warnings = if let (Some(text_bytes), Some(text_blob)) = (&text_bytes, &text_blob) {
        let warnings = hydrate_scenario_spell_names(spells, text_bytes, text_blob.clone())
            .map_err(|error| format!("Data Spell names failed native validation: {error}"))?;
        if encode_scenario_spell_name_resources(spells, Some(text_bytes))
            .map_err(|error| format!("Data Spell names failed native validation: {error}"))?
            != *text_bytes
        {
            return Err("Data Spell names failed exact no-edit round-trip validation".into());
        }
        warnings
    } else {
        Vec::new()
    };

    let source = if let (Some(text_path), Some(text_bytes), Some(text_blob)) =
        (text_path, &text_bytes, text_blob)
    {
        let native_path = params
            .get("textNativePath")
            .and_then(Value::as_str)
            .map(ToOwned::to_owned)
            .or_else(|| {
                Path::new(text_path)
                    .file_name()
                    .and_then(|name| name.to_str())
                    .map(ToOwned::to_owned)
            })
            .ok_or_else(|| "textNativePath is required for an unnamed resource path".to_string())?;
        Some(ClassicSourceBlob {
            native_path,
            blob: text_blob.clone(),
            byte_length: text_bytes.len() as u64,
        })
    } else {
        None
    };
    Ok((source, warnings))
}

fn validate_standard_spells(
    bytes: &[u8],
    blob: BlobId,
    text_bytes: &[u8],
    text_blob: BlobId,
) -> Result<DecodedSpellFile, String> {
    let mut decoded = decode_standard_spells(bytes, Some(blob));
    if decoded.spells.len() != STANDARD_SPELL_RECORDS {
        return Err("Data S did not decode all 420 standard spell records".into());
    }
    hydrate_standard_spell_names(&mut decoded.spells, text_bytes, text_blob)
        .map_err(|error| format!("standard spell names failed native validation: {error}"))?;
    project_rebuilt_v3_standard_spell_catalog(&ProjectSnapshot {
        standard_spells: decoded.spells.clone(),
        ..ProjectSnapshot::new_authored(StableId("standard-spell-validation".into()))
    })
    .map_err(|error| format!("standard spell catalog failed Rebuilt validation: {error}"))?;

    Ok(decoded)
}

use crate::request_params::{required_string, required_u64};
use providence_core::{
    model::StableId,
    personal_library::{LibraryCommand, PersonalAsset},
};
use providence_storage::PersonalLibraryStore;
use serde_json::Value;
use std::{fs::File, io::Read};

pub(super) fn dispatch(
    store: &PersonalLibraryStore,
    method: &str,
    params: &Value,
) -> Result<Value, String> {
    let expected = required_u64(params, "expectedRevision")?;
    let command = match method {
        "personal-library.undo" => LibraryCommand::Undo,
        "personal-library.redo" => LibraryCommand::Redo,
        _ => edit(store, method, params)?,
    };
    let delta = store.apply(expected, command).map_err(|e| e.to_string())?;
    serde_json::to_value(delta).map_err(|e| e.to_string())
}

fn edit(
    store: &PersonalLibraryStore,
    method: &str,
    params: &Value,
) -> Result<LibraryCommand, String> {
    let identity = StableId(required_string(params, "identity")?);
    Ok(match method {
        "personal-library.update" => LibraryCommand::Update {
            identity,
            name: required_string(params, "name")?,
            collection: super::collection(params)?,
        },
        "personal-library.rename" => LibraryCommand::Rename {
            identity,
            name: required_string(params, "name")?,
        },
        "personal-library.move" => LibraryCommand::Move {
            identity,
            collection: super::collection(params)?,
        },
        "personal-library.remove" => LibraryCommand::Remove { identity },
        "personal-library.create-collection" => LibraryCommand::CreateCollection {
            identity,
            name: required_string(params, "name")?,
        },
        "personal-library.import-image" | "personal-library.import-original" => {
            import(store, method, params, identity)?
        }
        _ => return Err(format!("Unknown personal library command '{method}'")),
    })
}

fn import(
    store: &PersonalLibraryStore,
    method: &str,
    params: &Value,
    identity: StableId,
) -> Result<LibraryCommand, String> {
    let path = required_string(params, "path")?;
    let mut bytes = Vec::new();
    File::open(path)
        .map_err(|e| e.to_string())?
        .take(64 * 1024 * 1024 + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    if bytes.is_empty() || bytes.len() > 64 * 1024 * 1024 {
        return Err("Original file must contain 1 to 64 MiB of data.".into());
    }
    let mime_type = if method.ends_with("import-image") {
        crate::personal_image::preview(&bytes)?;
        "image/png"
    } else {
        "application/octet-stream"
    };
    Ok(LibraryCommand::Import(
        (PersonalAsset {
            identity,
            name: required_string(params, "name")?,
            collection: super::collection(params)?,
            original: store.put_original(&bytes).map_err(|e| e.to_string())?,
            byte_length: bytes.len() as u64,
            mime_type: mime_type.into(),
            media: None,
            import_kind: None,
        })
        .into(),
    ))
}

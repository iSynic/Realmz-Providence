//! Initialize an absent scenario collision table from an explicitly reviewed native source.
use crate::request_params::{required_string, required_value};
use providence_core::{
    codecs::{SPECIAL_LAND_SOLIDITY_BYTES, decode_special_land_solidity},
    model::SpecialLandSolidityCatalog,
    session::{EditorCommand, EditorSession},
};
use providence_storage::ProjectStore;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{fs::File, io::Read};

pub(crate) fn dispatch(
    session: &mut EditorSession,
    store: Option<&ProjectStore>,
    method: &str,
    params: &Value,
) -> Result<Value, String> {
    let path = required_string(params, "path")?;
    let mut bytes = Vec::new();
    File::open(&path)
        .map_err(|error| format!("could not read Data Solids: {error}"))?
        .take(SPECIAL_LAND_SOLIDITY_BYTES as u64 + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| format!("could not read Data Solids: {error}"))?;
    let solid = decode_special_land_solidity(&bytes).map_err(|error| error.to_string())?;
    let digest = format!("{:x}", Sha256::digest(&bytes));
    let available = session.snapshot().world.special_land_solidity.is_none();
    let ids: Vec<_> = solid
        .iter()
        .enumerate()
        .filter_map(|(id, solid)| solid.then_some(id))
        .collect();
    let mut result = json!({"revision":session.revision(),"canInitialize":available,
        "source":"Data Solids","sourceSha256":digest,"sourceBytes":bytes.len(),"solidIds":ids});
    if method == "special-land-solidity.preview" {
        return Ok(result);
    }
    if method != "special-land-solidity.initialize" {
        return Err("unknown Special Land collision command".into());
    }
    if !available {
        return Err("The scenario already has Special Land collision rules. Edit individual resource rules instead of replacing the table.".into());
    }
    if required_string(params, "expectedSha256")? != digest {
        return Err("Data Solids changed after review. Preview the exact source again.".into());
    }
    let store =
        store.ok_or("Save the project before initializing Special Land collision rules.")?;
    let source_blob = store.put_blob(&bytes).map_err(|error| error.to_string())?;
    let change = crate::execute(
        session,
        params,
        EditorCommand::SetSpecialLandSolidityCatalog {
            catalog: Box::new(SpecialLandSolidityCatalog {
                source: "Data Solids".into(),
                source_blob,
                solid,
            }),
        },
    )?;
    result["revision"] = change["revision"].clone();
    result["changedEntities"] = required_value(&change, "changedEntities")?.clone();
    result["canInitialize"] = json!(false);
    Ok(result)
}

#[cfg(test)]
mod tests;

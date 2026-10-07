use crate::execute;
use crate::request_params::required_i64;
use crate::request_params::required_string;
use crate::request_params::required_u64;
use providence_core::codecs::MAPSTATS_REFERENCE_BYTES;
use providence_core::codecs::decode_custom_landlook_mapstats;
use providence_core::codecs::decode_landlook_mapstats;
use providence_core::codecs::standard_landlook_source_name;
use providence_core::session::EditorCommand;
use providence_core::session::EditorSession;
use providence_core::session::ExpectedRevisionCommand;
use providence_core::session::Revision;
use providence_storage::ProjectStore;
use serde_json::Value;
use serde_json::json;
use std::fs;
use std::io::Read;
use std::path::PathBuf;

pub(crate) fn import_mapstats_catalog_into_session(
    session: &mut EditorSession,
    store: &ProjectStore,
    landlook: i8,
    path: PathBuf,
    source: String,
) -> Result<(), String> {
    let bytes = fs::read(&path)
        .map_err(|error| format!("could not read Map Stats {}: {error}", path.display()))?;
    if bytes.len() != MAPSTATS_REFERENCE_BYTES {
        return Err(format!(
            "Map Stats {} must contain exactly {MAPSTATS_REFERENCE_BYTES} bytes; found {}",
            path.display(),
            bytes.len()
        ));
    }
    let blob = store.put_blob(&bytes).map_err(|error| error.to_string())?;
    let decoded = if providence_core::codecs::custom_landlook_source_name(landlook).is_some() {
        decode_custom_landlook_mapstats(&bytes, landlook, blob)
            .map_err(|error| error.to_string())?
    } else {
        decode_landlook_mapstats(&bytes, landlook, source, blob)
            .map_err(|error| error.to_string())?
    };
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: session.revision(),
            command: EditorCommand::ImportLandlookMapstatsCatalog {
                catalog: Box::new(decoded.catalog),
                profiles: decoded.profiles,
            },
        })
        .map_err(|error| error.to_string())?;
    Ok(())
}

pub(crate) fn import_mapstats_reference(
    session: &mut EditorSession,
    store: Option<&ProjectStore>,
    params: Value,
) -> Result<Value, String> {
    let store = store.ok_or_else(|| {
        "terrain.import-mapstats-reference requires serve-project so reference bytes have a durable blob store"
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
    let landlook = i8::try_from(required_i64(&params, "landlook")?)
        .map_err(|_| "landlook must fit a signed byte".to_string())?;
    let source_name = standard_landlook_source_name(landlook).ok_or_else(|| {
        format!(
            "landlook {landlook} is not a certified built-in Map Stats reference; custom landlooks remain a separate writer-gated seam"
        )
    })?;
    let path = PathBuf::from(required_string(&params, "path")?);
    let bytes =
        fs::read(&path).map_err(|error| format!("could not read {}: {error}", path.display()))?;
    if bytes.len() != MAPSTATS_REFERENCE_BYTES {
        return Err(format!(
            "{source_name} must contain exactly {MAPSTATS_REFERENCE_BYTES} source bytes (the {MAPSTATS_CORE_BYTES}-byte runtime core plus its preserved tail); found {}",
            bytes.len()
        ));
    }
    let blob = store.put_blob(&bytes).map_err(|error| error.to_string())?;
    let decoded = decode_landlook_mapstats(&bytes, landlook, source_name, blob)
        .map_err(|error| error.to_string())?;
    let catalog = decoded.catalog.clone();
    let profile_count = decoded.profiles.len();
    let mut result = execute(
        session,
        &params,
        EditorCommand::ImportLandlookMapstatsCatalog {
            catalog: Box::new(decoded.catalog),
            profiles: decoded.profiles,
        },
    )?;
    if let Some(object) = result.as_object_mut() {
        object.insert("landlook".into(), json!(landlook));
        object.insert("source".into(), json!(source_name));
        object.insert("profileCount".into(), json!(profile_count));
        object.insert("baseTile".into(), json!(catalog.base_tile));
        object.insert("baseScale".into(), json!(catalog.base_scale));
        object.insert("sourceBytes".into(), json!(catalog.byte_length));
    }
    Ok(result)
}
use providence_core::codecs::MAPSTATS_CORE_BYTES;

pub(crate) fn import_custom_mapstats(
    session: &mut EditorSession,
    store: Option<&ProjectStore>,
    params: &Value,
) -> Result<Value, String> {
    let store =
        store.ok_or("Open a portable project before importing Custom Landlook behavior.")?;
    if required_u64(params, "expectedRevision")? != session.revision().0 {
        return Err("The project changed before importing Custom Landlook behavior.".into());
    }
    let landlook =
        i8::try_from(required_i64(params, "landlook")?).map_err(|_| "Choose Custom 1–3.")?;
    if !(6..=8).contains(&landlook) {
        return Err("Custom Landlook behavior must target Custom 1–3.".into());
    }
    if session
        .snapshot()
        .landlook_catalogs
        .iter()
        .any(|row| row.landlook == landlook)
    {
        return Err(
            "This Custom Landlook is occupied. Review its replacement before importing behavior."
                .into(),
        );
    }
    let path = PathBuf::from(required_string(params, "path")?);
    if fs::metadata(&path)
        .map_err(|error| error.to_string())?
        .len()
        != MAPSTATS_REFERENCE_BYTES as u64
    {
        return Err(format!(
            "Custom Landlook behavior requires exactly {MAPSTATS_REFERENCE_BYTES} native bytes."
        ));
    }
    let mut bytes = Vec::with_capacity(MAPSTATS_REFERENCE_BYTES + 1);
    fs::File::open(path)
        .map_err(|error| error.to_string())?
        .take(MAPSTATS_REFERENCE_BYTES as u64 + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| error.to_string())?;
    let blob = store.put_blob(&bytes).map_err(|error| error.to_string())?;
    let decoded = decode_custom_landlook_mapstats(&bytes, landlook, blob)
        .map_err(|error| error.to_string())?;
    execute(
        session,
        params,
        EditorCommand::ImportLandlookMapstatsCatalog {
            catalog: Box::new(decoded.catalog),
            profiles: decoded.profiles,
        },
    )
}

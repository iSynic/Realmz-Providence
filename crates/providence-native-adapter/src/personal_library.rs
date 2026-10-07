use providence_core::model::StableId;
use providence_storage::PersonalLibraryStore;
use serde_json::{Value, json};

mod commands;
mod reading;

pub(crate) fn dispatch(
    store: Option<&PersonalLibraryStore>,
    method: &str,
    params: &Value,
) -> Result<Value, String> {
    if method == "personal-library.describe" && store.is_none() {
        return Ok(json!({"configured": false}));
    }
    let store = store.ok_or("My Library is not configured.")?;
    if let Some(result) = reading::dispatch(store, method, params) {
        return result;
    }
    commands::dispatch(store, method, params)
}

pub(super) fn collection(params: &Value) -> Result<Option<StableId>, String> {
    match params.get("collection") {
        None | Some(Value::Null) => Ok(None),
        Some(Value::String(value)) => Ok(Some(StableId(value.clone()))),
        _ => Err("collection must be an identity or null".into()),
    }
}

pub(crate) fn copy_icon(
    session: &mut providence_core::session::EditorSession,
    project: Option<&providence_storage::ProjectStore>,
    library: Option<&PersonalLibraryStore>,
    stock: Option<&providence_core::rebuilt::ApplicationMediaCatalog>,
    params: &Value,
) -> Result<Value, String> {
    let expected = crate::request_params::required_u64(params, "expectedRevision")?;
    if session.revision().0 != expected {
        return Err("The scenario changed. Review it before copying artwork.".into());
    }
    let project = project.ok_or("Open a saved scenario before copying artwork.")?;
    let library = library.ok_or("My Library is not configured.")?;
    let manifest = library.load_manifest().map_err(|error| error.to_string())?;
    if manifest.revision()
        != crate::request_params::required_u64(params, "expectedLibraryRevision")?
    {
        return Err("My Library changed. Select the artwork again before copying.".into());
    }
    let identity = StableId(crate::request_params::required_string(params, "identity")?);
    let asset = manifest
        .asset(&identity)
        .ok_or("This personal asset no longer exists.")?;
    let resource_id = crate::request_params::required_i64(params, "resourceId")?;
    if !(i64::from(providence_core::codecs::SCENARIO_ICON_MIN_ID)
        ..=i64::from(providence_core::codecs::SCENARIO_ICON_MAX_ID))
        .contains(&resource_id)
    {
        return Err("Choose a picture number from 1 to 32767.".into());
    }
    let occupied = |key: &providence_core::model::ClassicResourceKey| {
        key.resource_type == "cicn" && i64::from(key.resource_id) == resource_id
    };
    if session.snapshot().assets.iter().any(|asset| {
        asset.classic_resource.as_ref().is_some_and(occupied)
            || asset.identity.0 == format!("icon:{resource_id}")
    }) || stock.is_some_and(|catalog| {
        catalog.assets.iter().any(|asset| {
            asset
                .descriptor
                .classic_resource
                .as_ref()
                .is_some_and(occupied)
        })
    }) {
        return Err("That picture number is already in use. Choose another number; existing artwork is unchanged.".into());
    }
    for source in &session.snapshot().classic_sources {
        if !source.native_path.to_ascii_lowercase().ends_with(".rsrc") {
            continue;
        }
        if source.byte_length > 16 * 1024 * 1024 {
            return Err(
                "This resource file is too large to check safely for picture conflicts.".into(),
            );
        }
        let bytes = project
            .read_blob(&source.blob)
            .map_err(|error| error.to_string())?;
        let entries = providence_core::codecs::parse_resource_entries(&bytes)
            .map_err(|error| error.to_string())?;
        if entries
            .iter()
            .any(|entry| entry.resource_type == *b"cicn" && i64::from(entry.id) == resource_id)
        {
            return Err("That picture number is present in the scenario. Choose another number; existing artwork is unchanged.".into());
        }
    }
    let original = library
        .read_original(&asset.original)
        .map_err(|_| "The original artwork is missing or damaged. Nothing was copied.")?;
    let decoded = crate::personal_image::decode(&original)?;
    if original.len() as u64 != asset.byte_length {
        return Err("The original artwork has an unexpected size. Nothing was copied.".into());
    }
    crate::icon_media::import_scenario_icon_bytes(
        session,
        Some(project),
        json!({
            "expectedRevision":expected,"label":asset.name,"resourceId":resource_id,
            "width":decoded.width,"height":decoded.height,"rgbaBase64":BASE64.encode(decoded.rgba),
        }),
        original,
        Some("png".into()),
    )
}

pub(crate) fn apply_item_artwork(
    session: &mut providence_core::session::EditorSession,
    project: Option<&providence_storage::ProjectStore>,
    library: Option<&PersonalLibraryStore>,
    stock: Option<&providence_core::rebuilt::ApplicationMediaCatalog>,
    params: &Value,
) -> Result<Value, String> {
    let record_index = crate::request_params::required_u16(params, "recordIndex")?;
    if !session
        .snapshot()
        .scenario_item_rules
        .iter()
        .any(|item| item.record_index == record_index)
    {
        return Err("The selected scenario item no longer exists.".into());
    }
    let mut prepared = session.clone();
    let copied = copy_icon(&mut prepared, project, library, stock, params)?;
    let identity = crate::request_params::required_string(&copied, "identity")?;
    let asset = prepared
        .snapshot()
        .assets
        .iter()
        .find(|asset| asset.identity.0 == identity)
        .ok_or("The prepared artwork could not be found.")?
        .clone();
    crate::execute(
        session,
        params,
        providence_core::session::EditorCommand::ApplyScenarioItemArtwork {
            record_index,
            asset: Box::new(asset),
        },
    )
}

#[cfg(test)]
mod tests;
use base64::{Engine, engine::general_purpose::STANDARD as BASE64};

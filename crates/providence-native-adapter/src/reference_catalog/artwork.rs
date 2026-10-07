use super::*;
use providence_core::model::{AssetDescriptor, StableId};
use providence_core::{
    rebuilt::ApplicationMediaCatalog,
    session::{EditorCommand, EditorSession, Revision},
};
use providence_storage::ProjectStore;

struct Artwork {
    asset: AssetDescriptor,
    preview: Vec<u8>,
    payload: Vec<u8>,
}

enum TransferMode {
    AssignItem,
    Copy,
    PreviewCopy,
}

pub(crate) fn apply_item_artwork(
    session: &mut EditorSession,
    project: Option<&ProjectStore>,
    catalog: Option<&ReferenceCatalog>,
    library: Option<&ReferenceCatalogStore>,
    params: &Value,
) -> Result<Value, String> {
    transfer(
        session,
        project,
        catalog,
        library,
        None,
        params,
        TransferMode::AssignItem,
    )
}

pub(crate) fn copy_artwork(
    session: &mut EditorSession,
    project: Option<&ProjectStore>,
    catalog: Option<&ReferenceCatalog>,
    library: Option<&ReferenceCatalogStore>,
    stock: Option<&ApplicationMediaCatalog>,
    params: &Value,
) -> Result<Value, String> {
    transfer(
        session,
        project,
        catalog,
        library,
        stock,
        params,
        TransferMode::Copy,
    )
}

pub(crate) fn prepare_copy(
    session: &mut EditorSession,
    project: Option<&ProjectStore>,
    catalog: Option<&ReferenceCatalog>,
    library: Option<&ReferenceCatalogStore>,
    stock: Option<&ApplicationMediaCatalog>,
    params: &Value,
) -> Result<Value, String> {
    transfer(
        session,
        project,
        catalog,
        library,
        stock,
        params,
        TransferMode::PreviewCopy,
    )
}

fn transfer(
    session: &mut EditorSession,
    project: Option<&ProjectStore>,
    catalog: Option<&ReferenceCatalog>,
    library: Option<&ReferenceCatalogStore>,
    stock: Option<&ApplicationMediaCatalog>,
    params: &Value,
    mode: TransferMode,
) -> Result<Value, String> {
    let copy_only = !matches!(mode, TransferMode::AssignItem);
    let commit = !matches!(mode, TransferMode::PreviewCopy);
    let record_index = checked_item_context(session, params, copy_only)?;
    let project = project.ok_or("Open a saved project before applying artwork.")?;
    let mut source = read_source(catalog, library, params)?;
    allocate(&mut source.asset, session, stock, params, copy_only)?;
    let resource = source
        .asset
        .classic_resource
        .as_ref()
        .ok_or("The artwork has no picture resource.")?;
    check_retained_sources(session, project, resource, &source.payload, copy_only)?;
    source.asset.identity = StableId(format!("item-artwork:{}", resource.resource_id));
    if copy_only
        && session
            .snapshot()
            .assets
            .iter()
            .any(|asset| asset.identity == source.asset.identity)
    {
        return Err(
            "That scenario artwork identity is already in use. Choose another picture number."
                .into(),
        );
    }
    source.asset.kind = "icon".into();
    let command = if copy_only {
        providence_core::codecs::decode_cicn(&source.payload)
            .map_err(|_| "The artwork cannot be decoded.")?;
        EditorCommand::UpsertAsset {
            asset: Box::new(source.asset.clone()),
        }
    } else {
        EditorCommand::ApplyScenarioItemArtwork {
            record_index,
            asset: Box::new(source.asset.clone()),
        }
    };
    let mut proposed = session.clone();
    let result = crate::execute(&mut proposed, params, command)?;
    if !commit {
        return Ok(
            json!({"asset":source.asset,"preview":{"mimeType":"image/png","base64":BASE64.encode(source.preview),"width":source.asset.width,"height":source.asset.height}}),
        );
    }
    store_source(project, &source)?;
    *session = proposed;
    Ok(result)
}

fn store_source(project: &ProjectStore, source: &Artwork) -> Result<(), String> {
    project
        .put_blob(&source.preview)
        .map_err(|e| e.to_string())?;
    project
        .put_blob(&source.payload)
        .map_err(|e| e.to_string())?;
    Ok(())
}

fn checked_item_context(
    session: &EditorSession,
    params: &Value,
    copy_only: bool,
) -> Result<u16, String> {
    if Revision(crate::request_params::required_u64(
        params,
        "expectedRevision",
    )?) != session.revision()
    {
        return Err("The item changed. Review its current state before applying artwork.".into());
    }
    let record_index = if copy_only {
        0
    } else {
        crate::request_params::required_u16(params, "recordIndex")?
    };
    if !copy_only
        && !session
            .snapshot()
            .scenario_item_rules
            .iter()
            .any(|item| item.record_index == record_index)
    {
        return Err("The selected scenario item no longer exists.".into());
    }
    Ok(record_index)
}

fn read_source(
    catalog: Option<&ReferenceCatalog>,
    library: Option<&ReferenceCatalogStore>,
    params: &Value,
) -> Result<Artwork, String> {
    let catalog = catalog.ok_or("The artwork library is unavailable.")?;
    let library = library.ok_or("The artwork library is unavailable.")?;
    let identity = crate::request_params::required_string(params, "identity")?;
    let asset = catalog
        .assets
        .iter()
        .find(|entry| entry.descriptor.identity.0 == identity)
        .ok_or("The selected artwork is no longer in the library.")?
        .descriptor
        .clone();
    let payload_id = asset.classic_payload_blob.as_ref().ok_or(
        "The selected artwork is missing. Your item is unchanged. Choose another picture.",
    )?;
    let preview=library.read_blob_bounded(&asset.blob,MAX_PREVIEW_BYTES).map_err(|_|"The selected artwork could not be read. Your item is unchanged. Choose another picture.")?;
    let payload=library.read_blob_bounded(payload_id,MAX_PREVIEW_BYTES).map_err(|_|"The selected artwork could not be read. Your item is unchanged. Choose another picture.")?;
    if preview.len() as u64 != asset.byte_length
        || Some(payload.len() as u64) != asset.classic_payload_byte_length
    {
        return Err("The artwork is incomplete; choose another picture.".into());
    }
    Ok(Artwork {
        asset,
        preview,
        payload,
    })
}

fn allocate(
    asset: &mut AssetDescriptor,
    session: &EditorSession,
    stock: Option<&ApplicationMediaCatalog>,
    params: &Value,
    copy_only: bool,
) -> Result<(), String> {
    let resource = asset
        .classic_resource
        .as_mut()
        .ok_or("The artwork has no picture resource.")?;
    if copy_only {
        let number = crate::request_params::required_i16(params, "resourceId")?;
        if number == 0 {
            return Err("Choose a nonzero picture number from -32768 to 32767.".into());
        }
        if resource.resource_type != "cicn" {
            return Err("Only icon artwork can be copied here.".into());
        }
        resource.resource_id = i32::from(number);
        if session
            .snapshot()
            .assets
            .iter()
            .any(|asset| asset.classic_resource.as_ref() == Some(resource))
            || stock.is_some_and(|catalog| {
                catalog
                    .assets
                    .iter()
                    .any(|entry| entry.descriptor.classic_resource.as_ref() == Some(resource))
            })
        {
            return Err("That picture number is already in use. Choose another number; nothing was replaced.".into());
        }
    }
    if resource.resource_id == 0 {
        return Err("Applying this library picture is not supported by the editor yet. Your item is unchanged. Choose another picture for now.".into());
    }
    Ok(())
}

fn check_retained_sources(
    session: &EditorSession,
    project: &ProjectStore,
    key: &providence_core::model::ClassicResourceKey,
    payload: &[u8],
    copy_only: bool,
) -> Result<(), String> {
    for source in &session.snapshot().classic_sources {
        if !source.native_path.to_ascii_lowercase().ends_with(".rsrc") {
            continue;
        }
        if source.byte_length > MAX_SOURCE_EVIDENCE_BYTES {
            return Err(
                "This project's resource file is too large to check safely for picture conflicts."
                    .into(),
            );
        }
        let bytes = project.read_blob(&source.blob).map_err(|e| e.to_string())?;
        let entries =
            providence_core::codecs::parse_resource_entries(&bytes).map_err(|e| e.to_string())?;
        if entries.iter().any(|entry| {
            entry.resource_type == *b"cicn"
                && i32::from(entry.id) == key.resource_id
                && (copy_only || entry.data != payload)
        }) {
            return Err("Different scenario artwork already uses this picture number. Existing artwork has been left unchanged.".into());
        }
    }
    Ok(())
}

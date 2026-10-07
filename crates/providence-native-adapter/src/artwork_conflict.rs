use providence_core::{rebuilt::ApplicationMediaCatalog, session::EditorSession};
use providence_storage::ProjectStore;
use serde_json::{Value, json};

pub(crate) fn item_uses(session: &EditorSession, params: &Value) -> Result<Value, String> {
    let revision = crate::request_params::required_u64(params, "expectedRevision")?;
    if revision != session.revision().0 {
        return Err("The scenario changed. Reopen the copy dialog before inspecting uses.".into());
    }
    let number = i16::try_from(crate::request_params::required_i64(params, "resourceId")?)
        .map_err(|_| "Invalid picture number.")?;
    if number == 0 {
        return Err("Picture number zero is not artwork.".into());
    }
    let offset = params.get("offset").and_then(Value::as_u64).unwrap_or(0) as usize;
    let limit = params
        .get("limit")
        .and_then(Value::as_u64)
        .unwrap_or(32)
        .clamp(1, 32) as usize;
    let mut matches: Vec<_> = session
        .snapshot()
        .scenario_item_rules
        .iter()
        .filter(|item| item.definition.icon_id == i32::from(number))
        .collect();
    matches.sort_by_key(|item| item.record_index);
    let total = matches.len();
    let items: Vec<_> = matches.into_iter().skip(offset).take(limit).map(|item| json!({
        "identity":item.definition.id,"recordIndex":item.record_index,"classicId":item.definition.classic_id,
        "name":item.definition.name,"unidentifiedName":item.definition.unidentified_name,
        "field":"iconId","resourceId":number
    })).collect();
    Ok(
        json!({"revision":revision,"items":items,"offset":offset,"limit":limit,"total":total,
        "truncated":offset.saturating_add(limit)<total,"scope":"scenario-items"}),
    )
}

pub(crate) fn check(
    session: &EditorSession,
    project: Option<&ProjectStore>,
    stock: Option<&ApplicationMediaCatalog>,
    params: &Value,
) -> Result<Value, String> {
    let revision = crate::request_params::required_u64(params, "expectedRevision")?;
    if revision != session.revision().0 {
        return Err("The scenario changed. Reopen the copy dialog before continuing.".into());
    }
    let number = i16::try_from(crate::request_params::required_i64(params, "resourceId")?)
        .map_err(|_| "Choose a picture number from -32768 to 32767.")?;
    if number == 0 {
        return Err("Picture number zero means no artwork. Choose another number.".into());
    }
    let project = project.ok_or("Open a saved scenario before copying artwork.")?;
    let snapshot = session.snapshot();
    let matches =
        |asset: &&providence_core::model::AssetDescriptor| {
            asset.classic_resource.as_ref().is_some_and(|key| {
                key.resource_type == "cicn" && key.resource_id == i32::from(number)
            }) || asset.identity.0 == format!("icon:{number}")
                || asset.identity.0 == format!("item-artwork:{number}")
        };
    let owned: Vec<_> = snapshot.assets.iter().filter(matches).take(2).collect();
    let item_uses = snapshot
        .scenario_item_rules
        .iter()
        .filter(|item| item.definition.icon_id == i32::from(number))
        .count();
    let result = |existing: Value| {
        json!({"revision":revision,"resourceId":number,
        "available":existing.is_null(),"existing":existing,"itemUses":item_uses})
    };
    if let Some(asset) = owned.first() {
        return Ok(result(
            json!({"ownership":"scenario","identity":asset.identity,
            "label":asset.label,"ambiguous":owned.len()>1,
            "previewCommand":if asset.kind == "icon" { "icon.preview" } else { "" }}),
        ));
    }
    for source in &snapshot.classic_sources {
        if !source.native_path.to_ascii_lowercase().ends_with(".rsrc") {
            continue;
        }
        if source.byte_length > 16 * 1024 * 1024 {
            return Err(
                "This resource file is too large to check safely. Nothing was copied.".into(),
            );
        }
        let bytes = project
            .read_blob(&source.blob)
            .map_err(|error| error.to_string())?;
        if providence_core::codecs::parse_resource_entries(&bytes)
            .map_err(|error| error.to_string())?
            .iter()
            .any(|entry| entry.resource_type == *b"cicn" && entry.id == number)
        {
            return Ok(result(
                json!({"ownership":"scenario","label":"Existing scenario artwork",
                "identity":null,"previewCommand":"","ambiguous":false}),
            ));
        }
    }
    if let Some(catalog) = stock {
        let entries: Vec<_> = catalog
            .assets
            .iter()
            .map(|entry| &entry.descriptor)
            .filter(matches)
            .take(2)
            .collect();
        if let Some(asset) = entries.first() {
            return Ok(result(
                json!({"ownership":"stock","identity":asset.identity,
                "label":asset.label,"ambiguous":entries.len()>1,"previewCommand":"application-media.preview"}),
            ));
        }
    }
    Ok(result(Value::Null))
}

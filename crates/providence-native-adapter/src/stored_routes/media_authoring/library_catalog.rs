use super::*;

pub(super) fn list(catalogs: CatalogViews<'_>, params: &Value) -> Result<Value, String> {
    let library = catalogs
        .personal_library
        .map(|store| store.load_manifest())
        .transpose()
        .map_err(|e| e.to_string())?;
    let collection = params["collection"].as_str().unwrap_or("all");
    let kind = params["kind"].as_str().unwrap_or("all");
    let status = params["status"].as_str().unwrap_or("all");
    let query = params["query"]
        .as_str()
        .unwrap_or_default()
        .trim()
        .to_lowercase();
    let mut rows = Vec::new();
    collect_rows(library.as_ref(), catalogs, collection, &mut rows)?;
    rows.retain(|row| {
        crate::document_catalogs::media_kind_matches(row["kind"].as_str().unwrap_or(""), kind)
            && (status == "all"
                || (status == "ready") == row["prepared"].as_bool().unwrap_or(false))
            && (query.is_empty()
                || format!(
                    "{} {} {} {}",
                    row["name"], row["identity"], row["kind"], row["classicResource"]["resourceId"]
                )
                .to_lowercase()
                .contains(&query))
    });
    let limit = params["limit"].as_u64().unwrap_or(25).clamp(1, 128) as usize;
    let mut offset = params["offset"]
        .as_u64()
        .unwrap_or(0)
        .min(usize::MAX as u64) as usize;
    if let Some(seek) = params["seekIdentity"].as_str()
        && let Some(index) = rows.iter().position(|row| row["identity"] == seek)
    {
        offset = index / limit * limit;
    }
    let total = rows.len();
    let (undo, redo) = library
        .as_ref()
        .map(|library| library.history_counts())
        .unwrap_or_default();
    Ok(
        json!({"configured":library.is_some()||catalogs.reference_catalog.is_some(),"revision":library.as_ref().map(|l|l.revision()).unwrap_or(0),
        "items":rows.into_iter().skip(offset).take(limit).collect::<Vec<_>>(),"offset":offset,"limit":limit,"total":total,
        "truncated":offset.saturating_add(limit)<total,"undo":undo,"redo":redo}),
    )
}

fn collect_rows(
    library: Option<&providence_core::personal_library::PersonalLibrary>,
    catalogs: CatalogViews<'_>,
    collection: &str,
    rows: &mut Vec<Value>,
) -> Result<(), String> {
    if let Some(library) = library {
        for asset in library.assets() {
            if !matches!(collection, "all" | "personal" | "")
                && asset
                    .collection
                    .as_ref()
                    .is_none_or(|id| id.0 != collection)
            {
                continue;
            }
            rows.push(personal_row(asset)?);
        }
    }
    if matches!(collection, "all" | "bag-item" | "vault-icon")
        && let Some(catalog) = catalogs.reference_catalog
    {
        for entry in &catalog.assets {
            let asset = &entry.descriptor;
            if collection != "all" && asset.kind != collection {
                continue;
            }
            rows.push(json!({"identity":asset.identity,"name":asset.label,"label":asset.label,"kind":"icon",
                "ownership":"supplied","referenceKind":asset.kind,"prepared":true,"width":asset.width,"height":asset.height,
                "classicResource":asset.classic_resource,"previewCommand":"reference-catalog.preview"}));
        }
    }
    Ok(())
}

fn personal_row(asset: &providence_core::personal_library::PersonalAsset) -> Result<Value, String> {
    let mut row = serde_json::to_value(asset).map_err(|e| e.to_string())?;
    let family = asset
        .media
        .as_ref()
        .map(|media| media.primary.kind.as_str())
        .or(asset.import_kind.as_deref())
        .unwrap_or(match asset.mime_type.as_str() {
            "image/png" => "icon",
            "audio/wav" => "sound",
            "text/plain" => "text-resource",
            _ => "original",
        });
    row["kind"] = json!(family);
    row["ownership"] = json!("personal");
    row["prepared"] = json!(asset.media.is_some());
    row["previewCommand"] = json!("personal-library.preview");
    row["classicResource"] = json!(
        asset
            .media
            .as_ref()
            .and_then(|media| media.primary.classic_resource.as_ref())
    );
    Ok(row)
}

pub(super) fn copy(
    session: &mut EditorSession,
    project: Option<&ProjectStore>,
    catalogs: CatalogViews<'_>,
    method: &str,
    params: &Value,
) -> Result<Value, String> {
    super::check_project(session, params)?;
    let number = crate::request_params::required_i16(params, "resourceId")?;
    if number <= 0 {
        return Err("Choose a positive, unused icon number.".into());
    }
    let mut proposed = session.clone();
    let prepared = crate::reference_catalog::prepare_copy(
        &mut proposed,
        project,
        catalogs.reference_catalog,
        catalogs.reference_catalog_store,
        catalogs.application_media,
        params,
    )?;
    let asset: AssetDescriptor =
        serde_json::from_value(prepared["asset"].clone()).map_err(|e| e.to_string())?;
    let media = PersonalMedia {
        primary: asset,
        companion: None,
    };
    let hash = super::checked_hash(session, params, None, &media)?;
    if method.ends_with("prepare") {
        return Ok(
            json!({"revision":session.revision(),"reviewHash":hash,"media":media,
        "preview":{"primary":prepared["preview"]},"warnings":["This copies protected artwork; its supplied collection stays unchanged."]}),
        );
    }
    super::require_review(params, &hash)?;
    crate::reference_catalog::copy_artwork(
        session,
        project,
        catalogs.reference_catalog,
        catalogs.reference_catalog_store,
        catalogs.application_media,
        params,
    )
}

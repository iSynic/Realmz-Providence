use super::*;
use providence_core::{
    monster_appearance::{monster_appearance_candidate_ids, resolve_monster_appearance},
    personal_library::{LibraryCommand, PersonalAsset},
};

pub(super) fn open(
    session: &EditorSession,
    project: Option<&ProjectStore>,
    catalogs: CatalogViews<'_>,
    params: &Value,
) -> Result<Value, String> {
    super::check_project(session, params)?;
    let project = project.ok_or("Open the scenario before previewing its media.")?;
    let media = scenario_media(session, catalogs, params)?;
    Ok(
        json!({"revision":session.revision(),"media":media,"preview":super::preview(&media,|blob|read_source(session,project,catalogs,&media,blob))?}),
    )
}

pub(super) fn to_library(
    session: &EditorSession,
    project: Option<&ProjectStore>,
    catalogs: CatalogViews<'_>,
    method: &str,
    params: &Value,
) -> Result<Value, String> {
    super::check_project(session, params)?;
    let project =
        project.ok_or("Open a persistent scenario before adding its media to My Library.")?;
    let library = catalogs.personal_library.ok_or("Open My Library first.")?;
    let state = library.load_manifest().map_err(|e| e.to_string())?;
    if required_u64(params, "expectedLibraryRevision")? != state.revision() {
        return Err("My Library changed. Review this transfer again.".into());
    }
    let media = scenario_media(session, catalogs, params)?;
    let hash = super::checked_hash(session, params, Some(state.revision()), &media)?;
    let uses = crate::document_catalogs::project_asset_open(
        session,
        &json!({"identity":media.primary.identity,"expectedRevision":session.revision()}),
    )?;
    if method.ends_with("prepare") {
        return Ok(
            json!({"revision":session.revision(),"libraryRevision":state.revision(),"reviewHash":hash,
            "media":media,"uses":uses,"scenarioChanged":false,"preview":super::preview(&media,|blob|read_source(session,project,catalogs,&media,blob))?}),
        );
    }
    super::require_review(params, &hash)?;
    for resource in media.resources() {
        for blob in std::iter::once(&resource.blob).chain(resource.classic_payload_blob.iter()) {
            let bytes = read_source(session, project, catalogs, &media, blob)?;
            if library.put_original(&bytes).map_err(|e| e.to_string())? != *blob {
                return Err("The retained source changed. Nothing was added.".into());
            }
        }
    }
    let entry = PersonalAsset {
        identity: StableId(required_string(params, "libraryIdentity")?),
        name: required_string(params, "name")?,
        collection: crate::personal_library::collection(params)?,
        original: media.primary.blob.clone(),
        byte_length: media.primary.byte_length,
        mime_type: media
            .primary
            .mime_type
            .clone()
            .unwrap_or("application/octet-stream".into()),
        import_kind: None,
        media: Some(media),
    };
    let delta = library
        .apply(state.revision(), LibraryCommand::Import((entry).into()))
        .map_err(|e| e.to_string())?;
    Ok(json!({"delta":delta,"revision":session.revision(),"scenarioChanged":false}))
}

pub(super) fn to_scenario(
    session: &mut EditorSession,
    project: Option<&ProjectStore>,
    catalogs: CatalogViews<'_>,
    method: &str,
    params: &Value,
) -> Result<Value, String> {
    super::check_project(session, params)?;
    let project = project.ok_or("Open a persistent scenario before copying media.")?;
    let library = catalogs.personal_library.ok_or("Open My Library first.")?;
    let state = library.load_manifest().map_err(|e| e.to_string())?;
    if required_u64(params, "expectedLibraryRevision")? != state.revision() {
        return Err("My Library changed. Review this copy again.".into());
    }
    let entry = state
        .asset(&StableId(required_string(params, "identity")?))
        .ok_or("This library entry no longer exists.")?;
    let original=entry.media.as_ref().ok_or("This entry contains an original file. Prepare it through Import before copying to Scenario.")?;
    let number = i32::from(crate::request_params::required_i16(params, "resourceId")?);
    let media = super::rebase(original, number, &entry.name)?;
    let hash = super::checked_hash(session, params, Some(state.revision()), &media)?;
    super::allocation::check(session, project, catalogs, &media, false)?;
    if method.ends_with("prepare") {
        return Ok(
            json!({"revision":session.revision(),"libraryRevision":state.revision(),"reviewHash":hash,"media":media,
            "preview":super::preview(&media,|blob|library.read_original(blob).map_err(|e|e.to_string()))?}),
        );
    }
    super::require_review(params, &hash)?;
    for resource in media.resources() {
        for blob in std::iter::once(&resource.blob).chain(resource.classic_payload_blob.iter()) {
            let bytes = library.read_original(blob).map_err(|e| e.to_string())?;
            if project.put_blob(&bytes).map_err(|e| e.to_string())? != *blob {
                return Err("The library original changed. Nothing was copied.".into());
            }
        }
    }
    let identity = media.primary.identity.clone();
    let mut result = crate::execute(session, params, super::upsert(&media))?;
    result["identity"] = json!(identity);
    Ok(result)
}

pub(super) fn scenario_media(
    session: &EditorSession,
    catalogs: CatalogViews<'_>,
    params: &Value,
) -> Result<PersonalMedia, String> {
    let primary = super::asset(session, &required_string(params, "identity")?)?;
    let key = primary
        .classic_resource
        .as_ref()
        .ok_or("This media has no supported resource identity.")?;
    let companion = if primary.kind == "text-resource" {
        session
            .snapshot()
            .assets
            .iter()
            .find(|asset| {
                asset.kind == "text-style-resource"
                    && asset
                        .classic_resource
                        .as_ref()
                        .is_some_and(|other| other.resource_id == key.resource_id)
            })
            .cloned()
    } else if key.resource_type == "cicn" && key.resource_id > 0 {
        if let Some(pair) = appearance_pair(session, catalogs, &primary)? {
            return Ok(pair);
        }

        None
    } else {
        None
    };
    let media = PersonalMedia { primary, companion };
    if !matches!(
        media.primary.kind.as_str(),
        "icon"
            | "portrait"
            | "combat-icon"
            | "picture"
            | "sound"
            | "music"
            | "special-land-tile"
            | "text-resource"
    ) {
        return Err(
            "This family is preserved as reference content; transfer is not supported.".into(),
        );
    }
    Ok(media)
}

fn appearance_pair(
    session: &EditorSession,
    catalogs: CatalogViews<'_>,
    primary: &AssetDescriptor,
) -> Result<Option<PersonalMedia>, String> {
    for id in monster_appearance_candidate_ids(session.snapshot(), catalogs.application_media) {
        let pair =
            resolve_monster_appearance(session.snapshot(), catalogs.application_media, id as i16);
        if !pair.complete() {
            continue;
        }
        let base = pair
            .base
            .and_then(|resource| resource.asset)
            .ok_or("Missing base appearance")?;
        let reverse = pair
            .facing
            .and_then(|resource| resource.asset)
            .ok_or("Missing reverse appearance")?;
        if base.identity == primary.identity || reverse.identity == primary.identity {
            return Ok(Some(PersonalMedia {
                primary: base,
                companion: Some(reverse),
            }));
        }
    }
    Ok(None)
}

fn read_source(
    session: &EditorSession,
    project: &ProjectStore,
    catalogs: CatalogViews<'_>,
    media: &PersonalMedia,
    blob: &BlobId,
) -> Result<Vec<u8>, String> {
    if media.resources().any(|resource| {
        resource.blob == *blob || resource.classic_payload_blob.as_ref() == Some(blob)
    }) {
        let application_owned = catalogs.application_media.is_some_and(|catalog| {
            catalog.assets.iter().any(|entry| {
                media.resources().any(|resource| {
                    resource == &entry.descriptor
                        && !session
                            .snapshot()
                            .assets
                            .iter()
                            .any(|owned| owned.identity == resource.identity)
                        && (resource.blob == *blob
                            || resource.classic_payload_blob.as_ref() == Some(blob))
                })
            })
        });
        if application_owned {
            return catalogs
                .application_media_store
                .ok_or("The resolved application resource is unavailable.")?
                .read_blob(blob)
                .map_err(|e| e.to_string());
        }
        return project.read_blob(blob).map_err(|e| e.to_string());
    }
    Err("The exact source payload is unavailable. Restore it before transferring.".into())
}

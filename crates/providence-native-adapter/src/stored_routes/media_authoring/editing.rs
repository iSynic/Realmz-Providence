use super::*;

pub(super) fn dispatch(
    session: &mut EditorSession,
    project: Option<&ProjectStore>,
    _catalogs: CatalogViews<'_>,
    method: &str,
    params: &Value,
) -> Result<Value, String> {
    super::check_project(session, params)?;
    let _project = project.ok_or("Open a persistent scenario before editing media.")?;
    let identity = required_string(params, "identity")?;
    let asset = super::asset(session, &identity)?;
    if method == "media.metadata.apply" {
        return metadata(session, _catalogs, params, asset);
    }
    let media = if matches!(asset.kind.as_str(), "icon" | "combat-icon" | "portrait") {
        super::transfers::scenario_media(session, _catalogs, &json!({"identity":identity}))?
    } else {
        PersonalMedia {
            primary: asset.clone(),
            companion: None,
        }
    };
    let uses = crate::document_catalogs::project_asset_open(session, params)?;
    let hash = super::checked_hash(session, params, None, &media)?;
    let command = if media.companion.is_some() {
        EditorCommand::RemoveMonsterAppearancePair {
            icon_id: media
                .primary
                .classic_resource
                .as_ref()
                .ok_or("Missing exact key")?
                .resource_id as i16,
        }
    } else {
        EditorCommand::RemoveAsset {
            identity: asset.identity.clone(),
        }
    };
    let mut proposed = session.clone();
    let assessment = crate::execute(&mut proposed, params, command.clone());
    let allowed = assessment.is_ok();
    let reason = assessment.err().unwrap_or_default();
    if method.ends_with("prepare") {
        return Ok(
            json!({"revision":session.revision(),"reviewHash":hash,"media":media,"uses":uses,"allowed":allowed,"reason":reason}),
        );
    }
    super::require_review(params, &hash)?;
    if !allowed {
        return Err(reason);
    }
    crate::execute(session, params, command)
}

fn metadata(
    session: &mut EditorSession,
    _catalogs: CatalogViews<'_>,
    params: &Value,
    mut asset: AssetDescriptor,
) -> Result<Value, String> {
    let identity = asset.identity.0.clone();
    let name = required_string(params, "name")?;
    if name.trim().is_empty() || name.len() > 256 || name.chars().any(char::is_control) {
        return Err("Give this media a nonempty name without control characters.".into());
    }
    asset.label = name;
    if asset.kind == "special-land-tile" {
        asset.landlook = params["landlook"]
            .as_i64()
            .map(|value| i8::try_from(value).map_err(|_| "Land look must fit a signed byte."))
            .transpose()?;
        asset.base_tile = params["baseTile"]
            .as_i64()
            .map(|value| i16::try_from(value).map_err(|_| "Base tile must fit a signed short."))
            .transpose()?;
    }
    if asset
        .classic_resource
        .as_ref()
        .is_some_and(|key| key.resource_type == "cicn" && key.resource_id > 0)
    {
        // Metadata edits preserve both exact appearances when the core requires a pair.
        let mut media =
            super::transfers::scenario_media(session, _catalogs, &json!({"identity":identity}))?;
        if media.companion.is_some() {
            if media.primary.identity == asset.identity {
                media.primary = asset;
            } else {
                media.companion = Some(asset);
            }
            return crate::execute(session, params, super::upsert(&media));
        }
    }
    crate::execute(
        session,
        params,
        EditorCommand::UpsertAsset {
            asset: Box::new(asset),
        },
    )
}

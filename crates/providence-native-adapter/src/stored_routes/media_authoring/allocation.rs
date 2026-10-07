use super::*;
use providence_core::model::ClassicResourceKey;

pub(super) fn check(
    session: &EditorSession,
    project: &ProjectStore,
    catalogs: CatalogViews<'_>,
    media: &PersonalMedia,
    replacement: bool,
) -> Result<(), String> {
    let primary = media
        .primary
        .classic_resource
        .as_ref()
        .ok_or("This original must be prepared before copying to a scenario.")?;
    if !replacement {
        validate_number(&media.primary, primary.resource_id)?;
    }
    for resource in media.resources() {
        let key = resource
            .classic_resource
            .as_ref()
            .ok_or("A companion has no exact resource key.")?;
        if resource.kind == "music" {
            super::music::check_retained(session, key.resource_id, replacement)?;
        }
        check_resource_ownership(session, catalogs, resource, key, replacement)?;
        check_retained(session, project, key, replacement)?;
    }
    let mut draft = session.clone();
    crate::execute(
        &mut draft,
        &json!({"expectedRevision":session.revision()}),
        super::upsert(media),
    )?;
    Ok(())
}

fn validate_number(asset: &AssetDescriptor, id: i32) -> Result<(), String> {
    let valid = match asset.kind.as_str() {
        "picture" => (30000..=30128).contains(&id),
        "sound" => (200..=500).contains(&id),
        "music" => (1..=3).contains(&id),
        "special-land-tile" => (-32768..=-1).contains(&id),
        "text-resource" => (-32768..=32767).contains(&id) && id != 0,
        "icon" | "portrait" | "combat-icon" => (1..=32767).contains(&id),
        _ => false,
    };
    if valid {
        Ok(())
    } else {
        Err("Choose a resource number supported by this media family.".into())
    }
}

pub(super) fn check_retained(
    session: &EditorSession,
    project: &ProjectStore,
    key: &ClassicResourceKey,
    replacement: bool,
) -> Result<(), String> {
    for source in &session.snapshot().classic_sources {
        if !source.native_path.eq_ignore_ascii_case("Scenario.rsrc") {
            continue;
        }
        if source.byte_length > 16 * 1024 * 1024 {
            return Err("The retained resource file is too large to check safely.".into());
        }
        let bytes = project.read_blob(&source.blob).map_err(|e| e.to_string())?;
        let entries = providence_core::codecs::parse_resource_entries_preserving_duplicates(&bytes)
            .map_err(|e| e.to_string())?;
        let count = entries
            .iter()
            .filter(|entry| {
                entry.resource_type.as_slice() == key.resource_type.as_bytes()
                    && i32::from(entry.id) == key.resource_id
            })
            .count();
        if count > usize::from(replacement) {
            return Err("This resource number is retained or ambiguous in the imported scenario. Choose another number or repair the source.".into());
        }
    }
    Ok(())
}

fn check_resource_ownership(
    session: &EditorSession,
    catalogs: CatalogViews<'_>,
    resource: &AssetDescriptor,
    key: &ClassicResourceKey,
    replacement: bool,
) -> Result<(), String> {
    let owns = |candidate: &AssetDescriptor| candidate.classic_resource.as_ref() == Some(key);
    let scenario = session
        .snapshot()
        .assets
        .iter()
        .filter(|asset| owns(asset))
        .collect::<Vec<_>>();
    if replacement {
        if scenario.len() != 1 || scenario[0].identity != resource.identity {
            return Err("The replacement must retain the selected exact resource identity.".into());
        }
    } else if !scenario.is_empty()
        || session
            .snapshot()
            .assets
            .iter()
            .any(|asset| asset.identity == resource.identity)
        || catalogs
            .application_media
            .is_some_and(|catalog| catalog.assets.iter().any(|asset| owns(&asset.descriptor)))
    {
        return Err(format!(
            "{} {} is already occupied. Choose another number; existing content is unchanged.",
            key.resource_type.trim(),
            key.resource_id
        ));
    }
    Ok(())
}

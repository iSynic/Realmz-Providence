use crate::monster_appearance_views::MAX_MONSTER_APPEARANCE_PREVIEW_BYTES;
use crate::monster_appearance_views::monster_appearance_pair_summary;
use crate::request_params::required_i16;
use crate::request_params::required_u64;
use providence_core::codecs::CLASSIC_APPLICATION_MATERIALIZED_SOURCE_PREFIX;
use providence_core::model::AssetDescriptor;
use providence_core::model::ClassicResourceKey;
use providence_core::model::StableId;
use providence_core::monster_appearance::MONSTER_ICON_PAIR_OFFSET;
use providence_core::monster_appearance::resolve_monster_appearance;
use providence_core::rebuilt::ApplicationMediaAsset;
use providence_core::rebuilt::ApplicationMediaCatalog;
use providence_core::rebuilt::ApplicationMediaResolution;
use providence_core::session::EditorCommand;
use providence_core::session::EditorSession;
use providence_core::session::ExpectedRevisionCommand;
use providence_core::session::Revision;
use providence_storage::ProjectStore;
use providence_storage::ReferenceLibraryStore;
use serde_json::Value;
use serde_json::json;

pub(crate) fn materialize_monster_appearance_defaults(
    session: &mut EditorSession,
    project_store: Option<&ProjectStore>,
    application_media: Option<&ApplicationMediaCatalog>,
    application_media_store: Option<&ReferenceLibraryStore>,
    params: Value,
) -> Result<Value, String> {
    let project_store = project_store.ok_or_else(|| {
        "monster-appearance.materialize-defaults requires an open portable project".to_string()
    })?;
    let application_media = application_media.ok_or_else(|| {
        "monster-appearance.materialize-defaults requires a configured application-media catalog"
            .to_string()
    })?;
    let application_media_store = application_media_store.ok_or_else(|| {
        "monster-appearance.materialize-defaults requires the readable application-media store"
            .to_string()
    })?;
    let expected_revision = Revision(required_u64(&params, "expectedRevision")?);
    let icon_id = required_i16(&params, "iconId")?;
    let (base, facing) = resolve_application_monster_pair(application_media, icon_id)?;
    let base = copy_application_appearance_asset(
        project_store,
        application_media_store,
        base,
        StableId(format!("monster-appearance:{icon_id}:base")),
    )?;
    let facing = copy_application_appearance_asset(
        project_store,
        application_media_store,
        facing,
        StableId(format!("monster-appearance:{icon_id}:facing")),
    )?;
    let projection = session
        .execute(ExpectedRevisionCommand {
            expected_revision,
            command: EditorCommand::UpsertMonsterAppearancePair {
                base: Box::new(base),
                facing: Box::new(facing),
            },
        })
        .map_err(|error| error.to_string())?;
    Ok(json!({
        "projection": projection,
        "appearance": monster_appearance_pair_summary(&resolve_monster_appearance(
            session.snapshot(),
            Some(application_media),
            icon_id,
        )),
    }))
}

pub(crate) fn restore_monster_appearance_defaults(
    session: &mut EditorSession,
    application_media: Option<&ApplicationMediaCatalog>,
    params: Value,
) -> Result<Value, String> {
    let application_media = application_media.ok_or_else(|| {
        "monster-appearance.restore-defaults requires a configured application-media catalog"
            .to_string()
    })?;
    let expected_revision = Revision(required_u64(&params, "expectedRevision")?);
    let icon_id = required_i16(&params, "iconId")?;
    resolve_application_monster_pair(application_media, icon_id)?;
    let projection = session
        .execute(ExpectedRevisionCommand {
            expected_revision,
            command: EditorCommand::RemoveMonsterAppearancePair { icon_id },
        })
        .map_err(|error| error.to_string())?;
    Ok(json!({
        "projection": projection,
        "appearance": monster_appearance_pair_summary(&resolve_monster_appearance(
            session.snapshot(),
            Some(application_media),
            icon_id,
        )),
    }))
}

pub(crate) fn resolve_application_monster_pair(
    catalog: &ApplicationMediaCatalog,
    icon_id: i16,
) -> Result<(&ApplicationMediaAsset, &ApplicationMediaAsset), String> {
    let base_id = i32::from(icon_id);
    let facing_id = base_id + MONSTER_ICON_PAIR_OFFSET;
    if base_id <= 0 || facing_id > i32::from(i16::MAX) {
        return Err(format!(
            "monster appearance base id {icon_id} cannot name a positive signed-short pair"
        ));
    }
    let resolve = |resource_id| {
        let key = ClassicResourceKey {
            resource_type: "cicn".into(),
            resource_id,
        };
        match catalog.resolve_resource(&key, None) {
            ApplicationMediaResolution::Resolved(asset)
                if asset.descriptor.mime_type.as_deref() == Some("image/png")
                    && asset.descriptor.classic_payload_blob.is_some() =>
            {
                Ok(asset)
            }
            ApplicationMediaResolution::Resolved(_) => Err(format!(
                "application cicn {resource_id} is not a materializable image with Classic payload"
            )),
            ApplicationMediaResolution::Ambiguous => {
                Err(format!("application cicn {resource_id} is ambiguous"))
            }
            ApplicationMediaResolution::WrongKind => Err(format!(
                "application cicn {resource_id} has the wrong media kind"
            )),
            ApplicationMediaResolution::Missing => {
                Err(format!("application cicn {resource_id} is missing"))
            }
        }
    };
    Ok((resolve(base_id)?, resolve(facing_id)?))
}

pub(crate) fn copy_application_appearance_asset(
    project_store: &ProjectStore,
    application_store: &ReferenceLibraryStore,
    application_asset: &ApplicationMediaAsset,
    identity: StableId,
) -> Result<AssetDescriptor, String> {
    let runtime = application_store
        .read_blob(&application_asset.descriptor.blob)
        .map_err(|error| error.to_string())?;
    if runtime.len() > MAX_MONSTER_APPEARANCE_PREVIEW_BYTES
        || runtime.len() as u64 != application_asset.descriptor.byte_length
    {
        return Err(format!(
            "application appearance '{}' has invalid or oversized runtime payload geometry",
            application_asset.descriptor.identity.0
        ));
    }
    let classic_id = application_asset
        .descriptor
        .classic_payload_blob
        .as_ref()
        .ok_or_else(|| {
            format!(
                "application appearance '{}' has no Classic payload",
                application_asset.descriptor.identity.0
            )
        })?;
    let classic = application_store
        .read_blob(classic_id)
        .map_err(|error| error.to_string())?;
    if classic.len() > MAX_MONSTER_APPEARANCE_PREVIEW_BYTES
        || application_asset
            .descriptor
            .classic_payload_byte_length
            .is_none_or(|length| length != classic.len() as u64)
    {
        return Err(format!(
            "application appearance '{}' has invalid or oversized Classic payload geometry",
            application_asset.descriptor.identity.0
        ));
    }
    let runtime_blob = project_store
        .put_blob(&runtime)
        .map_err(|error| error.to_string())?;
    let classic_blob = project_store
        .put_blob(&classic)
        .map_err(|error| error.to_string())?;
    if runtime_blob != application_asset.descriptor.blob || classic_blob != *classic_id {
        return Err("content-addressed appearance copy changed a pinned blob identity".into());
    }
    let mut descriptor = application_asset.descriptor.clone();
    descriptor.identity = identity;
    descriptor.source = format!(
        "{CLASSIC_APPLICATION_MATERIALIZED_SOURCE_PREFIX}{}",
        application_asset.source.0
    );
    Ok(descriptor)
}

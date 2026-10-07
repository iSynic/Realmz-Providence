use base64::Engine as _;
use base64::engine::general_purpose::STANDARD as BASE64;
use providence_core::monster_appearance::MonsterAppearancePair;
use providence_core::monster_appearance::MonsterAppearanceResolution;
use providence_core::monster_appearance::MonsterAppearanceResource;
use providence_core::monster_appearance::MonsterAppearanceSourceRole;
use providence_core::monster_appearance::monster_appearance_candidate_ids;
use providence_core::monster_appearance::resolve_monster_appearance;
use providence_core::rebuilt::ApplicationMediaCatalog;
use providence_core::session::EditorSession;
use providence_storage::ProjectStore;
use providence_storage::ReferenceLibraryStore;
use serde_json::Value;
use serde_json::json;

pub(crate) fn monster_appearance_list_projection(
    session: &EditorSession,
    application_media: Option<&ApplicationMediaCatalog>,
    params: &Value,
) -> Result<Value, String> {
    let offset = params.get("offset").and_then(Value::as_u64).unwrap_or(0) as usize;
    let limit = params
        .get("limit")
        .and_then(Value::as_u64)
        .unwrap_or(64)
        .clamp(1, 128) as usize;
    let query = params
        .get("query")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .trim()
        .to_ascii_lowercase();
    let items = monster_appearance_candidate_ids(session.snapshot(), application_media)
        .into_iter()
        .map(|icon_id| {
            let pair = resolve_monster_appearance(
                session.snapshot(),
                application_media,
                i16::try_from(icon_id).expect("candidate IDs fit Classic signed short"),
            );
            monster_appearance_pair_summary(&pair)
        })
        .filter(|item| {
            query.is_empty()
                || item
                    .to_string()
                    .to_ascii_lowercase()
                    .contains(query.as_str())
        })
        .collect::<Vec<_>>();
    let total = items.len();
    Ok(json!({
        "revision": session.revision(),
        "items": items.into_iter().skip(offset).take(limit).collect::<Vec<_>>(),
        "offset": offset,
        "limit": limit,
        "total": total,
        "truncated": offset.saturating_add(limit) < total,
        "applicationLibraryConfigured": application_media.is_some(),
    }))
}

pub(crate) fn monster_appearance_pair_summary(pair: &MonsterAppearancePair) -> Value {
    json!({
        "iconId": pair.icon_id,
        "pairOffset": pair.pair_offset,
        "state": pair.state,
        "complete": pair.complete(),
        "base": pair.base.as_ref().map(monster_appearance_resource_summary),
        "facing": pair.facing.as_ref().map(monster_appearance_resource_summary),
    })
}

pub(crate) fn monster_appearance_resource_summary(resource: &MonsterAppearanceResource) -> Value {
    json!({
        "resourceId": resource.resource_id,
        "resolution": resource.resolution,
        "sourceRole": resource.source_role,
        "identity": resource.asset.as_ref().map(|asset| &asset.identity),
        "label": resource.asset.as_ref().map(|asset| &asset.label),
        "source": resource.asset.as_ref().map(|asset| &asset.source),
        "mimeType": resource.asset.as_ref().and_then(|asset| asset.mime_type.as_deref()),
        "width": resource.asset.as_ref().and_then(|asset| asset.width),
        "height": resource.asset.as_ref().and_then(|asset| asset.height),
    })
}

pub(crate) fn monster_appearance_projection(
    session: &EditorSession,
    project_store: Option<&ProjectStore>,
    application_media: Option<&ApplicationMediaCatalog>,
    application_media_store: Option<&ReferenceLibraryStore>,
    icon_id: i16,
    context: Value,
) -> Result<Value, String> {
    let pair = resolve_monster_appearance(session.snapshot(), application_media, icon_id);
    let mut total_bytes = 0usize;
    let base = pair
        .base
        .as_ref()
        .map(|resource| {
            monster_appearance_resource_projection(
                resource,
                project_store,
                application_media_store,
                &mut total_bytes,
            )
        })
        .transpose()?;
    let facing = pair
        .facing
        .as_ref()
        .map(|resource| {
            monster_appearance_resource_projection(
                resource,
                project_store,
                application_media_store,
                &mut total_bytes,
            )
        })
        .transpose()?;
    Ok(json!({
        "format": "providence.monster-appearance.v1",
        "revision": session.revision(),
        "context": context,
        "iconId": pair.icon_id,
        "pairOffset": pair.pair_offset,
        "state": pair.state,
        "complete": pair.complete(),
        "payloadBytes": total_bytes,
        "payloadComplete": pair.complete()
            && base.as_ref().is_some_and(|resource| resource["payloadAvailable"] == true)
            && facing.as_ref().is_some_and(|resource| resource["payloadAvailable"] == true),
        "base": base,
        "facing": facing,
    }))
}

pub(crate) fn monster_appearance_resource_projection(
    resource: &MonsterAppearanceResource,
    project_store: Option<&ProjectStore>,
    application_media_store: Option<&ReferenceLibraryStore>,
    total_bytes: &mut usize,
) -> Result<Value, String> {
    let mut projection = monster_appearance_resource_summary(resource);
    let object = projection
        .as_object_mut()
        .expect("Monster appearance resource summary is an object");
    object.insert("payloadAvailable".into(), json!(false));
    if resource.resolution != MonsterAppearanceResolution::Resolved {
        return Ok(projection);
    }
    let Some(asset) = resource.asset.as_ref() else {
        return Err(format!(
            "resolved monster appearance cicn {} has no asset descriptor",
            resource.resource_id
        ));
    };
    let bytes = match resource.source_role {
        Some(MonsterAppearanceSourceRole::Scenario) => {
            let Some(store) = project_store else {
                object.insert(
                    "payloadReason".into(),
                    json!("Open the portable project to read scenario-owned appearance bytes."),
                );
                return Ok(projection);
            };
            store
                .read_blob(&asset.blob)
                .map_err(|error| error.to_string())?
        }
        Some(MonsterAppearanceSourceRole::ClassicApplication) => {
            let Some(store) = application_media_store else {
                object.insert(
                    "payloadReason".into(),
                    json!("Configure the readable Classic application-media store."),
                );
                return Ok(projection);
            };
            store
                .read_blob(&asset.blob)
                .map_err(|error| error.to_string())?
        }
        None => {
            return Err(format!(
                "resolved monster appearance cicn {} has no source role",
                resource.resource_id
            ));
        }
    };
    account_appearance_bytes(&asset.identity.0, bytes.len(), total_bytes)?;
    object.insert("payloadAvailable".into(), json!(true));
    object.insert("bytes".into(), json!(bytes.len()));
    object.insert("blob".into(), json!(asset.blob));
    object.insert("base64".into(), json!(BASE64.encode(bytes)));
    Ok(projection)
}
pub(crate) const MAX_MONSTER_APPEARANCE_PREVIEW_BYTES: usize = 1024 * 1024;

pub(crate) const MAX_MONSTER_APPEARANCE_TOTAL_BYTES: usize = 2 * 1024 * 1024;

fn account_appearance_bytes(
    identity: &str,
    byte_length: usize,
    total_bytes: &mut usize,
) -> Result<(), String> {
    if byte_length > MAX_MONSTER_APPEARANCE_PREVIEW_BYTES {
        return Err(format!(
            "monster appearance '{}' exceeds the {} byte per-resource preview limit",
            identity, MAX_MONSTER_APPEARANCE_PREVIEW_BYTES
        ));
    }
    *total_bytes = total_bytes
        .checked_add(byte_length)
        .ok_or_else(|| "monster appearance preview byte count overflowed".to_string())?;
    if *total_bytes > MAX_MONSTER_APPEARANCE_TOTAL_BYTES {
        return Err(format!(
            "monster appearance pair exceeds the {} byte aggregate preview limit",
            MAX_MONSTER_APPEARANCE_TOTAL_BYTES
        ));
    }
    Ok(())
}

use crate::execute;
use crate::reference_strings::text_resource_id;
use crate::request_params::required_string;
use crate::request_params::required_u64;
use providence_core::{
    codecs::encode_classic_text_payload,
    model::{AssetDescriptor, StableId},
    references::TargetKind,
    session::{EditorCommand, EditorSession, Revision},
};
use providence_storage::ProjectStore;
use serde_json::{Value, json};

pub(super) fn read_text_resource(
    session: &EditorSession,
    store: Option<&ProjectStore>,
    params: Value,
) -> Result<Value, String> {
    let store = store.ok_or_else(|| {
        "text-resource.open requires serve-project so the content-addressed text is available"
            .to_string()
    })?;
    let identity = StableId(required_string(&params, "identity")?);
    let asset = session
        .snapshot()
        .assets
        .iter()
        .find(|asset| asset.identity == identity && asset.kind == "text-resource")
        .ok_or_else(|| format!("Text Resource '{}' was not found", identity.0))?;
    let bytes = store
        .read_blob(&asset.blob)
        .map_err(|error| error.to_string())?;
    let text = String::from_utf8(bytes).map_err(|_| {
        format!(
            "Text Resource '{}' runtime payload is not UTF-8",
            identity.0
        )
    })?;
    let resource_id = text_resource_id(asset)?;
    let mut projection = open_context(session, asset, &text, resource_id);
    projection
        .as_object_mut()
        .unwrap()
        .extend(crate::text_style_drafts::open_projection(
            session, store, asset, &text,
        )?);
    Ok(projection)
}

fn open_context(
    session: &EditorSession,
    asset: &AssetDescriptor,
    text: &str,
    resource_id: i32,
) -> Value {
    let style = session.snapshot().assets.iter().find(|candidate| {
        candidate.kind == "text-style-resource"
            && candidate.classic_resource.as_ref().is_some_and(|resource| {
                resource.resource_type == "styl" && resource.resource_id == resource_id
            })
    });
    let used_by = session
        .references()
        .into_iter()
        .filter(|reference| {
            reference.target_kind == TargetKind::TextResource
                && reference.target_id == resource_id.to_string()
        })
        .collect::<Vec<_>>();
    let used_by_total = used_by.len();
    let used_by = used_by.into_iter().take(128).collect::<Vec<_>>();
    json!({
        "revision": session.revision(),
        "resource": text_resource_projection(session, asset),
        "text": text,
        "styleCompanion": style.map(|style| json!({
            "identity": style.identity,
            "bytes": style.byte_length,
            "classicPayloadBytes": style.classic_payload_byte_length,
            "ownership": "compatibility-preserved",
        })),
        "usedBy": used_by,
        "usedByTotal": used_by_total,
        "usedByTruncated": used_by_total > 128,
    })
}

pub(super) fn update_text_resource(
    session: &mut EditorSession,
    store: Option<&ProjectStore>,
    params: Value,
) -> Result<Value, String> {
    let store = store.ok_or_else(|| {
        "text-resource.update requires serve-project so UTF-8 and Classic payloads are durable"
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
    let identity = StableId(required_string(&params, "identity")?);
    let mut asset = session
        .snapshot()
        .assets
        .iter()
        .find(|asset| asset.identity == identity && asset.kind == "text-resource")
        .cloned()
        .ok_or_else(|| format!("Text Resource '{}' was not found", identity.0))?;
    let text = required_string(&params, "text")?;
    let classic_payload = encode_classic_text_payload(&text).map_err(|error| error.to_string())?;
    let runtime_payload = text.as_bytes();
    let runtime_blob = store
        .put_blob(runtime_payload)
        .map_err(|error| error.to_string())?;
    let classic_payload_blob = store
        .put_blob(&classic_payload)
        .map_err(|error| error.to_string())?;
    asset.blob = runtime_blob.clone();
    asset.byte_length = runtime_payload.len() as u64;
    asset.classic_payload_blob = Some(classic_payload_blob.clone());
    asset.classic_payload_byte_length = Some(classic_payload.len() as u64);

    let resource_id = text_resource_id(&asset)?;
    let mut result = execute(
        session,
        &params,
        EditorCommand::UpsertAsset {
            asset: Box::new(asset),
        },
    )?;
    if let Some(object) = result.as_object_mut() {
        object.insert("identity".into(), json!(identity));
        object.insert("resourceType".into(), json!("TEXT"));
        object.insert("resourceId".into(), json!(resource_id));
        object.insert("runtimeBlob".into(), json!(runtime_blob));
        object.insert("runtimeBytes".into(), json!(runtime_payload.len()));
        object.insert("classicPayloadBlob".into(), json!(classic_payload_blob));
        object.insert("classicPayloadBytes".into(), json!(classic_payload.len()));
    }
    Ok(result)
}

pub(super) fn text_resource_projection(session: &EditorSession, asset: &AssetDescriptor) -> Value {
    let resource_id = text_resource_id(asset).ok();
    let has_style_companion = resource_id.is_some_and(|resource_id| {
        session.snapshot().assets.iter().any(|candidate| {
            candidate.kind == "text-style-resource"
                && candidate.classic_resource.as_ref().is_some_and(|resource| {
                    resource.resource_type == "styl" && resource.resource_id == resource_id
                })
        })
    });
    json!({
        "identity": asset.identity,
        "label": asset.label,
        "resourceType": "TEXT",
        "resourceId": resource_id,
        "mimeType": asset.mime_type,
        "bytes": asset.byte_length,
        "classicPayloadBytes": asset.classic_payload_byte_length,
        "hasStyleCompanion": has_style_companion,
        "styleOwnership": if has_style_companion { "compatibility-preserved" } else { "none" },
    })
}

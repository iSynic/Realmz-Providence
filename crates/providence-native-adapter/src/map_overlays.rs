use base64::Engine as _;
use base64::engine::general_purpose::STANDARD as BASE64;
use providence_core::codecs::decode_land_cell;
use providence_core::model::ClassicResourceKey;
use providence_core::model::LevelType;
use providence_core::model::MapLevel;
use providence_core::model::{AssetDescriptor, ClassicAction};
use providence_core::rebuilt::ApplicationMediaCatalog;
use providence_core::rebuilt::ApplicationMediaResolution;
use providence_core::session::EditorSession;
use providence_storage::ProjectStore;
use providence_storage::ReferenceLibraryStore;
use serde_json::Value;
use serde_json::json;
use std::collections::BTreeSet;

pub(crate) fn attach_map_overlay_projections(
    projection: &mut Value,
    session: &EditorSession,
    project_store: Option<&ProjectStore>,
    application_media: Option<&ApplicationMediaCatalog>,
    application_media_store: Option<&ReferenceLibraryStore>,
    map: &MapLevel,
    requested_resource_ids: &[i32],
) -> Result<(), String> {
    let candidates = overlay_candidates(map, requested_resource_ids)?;
    attach_resource_overlays(
        projection,
        session,
        project_store,
        application_media,
        application_media_store,
        &candidates,
    )
}

pub(crate) fn attach_resource_overlays(
    projection: &mut Value,
    session: &EditorSession,
    project_store: Option<&ProjectStore>,
    application_media: Option<&ApplicationMediaCatalog>,
    application_media_store: Option<&ReferenceLibraryStore>,
    candidates: &BTreeSet<i32>,
) -> Result<(), String> {
    if candidates.len() > MAX_MAP_OVERLAY_CANDIDATES {
        return Err("Too many crop overlay resources.".into());
    }
    let mut overlays = Vec::with_capacity(candidates.len());
    let mut unresolved = Vec::new();
    let mut total_bytes = 0usize;
    for &resource_id in candidates {
        let resource = ClassicResourceKey {
            resource_type: "cicn".into(),
            resource_id,
        };
        let Some(overlay) = resolve_overlay(
            &resource,
            session,
            project_store,
            application_media,
            application_media_store,
        )?
        else {
            unresolved.push(resource_id);
            continue;
        };
        account_preview_bytes(&overlay, &mut total_bytes)?;
        overlays.push(overlay_projection(resource_id, overlay));
    }

    let object = projection
        .as_object_mut()
        .ok_or_else(|| "map atlas projection was not an object".to_string())?;
    object.insert(
        "overlayCandidates".into(),
        json!(overlays.len() + unresolved.len()),
    );
    object.insert("overlayBytes".into(), json!(total_bytes));
    object.insert("overlays".into(), Value::Array(overlays));
    object.insert("unresolvedOverlayResourceIds".into(), json!(unresolved));
    Ok(())
}

pub(crate) fn map_overlay_resource_id(raw_tile: i16) -> Option<i32> {
    decode_land_cell(raw_tile).icon_resource_id.map(i32::from)
}

pub(crate) fn action_point_overlay_kind(actions: &[ClassicAction]) -> &'static str {
    let mut best = (0_u8, "trigger");
    for action in actions {
        let candidate = match action.opcode() {
            2 | 48 | 56 | 100 | 107 | 119..=127 => (5, "battle"),
            -23 | 4 | 5 | 23 | 34 | 35 | 41 | 44 | 54 | 92 | 104 => (4, "encounter"),
            12 | 13 | 20 | 29 | 37 | 45 | 57 | 61 | 70 | 71 | 93..=97 | 101 | 106 => (3, "map"),
            1 | 19 | 62 => (2, "text"),
            3
            | 6..=8
            | 10
            | 11
            | 21
            | 22
            | 24..=26
            | 31..=33
            | 36
            | 38..=40
            | 42
            | 46
            | 47
            | 49
            | 51
            | 55
            | 58..=60
            | 63..=67
            | 72
            | 73
            | 75..=78
            | 81
            | 84..=87
            | 91
            | 98
            | 99
            | 103 => (1, "quest"),
            _ => (0, "trigger"),
        };
        if candidate.0 > best.0 {
            best = candidate;
        }
    }
    best.1
}
pub(crate) const MAX_MAP_OVERLAY_CANDIDATES: usize = 1024;

pub(crate) const MAX_MAP_OVERLAY_PREVIEW_BYTES: usize = 1024 * 1024;

pub(crate) const MAX_MAP_OVERLAY_TOTAL_BYTES: usize = 16 * 1024 * 1024;

fn overlay_candidates(
    map: &MapLevel,
    requested_resource_ids: &[i32],
) -> Result<BTreeSet<i32>, String> {
    let mut candidates = if map.level_type == LevelType::Land {
        map.tiles
            .iter()
            .filter_map(|tile| map_overlay_resource_id(*tile))
            .collect::<BTreeSet<_>>()
    } else {
        BTreeSet::new()
    };
    if map.level_type == LevelType::Land {
        candidates.extend(requested_resource_ids.iter().copied());
    }
    if candidates.len() > MAX_MAP_OVERLAY_CANDIDATES {
        return Err(format!(
            "map '{}' references {} distinct overlay resources, exceeding the {} resource preview limit",
            map.identity.0,
            candidates.len(),
            MAX_MAP_OVERLAY_CANDIDATES
        ));
    }

    Ok(candidates)
}

struct ResolvedOverlay<'a> {
    asset: &'a AssetDescriptor,
    source_role: &'static str,
    bytes: Vec<u8>,
}

fn resolve_overlay<'a>(
    resource: &ClassicResourceKey,
    session: &'a EditorSession,
    project_store: Option<&ProjectStore>,
    application_media: Option<&'a ApplicationMediaCatalog>,
    application_media_store: Option<&ReferenceLibraryStore>,
) -> Result<Option<ResolvedOverlay<'a>>, String> {
    let scenario_matches = session
        .snapshot()
        .assets
        .iter()
        .filter(|asset| asset.classic_resource.as_ref() == Some(resource))
        .collect::<Vec<_>>();
    // An exact scenario key shadows application art even when unusable or ambiguous.
    match scenario_matches.as_slice() {
        [asset] if asset.mime_type.as_deref() == Some("image/png") => {
            let Some(store) = project_store else {
                return Ok(None);
            };
            let bytes = store
                .read_blob(&asset.blob)
                .map_err(|error| error.to_string())?;
            Ok(Some(ResolvedOverlay {
                asset,
                source_role: "scenario-override",
                bytes,
            }))
        }
        [] => resolve_application_overlay(resource, application_media, application_media_store),
        _ => Ok(None),
    }
}

fn resolve_application_overlay<'a>(
    resource: &ClassicResourceKey,
    catalog: Option<&'a ApplicationMediaCatalog>,
    store: Option<&ReferenceLibraryStore>,
) -> Result<Option<ResolvedOverlay<'a>>, String> {
    let Some(catalog) = catalog else {
        return Ok(None);
    };
    let asset = match catalog.resolve_resource(resource, None) {
        ApplicationMediaResolution::Resolved(asset)
            if asset.descriptor.mime_type.as_deref() == Some("image/png") =>
        {
            &asset.descriptor
        }
        _ => return Ok(None),
    };
    let Some(store) = store else {
        return Ok(None);
    };
    let bytes = store
        .read_blob(&asset.blob)
        .map_err(|error| error.to_string())?;
    Ok(Some(ResolvedOverlay {
        asset,
        source_role: "classic-application-fallback",
        bytes,
    }))
}

fn account_preview_bytes(
    overlay: &ResolvedOverlay<'_>,
    total_bytes: &mut usize,
) -> Result<(), String> {
    if overlay.bytes.len() > MAX_MAP_OVERLAY_PREVIEW_BYTES {
        return Err(format!(
            "map overlay '{}' exceeds the {} byte per-resource preview limit",
            overlay.asset.identity.0, MAX_MAP_OVERLAY_PREVIEW_BYTES
        ));
    }
    *total_bytes = total_bytes
        .checked_add(overlay.bytes.len())
        .ok_or_else(|| "map overlay preview byte count overflowed".to_string())?;
    if *total_bytes > MAX_MAP_OVERLAY_TOTAL_BYTES {
        return Err(format!(
            "map overlay previews exceed the {} byte aggregate limit",
            MAX_MAP_OVERLAY_TOTAL_BYTES
        ));
    }
    Ok(())
}

fn overlay_projection(resource_id: i32, overlay: ResolvedOverlay<'_>) -> Value {
    let ResolvedOverlay {
        asset,
        source_role,
        bytes,
    } = overlay;
    json!({
        "resourceId": resource_id,
        "identity": asset.identity,
        "sourceRole": source_role,
        "source": asset.source,
        "blob": asset.blob,
        "mimeType": asset.mime_type,
        "bytes": bytes.len(),
        "width": asset.width,
        "height": asset.height,
        "base64": BASE64.encode(bytes),
    })
}

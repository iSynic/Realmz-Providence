use providence_core::{
    model::AssetDescriptor, references::reference_targets_asset, session::EditorSession,
};
use serde_json::{Value, json};

mod asset_uses;
use asset_uses::AssetUseSources;

mod source_evidence;
pub(crate) use source_evidence::{source_evidence_list, source_evidence_open};

mod application_media;
pub(crate) use application_media::{
    application_media_list, application_media_open, application_media_preview,
};

const DEFAULT_PAGE_SIZE: usize = 64;
const MAX_PAGE_SIZE: usize = 128;
const MAX_REFERENCE_PREVIEW_BYTES: u64 = 4 * 1024 * 1024;

pub(crate) fn project_asset_list(session: &EditorSession, params: &Value) -> Result<Value, String> {
    let query = normalized_query(params);
    let identity = params.get("identity").and_then(Value::as_str);
    let kind = params
        .get("kind")
        .and_then(Value::as_str)
        .unwrap_or("all")
        .trim();
    let references = session.references();
    let diagnostics = session.diagnostics();
    let mut matches = session
        .snapshot()
        .assets
        .iter()
        .filter(|asset| identity.is_none_or(|identity| asset.identity.0 == identity))
        .filter(|asset| media_kind_matches(&asset.kind, kind))
        .filter(|asset| asset_matches_query(asset, &query))
        .filter(|asset| asset_status_matches(asset, params, &references, &diagnostics))
        .collect::<Vec<_>>();
    matches.sort_by(|left, right| {
        (
            left.kind.as_str(),
            left.classic_resource.as_ref(),
            left.identity.0.as_str(),
        )
            .cmp(&(
                right.kind.as_str(),
                right.classic_resource.as_ref(),
                right.identity.0.as_str(),
            ))
    });
    let total = matches.len();
    let (mut offset, limit) = page(params);
    if let Some(identity) = params.get("seekIdentity").and_then(Value::as_str)
        && let Some(index) = matches
            .iter()
            .position(|asset| asset.identity.0 == identity)
    {
        offset = index / limit * limit;
    }
    let items = matches
        .into_iter()
        .skip(offset)
        .take(limit)
        .map(|asset| project_asset_row(session, asset, &references, &diagnostics))
        .collect::<Vec<_>>();

    Ok(json!({
        "revision": session.revision(),
        "items": items,
        "offset": offset,
        "limit": limit,
        "total": total,
        "truncated": offset.saturating_add(limit) < total,
    }))
}

fn asset_status_matches(
    asset: &AssetDescriptor,
    params: &Value,
    references: &[providence_core::references::ReferenceDescriptor],
    diagnostics: &[providence_core::validation::Diagnostic],
) -> bool {
    match params["status"].as_str().unwrap_or("all") {
        "used" => references
            .iter()
            .any(|reference| reference_targets_asset(reference, asset)),
        "unused" => !references
            .iter()
            .any(|reference| reference_targets_asset(reference, asset)),
        "problems" => diagnostics
            .iter()
            .any(|diagnostic| diagnostic.entity.as_ref() == Some(&asset.identity)),
        _ => true,
    }
}

pub(crate) fn project_asset_open(session: &EditorSession, params: &Value) -> Result<Value, String> {
    if let Some(expected) = params.get("expectedRevision")
        && expected.as_u64() != Some(session.revision().0)
    {
        return Err("The scenario changed. Recheck artwork uses before opening a record.".into());
    }
    let identity = params
        .get("identity")
        .and_then(Value::as_str)
        .ok_or_else(|| "project-asset.open requires identity".to_string())?;
    let asset = session
        .snapshot()
        .assets
        .iter()
        .find(|asset| asset.identity.0 == identity)
        .ok_or_else(|| format!("Project asset '{identity}' was not found"))?;
    let references = session.references();
    let diagnostics = session.diagnostics();
    let used_by = references
        .into_iter()
        .filter(|reference| reference_targets_asset(reference, asset))
        .collect::<Vec<_>>();
    let problems = diagnostics
        .into_iter()
        .filter(|diagnostic| diagnostic.entity.as_ref() == Some(&asset.identity))
        .collect::<Vec<_>>();
    let (offset, limit) = page(params);
    let used_by_total = used_by.len();
    let problem_total = problems.len();
    let removal = session.check_asset_removal(&asset.identity);
    let snapshot = session.snapshot();
    let labels = AssetUseSources {
        items: &snapshot.scenario_item_rules,
        maps: &snapshot.world.maps,
        player_maps: &snapshot.world.player_maps,
        monster_sets: &snapshot.monster_sets,
    };
    let use_targets = labels.project_targets(&used_by, offset, limit);

    Ok(json!({
        "revision": session.revision(),
        "asset": asset,
        "removable": removal.is_ok(),
        "removalReason": asset_removal_reason(&removal),
        "previewCommand": preview_command(asset),
        "usedBy": used_by.into_iter().skip(offset).take(limit).collect::<Vec<_>>(),
        "pairedText": paired_text(&snapshot.assets, asset),
        "useTargets": use_targets,
        "problems": problems.into_iter().skip(offset).take(limit).collect::<Vec<_>>(),
        "paging": {
            "offset": offset,
            "limit": limit,
            "usedByTotal": used_by_total,
            "problemTotal": problem_total,
            "usedByTruncated": offset.saturating_add(limit) < used_by_total,
            "problemsTruncated": offset.saturating_add(limit) < problem_total,
        },
    }))
}

fn paired_text(assets: &[AssetDescriptor], style: &AssetDescriptor) -> Value {
    if style.kind != "text-style-resource" {
        return Value::Null;
    }
    let Some(key) = style
        .classic_resource
        .as_ref()
        .filter(|key| key.resource_type == "styl")
    else {
        return json!({"status": "missing", "identity": null});
    };
    let mut matches = assets.iter().filter(|asset| {
        asset.kind == "text-resource"
            && asset.classic_resource.as_ref().is_some_and(|candidate| {
                candidate.resource_type == "TEXT" && candidate.resource_id == key.resource_id
            })
    });
    let first = matches.next();
    let ambiguous = matches.next().is_some();
    json!({
        "status": if ambiguous { "ambiguous" } else if first.is_some() { "ready" } else { "missing" },
        "identity": if ambiguous { None } else { first.map(|asset| &asset.identity) },
        "resourceId": key.resource_id,
    })
}

fn normalized_query(params: &Value) -> String {
    params
        .get("query")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .trim()
        .to_lowercase()
}

fn page(params: &Value) -> (usize, usize) {
    let offset = params.get("offset").and_then(Value::as_u64).unwrap_or(0) as usize;
    let limit = params
        .get("limit")
        .and_then(Value::as_u64)
        .unwrap_or(DEFAULT_PAGE_SIZE as u64)
        .clamp(1, MAX_PAGE_SIZE as u64) as usize;
    (offset, limit)
}

fn asset_matches_query(asset: &AssetDescriptor, query: &str) -> bool {
    query.is_empty()
        || asset.identity.0.to_lowercase().contains(query)
        || asset.label.to_lowercase().contains(query)
        || asset.kind.to_lowercase().contains(query)
        || asset.source.to_lowercase().contains(query)
        || asset.classic_resource.as_ref().is_some_and(|resource| {
            resource.resource_type.to_lowercase().contains(query)
                || resource.resource_id.to_string().contains(query)
        })
}

fn preview_command(asset: &AssetDescriptor) -> Option<&'static str> {
    match asset.kind.as_str() {
        "picture" => Some("picture.preview"),
        "sound" => Some("sound.preview"),
        "icon" => Some("icon.preview"),
        "special-land-tile" => Some("special-land.preview"),
        "text-resource" => Some("text-resource.open"),
        _ => None,
    }
}

fn asset_removal_reason(result: &Result<(), providence_core::session::SessionError>) -> String {
    match result {
        Ok(()) => String::new(),
        Err(providence_core::session::SessionError::InvalidMonsterAppearance(_)) => {
            "This is paired monster artwork. Manage the image pair in Monster Editor.".into()
        }
        Err(error) => error.to_string(),
    }
}

fn project_asset_row(
    session: &EditorSession,
    asset: &AssetDescriptor,
    references: &[providence_core::references::ReferenceDescriptor],
    diagnostics: &[providence_core::validation::Diagnostic],
) -> Value {
    let used_by = references
        .iter()
        .filter(|reference| reference_targets_asset(reference, asset))
        .count();
    let problems = diagnostics
        .iter()
        .filter(|diagnostic| diagnostic.entity.as_ref() == Some(&asset.identity))
        .count();
    let removal = session.check_asset_removal(&asset.identity);
    let removal_reason = asset_removal_reason(&removal);
    json!({
        "identity": asset.identity,
        "label": asset.label,
        "kind": asset.kind,
        "mimeType": asset.mime_type,
        "classicResource": asset.classic_resource,
        "byteLength": asset.byte_length,
        "classicPayloadBytes": asset.classic_payload_byte_length,
        "width": asset.width,
        "height": asset.height,
        "durationMs": asset.duration_ms,
        "source": asset.source,
        "usedBy": used_by,
        "problems": problems,
        "previewCommand": preview_command(asset),
        "removable": removal.is_ok(),
        "removalReason": removal_reason,
    })
}

pub(crate) fn media_kind_matches(actual: &str, selected: &str) -> bool {
    selected == "all"
        || actual == selected
        || selected == "all-text" && matches!(actual, "text-resource" | "text-style-resource")
}

#[cfg(test)]
mod tests;

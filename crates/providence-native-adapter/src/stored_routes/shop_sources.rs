//! Read-only source interpretations; these blocks are never Shop authoring records.
use providence_core::{codecs::decode_shops, model::ProjectOrigin, session::EditorSession};
use providence_storage::ProjectStore;
use serde_json::{Value, json};
use std::collections::BTreeSet;

pub(super) fn list(
    session: &mut EditorSession,
    store: Option<&ProjectStore>,
    params: &Value,
) -> Result<Value, String> {
    let offset = params["offset"].as_u64().unwrap_or(0) as usize;
    let limit = params["limit"].as_u64().unwrap_or(64).clamp(1, 128) as usize;
    let snapshot = session.snapshot();
    let excluded = if matches!(snapshot.origin, ProjectOrigin::Imported { .. }) {
        if let Some(source) = snapshot
            .classic_sources
            .iter()
            .find(|source| source.native_path == "Data SD")
        {
            let bytes = store
                .ok_or("Retained Shop source requires an open project store.")?
                .read_blob(&source.blob)
                .map_err(|error| format!("Retained Shop source is unavailable: {error}"))?;
            let retained = snapshot
                .shops
                .iter()
                .map(|shop| shop.native_id)
                .collect::<BTreeSet<_>>();
            decode_shops(&bytes)
                .quarantined_records
                .into_iter()
                .filter(|row| !retained.contains(&row.native_id))
                .collect::<Vec<_>>()
        } else {
            Vec::new()
        }
    } else {
        Vec::new()
    };
    let index = session.discovery();
    let items = excluded.iter().skip(offset).take(limit).map(|row| {
        let id = row.native_id.0.to_string();
        json!({"identity": format!("shop:{id}"), "nativeId": row.native_id, "kind": "shop", "scope": "scenario",
            "name": format!("Unverified source slot {id}"), "reason": row.reason, "linkOnly": true,
            "callers": index.incoming("shop", &id).len()})
    }).collect::<Vec<_>>();
    Ok(
        json!({"revision": session.revision(), "items": items, "total": excluded.len(), "offset": offset,
        "limit": limit, "truncated": offset.saturating_add(limit) < excluded.len()}),
    )
}

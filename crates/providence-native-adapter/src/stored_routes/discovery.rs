//! Supplemental catalog text is decoded once per revision, outside the portable core.
use crate::catalogs::{CatalogViews, OpenMonsterLibrary};
use providence_core::{
    discovery::{DiscoveryIndex, DiscoveryRecord},
    session::EditorSession,
};
use providence_storage::ProjectStore;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::sync::{Mutex, OnceLock};

#[derive(Default)]
struct CachedText {
    key: String,
    index: DiscoveryIndex,
}

pub(super) fn dispatch(
    session: &mut EditorSession,
    store: Option<&ProjectStore>,
    catalogs: CatalogViews<'_>,
    monster_library: Option<&OpenMonsterLibrary>,
    method: &str,
    params: Value,
) -> Result<Value, String> {
    crate::session_routes::discovery::guard(session, &params)?;
    if !matches!(method, "discovery.search" | "discovery.preview") {
        let mut result = crate::session_routes::dispatch(session, method, params)?;
        super::discovery_media::connect_targets(&mut result, catalogs);
        return Ok(result);
    }
    let personal = catalogs
        .personal_library
        .map(|store| store.load_manifest().map_err(|e| e.to_string()))
        .transpose()?;
    let key = format!(
        "{}|{:?}",
        cache_key(
            session,
            store,
            catalogs,
            personal.as_ref().map(|r| r.revision()),
        ),
        monster_library.map(|library| (
            &library.session.catalog().library_id,
            library.session.revision()
        ))
    );
    static CACHE: OnceLock<Mutex<CachedText>> = OnceLock::new();
    let mut cache = CACHE
        .get_or_init(|| Mutex::new(CachedText::default()))
        .lock()
        .map_err(|_| "Discovery text cache is unavailable")?;
    if cache.key != key {
        cache.index.records = records(session, store, catalogs, personal.as_ref())?;
        append_monsters(&mut cache.index.records, monster_library);
        cache.key = key;
    }
    if method == "discovery.preview" {
        return preview(session, &params, &cache.index);
    }
    Ok(search_page(session, &params, &cache.index))
}

fn search_page(session: &EditorSession, params: &Value, index: &DiscoveryIndex) -> Value {
    let scope = params["scope"].as_str().unwrap_or("scenario");
    let kind = params["kind"].as_str().unwrap_or("all");
    let query = params["query"].as_str().unwrap_or("");
    let mut hits = session.discovery().search(query, kind, scope);
    hits.extend(index.search(query, kind, scope));
    hits.sort_by(|a, b| {
        (a.rank, &a.record.kind, &a.record.identity).cmp(&(
            b.rank,
            &b.record.kind,
            &b.record.identity,
        ))
    });
    hits.dedup_by(|a, b| {
        a.record.identity == b.record.identity && a.record.scope == b.record.scope
    });
    crate::session_routes::discovery::page(
        session,
        params,
        hits.into_iter()
            .map(|r| serde_json::to_value(r).unwrap())
            .collect(),
    )
}

fn append_monsters(out: &mut Vec<DiscoveryRecord>, library: Option<&OpenMonsterLibrary>) {
    let Some(library) = library else {
        return;
    };
    let catalog = library.session.catalog();
    for entry in catalog.built_ins.iter().chain(&catalog.custom_entries) {
        out.push(DiscoveryRecord {
            identity: entry.identity.0.clone(),
            kind: "monster-library-entry".into(),
            native_id: entry.preferred_scenario_monster_id.0.to_string(),
            name: entry.label.clone(),
            scope: if entry.ownership
                == providence_core::monster_library::MonsterLibraryOwnership::Custom
            {
                "personal"
            } else {
                "stock"
            }
            .into(),
            root_reason: None,
            fields: vec![
                ("label".into(), entry.label.clone()),
                ("description".into(), entry.description.clone()),
            ],
        });
    }
}

fn cache_key(
    s: &EditorSession,
    store: Option<&ProjectStore>,
    c: CatalogViews<'_>,
    personal: Option<u64>,
) -> String {
    let input = json!([
        s.snapshot().project_id,
        s.revision(),
        store.map(|s| s.root()),
        s.snapshot().assets,
        c.stock_items.map(|r| &r.fingerprint),
        c.application_media.map(|r| &r.library_id),
        c.reference_catalog.map(|r| &r.library_id),
        personal,
        c.personal_library.map(|r| r.root())
    ]);
    format!("{:x}", Sha256::digest(input.to_string()))
}

fn records(
    s: &EditorSession,
    store: Option<&ProjectStore>,
    c: CatalogViews<'_>,
    personal: Option<&providence_core::personal_library::PersonalLibrary>,
) -> Result<Vec<DiscoveryRecord>, String> {
    let mut out = Vec::new();
    for group in crate::reference_strings::collect_reference_string_groups(s, None)? {
        let payload = text_payload(s, store, &group.identity);
        out.push(DiscoveryRecord {
            identity: group.identity.clone(),
            kind: "reference-string".into(),
            native_id: group.resource_id.to_string(),
            name: group.label,
            scope: if group.ownership.starts_with("project-")
                || group.ownership.starts_with("compatibility-")
                || group.identity.contains("scenario-")
            {
                "scenario"
            } else {
                "stock"
            }
            .into(),
            root_reason: None,
            fields: group
                .entries
                .into_iter()
                .enumerate()
                .map(|(i, text)| (format!("entries[{i}]"), text))
                .chain(payload)
                .collect(),
        });
    }
    append_libraries(&mut out, c, personal);
    Ok(out)
}

fn text_payload(
    s: &EditorSession,
    store: Option<&ProjectStore>,
    identity: &str,
) -> Vec<(String, String)> {
    let Some(id) = identity.strip_prefix("reference-string:asset:") else {
        return Vec::new();
    };
    let Some(asset) = s
        .snapshot()
        .assets
        .iter()
        .find(|a| a.identity.0 == id && a.kind == "text-resource")
    else {
        return Vec::new();
    };
    let Some(store) = store else {
        return vec![(
            "availabilityReason".into(),
            "Open the saved project to read this text payload.".into(),
        )];
    };
    match store
        .read_blob(&asset.blob)
        .map_err(|e| e.to_string())
        .and_then(|bytes| {
            String::from_utf8(bytes)
                .map_err(|_| "The retained text payload is not readable UTF-8.".into())
        }) {
        Ok(text) => vec![("text".into(), text)],
        Err(reason) => vec![("availabilityReason".into(), reason)],
    }
}

fn append_libraries(
    out: &mut Vec<DiscoveryRecord>,
    c: CatalogViews<'_>,
    personal: Option<&providence_core::personal_library::PersonalLibrary>,
) {
    if let Some(personal) = personal {
        for asset in personal.assets() {
            out.push(DiscoveryRecord {
                identity: asset.identity.0.clone(),
                kind: asset
                    .media
                    .as_ref()
                    .map(|media| super::discovery_media::kind(&media.primary))
                    .unwrap_or("personal-asset")
                    .into(),
                native_id: asset.identity.0.clone(),
                name: asset.name.clone(),
                scope: "personal".into(),
                root_reason: None,
                fields: vec![("name".into(), asset.name.clone())],
            });
        }
    }
    if let Some(stock) = c.stock_items {
        for item in &stock.definitions {
            out.push(DiscoveryRecord {
                identity: item.id.0.clone(),
                kind: "item".into(),
                native_id: item.classic_id.to_string(),
                name: item.name.clone(),
                scope: "stock".into(),
                root_reason: None,
                fields: vec![
                    ("name".into(), item.name.clone()),
                    ("unidentifiedName".into(), item.unidentified_name.clone()),
                    ("description".into(), item.description.clone()),
                ],
            });
        }
    }
    append_media(out, c);
}

fn append_media(out: &mut Vec<DiscoveryRecord>, c: CatalogViews<'_>) {
    for asset in c
        .application_media
        .into_iter()
        .flat_map(|r| &r.assets)
        .map(|r| &r.descriptor)
        .chain(
            c.reference_catalog
                .into_iter()
                .flat_map(|r| &r.assets)
                .map(|r| &r.descriptor),
        )
    {
        out.push(DiscoveryRecord {
            identity: asset.identity.0.clone(),
            kind: super::discovery_media::kind(asset).into(),
            native_id: asset
                .classic_resource
                .as_ref()
                .map(|k| k.resource_id.to_string())
                .unwrap_or_default(),
            name: asset.label.clone(),
            scope: "stock".into(),
            root_reason: None,
            fields: vec![
                ("label".into(), asset.label.clone()),
                ("kind".into(), asset.kind.clone()),
            ],
        });
    }
}

fn preview(s: &mut EditorSession, p: &Value, index: &DiscoveryIndex) -> Result<Value, String> {
    let identity = p["identity"].as_str().ok_or("identity is required")?;
    let scope = p["scope"].as_str();
    if let Some(record) = index
        .records
        .iter()
        .find(|r| r.identity == identity && scope.is_none_or(|scope| r.scope == scope))
    {
        let mut summary = record.clone();
        summary.fields.clear();
        let query = p["query"].as_str().unwrap_or("");
        let fields = crate::session_routes::discovery::preview_fields(record, query);
        return Ok(
            json!({"record":summary,"fields":fields,"fieldsTotal":record.fields.len(),"revision":s.revision(),"callers":s.discovery().incoming_record(record).into_iter().take(3).collect::<Vec<_>>(),"usedBy":s.discovery().incoming_record(record).len(),"uses":s.discovery().outgoing(&record.identity).len()}),
        );
    }
    crate::session_routes::dispatch(s, "discovery.preview", p.clone())
}

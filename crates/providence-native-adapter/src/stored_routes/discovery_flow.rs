use crate::catalogs::{CatalogViews, OpenMonsterLibrary};
use providence_core::{
    discovery::flow::{FlowCatalog, FlowTarget},
    references::ResolutionState,
    session::EditorSession,
};
use providence_storage::ProjectStore;
use serde_json::{Value, json};

pub(super) fn read(
    session: &EditorSession,
    store: Option<&ProjectStore>,
    catalogs: CatalogViews<'_>,
    monsters: Option<&OpenMonsterLibrary>,
    params: &Value,
) -> Result<Value, String> {
    let personal = catalogs
        .personal_library
        .map(|store| store.load_manifest().map_err(|e| e.to_string()))
        .transpose()?;
    let key = json!([
        super::discovery::cache_key(
            session,
            store,
            catalogs,
            personal.as_ref().map(|r| r.revision())
        ),
        catalogs.stock_spells.map(|r| &r.fingerprint),
        catalogs.stock_rules.map(|r| &r.fingerprint),
        monsters.map(|r| (&r.session.catalog().library_id, r.session.revision()))
    ])
    .to_string();
    crate::discovery_flow::read(session, params, &key, || {
        // No project store is supplied: flow needs identities, never decoded blob contents.
        let mut records = super::discovery::records(session, None, catalogs, personal.as_ref())?;
        super::discovery::append_monsters(&mut records, monsters);
        for record in &mut records {
            record.fields.clear();
        }
        let mut catalog = FlowCatalog {
            records,
            ..Default::default()
        };
        resolve_targets(session, catalogs, &mut catalog);
        Ok(catalog)
    })
}

fn resolve_targets(session: &EditorSession, catalogs: CatalogViews<'_>, catalog: &mut FlowCatalog) {
    for link in &session.discovery().links {
        if link.resolution != ResolutionState::StockFallback {
            continue;
        }
        if let Some(target) = super::discovery_media::flow_target(link, catalogs) {
            catalog.targets.insert(link.occurrence.clone(), target);
        } else {
            let candidates: Vec<_> = catalog
                .records
                .iter()
                .filter(|r| {
                    r.scope == "stock"
                        && r.kind == link.target_kind
                        && (r.native_id == link.target_id
                            || link.target_identity.as_ref() == Some(&r.identity))
                })
                .collect();
            if let [record] = candidates.as_slice() {
                catalog.targets.insert(
                    link.occurrence.clone(),
                    FlowTarget {
                        identity: Some(record.identity.clone()),
                        scope: "stock".into(),
                        resolution: ResolutionState::Resolved,
                        reason: String::new(),
                    },
                );
            }
        }
    }
}

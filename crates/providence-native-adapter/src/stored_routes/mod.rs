//! Requests that need portable stores or external reference catalogs.
mod application;
mod battle_catalog;
mod characters;
mod classic;
mod diagnostics;
mod imports;
mod items;
mod media;
mod media_authoring;
pub(crate) use media_authoring::check_retained_landlook;
mod monsters;
mod personal;
mod project;
mod rebuilt;
pub(crate) use rebuilt::readiness_data;
mod discovery;
mod discovery_media;
#[cfg(test)]
mod discovery_tests;
mod reference;
mod rule_references;
mod scenario;
mod shop_sources;
mod spell_references;
mod text;
mod world;

use crate::catalogs::{CatalogViews, OpenMonsterLibrary};
use providence_core::session::EditorSession;
use providence_storage::ProjectStore;
use serde_json::Value;

pub(crate) fn dispatch(
    session: &mut EditorSession,
    store: Option<&ProjectStore>,
    catalogs: CatalogViews<'_>,
    monster_library: Option<&mut OpenMonsterLibrary>,
    method: &str,
    params: Value,
) -> Result<Value, String> {
    if let Some(request) = characters::resolve(method) {
        return request.dispatch(session, store, catalogs, method, &params);
    }
    if let Some(request) = items::resolve(method) {
        return request.dispatch(session, store, catalogs, method, params);
    }
    match method.split('.').next().unwrap_or_default() {
        "shop" if method == "shop.unverified.list" => shop_sources::list(session, store, &params),
        "discovery" => discovery::dispatch(
            session,
            store,
            catalogs,
            monster_library.as_deref(),
            method,
            params,
        ),
        _ if world::handles(method) => world::dispatch(session, store, catalogs, method, params),
        "battle-reference" | "battle-monster" if method.ends_with(".list") => {
            battle_catalog::dispatch(session, catalogs, method, &params)
        }
        "media" => media_authoring::dispatch(session, store, catalogs, method, &params),
        "personal-library" => personal::dispatch(session, store, catalogs, method, params),
        "monster-library" | "monster-appearance" | "monster-rewards" => {
            monsters::dispatch(session, store, catalogs, monster_library, method, params)
        }
        "monster-reference" if method == "monster-reference.list" => {
            crate::monster_reference_catalog::list(session, store, catalogs, &params)
        }
        "application-media" => application::dispatch(session, catalogs, method, params),
        "reference-catalog" | "artwork" => {
            reference::dispatch(session, store, catalogs, method, params)
        }
        "compiler" | "compatibility" => {
            diagnostics::dispatch(session, store, catalogs, method, params)
        }
        "project" => project::dispatch(session, store, catalogs, method, params),
        "picture" | "sound" | "icon" | "special-land" => {
            media::dispatch(session, store, method, params)
        }
        "text" if method == "text.export-check" => {
            crate::text_export::text_export_with_store(session, store, &params)
        }
        "text-resource" | "reference-string" => text::dispatch(session, store, method, params),
        _ => additional(session, store, catalogs, monster_library, method, params),
    }
}

fn additional(
    session: &mut EditorSession,
    store: Option<&ProjectStore>,
    catalogs: CatalogViews<'_>,
    monster_library: Option<&mut OpenMonsterLibrary>,
    method: &str,
    params: Value,
) -> Result<Value, String> {
    match method {
        "monster.copy-to-library" => {
            monsters::dispatch(session, store, catalogs, monster_library, method, params)
        }
        "scenario-contact.open"
        | "scenario-startup.open"
        | "scenario-restrictions.open"
        | "scenario-security.open"
        | "scenario-security.update"
        | "scenario-security.validate"
        | "scenario-security.repair-preview"
        | "scenario-security.source-preview"
        | "scenario-security.source-list"
        | "scenario-registration.generate" => scenario::dispatch(session, store, method, params),
        "race-rules.import"
        | "caste-rules.import"
        | "rule-names.import"
        | "item-rules.import-standard"
        | "item-rules.import-scenario"
        | "terrain.import-mapstats-reference"
        | "custom-landlook.metadata.import"
        | "spell-rules.import-standard" => imports::dispatch(session, store, method, params),
        "asset.import" => crate::asset_import::import(session, store, params),
        "record.open" => open_record(session, catalogs, &params),
        "validation.list" => crate::text_export::validation_list_projection(
            session,
            catalogs.application_media,
            &params,
        ),
        "action-definition.list"
        | "action-form.describe"
        | "action-form.coverage"
        | "action-form.shared-impact"
        | "action-target.list" => {
            crate::session_routes::action_authoring::dispatch_with_application(
                session,
                catalogs.application_media,
                method,
                params,
            )
        }
        _ => crate::session_routes::dispatch(session, method, params),
    }
}

fn open_record(
    session: &EditorSession,
    catalogs: CatalogViews<'_>,
    params: &Value,
) -> Result<Value, String> {
    let mut result = crate::record_catalog::record_open(session, params)?;
    discovery_media::connect_record_targets(&mut result, catalogs);
    Ok(result)
}

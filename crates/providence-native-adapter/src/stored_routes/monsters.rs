use crate::catalogs::CatalogViews;
use crate::catalogs::OpenMonsterLibrary;
use crate::monster_appearance_defaults::materialize_monster_appearance_defaults;
use crate::monster_appearance_defaults::restore_monster_appearance_defaults;
use crate::monster_appearance_import::import_monster_appearance_pair;
use crate::monster_appearance_views::monster_appearance_list_projection;
use crate::monster_appearance_views::monster_appearance_projection;
use crate::monster_library_copy::copy_scenario_monster_to_library;
use crate::monster_reward_projection;
use crate::request_params::required_i16;
use crate::request_params::required_string;
use providence_core::model::StableId;
use providence_core::rebuilt::ApplicationMediaCatalog;
use providence_core::session::EditorSession;
use providence_storage::ProjectStore;
use providence_storage::ReferenceLibraryStore;
use serde_json::Value;
use serde_json::json;

pub(super) fn dispatch(
    session: &mut EditorSession,
    store: Option<&ProjectStore>,
    catalogs: CatalogViews<'_>,
    monster_library: Option<&mut OpenMonsterLibrary>,
    method: &str,
    params: Value,
) -> Result<Value, String> {
    if method.starts_with("monster-appearance.") {
        return appearance(session, store, catalogs, method, params);
    }
    let application_media = catalogs.application_media;
    let application_media_store = catalogs.application_media_store;
    match method {
        "monster-library.preview" => preview(
            session,
            store,
            monster_library,
            params,
            application_media,
            application_media_store,
        ),
        "monster-rewards.preview" => monster_reward_projection::preview(
            session,
            store,
            application_media,
            application_media_store,
        ),
        "monster.copy-to-library" => {
            copy_scenario_monster_to_library(session, monster_library, params)
        }
        _ if method.starts_with("monster-library.") => {
            crate::monster_library_routes::dispatch_monster_library(
                session,
                monster_library,
                method,
                params,
            )
        }
        _ => crate::session_routes::dispatch(session, method, params),
    }
}

fn preview(
    session: &mut EditorSession,
    store: Option<&ProjectStore>,
    monster_library: Option<&mut OpenMonsterLibrary>,
    params: Value,
    application_media: Option<&ApplicationMediaCatalog>,
    application_media_store: Option<&ReferenceLibraryStore>,
) -> Result<Value, String> {
    let library = monster_library.as_deref().ok_or_else(|| {
        "monster-library.preview requires serve-project --monster-library-root <portable-library-directory>"
            .to_string()
    })?;
    let identity = StableId(required_string(&params, "identity")?);
    let entry = library
        .session
        .catalog()
        .entry(&identity)
        .ok_or_else(|| format!("Monster Library entry '{}' was not found", identity.0))?;
    monster_appearance_projection(
        session,
        store,
        application_media,
        application_media_store,
        entry.template.icon_id,
        json!({
            "kind": "monster-library-entry",
            "identity": entry.identity,
            "label": entry.label,
            "libraryRevision": library.session.revision(),
        }),
    )
}

fn appearance(
    session: &mut EditorSession,
    store: Option<&ProjectStore>,
    catalogs: CatalogViews<'_>,
    method: &str,
    params: Value,
) -> Result<Value, String> {
    let application_media = catalogs.application_media;
    let application_media_store = catalogs.application_media_store;
    match method {
        "monster-appearance.open" => monster_appearance_projection(
            session,
            store,
            application_media,
            application_media_store,
            required_i16(&params, "iconId")?,
            json!({"kind": "icon-id"}),
        ),
        "monster-appearance.list" => {
            monster_appearance_list_projection(session, application_media, &params)
        }
        "monster-appearance.materialize-defaults" => materialize_monster_appearance_defaults(
            session,
            store,
            application_media,
            application_media_store,
            params,
        ),
        "monster-appearance.import-pair" => {
            import_monster_appearance_pair(session, store, application_media, params)
        }
        "monster-appearance.restore-defaults" => {
            restore_monster_appearance_defaults(session, application_media, params)
        }
        _ => crate::session_routes::dispatch(session, method, params),
    }
}

use crate::{
    catalogs::CatalogViews,
    execute,
    request_params::{required_string, required_u64, required_value},
};
use providence_core::{
    level_settings::{self, LANDLOOK_CHOICES, LevelSettingsEdit},
    model::{LevelType, StableId},
    session::{EditorCommand, EditorSession},
};
use providence_storage::ProjectStore;
use serde_json::{Value, json};

pub(crate) fn dispatch(
    session: &mut EditorSession,
    store: Option<&ProjectStore>,
    catalogs: CatalogViews<'_>,
    method: &str,
    params: &Value,
) -> Result<Value, String> {
    let identity = StableId(required_string(params, "identity")?);
    match method {
        "level-settings.open" => open(session, store, catalogs, &identity),
        "level-settings.artwork" => {
            let landlook = required_value(params, "landlook")?
                .as_i64()
                .and_then(|value| i8::try_from(value).ok())
                .ok_or("landlook must be a signed byte")?;
            artwork(session, store, catalogs, &identity, landlook)
        }
        "level-settings.preview" | "level-settings.apply" => {
            if required_u64(params, "expectedRevision")? != session.revision().0 {
                return Err(
                    "The level revision changed. Reopen its settings before applying.".into(),
                );
            }
            let edit: LevelSettingsEdit =
                serde_json::from_value(required_value(params, "edit")?.clone())
                    .map_err(|error| format!("invalid level settings: {error}"))?;
            review_or_apply(session, store, catalogs, method, params, identity, edit)
        }
        _ => Err(format!("unknown method {method}")),
    }
}

fn open(
    session: &EditorSession,
    store: Option<&ProjectStore>,
    catalogs: CatalogViews<'_>,
    identity: &StableId,
) -> Result<Value, String> {
    let map = session
        .snapshot()
        .world
        .maps
        .iter()
        .find(|map| map.identity == *identity)
        .ok_or("The selected level no longer exists.")?;
    let settings = level_settings::inspect_level_settings(session.snapshot(), identity)
        .map_err(|error| error.to_string())?;
    let mut choices = Vec::new();
    if map.level_type == LevelType::Land {
        for (landlook, label) in LANDLOOK_CHOICES {
            let image = artwork(session, store, catalogs, identity, landlook)
                .unwrap_or_else(|reason| json!({"available":false,"reason":reason}));
            let catalog = session
                .snapshot()
                .landlook_catalogs
                .iter()
                .find(|catalog| catalog.landlook == landlook);
            choices.push(json!({"id":landlook,"name":label,"available":image["available"] == true,"reason":image["reason"],
                "ownership":if image["sourceRole"] == "scenario-override" {"Scenario artwork"} else {"Stock artwork"},
                "sharedBaseEditable":level_settings::custom_catalog_available(session.snapshot(),landlook),
                "baseTile":catalog.map(|catalog|catalog.base_tile)}));
        }
        if !LANDLOOK_CHOICES
            .iter()
            .any(|(id, _)| Some(*id) == settings.landlook)
        {
            choices.push(json!({"id":settings.landlook,"name":"Preserved imported Landlook","available":false,"reason":"Keep the imported renderer or choose a supported replacement.","sharedBaseEditable":false,"baseTile":null}));
        }
    }
    Ok(
        json!({"identity":identity,"revision":session.revision(),"dungeon":map.level_type == LevelType::Dungeon,"settings":settings,"landlooks":choices}),
    )
}

fn artwork(
    session: &EditorSession,
    store: Option<&ProjectStore>,
    catalogs: CatalogViews<'_>,
    identity: &StableId,
    landlook: i8,
) -> Result<Value, String> {
    let mut edit = level_settings::inspect_level_settings(session.snapshot(), identity)
        .map_err(|error| error.to_string())?;
    edit.landlook = Some(landlook);
    let runtime = level_settings::preview_level_renderer(session.snapshot(), identity, &edit)
        .map_err(|error| error.to_string())?;
    let mut map = session
        .snapshot()
        .world
        .maps
        .iter()
        .find(|map| map.identity == *identity)
        .ok_or("The selected level no longer exists.")?
        .clone();
    map.runtime = Some(runtime);
    crate::map_rendering::resolve_map_atlas(
        session,
        store,
        catalogs.application_media,
        catalogs.application_media_store,
        &map,
    )
}

fn review_or_apply(
    session: &mut EditorSession,
    store: Option<&ProjectStore>,
    catalogs: CatalogViews<'_>,
    method: &str,
    params: &Value,
    identity: StableId,
    edit: LevelSettingsEdit,
) -> Result<Value, String> {
    let preview = level_settings::preview_level_settings(session.snapshot(), &identity, &edit)
        .map_err(|error| error.to_string())?;
    let original = level_settings::inspect_level_settings(session.snapshot(), &identity)
        .map_err(|error| error.to_string())?;
    if original.landlook != edit.landlook {
        let image = artwork(
            session,
            store,
            catalogs,
            &identity,
            edit.landlook.ok_or("Choose a Landlook.")?,
        )?;
        if image["available"] != true {
            return Err(image["reason"]
                .as_str()
                .unwrap_or("The selected Landlook artwork is unavailable.")
                .into());
        }
    }
    if method == "level-settings.preview" {
        let offset = params.get("offset").and_then(Value::as_u64).unwrap_or(0) as usize;
        let total = preview.affected_maps.len();
        let affected = preview
            .affected_maps
            .into_iter()
            .skip(offset)
            .take(128)
            .collect::<Vec<_>>();
        return Ok(
            json!({"revision":session.revision(),"canApply":preview.can_apply,"changes":preview.changes,
            "sharedLandlook":preview.shared_landlook,"affectedMaps":affected,"offset":offset,"total":total,"truncated":offset.saturating_add(128) < total}),
        );
    }
    let mut result = execute(
        session,
        params,
        EditorCommand::ApplyLevelSettings {
            identity: identity.clone(),
            edit,
        },
    )?;
    result["settings"] = json!(
        level_settings::inspect_level_settings(session.snapshot(), &identity)
            .map_err(|error| error.to_string())?
    );
    Ok(result)
}

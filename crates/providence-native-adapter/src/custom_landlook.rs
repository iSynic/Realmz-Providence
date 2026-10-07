use crate::{catalogs::CatalogViews, execute, request_params::*};
use providence_core::{
    codecs::*,
    custom_landlook::{self, ArtworkMode},
    model::*,
    session::{EditorCommand, EditorSession},
};
use providence_storage::ProjectStore;
use serde::Deserialize;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};

mod material;
#[cfg(test)]
mod tests;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Draft {
    operation: String,
    source_look: i8,
    destination: i8,
    #[serde(default)]
    replace: bool,
    #[serde(default)]
    assign_map: bool,
    #[serde(default)]
    path: String,
    #[serde(default = "full")]
    mode: ArtworkMode,
    #[serde(default = "first")]
    tile: i16,
}
fn full() -> ArtworkMode {
    ArtworkMode::Full
}
fn first() -> i16 {
    1
}

pub(crate) fn dispatch(
    session: &mut EditorSession,
    store: Option<&ProjectStore>,
    catalogs: CatalogViews<'_>,
    method: &str,
    params: &Value,
) -> Result<Value, String> {
    let store = store.ok_or("Open a saved project before creating a Custom Landlook.")?;
    let owner = origin(session, params)?;
    match method {
        "custom-landlook.open" => open(session, store, catalogs, &owner),
        "custom-landlook.source" => material::atlas(
            session,
            store,
            catalogs,
            &owner,
            required_i16(params, "sourceLook")?
                .try_into()
                .map_err(|_| "Invalid template.")?,
        ),
        "custom-landlook.preview" | "custom-landlook.apply" => {
            review(session, store, catalogs, &owner, method, params)
        }
        _ => Err(format!("Unknown Custom Landlook operation {method}")),
    }
}

fn origin(session: &EditorSession, params: &Value) -> Result<StableId, String> {
    if required_u64(params, "expectedRevision")? != session.revision().0 {
        return Err("The project changed. Reopen the Landlook draft before applying.".into());
    }
    let owner = StableId(required_string(params, "identity")?);
    if !session.snapshot().world.maps.iter().any(|map| {
        map.identity == owner && map.level_type == LevelType::Land && map.runtime.is_some()
    }) {
        return Err("The originating Land map is unavailable.".into());
    }
    Ok(owner)
}

fn open(
    session: &EditorSession,
    store: &ProjectStore,
    catalogs: CatalogViews<'_>,
    owner: &StableId,
) -> Result<Value, String> {
    let sources:Vec<_>=[0,3,4,5,6,7,8,9,10].into_iter().map(|look| {
        let availability=(|| {
            material::metadata(session,store,catalogs,look,6)?;
            let art=material::atlas(session,store,catalogs,owner,look)?;
            if art["available"]!=true { return Err(art["reason"].as_str().unwrap_or("Template artwork is unavailable.").to_string()); }
            Ok(())
        })();
        json!({"landlook":look,"name":name(look),"ownership":if (6..=8).contains(&look){"Scenario"}else{"Stock"},"available":availability.is_ok(),"reason":availability.err()})
    }).collect();
    let slots: Vec<_> = (6..=8)
        .map(|look| json!({"landlook":look,"name":name(look),"occupied":occupied(session,look)}))
        .collect();
    let map = session
        .snapshot()
        .world
        .maps
        .iter()
        .find(|map| &map.identity == owner)
        .expect("bound origin");
    Ok(
        json!({"revision":session.revision(),"identity":owner,"name":map.name,"landlook":map.runtime.as_ref().and_then(|runtime|runtime.landlook),"sources":sources,"slots":slots}),
    )
}

fn occupied(session: &EditorSession, look: i8) -> bool {
    session
        .snapshot()
        .landlook_catalogs
        .iter()
        .any(|row| row.landlook == look)
        || session.snapshot().assets.iter().any(|asset| {
            asset.classic_resource.as_ref().is_some_and(|key| {
                key.resource_type == "PICT" && key.resource_id == 300 + i32::from(look)
            })
        })
}

fn name(look: i8) -> String {
    match look {
        0 => "Plains",
        3 => "Underground",
        4 => "Castle",
        5 => "Desert",
        9 => "Swamp",
        10 => "Snow",
        6 => "Custom 1",
        7 => "Custom 2",
        8 => "Custom 3",
        _ => "Unsupported",
    }
    .into()
}

fn review(
    session: &mut EditorSession,
    store: &ProjectStore,
    catalogs: CatalogViews<'_>,
    owner: &StableId,
    method: &str,
    params: &Value,
) -> Result<Value, String> {
    let draft: Draft = serde_json::from_value(required_value(params, "draft")?.clone())
        .map_err(|error| error.to_string())?;
    custom_landlook::validate_destination(draft.destination)?;
    let prepared = material::prepare(session, store, catalogs, owner, &draft)?;
    let hash = review_hash(session, owner, &draft, &prepared)?;
    if method == "custom-landlook.preview" {
        return Ok(projection(session, owner, &draft, &prepared, hash, params));
    }
    if required_string(params, "reviewHash")? != hash {
        return Err(
            "The source artwork or destination changed. Review impact again before applying."
                .into(),
        );
    }
    if !prepared.changed {
        return Err("This selection does not change the Custom Landlook.".into());
    }
    prepared.persist(store)?;
    let mut result = execute(session, params, prepared.command(owner, &draft))?;
    result["landlook"] = json!(draft.destination);
    Ok(result)
}

fn review_hash(
    session: &EditorSession,
    owner: &StableId,
    draft: &Draft,
    prepared: &material::Prepared,
) -> Result<String, String> {
    let data = json!({"revision":session.revision(),"identity":owner,"operation":draft.operation,"sourceLook":draft.source_look,"destination":draft.destination,"replace":draft.replace,"assign":draft.assign_map,"mode":draft.mode,"tile":draft.tile,"artwork":prepared.asset.blob,"native":prepared.asset.classic_payload_blob,"metadata":prepared.catalog.as_ref().map(|row| &row.source_blob)});
    Ok(format!(
        "{:x}",
        Sha256::digest(serde_json::to_vec(&data).map_err(|error| error.to_string())?)
    ))
}

fn projection(
    session: &EditorSession,
    owner: &StableId,
    draft: &Draft,
    prepared: &material::Prepared,
    hash: String,
    params: &Value,
) -> Value {
    let affected: Vec<_> = session
        .snapshot()
        .world
        .maps
        .iter()
        .filter(|map| {
            map.level_type == LevelType::Land
                && (map.runtime.as_ref().and_then(|runtime| runtime.landlook)
                    == Some(draft.destination)
                    || draft.assign_map && &map.identity == owner)
        })
        .collect();
    let offset = params["offset"]
        .as_u64()
        .unwrap_or(0)
        .min(usize::MAX as u64) as usize;
    let rows: Vec<_> = affected
        .iter()
        .skip(offset)
        .take(128)
        .map(|map| json!({"identity":map.identity,"name":map.name,"nativeIndex":map.native_index}))
        .collect();
    json!({"revision":session.revision(),"reviewHash":hash,"canApply":prepared.changed,"destination":draft.destination,"replacing":occupied(session,draft.destination),"operation":draft.operation,"changedTiles":prepared.tiles,"atlas":prepared.preview(),"affectedMaps":rows,"offset":offset,"total":affected.len(),"truncated":offset.saturating_add(128)<affected.len()})
}

use crate::{
    catalogs::CatalogViews,
    execute,
    request_params::{
        coerce_integral_numbers, required_string, required_u8, required_u64, required_value,
    },
};
use providence_core::{
    model::{RandomRectangle, StableId},
    monster_reference_catalog::MonsterReferenceQuery,
    random_region_authoring::{self as regions, references},
    session::{EditorCommand, EditorSession},
};
use serde_json::{Value, json};

pub(crate) fn dispatch(
    session: &mut EditorSession,
    catalogs: CatalogViews<'_>,
    method: &str,
    params: &Value,
) -> Result<Value, String> {
    let owner = StableId(required_string(params, "mapIdentity")?);
    regions::map(session.snapshot(), &owner)?;
    match method {
        "random-region.open" => open(session, catalogs, &owner, required_u8(params, "slot")?),
        "random-region.preview" | "random-region.apply" => {
            edit(session, catalogs, method, params, &owner)
        }
        "random-region.clear" => {
            check_revision(session, params)?;
            execute(
                session,
                params,
                EditorCommand::RemoveMapRandomRectangle {
                    map: owner,
                    slot: required_u8(params, "slot")?,
                },
            )
        }
        "random-region.reference.list" => {
            check_revision(session, params)?;
            let query = query(params)?;
            Ok(
                json!({"revision": session.revision(), "page": references::references(session.snapshot(), catalogs.application_media, &query)?}),
            )
        }
        _ => Err(format!("unknown method {method}")),
    }
}

fn check_revision(session: &EditorSession, params: &Value) -> Result<(), String> {
    if required_u64(params, "expectedRevision")? != session.revision().0 {
        return Err(
            "The originating map changed. Reopen or reconcile this region before applying.".into(),
        );
    }
    Ok(())
}

fn query(params: &Value) -> Result<MonsterReferenceQuery, String> {
    serde_json::from_value(coerce_integral_numbers(
        required_value(params, "query")?.clone(),
    ))
    .map_err(|error| format!("Invalid region picker query: {error}"))
}

fn open(
    session: &EditorSession,
    catalogs: CatalogViews<'_>,
    owner: &StableId,
    slot: u8,
) -> Result<Value, String> {
    let identity = StableId(format!("{}:rect:{slot}", owner.0));
    regions::slot(owner, &identity)?;
    let map = regions::map(session.snapshot(), owner)?;
    let rows = &map.runtime.as_ref().unwrap().random_rectangles;
    let current = rows.iter().find(|row| row.identity == identity);
    let slots: Vec<_> = (0..20u8)
        .rev()
        .map(|slot| {
            let identity = StableId(format!("{}:rect:{slot}", owner.0));
            let row = rows.iter().find(|row| row.identity == identity);
            json!({"slot": slot, "identity": identity, "present": row.is_some(), "region": row})
        })
        .collect();
    let names = if let Some(row) = current {
        reference_names(session, catalogs, row)?
    } else {
        json!({})
    };
    Ok(
        json!({"revision": session.revision(), "map": {"identity": map.identity, "name": map.name, "nativeIndex": map.native_index, "levelType": map.level_type},
        "slot": slot, "slots": slots, "region": current, "referenceNames": names}),
    )
}

fn edit(
    session: &mut EditorSession,
    catalogs: CatalogViews<'_>,
    method: &str,
    params: &Value,
    owner: &StableId,
) -> Result<Value, String> {
    check_revision(session, params)?;
    let draft: RandomRectangle = serde_json::from_value(coerce_integral_numbers(
        required_value(params, "region")?.clone(),
    ))
    .map_err(|error| format!("Invalid region draft: {error}"))?;
    let plan = regions::preview(session.snapshot(), owner, &draft)?;
    validate_sound(session, catalogs, owner, &draft)?;
    if method.ends_with(".preview") {
        return Ok(json!({"revision": session.revision(), "preview": plan}));
    }
    execute(
        session,
        params,
        EditorCommand::ApplyRandomRectangleDraft {
            map: owner.clone(),
            rectangle: Box::new(draft),
        },
    )
}

fn validate_sound(
    session: &EditorSession,
    catalogs: CatalogViews<'_>,
    owner: &StableId,
    draft: &RandomRectangle,
) -> Result<(), String> {
    let current = regions::map(session.snapshot(), owner)?
        .runtime
        .as_ref()
        .unwrap()
        .random_rectangles
        .iter()
        .find(|row| row.identity == draft.identity);
    if draft.sound_id == 0 || current.is_some_and(|row| row.sound_id == draft.sound_id) {
        return Ok(());
    }
    let query = reference_query("soundId", draft.sound_id);
    let page = references::references(session.snapshot(), catalogs.application_media, &query)?;
    if !page
        .items
        .iter()
        .any(|row| row.value == draft.sound_id && row.available)
    {
        return Err(format!(
            "Sound {} is missing or unavailable. Choose an exact available sound.",
            draft.sound_id
        ));
    }
    Ok(())
}

fn reference_query(field: &str, value: i16) -> MonsterReferenceQuery {
    MonsterReferenceQuery {
        field: field.into(),
        current_value: value,
        search: value.to_string(),
        ownership: "all".into(),
        show_unavailable: true,
        offset: 0,
        seek_current: false,
        limit: 128,
    }
}

fn reference_names(
    session: &EditorSession,
    catalogs: CatalogViews<'_>,
    row: &RandomRectangle,
) -> Result<Value, String> {
    let mut names = serde_json::Map::new();
    for (field, value) in [
        ("battleLow", row.battle_range[0]),
        ("battleHigh", row.battle_range[1]),
        ("soundId", row.sound_id),
        ("textId", row.text_id),
        ("door0", row.random_doors[0]),
        ("door1", row.random_doors[1]),
        ("door2", row.random_doors[2]),
    ] {
        let page = references::references(
            session.snapshot(),
            catalogs.application_media,
            &reference_query(field, value),
        )?;
        let label = page
            .items
            .iter()
            .find(|choice| choice.value == value)
            .map(|choice| choice.label.clone())
            .unwrap_or_else(|| format!("ID {value}"));
        names.insert(field.into(), json!(label));
    }
    Ok(Value::Object(names))
}

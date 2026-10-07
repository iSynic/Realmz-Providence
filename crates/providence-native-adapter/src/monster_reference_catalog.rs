use crate::{
    catalogs::CatalogViews,
    request_params::{coerce_integral_numbers, required_u64, required_value},
};
use providence_core::{
    monster_reference_catalog::{MonsterReferenceQuery, monster_reference_choices},
    session::EditorSession,
};
use providence_storage::ProjectStore;
use serde_json::{Value, json};

pub(crate) fn list(
    session: &EditorSession,
    store: Option<&ProjectStore>,
    catalogs: CatalogViews<'_>,
    params: &Value,
) -> Result<Value, String> {
    let expected = required_u64(params, "expectedRevision")?;
    if expected != session.revision().0 {
        return Err("The originating Monster project changed. Reopen this picker.".into());
    }
    let query: MonsterReferenceQuery = serde_json::from_value(coerce_integral_numbers(
        required_value(params, "query")?.clone(),
    ))
    .map_err(|error| format!("invalid Monster reference query: {error}"))?;
    let page = monster_reference_choices(session.snapshot(), catalogs.application_media, &query)?;
    let thumbnails = if query.field == "specialLand" {
        special_thumbnails(session, store, catalogs, &page)?
    } else {
        json!([])
    };
    Ok(json!({"revision": session.revision(), "page": page,"specialThumbnails":thumbnails}))
}

fn special_thumbnails(
    session: &EditorSession,
    store: Option<&ProjectStore>,
    catalogs: CatalogViews<'_>,
    page: &providence_core::monster_reference_catalog::MonsterReferencePage,
) -> Result<Value, String> {
    let mut bytes = 0;
    let mut thumbnails = vec![];
    for choice in page.items.iter().filter(|row| row.available) {
        let result = match crate::special_land_artwork::read(session, store, catalogs, choice.value)
        {
            Ok(result) => {
                bytes += result["bytes"].as_u64().unwrap_or_default();
                json!({"ok":true,"result":result})
            }
            Err(error) => json!({"ok":false,"error":error}),
        };
        if bytes > 8 * 1024 * 1024 {
            return Err("The Special Land catalog exceeds its preview budget.".into());
        }
        thumbnails.push(json!({"value":choice.value,"response":result}));
    }
    Ok(json!(thumbnails))
}

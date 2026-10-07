use crate::{
    catalogs::OpenMonsterLibrary,
    request_params::{coerce_integral_numbers, required_u64, required_value},
};
use providence_core::monster_library::{MonsterLibraryCommand, MonsterLibraryDraft};
use providence_core::session::EditorSession;
use serde_json::{Value, json};

pub(crate) fn dispatch(
    project: &EditorSession,
    library: &mut OpenMonsterLibrary,
    method: &str,
    params: &Value,
) -> Result<Value, String> {
    let expected = required_u64(params, "expectedRevision")?;
    if expected != library.session.revision().0 {
        return Err(format!(
            "Monster Library revision changed: expected {expected}, current {}",
            library.session.revision().0
        ));
    }
    let value = coerce_integral_numbers(required_value(params, "draft")?.clone());
    if method == "monster-library.draft.prepare"
        && let Some(preferred) = value.get("preferredScenarioMonsterId")
        && !preferred.is_null()
        && (!preferred.is_u64()
            || preferred
                .as_u64()
                .is_some_and(|id| id > u64::from(u32::MAX)))
    {
        return Ok(
            json!({"revision": library.session.revision(), "valid": false,
            "issues": [{"field": "preferredScenarioMonsterId", "message": "Enter a whole-number scenario Monster ID."}]}),
        );
    }
    let draft: MonsterLibraryDraft = serde_json::from_value(value)
        .map_err(|error| format!("invalid Monster Library draft: {error}"))?;
    if method == "monster-library.draft.prepare" {
        let issues = library.session.monster_library_draft_issues(&draft);
        if !issues.is_empty() {
            return Ok(
                json!({"revision": library.session.revision(), "valid": false, "issues": issues}),
            );
        }
    }
    let changes = library
        .session
        .monster_library_draft_changes(&draft)
        .map_err(|error| error.to_string())?;
    if method == "monster-library.draft.prepare" {
        return Ok(
            json!({"revision": library.session.revision(), "valid": true, "changes": changes}),
        );
    }
    let identity = draft.identity.clone();
    let change = crate::monster_library_routes::execute_monster_library(
        &mut library.session,
        params,
        MonsterLibraryCommand::ApplyDraft { draft },
    )?;
    let document = crate::monster_library_routes::open_entry(
        project,
        library,
        &json!({"identity": identity}),
    )?;
    Ok(json!({"change": change, "document": document, "changes": changes}))
}

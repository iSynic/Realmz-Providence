use crate::{catalogs::OpenMonsterLibrary, request_params::required_u64};
use providence_core::{
    model::StableId,
    monster_library::{MonsterLibraryEntry, MonsterLibraryOwnership},
    session::Revision,
};
use serde_json::Value;
use std::collections::BTreeSet;

pub(crate) fn require_revision(library: &OpenMonsterLibrary, params: &Value) -> Result<(), String> {
    let expected = Revision(required_u64(params, "expectedLibraryRevision")?);
    if expected != library.session.revision() {
        return Err(format!(
            "monster library revision conflict: expected {}, actual {}",
            expected.0,
            library.session.revision().0
        ));
    }
    Ok(())
}

pub(crate) fn ownership_scope(params: &Value) -> Result<&str, String> {
    let scope = params
        .get("ownership")
        .or_else(|| params.get("scope"))
        .and_then(Value::as_str)
        .unwrap_or("all");
    if !matches!(scope, "all" | "built-in" | "custom") {
        return Err("Monster Library ownership must be all, built-in, or custom".into());
    }
    Ok(scope)
}

pub(crate) fn eligible_entries<'a>(
    library: &'a OpenMonsterLibrary,
    scope: &'a str,
) -> impl Iterator<Item = &'a MonsterLibraryEntry> {
    library
        .session
        .catalog()
        .built_ins
        .iter()
        .filter(|entry| !entry.is_blank_builtin_placeholder())
        .chain(library.session.catalog().custom_entries.iter())
        .filter(move |entry| match scope {
            "built-in" => entry.ownership == MonsterLibraryOwnership::BuiltIn,
            "custom" => entry.ownership == MonsterLibraryOwnership::Custom,
            _ => true,
        })
}

pub(crate) fn population_entries(
    library: &OpenMonsterLibrary,
    params: &Value,
) -> Result<Vec<MonsterLibraryEntry>, String> {
    let scope = ownership_scope(params)?;
    let requested = requested_entries(params)?;
    let query = params
        .get("query")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .trim()
        .to_ascii_lowercase();
    let mut entries = eligible_entries(library, scope)
        .filter(|entry| crate::monster_library_routes::matches_query(entry, &query))
        .filter(|entry| {
            requested
                .as_ref()
                .is_none_or(|requested| requested.contains(&entry.identity))
        })
        .cloned()
        .collect::<Vec<_>>();
    // Population uses native ID and identity; browsing additionally sorts by the display label.
    entries.sort_by(|left, right| {
        left.preferred_scenario_monster_id
            .cmp(&right.preferred_scenario_monster_id)
            .then_with(|| left.identity.cmp(&right.identity))
    });
    validate_requested_entries(&entries, requested.as_ref())?;
    if entries.is_empty() {
        return Err("Monster Library population selected no entries".into());
    }
    Ok(entries)
}

fn requested_entries(params: &Value) -> Result<Option<BTreeSet<StableId>>, String> {
    params
        .get("entryIds")
        .map(|value| {
            value
                .as_array()
                .ok_or_else(|| "entryIds must be an array".to_string())?
                .iter()
                .map(|value| {
                    value
                        .as_str()
                        .map(|value| StableId(value.to_owned()))
                        .ok_or_else(|| "entryIds must contain strings".to_string())
                })
                .collect::<Result<BTreeSet<_>, _>>()
        })
        .transpose()
}

fn validate_requested_entries(
    entries: &[MonsterLibraryEntry],
    requested: Option<&BTreeSet<StableId>>,
) -> Result<(), String> {
    if let Some(requested) = requested {
        let selected = entries
            .iter()
            .map(|entry| entry.identity.clone())
            .collect::<BTreeSet<_>>();
        if selected != *requested {
            let missing = requested
                .difference(&selected)
                .map(|identity| identity.0.clone())
                .collect::<Vec<_>>();
            return Err(format!(
                "Monster Library population includes missing or ownership-filtered entries: {}",
                missing.join(", ")
            ));
        }
    }
    Ok(())
}

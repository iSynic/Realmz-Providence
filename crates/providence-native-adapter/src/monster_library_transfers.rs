use crate::{
    catalogs::OpenMonsterLibrary,
    request_params::{required_string, required_u64},
};
use providence_core::{
    model::NativeRecordId,
    monster_library::{MonsterLibraryCopyMode, MonsterLibraryScenarioCopy},
    session::{EditorCommand, EditorSession},
};
use serde_json::{Value, json};
use std::collections::{BTreeMap, BTreeSet};

pub(crate) fn dispatch(
    project: &mut EditorSession,
    library: &OpenMonsterLibrary,
    method: &str,
    params: &Value,
) -> Result<Value, String> {
    let normalized = crate::request_params::coerce_integral_numbers(params.clone());
    let params = &normalized;
    let revision = required_u64(params, "expectedRevision")?;
    if revision != project.revision().0 {
        return Err("The project changed. Review the transfer again.".into());
    }
    crate::monster_library_selection::require_revision(library, params)?;
    let entries = crate::monster_library_selection::population_entries(library, params)?;
    let allocations = prepare_allocations(project, &entries, params)?;
    let mode: MonsterLibraryCopyMode =
        serde_json::from_value(params.get("mode").cloned().unwrap_or(json!("normal")))
            .map_err(|error| format!("invalid copy mode: {error}"))?;
    let replace = params
        .get("replace")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let copies = entries
        .iter()
        .zip(&allocations)
        .map(|(entry, row)| MonsterLibraryScenarioCopy {
            target_id: row.target_id,
            template: Box::new(entry.template.clone()),
            description: entry.description.clone(),
            mode,
            replace,
        })
        .collect::<Vec<_>>();
    let review = project
        .shared_monster_library_transfer_review(&copies)
        .map_err(|error| error.to_string())?;
    if method == "monster-library.transfer.commit" {
        let review_hash = required_string(params, "reviewHash")?;
        let change = crate::execute(
            project,
            params,
            EditorCommand::CommitMonsterLibraryTransfer {
                copies,
                review_hash,
            },
        )?;
        return Ok(json!({"change": change, "reviewHash": review.review_hash}));
    }
    review_page(project, library, params, &review, &allocations)
}

fn review_page(
    project: &EditorSession,
    library: &OpenMonsterLibrary,
    params: &Value,
    review: &providence_core::session::MonsterLibraryTransferReview,
    allocations: &[providence_core::monster_population::MonsterPopulationRow],
) -> Result<Value, String> {
    let section = params
        .get("section")
        .and_then(Value::as_str)
        .unwrap_or("changes");
    let offset = params.get("offset").and_then(Value::as_u64).unwrap_or(0) as usize;
    let limit = params
        .get("limit")
        .and_then(Value::as_u64)
        .unwrap_or(128)
        .clamp(1, 128) as usize;
    let (total, rows) = match section {
        "changes" => bounded_page(&review.changes, offset, limit)?,
        "uses" => bounded_page(&review.uses, offset, limit)?,
        "comparison" => bounded_page(&review.comparison, offset, limit)?,
        "allocations" => (allocations.len(), Value::Array(allocations.iter().skip(offset).take(limit).map(|row| {
            let entry = library.session.catalog().entry(&row.identity).expect("reviewed entry exists");
            json!({"identity": row.identity, "label": entry.label, "ownership": entry.ownership,
                "preferredId": row.preferred_id, "targetId": row.target_id, "reason": row.reason})
        }).collect())),
        _ => return Err("Unknown transfer review section.".into()),
    };
    Ok(
        json!({"revision": project.revision(), "libraryRevision": library.session.revision(), "reviewHash": review.review_hash,
        "section": section, "offset": offset, "total": total, "items": rows }),
    )
}

fn bounded_page<T: serde::Serialize>(
    rows: &[T],
    offset: usize,
    limit: usize,
) -> Result<(usize, Value), String> {
    let start = offset.min(rows.len());
    let end = offset.saturating_add(limit).min(rows.len());
    serde_json::to_value(&rows[start..end])
        .map(|page| (rows.len(), page))
        .map_err(|error| error.to_string())
}

fn prepare_allocations(
    project: &EditorSession,
    entries: &[providence_core::monster_library::MonsterLibraryEntry],
    params: &Value,
) -> Result<Vec<providence_core::monster_population::MonsterPopulationRow>, String> {
    let destinations = destination_ids(params)?;
    let replace = params
        .get("replace")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    if params.get("targetNativeId").is_some() {
        let id = crate::request_params::required_u32(params, "targetNativeId")?;
        if entries.len() != 1 {
            return Err("An explicit destination requires one selected Library entry.".into());
        }
        return Ok(vec![
            providence_core::monster_population::plan_explicit_monster_destination(
                entries[0].identity.clone(),
                entries[0].preferred_scenario_monster_id,
                NativeRecordId(id),
                replace,
            )?,
        ]);
    }
    if replace {
        return Err("Replacement requires an explicit destination ID.".into());
    }
    providence_core::monster_population::plan_monster_population_with_destinations(
        &entries
            .iter()
            .map(|entry| (entry.identity.clone(), entry.preferred_scenario_monster_id))
            .collect::<Vec<_>>(),
        project
            .snapshot()
            .monster_sets
            .iter()
            .flat_map(|set| set.monsters.iter().map(|record| record.native_id.0))
            .collect::<BTreeSet<_>>(),
        &destinations,
    )
}

fn destination_ids(
    params: &Value,
) -> Result<BTreeMap<providence_core::model::StableId, NativeRecordId>, String> {
    let mut result = BTreeMap::new();
    let Some(value) = params.get("destinationIds") else {
        return Ok(result);
    };
    let rows = value.as_array().ok_or("destinationIds must be an array")?;
    if rows.len() > i16::MAX as usize {
        return Err("Too many explicit Monster destinations.".into());
    }
    for row in rows {
        let identity = providence_core::model::StableId(required_string(row, "identity")?);
        let target = crate::request_params::required_u32(row, "targetId")?;
        if result.insert(identity, NativeRecordId(target)).is_some() {
            return Err("A Library entry has more than one explicit destination.".into());
        }
    }
    if params.get("targetNativeId").is_some()
        || params.get("replace").and_then(Value::as_bool) == Some(true)
    {
        return Err("Use one replacement destination or reviewed empty bulk destinations.".into());
    }
    Ok(result)
}

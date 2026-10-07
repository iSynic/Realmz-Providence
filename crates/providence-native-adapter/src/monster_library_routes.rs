use crate::catalogs::OpenMonsterLibrary;
use crate::request_params::coerce_integral_numbers;
use crate::request_params::required_string;
use crate::request_params::required_u32;
use crate::request_params::required_u64;
use crate::request_params::required_value;
use providence_core::model::MonsterRecord;
use providence_core::model::NativeRecordId;
use providence_core::model::StableId;
use providence_core::monster_library::MonsterLibraryCommand;
use providence_core::monster_library::MonsterLibraryEntry;
use providence_core::monster_library::MonsterLibraryOrigin;
use providence_core::monster_library::MonsterLibraryOwnership;
use providence_core::monster_library::MonsterLibrarySession;
use providence_core::monster_library::decode_monster_scrapbook;
use providence_core::session::EditorSession;
use providence_core::session::ExpectedRevisionCommand;
use providence_core::session::Revision;
use providence_storage::MonsterLibraryStore;
use serde_json::Value;
use serde_json::json;
use std::fs;
use std::path::PathBuf;

pub(crate) fn dispatch_monster_library(
    project_session: &mut EditorSession,
    monster_library: Option<&mut OpenMonsterLibrary>,
    method: &str,
    params: Value,
) -> Result<Value, String> {
    if method == "monster-library.create" {
        return create(&params);
    }
    let library = monster_library.ok_or_else(|| {
        format!(
            "{method} requires serve-project --monster-library-root <portable-library-directory>"
        )
    })?;
    match method {
        "monster-library.describe" => describe(library),
        "monster-library.list" | "monster-library.filter-ownership" => list(library, &params),
        "monster-library.open" => open_entry(project_session, library, &params),
        "monster-library.draft.prepare" | "monster-library.draft.apply" => {
            crate::monster_library_drafts::dispatch(project_session, library, method, &params)
        }
        "monster-library.transfer.prepare" | "monster-library.transfer.commit" => {
            crate::monster_library_transfers::dispatch(project_session, library, method, &params)
        }
        "monster-library.operation.prepare" | "monster-library.operation.commit" => {
            crate::monster_library_operations::dispatch(project_session, library, method, &params)
        }
        "monster-library.import-built-ins" => import_built_ins(library, &params),
        "monster-library.create-custom" => create_custom(library, &params),
        "monster-library.update-custom" => update_custom(library, &params),
        "monster-library.duplicate" | "monster-library.copy-variant" => duplicate(library, &params),
        "monster-library.customize" => customize(library, &params),
        "monster-library.delete-custom" => delete_custom(library, &params),
        "monster-library.restore-built-in" => restore_built_in(library, &params),
        "monster-library.undo" => {
            execute_monster_library(&mut library.session, &params, MonsterLibraryCommand::Undo)
        }
        "monster-library.redo" => {
            execute_monster_library(&mut library.session, &params, MonsterLibraryCommand::Redo)
        }
        "monster-library.population-plan" | "monster-library.populate-scenario" => {
            crate::monster_library_population::populate(project_session, library, method, &params)
        }
        "monster-library.copy-to-scenario"
        | "monster-library.copy-to-all-sets"
        | "monster-library.copy-and-generate-variants"
        | "monster-library.replace-scenario" => {
            crate::monster_library_population::copy_to_scenario(
                project_session,
                library,
                method,
                &params,
            )
        }
        _ => Err(format!("unknown Monster Library method '{method}'")),
    }
}

fn create(params: &Value) -> Result<Value, String> {
    let root = PathBuf::from(required_string(params, "path")?);
    let library_id = StableId(required_string(params, "libraryId")?);
    let (store, session) =
        MonsterLibraryStore::create(&root, library_id).map_err(|error| error.to_string())?;
    Ok(json!({
        "path": store.catalog_path(),
        "revision": session.revision(),
        "libraryId": session.catalog().library_id,
    }))
}

fn list(library: &OpenMonsterLibrary, params: &Value) -> Result<Value, String> {
    let offset = params.get("offset").and_then(Value::as_u64).unwrap_or(0) as usize;
    let limit = params
        .get("limit")
        .and_then(Value::as_u64)
        .unwrap_or(64)
        .clamp(1, 128) as usize;
    let scope = crate::monster_library_selection::ownership_scope(params)?;
    let query = params
        .get("query")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .trim()
        .to_ascii_lowercase();
    let mut entries = crate::monster_library_selection::eligible_entries(library, scope)
        .filter(|entry| matches_query(entry, &query))
        .collect::<Vec<_>>();
    entries.sort_by(|left, right| {
        left.preferred_scenario_monster_id
            .cmp(&right.preferred_scenario_monster_id)
            .then_with(|| left.label.cmp(&right.label))
            .then_with(|| left.identity.cmp(&right.identity))
    });
    let total = entries.len();
    let items = entries
        .into_iter()
        .skip(offset)
        .take(limit)
        .map(monster_library_entry_summary)
        .collect::<Vec<_>>();
    Ok(json!({
        "revision": library.session.revision(), "items": items, "offset": offset, "limit": limit,
        "total": total, "truncated": offset.saturating_add(limit) < total, "ownership": scope,
    }))
}

pub(crate) fn matches_query(entry: &MonsterLibraryEntry, query: &str) -> bool {
    query.is_empty()
        || format!(
            "{} {} {} {}",
            entry.label, entry.description, entry.preferred_scenario_monster_id.0, entry.identity.0
        )
        .to_ascii_lowercase()
        .contains(query)
}

fn describe(library: &OpenMonsterLibrary) -> Result<Value, String> {
    Ok(json!({
        "revision": library.session.revision(),
        "canUndo": library.session.can_undo(),
        "canRedo": library.session.can_redo(),
        "libraryId": library.session.catalog().library_id,
        "sources": library.session.catalog().sources.len(),
        "builtIns": library.session.catalog().built_ins.len(),
        "customEntries": library.session.catalog().custom_entries.len(),
        "visibleEntries": library.session.catalog().effective_entries().len(),
        "path": library.store.catalog_path(),
    }))
}

pub(crate) fn open_entry(
    project_session: &EditorSession,
    library: &OpenMonsterLibrary,
    params: &Value,
) -> Result<Value, String> {
    let identity = StableId(required_string(params, "identity")?);
    let entry = library
        .session
        .catalog()
        .entry(&identity)
        .ok_or_else(|| format!("Monster Library entry '{}' was not found", identity.0))?;
    Ok(json!({
        "revision": library.session.revision(),
        "projectRevision": project_session.revision(),
        "slotPreview": providence_core::monster_reference_preview::preview_monster_references(project_session.snapshot(), &entry.template, false, false)?,
        "entry": entry,
        "protected": entry.ownership == MonsterLibraryOwnership::BuiltIn,
    }))
}

fn import_built_ins(library: &mut OpenMonsterLibrary, params: &Value) -> Result<Value, String> {
    let path = PathBuf::from(required_string(params, "path")?);
    let evidence_revision = required_string(params, "evidenceRevision")?;
    let evidence_path = required_string(params, "evidencePath")?;
    let native_name = params
        .get("nativeName")
        .and_then(Value::as_str)
        .map(str::to_owned)
        .or_else(|| {
            path.file_name()
                .and_then(|name| name.to_str())
                .map(str::to_owned)
        })
        .unwrap_or_else(|| "Monster Scrap Book".into());
    let bytes =
        fs::read(&path).map_err(|error| format!("could not read {}: {error}", path.display()))?;
    let decoded =
        decode_monster_scrapbook(&bytes, &native_name, &evidence_revision, &evidence_path);
    let blob = library
        .store
        .put_blob(&bytes)
        .map_err(|error| error.to_string())?;
    if blob != decoded.source.blob {
        return Err("Monster Scrap Book blob identity did not match the decoded source".into());
    }
    execute_monster_library(
        &mut library.session,
        params,
        MonsterLibraryCommand::ImportBuiltIns {
            source: decoded.source,
            entries: decoded.entries,
        },
    )
}

fn create_custom(library: &mut OpenMonsterLibrary, params: &Value) -> Result<Value, String> {
    let template = parse_monster_library_template(params)?;
    let origin = params
        .get("origin")
        .cloned()
        .map(|origin| {
            serde_json::from_value::<MonsterLibraryOrigin>(origin)
                .map_err(|error| format!("invalid Monster Library origin: {error}"))
        })
        .transpose()?
        .unwrap_or(MonsterLibraryOrigin::Blank);
    execute_monster_library(
        &mut library.session,
        params,
        MonsterLibraryCommand::CreateCustom {
            label: required_string(params, "label")?,
            preferred_scenario_monster_id: NativeRecordId(required_u32(
                params,
                "preferredScenarioMonsterId",
            )?),
            template: Box::new(template),
            description: params
                .get("description")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .into(),
            origin,
        },
    )
}

fn update_custom(library: &mut OpenMonsterLibrary, params: &Value) -> Result<Value, String> {
    let template = parse_monster_library_template(params)?;
    execute_monster_library(
        &mut library.session,
        params,
        MonsterLibraryCommand::UpdateCustom {
            identity: StableId(required_string(params, "identity")?),
            label: required_string(params, "label")?,
            preferred_scenario_monster_id: NativeRecordId(required_u32(
                params,
                "preferredScenarioMonsterId",
            )?),
            template: Box::new(template),
            description: params
                .get("description")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .into(),
        },
    )
}

fn duplicate(library: &mut OpenMonsterLibrary, params: &Value) -> Result<Value, String> {
    execute_monster_library(
        &mut library.session,
        params,
        MonsterLibraryCommand::Duplicate {
            source: StableId(required_string(params, "source")?),
            label: params
                .get("label")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .into(),
        },
    )
}

fn customize(library: &mut OpenMonsterLibrary, params: &Value) -> Result<Value, String> {
    execute_monster_library(
        &mut library.session,
        params,
        MonsterLibraryCommand::CustomizeBuiltIn {
            source: StableId(required_string(params, "source")?),
            label: params
                .get("label")
                .and_then(Value::as_str)
                .map(str::to_owned),
        },
    )
}

fn delete_custom(library: &mut OpenMonsterLibrary, params: &Value) -> Result<Value, String> {
    execute_monster_library(
        &mut library.session,
        params,
        MonsterLibraryCommand::DeleteCustom {
            identity: StableId(required_string(params, "identity")?),
        },
    )
}

fn restore_built_in(library: &mut OpenMonsterLibrary, params: &Value) -> Result<Value, String> {
    execute_monster_library(
        &mut library.session,
        params,
        MonsterLibraryCommand::RestoreBuiltIn {
            source: StableId(required_string(params, "source")?),
        },
    )
}

pub(crate) fn monster_library_entry_summary(entry: &MonsterLibraryEntry) -> Value {
    json!({
        "identity": entry.identity,
        "ownership": entry.ownership,
        "label": entry.label,
        "preferredScenarioMonsterId": entry.preferred_scenario_monster_id,
        "origin": entry.origin,
        "hitDice": entry.template.hit_dice,
        "armor": entry.template.armor,
        "agility": entry.template.agility,
        "iconId": entry.template.icon_id,
        "description": entry.description,
    })
}

pub(crate) fn parse_monster_library_template(params: &Value) -> Result<MonsterRecord, String> {
    serde_json::from_value(coerce_integral_numbers(
        required_value(params, "template")?.clone(),
    ))
    .map_err(|error| format!("invalid Monster Library template: {error}"))
}

pub(crate) fn execute_monster_library(
    session: &mut MonsterLibrarySession,
    params: &Value,
    command: MonsterLibraryCommand,
) -> Result<Value, String> {
    let expected_revision = Revision(required_u64(params, "expectedRevision")?);
    let projection = session
        .execute(ExpectedRevisionCommand {
            expected_revision,
            command,
        })
        .map_err(|error| error.to_string())?;
    serde_json::to_value(projection).map_err(|error| error.to_string())
}

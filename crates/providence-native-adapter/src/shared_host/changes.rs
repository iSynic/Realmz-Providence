//! Prepared stages are private, bounded and tied to one live session generation.
use crate::{catalogs::CatalogViews, stored_routes};
use providence_core::session::{AuthoringStage, EditorSession, Revision};
use providence_session_client::file_access::FileAccess;
use providence_storage::ProjectStore;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, VecDeque};
mod limits;
mod step_context;

#[derive(Default)]
pub(super) struct PreparedChanges {
    stages: VecDeque<PreparedStage>,
    serial: u64,
}
struct PreparedStage {
    token: String,
    stage: AuthoringStage,
    paint_resource_revision: Option<u64>,
}
struct StepContext<'a> {
    store: &'a ProjectStore,
    catalogs: CatalogViews<'a>,
    access: Option<&'a FileAccess>,
}
impl PreparedChanges {
    pub fn prepare(
        &mut self,
        session: &EditorSession,
        store: &ProjectStore,
        catalogs: CatalogViews<'_>,
        params: &Value,
        generation: &str,
        access: Option<&FileAccess>,
    ) -> Result<Value, String> {
        let steps = bounded_steps(params)?;
        step_context::check(params, steps)?;
        let paint_resource_revision = stamp_revision(store, steps)?;
        let mut stage = session
            .begin_authoring_stage(session.revision())
            .map_err(|e| e.to_string())?;
        let mut results = BTreeMap::new();
        let mut previews = BTreeMap::new();
        for (index, step) in steps.iter().enumerate() {
            apply_step(
                step,
                index,
                &mut stage,
                &StepContext {
                    store,
                    catalogs,
                    access,
                },
                &mut results,
                &mut previews,
            )?;
        }
        self.serial += 1;
        let token = format!(
            "{:x}",
            Sha256::digest(format!("{generation}:{}:{params}", self.serial))
        );
        let changed = stage.changed_entities();
        let diagnostics = stage.session().diagnostics();
        let result = json!({"previewToken":token,"baseRevision":session.revision(),"projectId":session.snapshot().project_id,"sessionGeneration":generation,"results":results,"changePreviews":previews,"changedEntities":changed.iter().take(128).collect::<Vec<_>>(),"changedEntitiesTotal":changed.len(),"diagnostics":diagnostics.iter().take(128).collect::<Vec<_>>(),"diagnosticsTotal":diagnostics.len(),"truncated":changed.len()>128 || diagnostics.len()>128,"requiresCommit":true});
        if serde_json::to_vec(&result)
            .map_err(|e| e.to_string())?
            .len()
            > 8 * 1024 * 1024
        {
            return Err("change-set-result-too-large: split this preview into smaller change sets; no changes committed".into());
        }
        self.stages.push_back(PreparedStage {
            token,
            stage,
            paint_resource_revision,
        });
        while self.stages.len() > 8 {
            self.stages.pop_front();
        }
        Ok(result)
    }
    pub fn commit(
        &mut self,
        session: &mut EditorSession,
        store: &ProjectStore,
        params: &Value,
        _generation: &str,
        attribution: providence_core::session::HistoryAttribution,
    ) -> Result<Value, String> {
        let token = params["previewToken"]
            .as_str()
            .ok_or("previewToken is required")?;
        let index = self
            .stages
            .iter()
            .position(|prepared| prepared.token == token)
            .ok_or("preview-expired: prepare the change again")?;
        let prepared = self.stages.remove(index).unwrap();
        if prepared.paint_resource_revision.is_some_and(|revision| {
            store
                .read_paint_resources()
                .map(|resources| resources.revision != revision)
                .unwrap_or(true)
        }) {
            return Err(
                "paint-resource-changed: refresh the stamp catalog and prepare this change again"
                    .into(),
            );
        }
        let expected = params["expectedRevision"]
            .as_u64()
            .ok_or("expectedRevision is required")?;
        if Revision(expected) != session.revision() {
            return Err("revision-conflict: prepare changes again".into());
        }
        let result = session
            .commit_authoring_stage_attributed(prepared.stage, attribution)
            .map_err(|e| e.to_string())?;
        serde_json::to_value(result).map_err(|e| e.to_string())
    }
}

fn stamp_revision(store: &ProjectStore, steps: &[Value]) -> Result<Option<u64>, String> {
    if !steps
        .iter()
        .any(|step| step["tool"] == "providence_map_stamp_apply")
    {
        return Ok(None);
    }
    store
        .read_paint_resources()
        .map(|resources| Some(resources.revision))
        .map_err(|error| error.to_string())
}

fn apply_step(
    step: &Value,
    index: usize,
    stage: &mut AuthoringStage,
    context: &StepContext<'_>,
    results: &mut BTreeMap<String, Value>,
    previews: &mut BTreeMap<String, Value>,
) -> Result<(), String> {
    let capability = providence_session_client::capabilities::find(
        step["tool"].as_str().ok_or("step tool is required")?,
    )
    .filter(|r| r.stageable && !r.method.starts_with("history."))
    .ok_or("step is not a stageable project-authoring capability")?;
    let name = step["name"].as_str().ok_or("step name is required")?;
    if name.is_empty() || name.len() > 64 || results.contains_key(name) {
        return Err("step names must be unique and 1 through 64 bytes".into());
    }
    let mut arguments = step["arguments"]
        .as_object()
        .cloned()
        .map(Value::Object)
        .ok_or("step arguments must be an object")?;
    resolve(&mut arguments, results, 0)?;
    arguments["expectedRevision"] = json!(stage.session().revision());
    let mut schema = capability.input_schema.clone();
    schema["required"].as_array_mut().unwrap().retain(|field| {
        !matches!(
            field.as_str(),
            Some("projectId" | "sessionGeneration" | "operationId")
        )
    });
    providence_session_client::capabilities::validate(&schema, &arguments)?;
    if let Some(access) = context.access {
        access.authorize(capability.method, &mut arguments)?;
    }
    limits::check(stage.session(), capability.method, &arguments)?;
    if let Some(preview) = step_preview(
        stage.session_mut(),
        context.store,
        context.catalogs,
        capability.method,
        &arguments,
    )? {
        previews.insert(name.to_string(), preview);
    }
    let result = stored_routes::dispatch(
        stage.session_mut(),
        Some(context.store),
        context.catalogs,
        None,
        capability.method,
        arguments,
    )
    .map_err(|e| format!("step {index} ({name}) failed; no changes committed: {e}"))?;
    results.insert(name.to_string(), result);
    Ok(())
}

fn step_preview(
    session: &mut EditorSession,
    store: &ProjectStore,
    catalogs: CatalogViews<'_>,
    method: &str,
    params: &Value,
) -> Result<Option<Value>, String> {
    let preview = match method {
        "map.apply-intent" => "map.preview-intent",
        "magic-brush.apply" => "magic-brush.preview",
        "dungeon-cell.apply-features" => "dungeon-cell.preview-features",
        "level-settings.apply" => "level-settings.preview",
        "land-cell.apply" => "land-cell.preview",
        "smart-terrain.apply" => "smart-terrain.preview",
        "terrain-generation.apply" => "terrain-generation.preview",
        "map-stamp.apply" => "map-stamp.preview",
        "random-region.apply" => "random-region.preview",
        "media.import.commit" => "media.import.prepare",
        "media.remove.commit" => "media.remove.prepare",
        "action-settings.commit-repair" => "action-settings.preview-repair",
        _ => return Ok(None),
    };
    stored_routes::dispatch(
        session,
        Some(store),
        catalogs,
        None,
        preview,
        params.clone(),
    )
    .map(Some)
}

fn resolve(
    value: &mut Value,
    results: &BTreeMap<String, Value>,
    depth: usize,
) -> Result<(), String> {
    if depth > 32 {
        return Err("change-set arguments exceed nesting limit".into());
    }
    if let Some(name) = value.get("$result").and_then(Value::as_str) {
        let pointer = value
            .get("pointer")
            .and_then(Value::as_str)
            .ok_or("result reference requires a JSON pointer")?;
        *value = results
            .get(name)
            .and_then(|r| r.pointer(pointer))
            .cloned()
            .ok_or("result reference does not resolve to an earlier step")?;
    } else {
        match value {
            Value::Object(map) => {
                for child in map.values_mut() {
                    resolve(child, results, depth + 1)?;
                }
            }
            Value::Array(rows) => {
                for child in rows {
                    resolve(child, results, depth + 1)?;
                }
            }
            _ => {}
        }
    }
    Ok(())
}

fn bounded_steps(params: &Value) -> Result<&[Value], String> {
    let steps = params["steps"]
        .as_array()
        .filter(|r| !r.is_empty() && r.len() <= 64)
        .ok_or("a change set requires 1 through 64 steps")?;
    if serde_json::to_vec(steps).map_err(|e| e.to_string())?.len() > 2 * 1024 * 1024 {
        return Err("change set exceeds 2 MiB".into());
    }
    Ok(steps.as_slice())
}

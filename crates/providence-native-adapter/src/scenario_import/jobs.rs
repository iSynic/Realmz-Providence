//! A job owns its captured inputs and scratch store; only commit publishes truth.

use crate::request_params::required_u64;
use providence_core::{
    model::ProjectSnapshot,
    session::{EditorSession, Revision},
};
use providence_storage::ProjectStore;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    fs,
    path::Path,
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
    },
    thread,
};
use tempfile::TempDir;

#[derive(Default)]
struct State {
    phase: String,
    completed: usize,
    completed_items: usize,
    total_items: usize,
    item_kind: String,
    result: Option<Result<Prepared, String>>,
}

struct Prepared {
    snapshot: ProjectSnapshot,
    acknowledgement: Value,
    store: ProjectStore,
    _root: TempDir,
}

struct Job {
    id: u64,
    project: providence_core::model::StableId,
    revision: Revision,
    destination: std::path::PathBuf,
    cancel: Arc<AtomicBool>,
    state: Arc<Mutex<State>>,
    worker: thread::JoinHandle<()>,
}

#[derive(Default)]
pub(crate) struct Jobs {
    next_id: u64,
    current: Option<Job>,
}

impl Drop for Jobs {
    fn drop(&mut self) {
        if let Some(job) = self.current.take() {
            job.cancel.store(true, Ordering::Relaxed);
            // Normal connection shutdown must finish cleanup before process exit.
            let _ = job.worker.join();
        }
    }
}

impl Jobs {
    pub(crate) fn dispatch(
        &mut self,
        session: &mut EditorSession,
        store: Option<&ProjectStore>,
        method: &str,
        params: &Value,
    ) -> Option<Result<Value, String>> {
        let action = method.strip_prefix("project.import-classic-scenario.")?;
        Some(match action {
            "begin" => self.begin(session, store, params.clone()),
            "status" | "cancel" | "commit" => self.continue_job(session, store, action, params),
            _ => Err(format!("Unknown import job operation: {action}")),
        })
    }

    fn begin(
        &mut self,
        session: &EditorSession,
        store: Option<&ProjectStore>,
        params: Value,
    ) -> Result<Value, String> {
        let store = store.ok_or("Import jobs require a portable project.")?;
        let revision = Revision(required_u64(&params, "expectedRevision")?);
        if revision != session.revision() {
            return Err("Import revision is stale.".into());
        }
        if self
            .current
            .as_ref()
            .is_some_and(|job| !job.cancel.load(Ordering::Relaxed) || !job.worker.is_finished())
        {
            return Err("Finish or cancel the current import first.".into());
        }
        let job_root = store.root().join(".providence/import-jobs");
        fs::create_dir_all(&job_root).map_err(|error| error.to_string())?;
        let root = tempfile::Builder::new()
            .prefix("import-")
            .tempdir_in(job_root)
            .map_err(|error| error.to_string())?;
        let state = Arc::new(Mutex::new(State {
            phase: "capture-inputs".into(),
            ..Default::default()
        }));
        let cancel = Arc::new(AtomicBool::new(false));
        let project = session.snapshot().project_id.clone();
        let worker = start_worker(
            root,
            project.clone(),
            revision,
            params,
            state.clone(),
            cancel.clone(),
        )?;
        self.next_id = self
            .next_id
            .checked_add(1)
            .ok_or("Import job IDs exhausted.")?;
        self.current = Some(Job {
            id: self.next_id,
            project,
            revision,
            destination: store.root().into(),
            cancel,
            state,
            worker,
        });
        Ok(
            json!({"jobId": self.next_id, "revision": revision, "status": "running", "phase": "capture-inputs", "completedPhases": 0}),
        )
    }

    fn continue_job(
        &mut self,
        session: &mut EditorSession,
        store: Option<&ProjectStore>,
        action: &str,
        params: &Value,
    ) -> Result<Value, String> {
        let id = required_u64(params, "jobId")?;
        let job = self
            .current
            .as_ref()
            .filter(|job| job.id == id)
            .ok_or("Import job is unavailable.")?;
        if action == "cancel" {
            job.cancel.store(true, Ordering::Relaxed);
            job.state
                .lock()
                .unwrap_or_else(|error| error.into_inner())
                .result = None;
            return Ok(json!({"jobId": id, "status": "cancelled"}));
        }
        let store = store.ok_or("Import jobs require a portable project.")?;
        if session.revision() != job.revision
            || session.snapshot().project_id != job.project
            || store.root() != job.destination
        {
            job.cancel.store(true, Ordering::Relaxed);
            return Err("Import job is stale; the active project is unchanged.".into());
        }
        if job.cancel.load(Ordering::Relaxed) {
            return Ok(json!({"jobId": id, "status": "cancelled"}));
        }
        let mut state = job.state.lock().unwrap_or_else(|error| error.into_inner());
        if action == "status" {
            let status = match &state.result {
                None => "running",
                Some(Ok(_)) => "ready",
                Some(Err(_)) => "failed",
            };
            return Ok(
                json!({"jobId": id, "status": status, "phase": state.phase, "completedPhases": state.completed,
                "completedItems": state.completed_items, "totalItems": state.total_items, "itemKind": state.item_kind,
                "error": state.result.as_ref().and_then(|result| result.as_ref().err())}),
            );
        }
        let prepared = state
            .result
            .take()
            .ok_or("Import is not ready to commit.")??;
        job.cancel.store(true, Ordering::Relaxed);
        drop(state);
        commit_prepared(session, store, job.revision, prepared)
    }
}

fn prepare(
    root: TempDir,
    project: providence_core::model::StableId,
    revision: Revision,
    mut params: Value,
    progress: super::timing::Progress,
    cancel: &AtomicBool,
) -> Result<Prepared, String> {
    let sources = super::ScenarioSources::read(&params)?;
    let scenario = root.path().join("inputs").join(&sources.scenario_name);
    let scenario_inputs = capture_directory(
        &sources.scenario_directory,
        &scenario,
        "scenario source files",
        cancel,
    )?;
    let application = root.path().join("application");
    let application_inputs = capture_directory(
        &sources.application_data_directory,
        &application,
        "application source files",
        cancel,
    )?;
    fs::write(
        root.path().join("captured-inputs.json"),
        serde_json::to_vec(
            &json!({"scenario": scenario_inputs, "application": application_inputs}),
        )
        .map_err(|error| error.to_string())?,
    )
    .map_err(|error| error.to_string())?;
    params["directory"] = json!(scenario);
    params["applicationDataDirectory"] = json!(application);
    params["startupFile"] = json!(sources.scenario_name);
    let snapshot = ProjectSnapshot::new_authored(project);
    let store = ProjectStore::create_new(root.path().join("project"), &snapshot)
        .map_err(|error| error.to_string())?;
    let mut session =
        EditorSession::from_persisted_state(providence_core::session::PersistedSessionState {
            snapshot,
            revision,
            undo: vec![],
            redo: vec![],
        });
    let acknowledgement = super::import_classic_scenario_with_progress(
        &mut session,
        Some(&store),
        params,
        Some(progress),
    )?;
    Ok(Prepared {
        snapshot: session.snapshot().clone(),
        acknowledgement,
        store,
        _root: root,
    })
}

fn capture_directory(
    source: &Path,
    destination: &Path,
    item_kind: &str,
    cancel: &AtomicBool,
) -> Result<std::collections::BTreeMap<String, String>, String> {
    let mut inputs = std::collections::BTreeMap::new();
    fs::create_dir_all(destination).map_err(|error| error.to_string())?;
    let entries = fs::read_dir(source)
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;
    let entries = entries
        .into_iter()
        .filter_map(|entry| match entry.file_type() {
            Ok(kind) if kind.is_file() => Some(Ok(entry)),
            Ok(_) => None,
            Err(error) => Some(Err(error.to_string())),
        })
        .collect::<Result<Vec<_>, _>>()?;
    let progress = super::item_progress::callback();
    if let Some(progress) = &progress {
        progress(item_kind, 0, entries.len());
    }
    for entry in &entries {
        if cancel.load(Ordering::Relaxed) {
            return Err("Import cancelled.".into());
        }
        let path = entry.path();
        let before = fs::metadata(&path).map_err(|error| error.to_string())?;
        let bytes = fs::read(&path).map_err(|error| error.to_string())?;
        let after = fs::metadata(&path).map_err(|error| error.to_string())?;
        if before.len() != after.len() || before.modified().ok() != after.modified().ok() {
            return Err(
                "An import input changed while being captured; start the import again.".into(),
            );
        }
        let captured = destination.join(entry.file_name());
        fs::write(&captured, &bytes).map_err(|error| error.to_string())?;
        let digest = format!("{:x}", Sha256::digest(&bytes));
        inputs.insert(entry.file_name().to_string_lossy().into_owned(), digest);
        if let Some(progress) = &progress {
            progress(item_kind, inputs.len(), entries.len());
        }
    }
    Ok(inputs)
}

#[cfg(test)]
mod tests;

fn transfer_blobs(source: &ProjectStore, destination: &ProjectStore) -> Result<(), String> {
    for entry in
        fs::read_dir(source.root().join("blobs/sha256")).map_err(|error| error.to_string())?
    {
        let entry = entry.map_err(|error| error.to_string())?;
        let id = providence_core::model::BlobId(format!(
            "sha256:{}",
            entry.file_name().to_string_lossy()
        ));
        destination
            .adopt_blob(source, &id)
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn start_worker(
    root: TempDir,
    project: providence_core::model::StableId,
    revision: Revision,
    params: Value,
    state: Arc<Mutex<State>>,
    cancel: Arc<AtomicBool>,
) -> Result<thread::JoinHandle<()>, String> {
    let worker_state = state.clone();
    let worker_cancel = cancel.clone();
    let worker_project = project;
    thread::Builder::new()
        .name("scenario-import".into())
        .spawn(move || {
            let (_items, progress) = job_progress(worker_state.clone(), worker_cancel.clone());
            let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                prepare(
                    root,
                    worker_project,
                    revision,
                    params,
                    progress,
                    &worker_cancel,
                )
            }))
            .unwrap_or_else(|_| {
                Err("Import worker failed; the active project is unchanged.".into())
            });
            let mut state = worker_state
                .lock()
                .unwrap_or_else(|error| error.into_inner());
            if !worker_cancel.load(Ordering::Relaxed) {
                state.result = Some(result);
            }
        })
        .map_err(|error| format!("Could not start import: {error}"))
}

fn commit_prepared(
    session: &mut EditorSession,
    store: &ProjectStore,
    revision: Revision,
    prepared: Prepared,
) -> Result<Value, String> {
    transfer_blobs(&prepared.store, store)?;
    let projection = session
        .commit_classic_scenario_import(revision, prepared.snapshot)
        .map_err(|error| error.to_string())?;
    let mut result = prepared.acknowledgement;
    for (name, value) in serde_json::to_value(projection)
        .map_err(|error| error.to_string())?
        .as_object()
        .expect("projection object")
    {
        result[name] = value.clone();
    }
    // Transport checkpoints this revision before acknowledging it. An unknown
    // acknowledgement closes the connection and must never be replayed.
    Ok(result)
}

fn job_progress(
    state: Arc<Mutex<State>>,
    cancel: Arc<AtomicBool>,
) -> (super::item_progress::Scope, super::timing::Progress) {
    let item_state = state.clone();
    let items = super::item_progress::Scope::begin(Arc::new(move |kind, completed, total| {
        let mut state = item_state.lock().unwrap_or_else(|error| error.into_inner());
        state.item_kind = kind.into();
        state.completed_items = if completed == 0 {
            0
        } else {
            state.completed_items.max(completed)
        };
        state.total_items = total;
    }));
    let progress_state = state;
    let progress_cancel = cancel;
    let progress: super::timing::Progress = Arc::new(move |phase, completed| {
        if progress_cancel.load(Ordering::Relaxed) {
            return Err("Import cancelled.".into());
        }
        let mut state = progress_state
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        if state.phase != phase {
            state.item_kind.clear();
            state.completed_items = 0;
            state.total_items = 0;
        }
        state.phase = phase.into();
        if completed {
            state.completed += 1;
        }
        Ok(())
    });
    (items, progress)
}

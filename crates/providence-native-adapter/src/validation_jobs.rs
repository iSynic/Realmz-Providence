use std::sync::{Arc, Condvar, Mutex, MutexGuard};
use std::thread::{self, JoinHandle};

use crate::request_params::required_u64;
use crate::validation_listing;
use providence_core::model::ProjectSnapshot;
use providence_core::rebuilt::ApplicationMediaCatalog;
use providence_core::session::EditorSession;
#[cfg(test)]
use providence_core::session::PersistedSessionState;
use providence_core::session::Revision;
use serde_json::Value;
use serde_json::json;

struct Work {
    id: u64,
    snapshot: ProjectSnapshot,
    revision: Revision,
    application_media: Option<ApplicationMediaCatalog>,
    params: Value,
    readiness: Option<(String, Option<providence_storage::ProjectStore>)>,
}

#[derive(Default)]
struct State {
    next_id: u64,
    latest: Option<(u64, Revision)>,
    pending: Option<Work>,
    result: Option<Result<Value, String>>,
    stop: bool,
}

type Shared = Arc<(Mutex<State>, Condvar)>;
type Evaluator = Arc<dyn Fn(Work) -> Result<Value, String> + Send + Sync>;

pub(super) struct Jobs {
    shared: Shared,
    worker: Option<JoinHandle<()>>,
    evaluate: Evaluator,
    context: Option<(
        providence_core::model::StableId,
        Option<std::path::PathBuf>,
        Option<ApplicationMediaCatalog>,
    )>,
}

impl Default for Jobs {
    fn default() -> Self {
        let cache = Mutex::new(crate::diagnostic_cache::Cache::default());
        Self::with_evaluator(Arc::new(move |work| {
            cache
                .lock()
                .unwrap_or_else(|error| error.into_inner())
                .evaluate(
                    work.snapshot,
                    work.revision,
                    work.application_media,
                    &work.params,
                    work.readiness,
                )
        }))
    }
}

fn lock(shared: &Shared) -> MutexGuard<'_, State> {
    shared.0.lock().unwrap_or_else(|error| error.into_inner())
}

impl Jobs {
    fn with_evaluator(evaluate: Evaluator) -> Self {
        Self {
            shared: Arc::new((Mutex::new(State::default()), Condvar::new())),
            worker: None,
            evaluate,
            context: None,
        }
    }

    pub(super) fn dispatch(
        &mut self,
        session: &EditorSession,
        store: Option<&providence_storage::ProjectStore>,
        application_media: Option<&ApplicationMediaCatalog>,
        method: &str,
        params: &Value,
    ) -> Option<Result<Value, String>> {
        let result = match method {
            "validation.begin" => self.begin(session, application_media, params),
            "readiness.begin" => {
                let target = params.get("target").and_then(Value::as_str).unwrap_or("");
                if !matches!(target, "classic" | "rebuilt") {
                    return Some(Err("Readiness target must be classic or rebuilt.".into()));
                }
                self.queue(
                    session,
                    application_media,
                    params,
                    Some((target.into(), store.cloned())),
                )
            }
            "validation.poll" | "readiness.poll" => {
                if self.context.as_ref().is_some_and(|(project, root, media)| {
                    project != &session.snapshot().project_id
                        || root.as_deref() != store.map(|store| store.root())
                        || media.as_ref() != application_media
                }) {
                    let mut state = lock(&self.shared);
                    state.latest = None;
                    state.pending = None;
                    state.result = None;
                }
                required_u64(params, "jobId").map(|id| self.poll(id, session.revision()))
            }
            "validation.cancel" | "readiness.cancel" => {
                required_u64(params, "jobId").map(|id| self.cancel(id))
            }
            _ => return None,
        };
        if matches!(method, "validation.begin" | "readiness.begin") && result.is_ok() {
            self.context = Some((
                session.snapshot().project_id.clone(),
                store.map(|store| store.root().to_path_buf()),
                application_media.cloned(),
            ));
        }
        Some(result)
    }

    fn begin(
        &mut self,
        session: &EditorSession,
        application_media: Option<&ApplicationMediaCatalog>,
        params: &Value,
    ) -> Result<Value, String> {
        validation_listing::project(Vec::new(), session.revision(), 0, params)?;
        self.queue(session, application_media, params, None)
    }

    fn queue(
        &mut self,
        session: &EditorSession,
        application_media: Option<&ApplicationMediaCatalog>,
        params: &Value,
        readiness: Option<(String, Option<providence_storage::ProjectStore>)>,
    ) -> Result<Value, String> {
        self.start_worker()?;
        let mut work = Work {
            id: 0,
            snapshot: session.snapshot().clone(),
            revision: session.revision(),
            application_media: application_media.cloned(),
            params: params.clone(),
            readiness,
        };
        let mut state = lock(&self.shared);
        state.next_id = state.next_id.checked_add(1).ok_or_else(|| {
            "Validation request IDs are exhausted; reopen the project.".to_string()
        })?;
        work.id = state.next_id;
        state.latest = Some((work.id, work.revision));
        let response = json!({"jobId":work.id, "revision":work.revision, "status":"pending"});
        state.pending = Some(work);
        state.result = None;
        self.shared.1.notify_one();
        Ok(response)
    }

    fn start_worker(&mut self) -> Result<(), String> {
        if self.worker.is_none() {
            let shared = self.shared.clone();
            let evaluate = self.evaluate.clone();
            self.worker = Some(
                thread::Builder::new()
                    .name("scenario-validation".into())
                    .spawn(move || work_loop(shared, evaluate))
                    .map_err(|error| format!("Could not start scenario validation: {error}"))?,
            );
        }
        Ok(())
    }

    fn poll(&self, id: u64, revision: Revision) -> Value {
        let mut state = lock(&self.shared);
        let Some((current, checked_revision)) = state.latest else {
            return json!({"jobId":id, "status":"superseded"});
        };
        if id != current {
            return json!({"jobId":id, "status":"superseded"});
        }
        if checked_revision != revision {
            state.latest = None;
            state.pending = None;
            state.result = None;
            return json!({"jobId":id, "revision":revision, "status":"outdated"});
        }
        match state.result.as_ref() {
            None => json!({"jobId":id, "revision":revision, "status":"pending"}),
            Some(Ok(page)) => {
                json!({"jobId":id, "revision":revision, "status":"ready", "page":page})
            }
            Some(Err(error)) => {
                json!({"jobId":id, "revision":revision, "status":"failed", "error":error})
            }
        }
    }

    fn cancel(&self, id: u64) -> Value {
        let mut state = lock(&self.shared);
        let cancelled = state.latest.is_some_and(|(current, _)| current == id);
        if cancelled {
            state.latest = None;
            state.pending = None;
            state.result = None;
        }
        json!({"jobId":id, "cancelled":cancelled})
    }
}

impl Drop for Jobs {
    fn drop(&mut self) {
        {
            let mut state = lock(&self.shared);
            state.stop = true;
            state.pending = None;
            state.result = None;
            self.shared.1.notify_one();
        }
        if let Some(worker) = self.worker.take() {
            let _ = worker.join();
        }
    }
}

fn work_loop(shared: Shared, evaluate: Evaluator) {
    loop {
        let work = {
            let mut state = lock(&shared);
            while !state.stop && state.pending.is_none() {
                state = shared
                    .1
                    .wait(state)
                    .unwrap_or_else(|error| error.into_inner());
            }
            if state.stop {
                return;
            }
            state.pending.take().expect("pending work was checked")
        };
        let identity = (work.id, work.revision);
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| evaluate(work)))
            .unwrap_or_else(|_| Err("Scenario validation failed unexpectedly. Try again.".into()));
        let mut state = lock(&shared);
        if !state.stop && state.latest == Some(identity) {
            state.result = Some(result);
        }
    }
}

#[cfg(test)]
fn evaluate(work: Work) -> Result<Value, String> {
    let session = EditorSession::from_persisted_state(PersistedSessionState {
        snapshot: work.snapshot,
        revision: work.revision,
        undo: Vec::new(),
        redo: Vec::new(),
    });
    project(&session, work.application_media.as_ref(), &work.params)
}

pub(super) fn project(
    session: &EditorSession,
    application_media: Option<&ApplicationMediaCatalog>,
    params: &Value,
) -> Result<Value, String> {
    crate::diagnostic_policy::Findings::collect(session, application_media).project(
        session.revision(),
        params,
        &crate::diagnostic_policy::uncalled_records(session, params),
    )
}

#[cfg(test)]
mod tests;

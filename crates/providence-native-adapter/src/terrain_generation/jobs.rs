use super::*;
use std::{
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
    },
    thread::JoinHandle,
};

struct Work {
    id: u64,
    project: StableId,
    revision: u64,
    canceled: Arc<AtomicBool>,
    result: Arc<Mutex<Option<Result<Value, String>>>>,
    thread: JoinHandle<()>,
}

#[derive(Default)]
pub(crate) struct Jobs {
    next: u64,
    work: Option<Work>,
}

impl Jobs {
    pub(crate) fn dispatch(
        &mut self,
        session: &EditorSession,
        store: Option<&ProjectStore>,
        catalogs: CatalogViews<'_>,
        method: &str,
        params: &Value,
    ) -> Option<Result<Value, String>> {
        match method {
            "terrain-generation.begin" => Some(self.begin(session, store, catalogs, params)),
            "terrain-generation.poll" | "terrain-generation.cancel" => {
                Some(self.poll(session, method, params))
            }
            _ => None,
        }
    }

    fn begin(
        &mut self,
        session: &EditorSession,
        store: Option<&ProjectStore>,
        catalogs: CatalogViews<'_>,
        params: &Value,
    ) -> Result<Value, String> {
        super::check_revision(session, params)?;
        if self
            .work
            .as_ref()
            .is_some_and(|work| !work.thread.is_finished())
        {
            return Err(
                "Wait for this connection's current terrain job to finish or cancel it.".into(),
            );
        }
        let atlas = super::atlas(session, store, catalogs, params)?;
        let intent = super::intent(params)?;
        let identity = StableId(required_string(params, "identity")?);
        let snapshot = session.snapshot().clone();
        let revision = session.revision().0;
        let project = snapshot.project_id.clone();
        let canceled = Arc::new(AtomicBool::new(false));
        let result = Arc::new(Mutex::new(None));
        let stop = canceled.clone();
        let output = result.clone();
        let thread = std::thread::spawn(move || {
            let plan = core::preview(&snapshot, &identity, &intent, &atlas, &mut || {
                stop.load(Ordering::Relaxed)
            })
            .map_err(|error| error.to_string())
            .and_then(|plan| super::project(revision, &snapshot.project_id, &identity, &plan));
            *output.lock().unwrap_or_else(|error| error.into_inner()) = Some(plan);
        });
        if let Some(old) = self.work.take() {
            let _ = old.thread.join();
        }
        self.next += 1;
        self.work = Some(Work {
            id: self.next,
            project,
            revision,
            canceled,
            result,
            thread,
        });
        Ok(json!({"jobId":self.next,"revision":revision,"status":"pending"}))
    }

    fn poll(
        &mut self,
        session: &EditorSession,
        method: &str,
        params: &Value,
    ) -> Result<Value, String> {
        let id = required_u64(params, "jobId")?;
        let work = self
            .work
            .as_ref()
            .filter(|work| work.id == id)
            .ok_or("This terrain job is no longer available.")?;
        if method == "terrain-generation.cancel" {
            work.canceled.store(true, Ordering::Relaxed);
            return Ok(json!({"jobId":id,"status":"canceled"}));
        }
        if work.revision != session.revision().0 || work.project != session.snapshot().project_id {
            work.canceled.store(true, Ordering::Relaxed);
            return Err(
                "The project changed while generating terrain. Start a fresh preview.".into(),
            );
        }
        if work.canceled.load(Ordering::Relaxed) {
            return Ok(json!({"jobId":id,"status":"canceled"}));
        }
        match work
            .result
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .as_ref()
        {
            Some(Ok(result)) => Ok(json!({"jobId":id,"status":"complete","preview":result})),
            Some(Err(error)) => Err(error.clone()),
            None if work.thread.is_finished() => {
                Err("The terrain worker stopped before returning a preview.".into())
            }
            None => Ok(json!({"jobId":id,"status":"pending"})),
        }
    }
}

impl Drop for Jobs {
    fn drop(&mut self) {
        if let Some(work) = self.work.take() {
            work.canceled.store(true, Ordering::Relaxed);
            let _ = work.thread.join();
        }
    }
}

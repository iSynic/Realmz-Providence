//! Compiler workers own captured read models, never the live project session.
mod artifact;
mod finalization;
mod model;
mod replacement;
mod worker;
use crate::catalogs::CatalogViews;
use model::{Format, Phase, Record};
use providence_core::session::EditorSession;
use providence_storage::ProjectStore;
use serde_json::Value;
use std::{
    collections::BTreeMap,
    path::PathBuf,
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
    },
    thread::JoinHandle,
};
#[cfg(test)]
pub(crate) use worker::TestPoint;

#[derive(Default)]
pub(super) struct Jobs {
    active: BTreeMap<String, Running>,
    #[cfg(test)]
    gate: Option<worker::TestGate>,
}
struct Running {
    thread: JoinHandle<()>,
    record: Arc<Mutex<Record>>,
    cancelled: Arc<AtomicBool>,
}
pub(super) struct CaptureContext<'a> {
    pub session: &'a EditorSession,
    pub store: &'a ProjectStore,
    pub catalogs: CatalogViews<'a>,
    pub options: &'a [String],
    pub provenance: Value,
}

impl Jobs {
    pub fn dispatch(
        &mut self,
        context: CaptureContext<'_>,
        method: &str,
        params: &Value,
    ) -> Result<Value, String> {
        self.settle_finished();
        match method {
            "export.begin" => self.begin(&context, params),
            "export.inspect-artifact" => replacement::inspect(params),
            "export.poll" | "export.cancel" => {
                self.read_or_cancel(context.session, context.store, method, params)
            }
            _ => Err("capability-unavailable: unknown export job command".into()),
        }
    }

    fn begin(&mut self, context: &CaptureContext<'_>, params: &Value) -> Result<Value, String> {
        if self.active.len() >= 2 {
            return Err(
                "export-capacity: two compiler jobs are already active; poll or cancel one first"
                    .into(),
            );
        }
        let format = requested_format(params)?;
        let destination = destination(params, format)?;
        let finalization = finalization::Captured::read(params)?;
        let job_id = providence_session_client::new_operation_id();
        let replacement = replacement::prepare(params, &destination, format, &job_id)?;
        let journal = model::path(context.store.root(), &job_id)?;
        let record = Arc::new(Mutex::new(queued(
            context,
            job_id.clone(),
            format,
            destination,
        )));
        if let Some(capture) = &finalization {
            record
                .lock()
                .unwrap_or_else(|error| error.into_inner())
                .source_provenance["packageFinalization"] = capture.provenance();
        }
        record
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .replacement = replacement;
        model::write(
            &journal,
            &record.lock().unwrap_or_else(|error| error.into_inner()),
        )?;
        super::receipts::link_export_job(
            context.store,
            params["operationId"]
                .as_str()
                .ok_or("operationId is required")?,
            &job_id,
        )?;
        let cancelled = Arc::new(AtomicBool::new(false));
        let work = worker::Work::capture(
            context,
            journal,
            record.clone(),
            cancelled.clone(),
            params,
            finalization,
        );
        self.launch(work, record, cancelled, params)
    }

    fn launch(
        &mut self,
        work: worker::Work,
        record: Arc<Mutex<Record>>,
        cancelled: Arc<AtomicBool>,
        params: &Value,
    ) -> Result<Value, String> {
        let job_id = record
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .job_id
            .clone();
        #[cfg(test)]
        let work = work.with_gate(self.gate.take());
        let Some(thread) = work.start()? else {
            return Ok(model::projection(
                &record.lock().unwrap_or_else(|error| error.into_inner()),
                params,
            ));
        };
        self.active.insert(
            job_id,
            Running {
                thread,
                record: record.clone(),
                cancelled,
            },
        );
        Ok(model::projection(
            &record.lock().unwrap_or_else(|error| error.into_inner()),
            params,
        ))
    }

    fn read_or_cancel(
        &mut self,
        session: &EditorSession,
        store: &ProjectStore,
        method: &str,
        params: &Value,
    ) -> Result<Value, String> {
        let id = params["jobId"].as_str().ok_or("jobId is required")?;
        let path = model::path(store.root(), id)?;
        if let Some(running) = self.active.get(id) {
            let mut record = running
                .record
                .lock()
                .unwrap_or_else(|error| error.into_inner());
            if method == "export.cancel" && !model::terminal(record.state) {
                record.cancel_requested = true;
                running.cancelled.store(true, Ordering::SeqCst);
                model::write(&path, &record)?;
            }
            return Ok(model::projection(&record, params));
        }
        let mut record = model::read(&path, &session.snapshot().project_id.0)?;
        if record.job_id != id {
            return Err("export-job-invalid: journal identity does not match its path".into());
        }
        if !model::terminal(record.state) {
            reconcile(&mut record);
            model::write(&path, &record)?;
        }
        Ok(model::projection(&record, params))
    }

    fn settle_finished(&mut self) {
        let finished: Vec<_> = self
            .active
            .iter()
            .filter(|(_, running)| running.thread.is_finished())
            .map(|(id, _)| id.clone())
            .collect();
        for id in finished {
            if let Some(running) = self.active.remove(&id) {
                let _ = running.thread.join();
            }
        }
    }
    #[cfg(test)]
    pub fn hold_next(
        &mut self,
        point: TestPoint,
    ) -> (std::sync::mpsc::Receiver<()>, std::sync::mpsc::Sender<()>) {
        let (ready, observed) = std::sync::mpsc::channel();
        let (release, resume) = std::sync::mpsc::channel();
        self.gate = Some(worker::TestGate {
            point,
            ready,
            release: resume,
        });
        (observed, release)
    }
}

fn queued(
    context: &CaptureContext<'_>,
    job_id: String,
    format: Format,
    destination: PathBuf,
) -> Record {
    Record {
        job_id,
        project_id: context.session.snapshot().project_id.0.clone(),
        source_revision: context.session.revision().0,
        source_provenance: context.provenance.clone(),
        format,
        destination,
        state: Phase::Queued,
        cancel_requested: false,
        committed: Some(false),
        artifact_sha256: None,
        artifact_bytes: None,
        result: None,
        error: None,
        journal_error: None,
        replacement: None,
    }
}
impl Drop for Jobs {
    fn drop(&mut self) {
        for (_, running) in std::mem::take(&mut self.active) {
            let _ = running.thread.join();
        }
    }
}

fn destination(params: &Value, format: Format) -> Result<PathBuf, String> {
    let path = PathBuf::from(params["path"].as_str().ok_or("output path is required")?);
    if !path.is_absolute() {
        return Err("file-access: export output must be absolute".into());
    }
    match path.symlink_metadata() {
        Ok(_) if params.get("replacement").is_none() => {
            return Err("export-output-exists: refusing to replace an existing output".into());
        }
        Ok(_) => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => return Err(format!("export-output-unavailable: {error}")),
    }
    if format == Format::Rebuilt
        && path.extension().and_then(|extension| extension.to_str()) != Some("realmz2")
    {
        return Err("Rebuilt output requires the .realmz2 extension".into());
    }
    let parent = path
        .parent()
        .ok_or("Missing output parent")?
        .canonicalize()
        .map_err(|error| error.to_string())?;
    Ok(parent.join(path.file_name().ok_or("Missing output name")?))
}

fn reconcile(record: &mut Record) {
    if record.state == Phase::Publishing {
        record.state = Phase::Uncertain;
        record.committed = None;
        let matches = artifact::digest(&record.destination, record.format)
            .ok()
            .is_some_and(|(hash, _)| Some(hash) == record.artifact_sha256);
        record.error=Some(if matches {"export-outcome-uncertain: destination matches the prepared artifact; original publication acknowledgement is unavailable"}
                         else {"export-outcome-uncertain: publication was interrupted; inspect the destination before any new request"}.into());
    } else {
        record.state = Phase::Interrupted;
        record.committed = Some(false);
        record.error=Some("export-interrupted: compiler stopped before its recorded publication phase; no automatic retry".into());
    }
}

fn requested_format(params: &Value) -> Result<Format, String> {
    let format: Format = serde_json::from_value(params["format"].clone())
        .map_err(|_| "Choose classic or rebuilt export")?;
    if format == Format::Classic
        && (params.get("minimumEngineVersion").is_some()
            || params.get("packageFinalization").is_some())
    {
        return Err(
            "invalid-input: Classic exports do not accept Rebuilt engine/finalization options"
                .into(),
        );
    }
    Ok(format)
}

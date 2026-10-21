mod replacement_publish;
use super::{
    artifact,
    model::{self, Format, Phase, Record},
};
use providence_core::{
    model::ProjectSnapshot,
    rebuilt::ApplicationMediaCatalog,
    session::{EditorSession, PersistedSessionState, Revision},
};
use providence_storage::ProjectStore;
use serde_json::{Value, json};
use std::{
    path::PathBuf,
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
    },
};

pub(super) struct Work {
    pub snapshot: ProjectSnapshot,
    pub revision: Revision,
    pub store: ProjectStore,
    pub application: Option<ApplicationMediaCatalog>,
    pub support_options: Vec<String>,
    pub support_inputs: Value,
    pub minimum_engine: String,
    finalization: Option<super::finalization::Captured>,
    pub journal: PathBuf,
    pub record: Arc<Mutex<Record>>,
    pub cancelled: Arc<AtomicBool>,
    #[cfg(test)]
    gate: Option<TestGate>,
}

#[cfg(test)]
#[derive(Clone, Copy, PartialEq, Eq)]
pub(crate) enum TestPoint {
    BeforeCompile,
    BeforePublish,
    AfterBackup,
}
#[cfg(test)]
pub(crate) struct TestGate {
    pub point: TestPoint,
    pub ready: std::sync::mpsc::Sender<()>,
    pub release: std::sync::mpsc::Receiver<()>,
}

impl Work {
    pub fn capture(
        context: &super::CaptureContext<'_>,
        journal: PathBuf,
        record: Arc<Mutex<Record>>,
        cancelled: Arc<AtomicBool>,
        params: &Value,
        finalization: Option<super::finalization::Captured>,
    ) -> Self {
        Self {
            snapshot: context.session.snapshot().clone(),
            revision: context.session.revision(),
            store: context.store.clone(),
            application: context.catalogs.application_media.cloned(),
            support_options: context.options.to_vec(),
            support_inputs: context.provenance["supportInputs"].clone(),
            minimum_engine: params["minimumEngineVersion"]
                .as_str()
                .unwrap_or("0.1.0")
                .into(),
            finalization,
            journal,
            record,
            cancelled,
            #[cfg(test)]
            gate: None,
        }
    }
    #[cfg(test)]
    pub fn with_gate(mut self, gate: Option<TestGate>) -> Self {
        self.gate = gate;
        self
    }
    #[cfg(test)]
    fn pause(&self, point: TestPoint) -> Result<(), String> {
        if let Some(gate) = &self.gate
            && gate.point == point
        {
            gate.ready.send(()).map_err(|error| error.to_string())?;
            gate.release
                .recv_timeout(std::time::Duration::from_secs(10))
                .map_err(|error| error.to_string())?;
        }
        Ok(())
    }
    pub fn start(self) -> Result<Option<std::thread::JoinHandle<()>>, String> {
        let record = self.record.clone();
        let journal = self.journal.clone();
        match std::thread::Builder::new()
            .name("providence-export".into())
            .spawn(move || self.run())
        {
            Ok(thread) => Ok(Some(thread)),
            Err(error) => {
                let mut failed = record.lock().unwrap_or_else(|error| error.into_inner());
                failed.state = Phase::Failed;
                failed.error = Some(format!("export-worker-unavailable: {error}"));
                model::write(&journal, &failed)?;
                Ok(None)
            }
        }
    }
    fn run(self) {
        if let Err(error) = self.execute() {
            let mut record = self
                .record
                .lock()
                .unwrap_or_else(|error| error.into_inner());
            record.state = if record.committed == Some(true) {
                Phase::Completed
            } else if error == "export-cancelled" {
                Phase::Cancelled
            } else {
                Phase::Failed
            };
            if record.committed != Some(true) {
                record.committed = Some(false);
            }
            record.error = Some(error);
            if let Err(error) = model::write(&self.journal, &record) {
                record.journal_error = Some(error);
            }
        }
    }

    fn execute(&self) -> Result<(), String> {
        self.check_cancel()?;
        self.support_current()?;
        self.update(|record| record.state = Phase::Compiling)?;
        #[cfg(test)]
        self.pause(TestPoint::BeforeCompile)?;
        self.check_cancel()?;
        let (destination, format) = {
            let record = self
                .record
                .lock()
                .unwrap_or_else(|error| error.into_inner());
            (record.destination.clone(), record.format)
        };
        let parent = destination.parent().ok_or("Missing output parent")?;
        let staging = tempfile::Builder::new()
            .prefix(".providence-export-")
            .tempdir_in(parent)
            .map_err(|error| error.to_string())?;
        // Classic verifies the directory name against the scenario startup file.
        let candidate = staging
            .path()
            .join(destination.file_name().ok_or("Missing output name")?);
        let finalization = self
            .finalization
            .as_ref()
            .map(|capture| capture.stage(staging.path()))
            .transpose()?;
        let mut result = self.compile(format, &candidate, finalization)?;
        self.support_current()?;
        let (hash, bytes) = artifact::digest(&candidate, format)?;
        if let Some(object) = result.as_object_mut() {
            let key = if format == Format::Classic {
                "directory"
            } else {
                "path"
            };
            object.insert(key.into(), json!(destination));
        }
        self.check_cancel()?;
        self.update(|record| {
            record.state = Phase::Publishing;
            record.committed = None;
            record.artifact_sha256 = Some(hash);
            record.artifact_bytes = Some(bytes);
            record.result = Some(result);
        })?;
        #[cfg(test)]
        self.pause(TestPoint::BeforePublish)?;
        self.check_cancel()?;
        self.support_current()?;
        self.publish(&candidate, &destination, format)?;
        self.update(|record| {
            record.committed = Some(true);
            record.state = Phase::Completed
        })
    }

    fn compile(
        &self,
        format: Format,
        candidate: &std::path::Path,
        finalization: Option<crate::rebuilt_packages::PackageFinalizationOptions>,
    ) -> Result<Value, String> {
        let session = EditorSession::from_persisted_state(PersistedSessionState {
            snapshot: self.snapshot.clone(),
            revision: self.revision,
            undo: vec![],
            redo: vec![],
        });
        match format {
            Format::Classic => {
                crate::classic_compilation::compile_project_classic_slice_with_application(
                    &session,
                    &self.store,
                    self.application.as_ref(),
                    json!({"directory":candidate,"expectedRevision":self.revision}),
                    crate::classic_compilation::ClassicManifestOperation::Publish,
                )
            }
            Format::Rebuilt => crate::rebuilt_packages::compile_rebuilt_package(
                &session,
                &self.store,
                self.application.as_ref(),
                json!({"path":candidate,"expectedRevision":self.revision,"minimumEngineVersion":self.minimum_engine,"packageFinalization":finalization}),
            ),
        }
    }

    fn check_cancel(&self) -> Result<(), String> {
        if self.cancelled.load(Ordering::SeqCst) {
            Err("export-cancelled".into())
        } else {
            Ok(())
        }
    }
    fn support_current(&self) -> Result<(), String> {
        if let Some(capture) = &self.finalization {
            capture.check_current()?;
        }
        if super::super::support::identities(&self.support_options)? != self.support_inputs {
            Err("application-support-changed: captured export support changed; no publication attempted".into())
        } else {
            Ok(())
        }
    }
    fn update(&self, change: impl FnOnce(&mut Record)) -> Result<(), String> {
        let mut record = self
            .record
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        change(&mut record);
        model::write(&self.journal, &record)
    }
}

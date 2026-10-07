use crate::{diagnostic_policy::Findings, readiness::ReadinessData};
use providence_core::{
    model::ProjectSnapshot,
    rebuilt::ApplicationMediaCatalog,
    session::{EditorSession, PersistedSessionState, Revision},
};
use providence_storage::ProjectStore;
use serde_json::Value;
use std::{
    collections::BTreeMap,
    path::{Path, PathBuf},
};

#[derive(PartialEq)]
struct SupportFileIdentity {
    path: PathBuf,
    byte_length: u64,
    modified: Option<std::time::SystemTime>,
}

#[derive(PartialEq)]
struct ContextIdentity {
    options: Value,
    files: Vec<SupportFileIdentity>,
}

#[derive(Default)]
pub(crate) struct Cache {
    session: Option<EditorSession>,
    media: Option<ApplicationMediaCatalog>,
    findings: Option<Findings>,
    readiness: BTreeMap<String, ReadinessData>,
    context: Option<ContextIdentity>,
}

impl Cache {
    pub(crate) fn evaluate(
        &mut self,
        snapshot: ProjectSnapshot,
        revision: Revision,
        media: Option<ApplicationMediaCatalog>,
        params: &Value,
        target: Option<(String, Option<ProjectStore>)>,
    ) -> Result<Value, String> {
        self.update_project(snapshot, revision, media);
        let session = self.session.as_ref().expect("cached session");
        let Some((target, store)) = target else {
            let findings = self
                .findings
                .get_or_insert_with(|| Findings::collect(session, self.media.as_ref()));
            return findings.project(revision, params);
        };
        let root = store.as_ref().map(ProjectStore::root);
        let context = context_identity(params, root, session.snapshot())?;
        if self.context.as_ref() != Some(&context) {
            self.readiness.clear();
            self.context = Some(context);
        }
        if !self.readiness.contains_key(&target) {
            // Readiness uses the queued authored snapshot and captured source access.
            // Reopening would reload saved truth and rebuild an unrelated search index.
            let data = if target == "classic" {
                crate::readiness::collect_classic(session.snapshot(), self.media.as_ref())
            } else {
                crate::stored_routes::readiness_data(
                    session,
                    store.as_ref(),
                    params,
                    self.media.as_ref(),
                )?
            };
            if self.context.as_ref() != Some(&context_identity(params, root, session.snapshot())?) {
                self.readiness.clear();
                self.context = None;
                return Err("Readiness support changed while checking. Check again.".into());
            }
            self.readiness.insert(target.clone(), data);
        }
        self.readiness[&target].project(revision, params)
    }
    fn update_project(
        &mut self,
        snapshot: ProjectSnapshot,
        revision: Revision,
        media: Option<ApplicationMediaCatalog>,
    ) {
        let reusable = self.session.as_ref().is_some_and(|session| {
            session.revision() == revision && session.snapshot() == &snapshot
        }) && self.media == media;
        if !reusable {
            self.session = Some(EditorSession::from_persisted_state(PersistedSessionState {
                snapshot,
                revision,
                undo: Vec::new(),
                redo: Vec::new(),
            }));
            self.media = media;
            self.findings = None;
            self.readiness.clear();
            self.context = None;
        }
    }
}

#[cfg(test)]
mod tests;

// Filesystem identities are checked on the worker, including captured blobs.
// A page/filter never changes the classification key; changed external support
// or rule selection cannot reuse a previously derived classification.
fn context_identity(
    params: &Value,
    root: Option<&Path>,
    snapshot: &ProjectSnapshot,
) -> Result<ContextIdentity, String> {
    let context = serde_json::json!({"applicationLibraryRoot":params.get("applicationLibraryRoot"),
        "packageFinalization":params.get("packageFinalization"), "store":root});
    let mut paths = Vec::new();
    if let Some(root) = root {
        for source in &snapshot.classic_sources {
            if let Some(hash) = source.blob.0.strip_prefix("sha256:") {
                paths.push(root.join("blobs/sha256").join(hash));
            }
        }
    }
    if let Some(path) = params.get("applicationLibraryRoot").and_then(Value::as_str) {
        collect_files(Path::new(path), &mut paths)?;
    }
    if let Some(options) = crate::classic_rule_selection::options(params)? {
        paths.push(options.application_package);
        if let Some(path) = options.application_media_catalog_path {
            paths.push(path);
        }
        collect_files(&options.classic_application_data_directory, &mut paths)?;
    }
    paths.sort();
    paths.dedup();
    let files = paths
        .into_iter()
        .map(|path| {
            let metadata = std::fs::metadata(&path)
                .map_err(|error| format!("Readiness support {}: {error}", path.display()))?;
            Ok(SupportFileIdentity {
                path,
                byte_length: metadata.len(),
                modified: metadata.modified().ok(),
            })
        })
        .collect::<Result<Vec<_>, String>>()?;
    Ok(ContextIdentity {
        options: context,
        files,
    })
}

fn collect_files(root: &Path, files: &mut Vec<PathBuf>) -> Result<(), String> {
    for entry in std::fs::read_dir(root)
        .map_err(|error| format!("Readiness support {}: {error}", root.display()))?
    {
        let entry = entry.map_err(|error| error.to_string())?;
        let kind = entry.file_type().map_err(|error| error.to_string())?;
        if kind.is_dir() {
            collect_files(&entry.path(), files)?;
        } else if kind.is_file() {
            files.push(entry.path());
        }
    }
    Ok(())
}

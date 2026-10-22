//! Line transport acknowledges a mutation only after its portable checkpoint.
//! An unknown outcome closes the session; callers must reopen rather than replay it.

use std::io::{BufRead, Write};
use std::time::Instant;

use providence_core::session::{EditorSession, Revision};
use providence_storage::ProjectStore;
use serde_json::{Value, json};

use crate::Request;
use crate::Response;
use crate::catalogs::CatalogViews;
use crate::catalogs::OpenMonsterLibrary;
use crate::dispatch;
use crate::validation_jobs;
#[cfg(test)]
use providence_core::rebuilt::ApplicationMediaCatalog;
#[cfg(test)]
use providence_storage::ReferenceLibraryStore;

#[derive(Default)]
struct CommandTiming {
    dispatch_micros: u128,
    checkpoint_micros: u128,
    history_snapshot_reused: bool,
}

struct PendingCommand {
    journal: Value,
    measure: bool,
    describes_startup: bool,
    revision: Revision,
    attribution: Option<providence_core::session::HistoryAttribution>,
}
impl PendingCommand {
    fn capture(session: &EditorSession, request: &mut Request) -> Self {
        let attribution = request
            .params
            .as_object_mut()
            .and_then(|params| {
                params.remove("_hostSession");
                params.remove("_historyAttribution")
            })
            .and_then(|value| serde_json::from_value(value).ok());
        Self {
            journal: json!({"method":request.method,"params":request.params}),
            measure: request.params["measurePerformance"]
                .as_bool()
                .unwrap_or(false),
            describes_startup: request.method == "session.describe",
            revision: session.revision(),
            attribution: if request.method.starts_with("history.") {
                None
            } else {
                attribution
            },
        }
    }
}

pub(crate) struct ConnectionJobs {
    terrain: crate::terrain_generation::jobs::Jobs,
    validation: validation_jobs::Jobs,
    imports: crate::scenario_import::jobs::Jobs,
    integrity: crate::library_integrity::Inspection,
}
impl ConnectionJobs {
    pub(crate) fn new(catalogs: CatalogViews<'_>) -> Self {
        Self {
            terrain: Default::default(),
            validation: validation_jobs::Jobs::with_catalogs(catalogs),
            imports: crate::scenario_import::jobs::Jobs::default(),
            integrity: crate::library_integrity::Inspection::begin(catalogs),
        }
    }
}

pub(crate) fn serve_io_with_libraries(
    session: &mut EditorSession,
    store: Option<&ProjectStore>,
    catalogs: CatalogViews<'_>,
    mut monster_library: Option<&mut OpenMonsterLibrary>,
    startup_timing: Option<&crate::startup::StartupTiming>,
    reader: impl BufRead,
    mut writer: impl Write,
) -> Result<(), String> {
    let mut jobs = ConnectionJobs {
        terrain: Default::default(),
        validation: validation_jobs::Jobs::with_catalogs(catalogs),
        imports: crate::scenario_import::jobs::Jobs::default(),
        integrity: crate::library_integrity::Inspection::begin(catalogs),
    };
    for line in reader.lines() {
        let line = line.map_err(|error| error.to_string())?;
        let request = match serde_json::from_str::<Request>(&line) {
            Ok(request) => request,
            Err(error) => {
                write_response(&mut writer, rejected_request(error.to_string()))?;
                continue;
            }
        };
        let id = request.id;
        let response = guard_panic(id, || {
            process_request(
                session,
                store,
                catalogs,
                monster_library.as_deref_mut(),
                &mut jobs,
                request,
                startup_timing,
            )
        })
        .unwrap_or_else(|poisoned| poisoned);
        let requires_reopen = response.outcome_unknown == Some(true);
        write_response(&mut writer, response)?;
        if requires_reopen {
            return Ok(());
        }
    }
    Ok(())
}

pub(crate) fn process_request(
    session: &mut EditorSession,
    store: Option<&ProjectStore>,
    catalogs: CatalogViews<'_>,
    mut monster_library: Option<&mut OpenMonsterLibrary>,
    jobs: &mut ConnectionJobs,
    mut request: Request,
    startup_timing: Option<&crate::startup::StartupTiming>,
) -> Response {
    let command = PendingCommand::capture(session, &mut request);
    let receipt = match crate::monster_operation_receipts::start(
        store,
        monster_library.as_deref(),
        catalogs.personal_library,
        &request,
    ) {
        crate::monster_operation_receipts::Start::Continue(receipt) => receipt,
        crate::monster_operation_receipts::Start::Reply(response) => return response,
    };
    let previous_library_revision = monster_library
        .as_ref()
        .map(|library| library.session.revision());
    let started = Instant::now();
    let mut response = dispatch_with_imports(
        session,
        store,
        catalogs,
        monster_library.as_deref_mut(),
        jobs,
        request,
    );
    let mut timing = CommandTiming {
        dispatch_micros: started.elapsed().as_micros(),
        ..Default::default()
    };
    let advanced = session.revision() != command.revision;
    if advanced && let Some(attribution) = command.attribution {
        session.attribute_latest_edit(attribution);
    }
    reject_unacknowledged_mutation(
        &mut response,
        advanced || library_advanced(monster_library.as_deref(), previous_library_revision),
    );
    if response.ok && advanced {
        checkpoint_project(session, store, &command.journal, &mut response, &mut timing);
    }
    if response.ok {
        checkpoint_monster_library(monster_library, previous_library_revision, &mut response);
    }
    if command.measure {
        attach_performance_metrics(
            &mut response,
            timing,
            startup_timing.filter(|_| command.describes_startup),
        );
    }
    crate::monster_operation_receipts::finish(receipt, &mut response);
    response
}

#[cfg(panic = "abort")]
compile_error!("the adapter's request panic boundary requires panic = \"unwind\"");

/// Converts a panic in one request into a typed outcome-unknown reply. Unwinding skips the
/// session's rollback, so the caller must never dispatch to, read, or checkpoint the state the
/// closure borrowed again; it may only be dropped.
pub(crate) fn guard_panic(
    id: u64,
    handle: impl FnOnce() -> Response,
) -> Result<Response, Response> {
    std::panic::catch_unwind(std::panic::AssertUnwindSafe(handle)).map_err(|payload| {
        let cause = payload
            .downcast_ref::<&str>()
            .map(|cause| cause.to_string())
            .or_else(|| payload.downcast_ref::<String>().cloned())
            .unwrap_or_else(|| "non-text panic payload".into());
        eprintln!("request {id} panicked and poisoned its session: {cause}");
        unknown_outcome(
            id,
            format!(
                "session-poisoned: the request panicked, so its outcome is unknown and this session will not be saved again; reopen the project before retrying: {cause}"
            ),
        )
    })
}

#[cfg(test)]
thread_local! {
    static PANIC_BEFORE_CHECKPOINT: std::cell::Cell<bool> = const { std::cell::Cell::new(false) };
}

/// Panics in the next project checkpoint, after its command advanced the session.
#[cfg(test)]
pub(crate) fn arm_panic_before_checkpoint() {
    PANIC_BEFORE_CHECKPOINT.set(true);
}

fn library_advanced(library: Option<&OpenMonsterLibrary>, previous: Option<Revision>) -> bool {
    library.is_some_and(|library| previous != Some(library.session.revision()))
}

/// A failed reply that still advanced a session is never checkpointed or attributed to the
/// next command. The disk keeps the last acknowledged state and the client must reopen.
pub(crate) fn reject_unacknowledged_mutation(response: &mut Response, advanced: bool) {
    if response.ok || !advanced || response.outcome_unknown == Some(true) {
        return;
    }
    let error = response.error.as_deref().unwrap_or("unknown error");
    *response = unknown_outcome(
        response.id,
        format!(
            "command could not be durably acknowledged because it failed after changing the session; reopen the project before retrying: {error}"
        ),
    );
}

fn checkpoint_project(
    session: &EditorSession,
    store: Option<&ProjectStore>,
    command: &Value,
    response: &mut Response,
    timing: &mut CommandTiming,
) {
    let Some(store) = store else { return };
    #[cfg(test)]
    if PANIC_BEFORE_CHECKPOINT.replace(false) {
        panic!("injected panic before checkpoint");
    }
    let started = Instant::now();
    match store.checkpoint_session(session, command) {
        Ok(outcome) => {
            timing.history_snapshot_reused = outcome.history_snapshot_reused;
            if let Some(warning) = outcome.infrastructure_warning {
                attach_infrastructure_warning(response, warning);
            }
        }
        Err(error) => {
            *response = unknown_outcome(
                response.id,
                format!(
                    "command could not be durably acknowledged because the portable checkpoint failed; reopen the project before retrying: {error}"
                ),
            );
        }
    }
    timing.checkpoint_micros = started.elapsed().as_micros();
}

fn checkpoint_monster_library(
    library: Option<&mut OpenMonsterLibrary>,
    previous_revision: Option<Revision>,
    response: &mut Response,
) {
    let Some(library) = library else { return };
    if previous_revision == Some(library.session.revision()) {
        return;
    }
    if let Err(error) = library.store.checkpoint_session(&library.session) {
        *response = unknown_outcome(
            response.id,
            format!(
                "Monster Library command could not be durably acknowledged; reopen the library before retrying: {error}"
            ),
        );
    }
}

fn rejected_request(error: String) -> Response {
    Response {
        id: 0,
        outcome_unknown: None,
        ok: false,
        result: None,
        error: Some(format!("invalid request: {error}")),
    }
}

fn unknown_outcome(id: u64, error: String) -> Response {
    Response {
        id,
        outcome_unknown: Some(true),
        ok: false,
        result: None,
        error: Some(error),
    }
}

fn attach_infrastructure_warning(response: &mut Response, warning: String) {
    if let Some(Value::Object(result)) = response.result.as_mut() {
        result.insert("infrastructureWarning".into(), Value::String(warning));
    }
}

fn attach_performance_metrics(
    response: &mut Response,
    timing: CommandTiming,
    startup_timing: Option<&crate::startup::StartupTiming>,
) {
    let Some(Value::Object(result)) = response.result.as_mut() else {
        return;
    };
    result.insert(
        "performance".into(),
        json!({
            "dispatchMs": timing.dispatch_micros as f64 / 1000.0,
            "checkpointMs": timing.checkpoint_micros as f64 / 1000.0,
            "historySnapshotReused": timing.history_snapshot_reused,
        }),
    );
    if let Some(startup_timing) = startup_timing {
        result["performance"]["startup"] = json!(startup_timing);
    }
}

fn write_response(writer: &mut impl Write, response: Response) -> Result<(), String> {
    serde_json::to_writer(&mut *writer, &response).map_err(|error| error.to_string())?;
    writer.write_all(b"\n").map_err(|error| error.to_string())?;
    writer.flush().map_err(|error| error.to_string())
}

#[cfg(test)]
pub(crate) fn serve_io(
    session: &mut EditorSession,
    store: Option<&ProjectStore>,
    reader: impl BufRead,
    writer: impl Write,
) -> Result<(), String> {
    serve_io_with_application(session, store, None, None, reader, writer)
}

#[cfg(test)]
pub(crate) fn serve_io_with_application(
    session: &mut EditorSession,
    store: Option<&ProjectStore>,
    application_media: Option<&ApplicationMediaCatalog>,
    application_media_store: Option<&ReferenceLibraryStore>,
    reader: impl BufRead,
    writer: impl Write,
) -> Result<(), String> {
    serve_io_with_libraries(
        session,
        store,
        CatalogViews {
            application_media,
            application_media_store,
            ..Default::default()
        },
        None,
        None,
        reader,
        writer,
    )
}

fn dispatch_with_imports(
    session: &mut EditorSession,
    store: Option<&ProjectStore>,
    catalogs: CatalogViews<'_>,
    monster_library: Option<&mut OpenMonsterLibrary>,
    jobs: &mut ConnectionJobs,
    request: Request,
) -> Response {
    let imported = if request.method == "application-media.integrity-status" {
        Some(Ok(jobs.integrity.status()))
    } else {
        jobs.imports
            .dispatch(session, store, &request.method, &request.params)
            .or_else(|| {
                jobs.terrain
                    .dispatch(session, store, catalogs, &request.method, &request.params)
            })
    };
    if let Some(result) = imported {
        match result {
            Ok(result) => Response {
                id: request.id,
                ok: true,
                result: Some(result),
                error: None,
                outcome_unknown: None,
            },
            Err(error) => Response {
                id: request.id,
                ok: false,
                result: None,
                error: Some(error),
                outcome_unknown: None,
            },
        }
    } else {
        dispatch(
            session,
            store,
            catalogs,
            monster_library,
            &mut jobs.validation,
            request,
        )
    }
}

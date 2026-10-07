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

pub(crate) fn serve_io_with_libraries(
    session: &mut EditorSession,
    store: Option<&ProjectStore>,
    catalogs: CatalogViews<'_>,
    mut monster_library: Option<&mut OpenMonsterLibrary>,
    startup_timing: Option<&crate::startup::StartupTiming>,
    reader: impl BufRead,
    mut writer: impl Write,
) -> Result<(), String> {
    let mut jobs = validation_jobs::Jobs::default();
    for line in reader.lines() {
        let line = line.map_err(|error| error.to_string())?;
        let request = match serde_json::from_str::<Request>(&line) {
            Ok(request) => request,
            Err(error) => {
                write_response(&mut writer, rejected_request(error.to_string()))?;
                continue;
            }
        };
        let response = process_request(
            session,
            store,
            catalogs,
            monster_library.as_deref_mut(),
            &mut jobs,
            request,
            startup_timing,
        );
        let requires_reopen = response.outcome_unknown == Some(true);
        write_response(&mut writer, response)?;
        if requires_reopen {
            return Ok(());
        }
    }
    Ok(())
}

fn process_request(
    session: &mut EditorSession,
    store: Option<&ProjectStore>,
    catalogs: CatalogViews<'_>,
    mut monster_library: Option<&mut OpenMonsterLibrary>,
    jobs: &mut validation_jobs::Jobs,
    request: Request,
    startup_timing: Option<&crate::startup::StartupTiming>,
) -> Response {
    let receipt = match crate::monster_operation_receipts::start(
        store,
        monster_library.as_deref(),
        catalogs.personal_library,
        &request,
    ) {
        crate::monster_operation_receipts::Start::Continue(receipt) => receipt,
        crate::monster_operation_receipts::Start::Reply(response) => return response,
    };
    let command = json!({"method": request.method, "params": request.params});
    let measure = request
        .params
        .get("measurePerformance")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let describes_startup = request.method == "session.describe";
    let previous_revision = session.revision();
    let previous_library_revision = monster_library
        .as_ref()
        .map(|library| library.session.revision());
    let started = Instant::now();
    let mut response = dispatch(
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
    if response.ok && session.revision() != previous_revision {
        checkpoint_project(session, store, &command, &mut response, &mut timing);
    }
    if response.ok {
        checkpoint_monster_library(monster_library, previous_library_revision, &mut response);
    }
    if measure {
        attach_performance_metrics(
            &mut response,
            timing,
            startup_timing.filter(|_| describes_startup),
        );
    }
    crate::monster_operation_receipts::finish(receipt, &mut response);
    response
}

fn checkpoint_project(
    session: &EditorSession,
    store: Option<&ProjectStore>,
    command: &Value,
    response: &mut Response,
    timing: &mut CommandTiming,
) {
    let Some(store) = store else { return };
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

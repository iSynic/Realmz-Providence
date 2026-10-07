use crate::catalogs::OpenLibraries;
use crate::demo::demo_ui_snapshot;
use crate::library_arguments::open_library_arguments;
use providence_core::{model::ProjectSnapshot, session::EditorSession, snapshot::from_json};
use providence_storage::{ProjectOpenTiming, ProjectStore};
use std::{fs, path::Path, process::ExitCode, time::Instant};

#[derive(Default, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct StartupTiming {
    pub(crate) project_open_ms: f64,
    pub(crate) libraries_open_ms: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) project: Option<ProjectOpenTiming>,
}

pub(crate) struct Startup {
    pub(crate) session: EditorSession,
    pub(crate) store: Option<ProjectStore>,
    pub(crate) libraries: OpenLibraries,
    pub(crate) timing: StartupTiming,
}

pub(crate) struct StartupError {
    pub(crate) message: String,
    pub(crate) exit_code: ExitCode,
}

impl StartupError {
    fn usage(message: String) -> Self {
        Self {
            message,
            exit_code: ExitCode::from(2),
        }
    }

    fn load(message: String) -> Self {
        Self {
            message,
            exit_code: ExitCode::FAILURE,
        }
    }
}

pub(crate) fn start(arguments: &mut impl Iterator<Item = String>) -> Result<Startup, StartupError> {
    match arguments.next().as_deref() {
        Some("serve-demo") => open_demo(arguments),
        Some("serve-library") => open_library(arguments),
        Some("serve") => open_snapshot(arguments),
        Some("serve-project") => open_project(arguments),
        _ => Err(StartupError::usage(
            "Usage: providence-native-adapter build-identity | serve-demo | serve <snapshot.json> | serve-project <project-directory> [--application-library-root <directory>] [--monster-library-root <directory>] [--reference-catalog-root <directory>] [--personal-library-root <directory>]".into(),
        )),
    }
}

fn open_library(arguments: &mut impl Iterator<Item = String>) -> Result<Startup, StartupError> {
    let started = Instant::now();
    let libraries = open_library_arguments(arguments).map_err(StartupError::usage)?;
    if libraries.monster_library.is_none() {
        return Err(StartupError::usage(
            "serve-library requires a Monster Library".into(),
        ));
    }
    Ok(Startup {
        session: EditorSession::new(ProjectSnapshot::new_authored(
            providence_core::model::StableId("library-reference-context".into()),
        )),
        store: None,
        libraries,
        timing: StartupTiming {
            libraries_open_ms: started.elapsed().as_secs_f64() * 1000.0,
            ..Default::default()
        },
    })
}

fn open_demo(arguments: &mut impl Iterator<Item = String>) -> Result<Startup, StartupError> {
    let started = Instant::now();
    let libraries = open_library_arguments(arguments).map_err(StartupError::usage)?;
    let libraries_open_ms = started.elapsed().as_secs_f64() * 1000.0;
    let started = Instant::now();
    let session = EditorSession::new(demo_ui_snapshot());
    Ok(Startup {
        session,
        store: None,
        libraries,
        timing: StartupTiming {
            project_open_ms: started.elapsed().as_secs_f64() * 1000.0,
            libraries_open_ms,
            ..Default::default()
        },
    })
}

fn open_snapshot(arguments: &mut impl Iterator<Item = String>) -> Result<Startup, StartupError> {
    let started = Instant::now();
    let path = arguments
        .next()
        .ok_or_else(|| StartupError::usage("serve requires a portable snapshot path".into()))?;
    let snapshot = read_snapshot(Path::new(&path)).map_err(StartupError::load)?;
    Ok(Startup {
        session: EditorSession::new(snapshot),
        store: None,
        libraries: OpenLibraries::default(),
        timing: StartupTiming {
            project_open_ms: started.elapsed().as_secs_f64() * 1000.0,
            ..Default::default()
        },
    })
}

fn open_project(arguments: &mut impl Iterator<Item = String>) -> Result<Startup, StartupError> {
    let started = Instant::now();
    let path = arguments
        .next()
        .ok_or_else(|| StartupError::usage("serve-project requires a project directory".into()))?;
    let (store, session, project) =
        ProjectStore::open_session_measured(&path).map_err(|error| {
            StartupError::load(format!("could not open project store {path}: {error}"))
        })?;
    let project_open_ms = started.elapsed().as_secs_f64() * 1000.0;
    let started = Instant::now();
    let libraries = open_library_arguments(arguments).map_err(StartupError::usage)?;
    Ok(Startup {
        session,
        store: Some(store),
        libraries,
        timing: StartupTiming {
            project_open_ms,
            libraries_open_ms: started.elapsed().as_secs_f64() * 1000.0,
            project: Some(project),
        },
    })
}

pub(crate) fn read_snapshot(path: &Path) -> Result<ProjectSnapshot, String> {
    let json = fs::read_to_string(path)
        .map_err(|error| format!("could not read {}: {error}", path.display()))?;
    from_json(&json).map_err(|error| error.to_string())
}

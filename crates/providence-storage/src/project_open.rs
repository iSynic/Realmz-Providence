use crate::{ProjectStore, StoreError, database::create_schema};
use providence_core::{
    model::{BlobId, ProjectSnapshot},
    session::EditorSession,
};
use rusqlite::OptionalExtension;
use serde::Serialize;
use std::{path::PathBuf, time::Instant};

/// Diagnostic phase timings; never persisted in portable or local project state.
#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectOpenTiming {
    pub snapshot_load_ms: f64,
    pub index_rebuild_ms: f64,
    pub index_reused: bool,
    pub history_restore_ms: f64,
}

impl ProjectStore {
    pub fn open_session(root: impl Into<PathBuf>) -> Result<(Self, EditorSession), StoreError> {
        let (store, session, _) = Self::open_session_measured(root)?;
        Ok((store, session))
    }

    pub fn open_session_measured(
        root: impl Into<PathBuf>,
    ) -> Result<(Self, EditorSession, ProjectOpenTiming), StoreError> {
        let store = Self { root: root.into() };
        let started = Instant::now();
        let snapshot = store.load_snapshot()?;
        let snapshot_load_ms = started.elapsed().as_secs_f64() * 1000.0;
        let started = Instant::now();
        let index_reused = store.index_matches_snapshot()?;
        let index_rebuild_ms = started.elapsed().as_secs_f64() * 1000.0;
        let started = Instant::now();
        let session = store.restore_session(snapshot)?;
        let timing = ProjectOpenTiming {
            snapshot_load_ms,
            index_rebuild_ms,
            index_reused,
            history_restore_ms: started.elapsed().as_secs_f64() * 1000.0,
        };
        Ok((store, session, timing))
    }

    fn restore_session(&self, snapshot: ProjectSnapshot) -> Result<EditorSession, StoreError> {
        let connection = self.open_database()?;
        create_schema(&connection)?;
        let state_blob: Option<String> = connection
            .query_row(
                "SELECT value FROM metadata WHERE key = 'session_state_blob'",
                [],
                |row| row.get(0),
            )
            .optional()?;
        if let Some(state_blob) = state_blob {
            let state = self
                .load_persisted_session(&BlobId(state_blob), &snapshot)
                .ok()
                .filter(|state| state.snapshot == snapshot);
            if let Some(state) = state {
                return Ok(EditorSession::from_persisted_state(state));
            }
            connection.execute("DELETE FROM metadata WHERE key = 'session_state_blob'", [])?;
        }
        Ok(EditorSession::new(snapshot))
    }
}

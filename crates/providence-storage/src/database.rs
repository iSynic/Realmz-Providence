use crate::COMMAND_JOURNAL_ENTRY_LIMIT;
use crate::LOCAL_DIRECTORY;
use crate::ProjectStore;
use crate::errors::StoreError;
use providence_core::model::BlobId;
use providence_core::model::ProjectSnapshot;
use providence_core::session::Revision;
use rusqlite::Connection;
use rusqlite::params;
use serde_json::Value;
use std::fs;

impl ProjectStore {
    pub(super) fn update_infrastructure(
        &self,
        snapshot: &ProjectSnapshot,
        revision: Revision,
        command: &Value,
        snapshot_sha256: &str,
        session_state_blob: Option<&BlobId>,
    ) -> Result<(), StoreError> {
        self.rebuild_index(snapshot)?;
        let mut connection = self.open_database()?;
        create_schema(&connection)?;
        let stored_revision =
            i64::try_from(revision.0).map_err(|_| StoreError::RevisionOutOfRange(revision.0))?;
        let transaction = connection.transaction()?;
        if let Some(session_state_blob) = session_state_blob {
            transaction.execute(
                "INSERT OR REPLACE INTO metadata(key, value) VALUES ('session_state_blob', ?1)",
                params![session_state_blob.0],
            )?;
        }
        transaction.execute(
            "INSERT OR REPLACE INTO command_journal(revision, command_json, snapshot_sha256, session_state_blob) VALUES (?1, ?2, ?3, ?4)",
            params![
                stored_revision,
                serde_json::to_string(command)?,
                snapshot_sha256,
                session_state_blob.map(|value| value.0.as_str()),
            ],
        )?;
        if session_state_blob.is_some() {
            transaction.execute(
                "UPDATE command_journal SET session_state_blob = NULL WHERE revision <> ?1",
                params![stored_revision],
            )?;
        }
        transaction.execute(
            "DELETE FROM command_journal WHERE revision NOT IN (SELECT revision FROM command_journal ORDER BY revision DESC LIMIT ?1)",
            params![i64::try_from(COMMAND_JOURNAL_ENTRY_LIMIT).expect("journal limit fits SQLite")],
        )?;
        transaction.commit()?;
        Ok(())
    }

    pub(super) fn update_session_infrastructure(
        &self,
        _snapshot: &ProjectSnapshot,
        revision: Revision,
        command: &Value,
        snapshot_sha256: &str,
        session_state_blob: Option<&BlobId>,
    ) -> Result<(), StoreError> {
        let mut connection = self.open_database()?;
        create_schema(&connection)?;
        let stored_revision =
            i64::try_from(revision.0).map_err(|_| StoreError::RevisionOutOfRange(revision.0))?;
        let transaction = connection.transaction()?;
        transaction.execute(
            "INSERT OR REPLACE INTO metadata(key, value) VALUES ('index_dirty', '1')",
            [],
        )?;
        if let Some(session_state_blob) = session_state_blob {
            transaction.execute(
                "INSERT OR REPLACE INTO metadata(key, value) VALUES ('session_state_blob', ?1)",
                params![session_state_blob.0],
            )?;
        }
        transaction.execute(
            "INSERT OR REPLACE INTO command_journal(revision, command_json, snapshot_sha256, session_state_blob) VALUES (?1, ?2, ?3, ?4)",
            params![
                stored_revision,
                serde_json::to_string(command)?,
                snapshot_sha256,
                session_state_blob.map(|value| value.0.as_str()),
            ],
        )?;
        if session_state_blob.is_some() {
            transaction.execute(
                "UPDATE command_journal SET session_state_blob = NULL WHERE revision <> ?1",
                params![stored_revision],
            )?;
        }
        transaction.execute(
            "DELETE FROM command_journal WHERE revision NOT IN (SELECT revision FROM command_journal ORDER BY revision DESC LIMIT ?1)",
            params![i64::try_from(COMMAND_JOURNAL_ENTRY_LIMIT).expect("journal limit fits SQLite")],
        )?;
        transaction.commit()?;
        Ok(())
    }

    pub(super) fn open_database(&self) -> Result<Connection, StoreError> {
        let directory = self.root.join(LOCAL_DIRECTORY);
        fs::create_dir_all(directory)?;
        Ok(Connection::open(self.local_database_path())?)
    }
}

pub(super) fn create_schema(connection: &Connection) -> Result<(), rusqlite::Error> {
    connection.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS metadata(
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS entity(
            identity TEXT PRIMARY KEY,
            kind TEXT NOT NULL,
            native_id INTEGER,
            label TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS entity_kind ON entity(kind, native_id);
        CREATE TABLE IF NOT EXISTS derived_reference(
            source TEXT NOT NULL,
            field TEXT NOT NULL,
            target_kind TEXT NOT NULL,
            target_id TEXT NOT NULL,
            resolution TEXT NOT NULL,
            native_path TEXT,
            byte_start INTEGER,
            byte_end INTEGER,
            PRIMARY KEY(source, field, target_kind, target_id)
        );
        CREATE INDEX IF NOT EXISTS reference_target ON derived_reference(target_kind, target_id);
        CREATE TABLE IF NOT EXISTS command_journal(
            revision INTEGER PRIMARY KEY,
            command_json TEXT NOT NULL,
            snapshot_sha256 TEXT NOT NULL,
            session_state_blob TEXT
        );
        ",
    )?;
    upgrade_reference_key(connection)?;
    let has_session_state_blob = {
        let mut statement = connection.prepare("PRAGMA table_info(command_journal)")?;
        let columns = statement.query_map([], |row| row.get::<_, String>(1))?;
        columns
            .collect::<Result<Vec<_>, _>>()?
            .iter()
            .any(|column| column == "session_state_blob")
    };
    if !has_session_state_blob {
        connection.execute(
            "ALTER TABLE command_journal ADD COLUMN session_state_blob TEXT",
            [],
        )?;
    }
    Ok(())
}

fn upgrade_reference_key(connection: &Connection) -> Result<(), rusqlite::Error> {
    let old_key = connection.query_row(
        "SELECT pk FROM pragma_table_info('derived_reference') WHERE name = 'target_kind'",
        [],
        |row| row.get::<_, i64>(0),
    )? == 0;
    if !old_key {
        return Ok(());
    }
    // One physical word may name several consumers. Only the rebuildable cache changes.
    let result = connection.execute_batch(
        "SAVEPOINT reference_key_upgrade;
        ALTER TABLE derived_reference RENAME TO previous_derived_reference;
        CREATE TABLE derived_reference(
            source TEXT NOT NULL,
            field TEXT NOT NULL,
            target_kind TEXT NOT NULL,
            target_id TEXT NOT NULL,
            resolution TEXT NOT NULL,
            native_path TEXT,
            byte_start INTEGER,
            byte_end INTEGER,
            PRIMARY KEY(source, field, target_kind, target_id)
        );
        INSERT INTO derived_reference SELECT * FROM previous_derived_reference;
        DROP TABLE previous_derived_reference;
        CREATE INDEX reference_target ON derived_reference(target_kind, target_id);
        INSERT OR REPLACE INTO metadata(key, value) VALUES ('index_dirty', '1');
        RELEASE reference_key_upgrade;",
    );
    if result.is_err() {
        let _ = connection
            .execute_batch("ROLLBACK TO reference_key_upgrade; RELEASE reference_key_upgrade;");
    }
    result
}

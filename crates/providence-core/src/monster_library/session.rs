mod commands;
mod drafts;
mod operations;
use super::contracts::*;
use super::validation::{
    canonical_template, normalized_label, validate_entry, validated_description,
};
use crate::{
    model::StableId,
    session::{ExpectedRevisionCommand, Revision, SESSION_HISTORY_ENTRY_LIMIT},
};
pub use drafts::MonsterLibraryDraft;
pub use operations::MonsterLibraryOperationReview;
#[derive(Debug, Clone)]
pub struct MonsterLibrarySession {
    catalog: MonsterLibraryCatalog,
    undo: Vec<MonsterLibraryHistoryEntry>,
    redo: Vec<MonsterLibraryHistoryEntry>,
}

impl MonsterLibrarySession {
    pub fn new(catalog: MonsterLibraryCatalog) -> Result<Self, MonsterLibraryError> {
        catalog.validate()?;
        Ok(Self {
            catalog,
            undo: Vec::new(),
            redo: Vec::new(),
        })
    }

    pub fn from_persisted_state(
        mut state: PersistedMonsterLibrarySession,
    ) -> Result<Self, MonsterLibraryError> {
        state.catalog.validate()?;
        state.undo.truncate(SESSION_HISTORY_ENTRY_LIMIT);
        state.redo.truncate(SESSION_HISTORY_ENTRY_LIMIT);
        Ok(Self {
            catalog: state.catalog,
            undo: state.undo,
            redo: state.redo,
        })
    }

    pub fn persisted_state(&self) -> PersistedMonsterLibrarySession {
        PersistedMonsterLibrarySession {
            catalog: self.catalog.clone(),
            undo: self.undo.clone(),
            redo: self.redo.clone(),
        }
    }

    pub fn catalog(&self) -> &MonsterLibraryCatalog {
        &self.catalog
    }

    pub fn revision(&self) -> Revision {
        self.catalog.revision
    }

    pub fn can_undo(&self) -> bool {
        !self.undo.is_empty()
    }

    pub fn can_redo(&self) -> bool {
        !self.redo.is_empty()
    }

    pub fn execute(
        &mut self,
        request: ExpectedRevisionCommand<MonsterLibraryCommand>,
    ) -> Result<MonsterLibraryChangeProjection, MonsterLibraryError> {
        if request.expected_revision != self.catalog.revision {
            return Err(MonsterLibraryError::RevisionConflict {
                expected: request.expected_revision,
                actual: self.catalog.revision,
            });
        }
        match request.command {
            MonsterLibraryCommand::Undo => self.undo(),
            MonsterLibraryCommand::Redo => self.redo(),
            command => self.apply(command),
        }
    }

    fn apply(
        &mut self,
        command: MonsterLibraryCommand,
    ) -> Result<MonsterLibraryChangeProjection, MonsterLibraryError> {
        let before = self.catalog.clone();
        // Handlers mutate only the catalog; rejected commands must leave history and IDs intact.
        let attempted = self.apply_command(command).and_then(|changes| {
            self.catalog.validate()?;
            Ok(changes)
        });
        let changed_entries = match attempted {
            Ok(changes) => changes,
            Err(error) => {
                self.catalog = before;
                return Err(error);
            }
        };
        if changed_entries.is_empty() {
            return Ok(self.unchanged_projection());
        }
        push_history(
            &mut self.undo,
            MonsterLibraryHistoryEntry {
                catalog: before,
                changed_entries: changed_entries.clone(),
            },
        );
        self.redo.clear();
        Ok(self.advance(changed_entries))
    }

    fn undo(&mut self) -> Result<MonsterLibraryChangeProjection, MonsterLibraryError> {
        let entry = self.undo.pop().ok_or(MonsterLibraryError::NothingToUndo)?;
        let current_revision = self.catalog.revision;
        push_history(
            &mut self.redo,
            MonsterLibraryHistoryEntry {
                catalog: self.catalog.clone(),
                changed_entries: entry.changed_entries.clone(),
            },
        );
        self.catalog = entry.catalog;
        self.catalog.revision = current_revision;
        Ok(self.advance(entry.changed_entries))
    }

    fn redo(&mut self) -> Result<MonsterLibraryChangeProjection, MonsterLibraryError> {
        let entry = self.redo.pop().ok_or(MonsterLibraryError::NothingToRedo)?;
        let current_revision = self.catalog.revision;
        push_history(
            &mut self.undo,
            MonsterLibraryHistoryEntry {
                catalog: self.catalog.clone(),
                changed_entries: entry.changed_entries.clone(),
            },
        );
        self.catalog = entry.catalog;
        self.catalog.revision = current_revision;
        Ok(self.advance(entry.changed_entries))
    }

    fn advance(&mut self, mut changed_entries: Vec<StableId>) -> MonsterLibraryChangeProjection {
        let previous_revision = self.catalog.revision;
        self.catalog.revision.0 += 1;
        let changed_entries_total = changed_entries.len();
        changed_entries.truncate(MONSTER_LIBRARY_CHANGE_LIMIT);
        MonsterLibraryChangeProjection {
            previous_revision,
            revision: self.catalog.revision,
            changed_entries,
            changed_entries_total,
            truncated: changed_entries_total > MONSTER_LIBRARY_CHANGE_LIMIT,
            can_undo: self.can_undo(),
            can_redo: self.can_redo(),
        }
    }

    fn next_custom_identity(&mut self) -> StableId {
        loop {
            let identity = StableId(format!(
                "monster-library:custom:{}",
                self.catalog.next_custom_id
            ));
            self.catalog.next_custom_id += 1;
            if self.catalog.entry(&identity).is_none() {
                return identity;
            }
        }
    }
}
fn push_history(history: &mut Vec<MonsterLibraryHistoryEntry>, entry: MonsterLibraryHistoryEntry) {
    history.push(entry);
    if history.len() > SESSION_HISTORY_ENTRY_LIMIT {
        history.remove(0);
    }
}

//! Clones retain canonical state but receive a fresh projection-cache identity.
use super::*;

impl Clone for EditorSession {
    fn clone(&self) -> Self {
        Self {
            snapshot: self.snapshot.clone(),
            revision: self.revision,
            undo: self.undo.clone(),
            redo: self.redo.clone(),
            projections: self.projections.clone(),
            private_staging: self.private_staging,
            staged_changes: self.staged_changes.clone(),
            instance_id: next_session_id(),
        }
    }
}

mod combat;
mod resources;
mod story;
#[cfg(test)]
mod tests;
mod world;

use super::{EditorCommand, EditorSession, SessionError};
use crate::model::StableId;

impl EditorSession {
    // Only unhandled variants pass to the next domain; a matched command executes once.
    pub(super) fn apply_domain_command(
        &mut self,
        command: EditorCommand,
    ) -> Result<Vec<StableId>, SessionError> {
        self.dispatch_messages(command)
    }
}

use super::super::model::{BackupState, Replacement};
use super::*;
use std::path::Path;

impl Work {
    pub(super) fn publish(
        &self,
        candidate: &Path,
        destination: &Path,
        format: Format,
    ) -> Result<(), String> {
        let replacement = self
            .record
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .replacement
            .clone();
        let Some(replacement) = replacement else {
            return artifact::publish(candidate, destination, format);
        };
        if artifact::digest(destination, format)?.0 != replacement.expected_sha256 {
            return Err(
                "export-artifact-changed: original changed before replacement; no move attempted"
                    .into(),
            );
        }
        move_original(destination, &replacement.backup_path, format)?;
        let result = self.finish_replacement(candidate, destination, format, &replacement);
        if let Err(error) = result {
            return self.restore_original(destination, format, &replacement, error);
        }
        Ok(())
    }
    fn finish_replacement(
        &self,
        candidate: &Path,
        destination: &Path,
        format: Format,
        replacement: &Replacement,
    ) -> Result<(), String> {
        if artifact::digest(&replacement.backup_path, format)?.0 != replacement.expected_sha256 {
            return Err(
                "export-artifact-changed: moved original differs from the authorized hash".into(),
            );
        }
        self.update(|record| record.replacement.as_mut().unwrap().state = BackupState::Retained)?;
        #[cfg(test)]
        self.pause(TestPoint::AfterBackup)?;
        self.check_cancel()?;
        self.support_current()?;
        artifact::publish(candidate, destination, format)
    }
    fn restore_original(
        &self,
        destination: &Path,
        format: Format,
        replacement: &Replacement,
        cause: String,
    ) -> Result<(), String> {
        let restoration = move_original(&replacement.backup_path, destination, format);
        let state = if restoration.is_ok() {
            BackupState::Restored
        } else {
            BackupState::RestoreBlocked
        };
        // The original is retained even if journal persistence or restoration fails.
        let journal = self.update(|record| record.replacement.as_mut().unwrap().state = state);
        if let Err(error) = restoration {
            return Err(format!(
                "export-replacement-restore-blocked: {cause}; {error}; original retained at {}; journal: {journal:?}",
                replacement.backup_path.display()
            ));
        }
        journal?;
        Err(cause)
    }
}
fn move_original(source: &Path, destination: &Path, format: Format) -> Result<(), String> {
    if format == Format::Classic {
        providence_publication::publish_directory_noclobber(source, destination)
    } else {
        providence_publication::move_file_noclobber(source, destination)
    }
    .map_err(|error| error.to_string())
}

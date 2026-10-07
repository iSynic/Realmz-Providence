use crate::level_settings::{LevelSettingsEdit, prepare};
use crate::model::StableId;
use crate::session::{EditorSession, SessionError};

impl EditorSession {
    pub(super) fn apply_level_settings(
        &mut self,
        identity: StableId,
        edit: LevelSettingsEdit,
    ) -> Result<Vec<StableId>, SessionError> {
        let prepared = prepare(&self.snapshot, &identity, &edit)?;
        if !prepared.preview.can_apply {
            return Err(SessionError::InvalidClassicImport(
                "The level settings already match. No changes were applied.".into(),
            ));
        }
        let mut changed = self.set_map_runtime_metadata(identity.clone(), prepared.runtime)?;
        if let Some((landlook, tile, scale)) = prepared.shared_base {
            changed.extend(self.set_landlook_catalog_base(landlook, tile, scale)?);
        }
        self.snapshot
            .world
            .maps
            .iter_mut()
            .find(|map| map.identity == identity)
            .expect("validated level")
            .name = edit.name;
        changed.sort();
        changed.dedup();
        Ok(changed)
    }
}

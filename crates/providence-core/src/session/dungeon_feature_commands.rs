use crate::dungeon_features::{DungeonFeatureEdit, invalid, preview_dungeon_features};
use crate::model::{CLASSIC_MAP_SIZE, StableId};
use crate::session::{EditorSession, SessionError};

impl EditorSession {
    pub(super) fn apply_dungeon_features(
        &mut self,
        identity: StableId,
        edit: DungeonFeatureEdit,
    ) -> Result<Vec<StableId>, SessionError> {
        // Plan every cell first: Session errors must never leave a partially written selection.
        let preview = preview_dungeon_features(&self.snapshot, &identity, &edit)?;
        self.write_dungeon_features(identity, preview.painted_cells)
    }

    pub(super) fn write_dungeon_features(
        &mut self,
        identity: StableId,
        painted_cells: Vec<crate::session::LandMapCellPaint>,
    ) -> Result<Vec<StableId>, SessionError> {
        if painted_cells.is_empty() {
            return Err(invalid(
                &identity,
                "the selected features already match; there are no changes to apply",
            ));
        }
        let map = self
            .snapshot
            .world
            .maps
            .iter_mut()
            .find(|map| map.identity == identity)
            .expect("the preview validated this map");
        for cell in painted_cells {
            map.tiles[usize::from(cell.y) * CLASSIC_MAP_SIZE + usize::from(cell.x)] = cell.tile;
        }
        Ok(vec![identity])
    }
}

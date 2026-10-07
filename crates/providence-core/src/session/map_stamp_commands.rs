use crate::{
    map_stamp::{StampPlacement, preview},
    model::{LevelType, StableId},
    session::{EditorSession, SessionError},
};

impl EditorSession {
    pub(super) fn apply_map_stamp(
        &mut self,
        identity: StableId,
        placement: StampPlacement,
    ) -> Result<Vec<StableId>, SessionError> {
        let plan = preview(&self.snapshot, &identity, &placement)?;
        match placement.resource.level_type {
            LevelType::Land => self.write_land_terrain(identity, plan.painted_cells),
            LevelType::Dungeon => self.write_dungeon_features(identity, plan.painted_cells),
        }
    }
}

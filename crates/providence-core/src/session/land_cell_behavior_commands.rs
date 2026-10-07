use super::{EditorSession, SessionError};
use crate::{
    land_cell_behavior::{LandCellBehaviorEdit, preview},
    map_paint::invalid,
    model::{CLASSIC_MAP_SIZE, StableId},
};

impl EditorSession {
    pub(super) fn apply_land_cell_behavior(
        &mut self,
        identity: StableId,
        edit: LandCellBehaviorEdit,
    ) -> Result<Vec<StableId>, SessionError> {
        let plan = preview(&self.snapshot, &identity, &edit)?;
        if !plan.changed {
            return Err(invalid(
                &identity,
                "This cell already matches. No changes were applied.",
            ));
        }
        let map = self
            .snapshot
            .world
            .maps
            .iter_mut()
            .find(|map| map.identity == identity)
            .expect("validated map");
        map.tiles[usize::from(edit.y) * CLASSIC_MAP_SIZE + usize::from(edit.x)] = plan.after;
        let mut changed = vec![identity];
        if let Some(solid) = edit.solid {
            let catalog = self
                .snapshot
                .world
                .special_land_solidity
                .as_mut()
                .expect("validated passability row");
            let row = &mut catalog.solid[usize::from(
                plan.special_resource_id
                    .expect("validated resource")
                    .unsigned_abs(),
            )];
            if *row != solid {
                *row = solid;
                changed.push(StableId("special-land-solidity".into()));
            }
        }
        Ok(changed)
    }
}

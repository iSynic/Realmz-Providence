use crate::codecs::LAND_LAYOUT_CELLS;
use crate::codecs::LAND_LAYOUT_COLUMNS;
use crate::codecs::classic_land_index;
use crate::model::LandLayout;
use crate::model::LevelType;
use crate::model::StableId;
use crate::session::EditorSession;
use crate::session::errors::SessionError;

impl EditorSession {
    pub(super) fn set_land_layout_cell(
        &mut self,
        row: u8,
        column: u8,
        target: Option<StableId>,
    ) -> Result<Vec<StableId>, SessionError> {
        let preview = crate::land_layout_edit::preview_layout_placement(
            &self.snapshot,
            row,
            column,
            target.as_ref(),
        )?;
        let layout = self
            .snapshot
            .world
            .land_layout
            .get_or_insert_with(|| LandLayout {
                cells: vec![0; LAND_LAYOUT_CELLS],
            });
        let previous_value =
            layout.cells[usize::from(row) * LAND_LAYOUT_COLUMNS + usize::from(column)];
        for change in preview.changes {
            layout.cells
                [usize::from(change.row) * LAND_LAYOUT_COLUMNS + usize::from(change.column)] =
                change.value;
        }
        let mut changed = vec![StableId("land-layout".into())];
        changed.extend(target);
        if let Some(previous_index) = classic_land_index(previous_value)
            && let Some(previous) =
                self.snapshot.world.maps.iter().find(|map| {
                    map.level_type == LevelType::Land && map.native_index == previous_index
                })
        {
            changed.push(previous.identity.clone());
        }
        changed.sort();
        changed.dedup();
        Ok(changed)
    }

    pub(super) fn remove_land_layout(&mut self) -> Result<Vec<StableId>, SessionError> {
        self.snapshot.world.land_layout = None;
        Ok(vec![StableId("land-layout".into())])
    }
}

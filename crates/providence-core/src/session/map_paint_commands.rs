use crate::codecs::paint_land_cell_preserving_markers;
use crate::map_paint::{
    LandTerrainPaint, invalid, land_map, preview_land_terrain_paint, validate_cells,
};
use crate::model::LevelType;
use crate::model::StableId;
use crate::session::EditorSession;
use crate::session::LandMapCellPaint;
use crate::session::errors::SessionError;
use std::collections::BTreeSet;

impl EditorSession {
    pub(super) fn apply_magic_brush(
        &mut self,
        command: crate::smart_terrain::staged::Apply,
    ) -> Result<Vec<StableId>, SessionError> {
        let plan = crate::smart_terrain::staged::preview(
            &self.snapshot,
            &command.identity,
            &command.intent,
            &command.atlas,
            &mut || false,
        )?;
        self.write_land_terrain(command.identity, plan.paint.painted_cells)
    }

    pub(super) fn apply_smart_terrain(
        &mut self,
        command: crate::smart_terrain::Apply,
    ) -> Result<Vec<StableId>, SessionError> {
        let crate::smart_terrain::Apply {
            identity,
            intent,
            atlas,
        } = command;
        let plan = crate::smart_terrain::preview_mapped(
            &self.snapshot,
            &identity,
            &intent,
            atlas.as_ref(),
            &mut || false,
        )?;
        self.write_land_terrain(identity, plan.paint.painted_cells)
    }

    pub(super) fn paint_land_raw_cells(
        &mut self,
        identity: StableId,
        cells: Vec<LandMapCellPaint>,
    ) -> Result<Vec<StableId>, SessionError> {
        validate_cells(&identity, &cells)?;
        let level_index = land_map(&self.snapshot, &identity)?.native_index;
        let action_points = self
            .snapshot
            .world
            .action_points
            .iter()
            .filter(|row| {
                row.level_type == LevelType::Land
                    && row.level_index == level_index
                    && row.chance_percent > 0
            })
            .filter_map(|row| {
                row.coordinate
                    .map(|coordinate| (coordinate.x, coordinate.y))
            })
            .collect::<BTreeSet<_>>();
        let map = self
            .snapshot
            .world
            .maps
            .iter_mut()
            .find(|map| map.identity == identity)
            .expect("map presence was validated");
        for cell in cells {
            let index = usize::from(cell.y) * crate::model::CLASSIC_MAP_SIZE + usize::from(cell.x);
            map.tiles[index] = paint_land_cell_preserving_markers(
                map.tiles[index],
                cell.tile,
                action_points.contains(&(cell.x, cell.y)),
            );
        }
        Ok(vec![identity])
    }

    pub(super) fn paint_land_terrain(
        &mut self,
        identity: StableId,
        paint: LandTerrainPaint,
    ) -> Result<Vec<StableId>, SessionError> {
        let preview = preview_land_terrain_paint(&self.snapshot, &identity, &paint)?;
        self.write_land_terrain(identity, preview.painted_cells)
    }

    pub(super) fn write_land_terrain(
        &mut self,
        identity: StableId,
        painted_cells: Vec<LandMapCellPaint>,
    ) -> Result<Vec<StableId>, SessionError> {
        if painted_cells.is_empty() {
            return Err(invalid(
                &identity,
                "the terrain operation has no changed cells",
            ));
        }
        let map = self
            .snapshot
            .world
            .maps
            .iter_mut()
            .find(|map| map.identity == identity)
            .expect("map presence was validated");
        for cell in painted_cells {
            map.tiles[usize::from(cell.y) * crate::model::CLASSIC_MAP_SIZE + usize::from(cell.x)] =
                cell.tile;
        }
        Ok(vec![identity])
    }
}

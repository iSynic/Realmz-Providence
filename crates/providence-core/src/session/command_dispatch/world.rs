use super::super::{EditorCommand, EditorSession, SessionError};
use crate::model::StableId;

impl EditorSession {
    pub(super) fn dispatch_map_cells(
        &mut self,
        command: EditorCommand,
    ) -> Result<Vec<StableId>, SessionError> {
        let changed = match command {
            EditorCommand::ApplyMagicBrush(command) => self.apply_magic_brush(command)?,
            EditorCommand::AcceptTerrainMapping(command) => crate::terrain_mapping::accept(
                &mut self.snapshot,
                &command.identity,
                command.edit,
                &command.atlas,
            )
            .map_err(SessionError::InvalidClassicImport)?,
            EditorCommand::ApplyLandCellBehavior { identity, edit } => {
                self.apply_land_cell_behavior(identity, edit)?
            }
            EditorCommand::ApplyMapStamp {
                identity,
                placement,
            } => self.apply_map_stamp(identity, placement)?,
            EditorCommand::CreateMap { level_type } => self.create_map(level_type)?,
            EditorCommand::DuplicateMap { source } => self.duplicate_map(source)?,
            EditorCommand::PaintLandMapCells { identity, cells } => {
                self.paint_land_raw_cells(identity, cells)?
            }
            EditorCommand::PaintLandTerrain { identity, paint } => {
                self.paint_land_terrain(identity, paint)?
            }
            EditorCommand::ApplyLandPaintIntent { identity, intent } => {
                let plan = crate::land_paint_intent::preview(&self.snapshot, &identity, &intent)?;
                self.write_land_terrain(identity, plan.painted_cells)?
            }
            EditorCommand::ApplySmartTerrain(command) => self.apply_smart_terrain(command)?,
            EditorCommand::UpdateLandMapCell {
                identity,
                x,
                y,
                tile,
            } => self.update_land_map_cell(identity, x, y, tile)?,
            EditorCommand::UpdateDungeonMapPrimitive {
                identity,
                x,
                y,
                primitive,
                enabled,
            } => self.update_dungeon_map_primitive(identity, x, y, primitive, enabled)?,
            EditorCommand::ApplyDungeonFeatures { identity, edit } => {
                self.apply_dungeon_features(identity, edit)?
            }
            EditorCommand::SetLandLayoutCell {
                row,
                column,
                target,
            } => self.set_land_layout_cell(row, column, target)?,
            EditorCommand::RemoveLandLayout => self.remove_land_layout()?,
            command => return self.dispatch_player_maps(command),
        };
        Ok(changed)
    }

    pub(super) fn dispatch_player_maps(
        &mut self,
        command: EditorCommand,
    ) -> Result<Vec<StableId>, SessionError> {
        let changed = match command {
            EditorCommand::ImportClassicPlayerMapSlice {
                annex_blob,
                sources,
                player_maps,
            } => self.import_classic_player_map_slice(annex_blob, sources, player_maps)?,
            EditorCommand::UpdatePlayerMap { player_map } => self.update_player_map(player_map)?,
            EditorCommand::ApplyPlayerMapDraft { player_map, names } => {
                self.apply_player_map_draft(player_map, names)?
            }
            EditorCommand::CreatePlayerMap => self.create_player_map()?,
            EditorCommand::ImportClassicPlayerMapNames {
                annex_blob,
                sources,
                catalog,
            } => self.import_classic_player_map_names(annex_blob, sources, catalog)?,
            EditorCommand::UpdatePlayerMapNames {
                native_id,
                available_name,
                unavailable_name,
            } => self.update_player_map_names(native_id, available_name, unavailable_name)?,
            command => return self.dispatch_random_rectangles(command),
        };
        Ok(changed)
    }

    pub(super) fn dispatch_random_rectangles(
        &mut self,
        command: EditorCommand,
    ) -> Result<Vec<StableId>, SessionError> {
        let changed = match command {
            EditorCommand::SetMapRuntimeMetadata { identity, metadata } => {
                self.set_map_runtime_metadata(identity, *metadata)?
            }
            EditorCommand::ApplyLevelSettings { identity, edit } => {
                self.apply_level_settings(identity, edit)?
            }
            EditorCommand::UpsertMapRandomRectangle { map, rectangle } => {
                self.upsert_map_random_rectangle(map, rectangle)?
            }
            EditorCommand::ApplyRandomRectangleDraft { map, rectangle } => {
                let plan =
                    crate::random_region_authoring::preview(&self.snapshot, &map, &rectangle)
                        .map_err(SessionError::InvalidClassicImport)?;
                if !plan.can_apply {
                    return Err(SessionError::InvalidClassicImport(
                        "This region already matches. No changes were applied.".into(),
                    ));
                }
                self.write_map_random_rectangle(map, *rectangle)?
            }
            EditorCommand::RemoveMapRandomRectangle { map, slot } => {
                self.remove_map_random_rectangle(map, slot)?
            }
            EditorCommand::RetargetRandomRectangleDoor {
                source,
                door_slot,
                target_native_id,
            } => self.retarget_random_rectangle_door(source, door_slot, target_native_id)?,
            EditorCommand::RetargetRandomRectangleReference {
                source,
                field,
                target_native_id,
            } => self.retarget_random_rectangle_reference(source, field, target_native_id)?,
            EditorCommand::RetargetRandomRectangleBattleRange {
                source,
                low_id,
                high_id,
            } => self.retarget_random_rectangle_battle_range(source, low_id, high_id)?,
            command => return self.dispatch_terrain(command),
        };
        Ok(changed)
    }

    pub(super) fn dispatch_terrain(
        &mut self,
        command: EditorCommand,
    ) -> Result<Vec<StableId>, SessionError> {
        let changed = match command {
            EditorCommand::UpsertTerrainProfile { profile } => {
                self.upsert_terrain_profile(*profile)?
            }
            EditorCommand::ImportLandlookMapstatsCatalog { catalog, profiles } => {
                self.import_landlook_mapstats_catalog(catalog, profiles)?
            }
            EditorCommand::ApplyCustomLandlook {
                landlook,
                catalog,
                profiles,
                asset,
                assign_map,
                replace,
            } => {
                self.apply_custom_landlook(catalog, profiles, asset, landlook, assign_map, replace)?
            }
            EditorCommand::SetLandlookCatalogBase {
                landlook,
                base_tile,
                base_scale,
            } => self.set_landlook_catalog_base(landlook, base_tile, base_scale)?,
            EditorCommand::SetLandlookRangeSlot {
                landlook,
                slot,
                first_tile,
                last_tile,
            } => self.set_landlook_range_slot(landlook, slot, first_tile, last_tile)?,
            EditorCommand::SetSpecialLandSolidityCatalog { catalog } => {
                self.set_special_land_solidity_catalog(*catalog)?
            }
            command => return self.dispatch_world_import(command),
        };
        Ok(changed)
    }

    pub(super) fn dispatch_world_import(
        &mut self,
        command: EditorCommand,
    ) -> Result<Vec<StableId>, SessionError> {
        let changed = match command {
            command @ EditorCommand::ImportClassicLandSlice { .. } => {
                self.import_classic_land_slice(command)?
            }
            EditorCommand::ImportClassicDungeonSlice {
                annex_blob,
                sources,
                maps,
                action_points,
            } => self.import_classic_dungeon_slice(annex_blob, sources, maps, action_points)?,
            command => return self.dispatch_media(command),
        };
        Ok(changed)
    }
}

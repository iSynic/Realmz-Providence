use super::terrain_commands::validate_landlook_mapstats_catalog;
use super::{EditorSession, SessionError};
use crate::{custom_landlook::validate_destination, model::*};

impl EditorSession {
    pub(super) fn apply_custom_landlook(
        &mut self,
        catalog: Option<Box<LandlookCatalogMetadata>>,
        profiles: Vec<TerrainProfile>,
        asset: Box<AssetDescriptor>,
        look: i8,
        assign: Option<StableId>,
        replace: bool,
    ) -> Result<Vec<StableId>, SessionError> {
        self.validate_custom_landlook(
            catalog.as_deref(),
            &profiles,
            &asset,
            look,
            assign.as_ref(),
            replace,
        )?;
        let mut changed = if let Some(catalog) = catalog {
            self.import_landlook_mapstats_catalog(catalog, profiles)?
        } else {
            vec![]
        };
        changed.extend(self.apply_asset_upsert(*asset)?);
        if let Some(identity) = assign {
            let metadata = self
                .snapshot
                .landlook_catalogs
                .iter()
                .find(|row| row.landlook == look)
                .expect("validated metadata");
            let map = self
                .snapshot
                .world
                .maps
                .iter_mut()
                .find(|map| map.identity == identity)
                .expect("validated map");
            let runtime = map.runtime.as_mut().expect("validated renderer");
            runtime.landlook = Some(look);
            runtime.tileset_id = StableId(format!("classic.landlook.{look}"));
            runtime.base_tile = Some(metadata.base_tile);
            runtime.base_scale = Some(metadata.base_scale);
            changed.push(identity);
        }
        self.snapshot.normalize();
        changed.sort();
        changed.dedup();
        Ok(changed)
    }
    fn validate_custom_landlook(
        &self,
        catalog: Option<&LandlookCatalogMetadata>,
        profiles: &[TerrainProfile],
        asset: &AssetDescriptor,
        look: i8,
        assign: Option<&StableId>,
        replace: bool,
    ) -> Result<(), SessionError> {
        validate_destination(look).map_err(SessionError::InvalidClassicImport)?;
        validate_artwork(asset, look)?;
        let key = ClassicResourceKey {
            resource_type: "PICT".into(),
            resource_id: 300 + i32::from(look),
        };
        let occupied = self
            .snapshot
            .assets
            .iter()
            .any(|row| row.classic_resource.as_ref() == Some(&key))
            || self
                .snapshot
                .landlook_catalogs
                .iter()
                .any(|row| row.landlook == look);
        if occupied && !replace {
            return Err(SessionError::InvalidClassicImport(
                "The custom slot is occupied. Review replacement before applying.".into(),
            ));
        }
        if let Some(catalog) = catalog {
            if catalog.landlook != look {
                return Err(SessionError::InvalidClassicImport(
                    "The behavior destination differs from the artwork.".into(),
                ));
            }
            validate_landlook_mapstats_catalog(catalog, profiles)?;
        } else if !profiles.is_empty()
            || !self
                .snapshot
                .landlook_catalogs
                .iter()
                .any(|row| row.landlook == look)
        {
            return Err(SessionError::InvalidClassicImport(
                "Create the Custom Landlook behavior before replacing its artwork.".into(),
            ));
        }
        self.check_asset_upsert(asset)?;
        self.validate_custom_map(assign)?;
        Ok(())
    }
    fn validate_custom_map(&self, assign: Option<&StableId>) -> Result<(), SessionError> {
        if let Some(identity) = assign
            && !self.snapshot.world.maps.iter().any(|map| {
                &map.identity == identity
                    && map.level_type == LevelType::Land
                    && map.runtime.is_some()
            })
        {
            return Err(SessionError::InvalidClassicImport(
                "The originating Land map no longer has a renderer.".into(),
            ));
        }
        Ok(())
    }
}

fn validate_artwork(asset: &AssetDescriptor, look: i8) -> Result<(), SessionError> {
    let key = ClassicResourceKey {
        resource_type: "PICT".into(),
        resource_id: 300 + i32::from(look),
    };
    if asset.classic_resource.as_ref() != Some(&key)
        || asset.kind != "tileset"
        || asset.mime_type.as_deref() != Some("image/png")
        || asset.width != Some(640)
        || asset.height != Some(320)
        || asset.tile_width != Some(32)
        || asset.tile_height != Some(32)
        || asset.columns != Some(20)
        || asset.rows != Some(10)
        || asset.landlook != Some(look)
    {
        return Err(SessionError::InvalidClassicImport(
            "Custom Landlook artwork must retain its exact 20 by 10 PICT grid.".into(),
        ));
    }
    Ok(())
}

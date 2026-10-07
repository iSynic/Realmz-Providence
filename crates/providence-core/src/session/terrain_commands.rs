use crate::codecs::SPECIAL_LAND_SOLIDITY_BYTES;
use crate::model::LandlookCatalogMetadata;
use crate::model::LevelType;
use crate::model::MapRuntimeMetadata;
use crate::model::SpecialLandSolidityCatalog;
use crate::model::StableId;
use crate::model::TerrainProfile;
use crate::session::EditorSession;
use crate::session::errors::SessionError;
use std::collections::BTreeSet;

impl EditorSession {
    pub(super) fn set_map_runtime_metadata(
        &mut self,
        identity: StableId,
        metadata: MapRuntimeMetadata,
    ) -> Result<Vec<StableId>, SessionError> {
        let map = self
            .snapshot
            .world
            .maps
            .iter_mut()
            .find(|map| map.identity == identity)
            .ok_or_else(|| SessionError::MapNotFound(identity.clone()))?;
        map.runtime = Some(metadata);
        Ok(vec![identity])
    }

    pub(super) fn upsert_terrain_profile(
        &mut self,
        profile: TerrainProfile,
    ) -> Result<Vec<StableId>, SessionError> {
        let identity = StableId(format!(
            "terrain:{}:{}",
            profile
                .landlook
                .map_or_else(|| "shared".into(), |value| value.to_string()),
            profile.tile
        ));
        if let Some(existing) =
            self.snapshot.terrain_catalog.iter_mut().find(|existing| {
                existing.landlook == profile.landlook && existing.tile == profile.tile
            })
        {
            *existing = profile;
        } else {
            self.snapshot.terrain_catalog.push(profile);
        }
        self.snapshot.normalize();
        Ok(vec![identity])
    }

    pub(super) fn import_landlook_mapstats_catalog(
        &mut self,
        catalog: Box<LandlookCatalogMetadata>,
        profiles: Vec<TerrainProfile>,
    ) -> Result<Vec<StableId>, SessionError> {
        validate_landlook_mapstats_catalog(&catalog, &profiles)?;
        let landlook = catalog.landlook;
        let catalog_identity = StableId(format!("landlook:{landlook}"));
        let mut identities = std::iter::once(catalog_identity)
            .chain(
                self.snapshot
                    .terrain_catalog
                    .iter()
                    .filter(|profile| profile.landlook == Some(landlook))
                    .chain(profiles.iter())
                    .map(|profile| StableId(format!("terrain:{landlook}:{}", profile.tile))),
            )
            .chain(
                self.snapshot
                    .world
                    .maps
                    .iter()
                    .filter(|map| {
                        map.level_type == LevelType::Land
                            && map.runtime.as_ref().and_then(|runtime| runtime.landlook)
                                == Some(landlook)
                    })
                    .map(|map| map.identity.clone()),
            )
            .collect::<BTreeSet<_>>();
        self.snapshot
            .terrain_catalog
            .retain(|profile| profile.landlook != Some(landlook));
        self.snapshot.terrain_catalog.extend(profiles);
        self.snapshot
            .landlook_catalogs
            .retain(|existing| existing.landlook != landlook);
        self.snapshot.landlook_catalogs.push(*catalog);
        let metadata = self
            .snapshot
            .landlook_catalogs
            .iter()
            .find(|existing| existing.landlook == landlook)
            .expect("imported landlook metadata exists");
        for map in &mut self.snapshot.world.maps {
            if map.level_type == LevelType::Land
                && let Some(runtime) = &mut map.runtime
                && runtime.landlook == Some(landlook)
            {
                runtime.base_tile = Some(metadata.base_tile);
                runtime.base_scale = Some(metadata.base_scale);
                identities.insert(map.identity.clone());
            }
        }
        self.snapshot.normalize();
        Ok(identities.into_iter().collect())
    }

    pub(super) fn set_landlook_catalog_base(
        &mut self,
        landlook: i8,
        base_tile: i16,
        base_scale: i16,
    ) -> Result<Vec<StableId>, SessionError> {
        let catalog = self
            .snapshot
            .landlook_catalogs
            .iter_mut()
            .find(|catalog| catalog.landlook == landlook)
            .ok_or_else(|| {
                SessionError::InvalidClassicImport(format!(
                    "landlook {landlook} has no imported Map Stats catalog"
                ))
            })?;
        catalog.base_tile = base_tile;
        catalog.base_scale = base_scale;
        let mut identities = vec![StableId(format!("landlook:{landlook}"))];
        for map in &mut self.snapshot.world.maps {
            if map.level_type == LevelType::Land
                && let Some(runtime) = &mut map.runtime
                && runtime.landlook == Some(landlook)
            {
                runtime.base_tile = Some(base_tile);
                runtime.base_scale = Some(base_scale);
                identities.push(map.identity.clone());
            }
        }
        Ok(identities)
    }

    pub(super) fn set_landlook_range_slot(
        &mut self,
        landlook: i8,
        slot: u8,
        first_tile: i16,
        last_tile: i16,
    ) -> Result<Vec<StableId>, SessionError> {
        if slot as usize >= crate::codecs::MAPSTATS_RANGE_SLOTS {
            return Err(SessionError::InvalidClassicImport(format!(
                "custom landlook range slot must be 0 through {}; found {slot}",
                crate::codecs::MAPSTATS_RANGE_SLOTS - 1
            )));
        }
        let catalog = self
            .snapshot
            .landlook_catalogs
            .iter_mut()
            .find(|catalog| catalog.landlook == landlook)
            .ok_or_else(|| {
                SessionError::InvalidClassicImport(format!(
                    "landlook {landlook} has no imported Map Stats catalog"
                ))
            })?;
        if crate::codecs::custom_landlook_source_name(landlook).is_none() {
            return Err(SessionError::InvalidClassicImport(format!(
                "landlook {landlook} is not a scenario-owned custom landlook"
            )));
        }
        if catalog.range_slots.len() != crate::codecs::MAPSTATS_RANGE_SLOTS {
            return Err(SessionError::InvalidClassicImport(
                "custom landlook range metadata must be reimported before it can be edited".into(),
            ));
        }
        let range = catalog
            .range_slots
            .iter_mut()
            .find(|range| range.slot == slot)
            .expect("validated complete custom landlook range slots");
        range.first_tile = first_tile;
        range.last_tile = last_tile;
        Ok(vec![StableId(format!("landlook:{landlook}:range:{slot}"))])
    }

    pub(super) fn set_special_land_solidity_catalog(
        &mut self,
        catalog: SpecialLandSolidityCatalog,
    ) -> Result<Vec<StableId>, SessionError> {
        if catalog.source != "Data Solids" || catalog.solid.len() != SPECIAL_LAND_SOLIDITY_BYTES {
            return Err(SessionError::InvalidClassicImport(
                "Special Land solidity must own exactly 1,024 Data Solids Boolean values".into(),
            ));
        }
        self.snapshot.world.special_land_solidity = Some(catalog);
        Ok(vec![StableId("special-land-solidity".into())])
    }
}

pub(super) fn validate_landlook_mapstats_catalog(
    catalog: &LandlookCatalogMetadata,
    profiles: &[TerrainProfile],
) -> Result<(), SessionError> {
    if catalog.landlook < -1 {
        return Err(SessionError::InvalidClassicImport(
            "Map Stats landlook must be -1 for Combat Data BD or nonnegative".into(),
        ));
    }
    if catalog.source.is_empty() {
        return Err(SessionError::InvalidClassicImport(
            "Map Stats source label must not be empty".into(),
        ));
    }
    if catalog.byte_length < crate::codecs::MAPSTATS_CORE_BYTES as u64 {
        return Err(SessionError::InvalidClassicImport(format!(
            "Map Stats source has {} bytes; at least {} are required",
            catalog.byte_length,
            crate::codecs::MAPSTATS_CORE_BYTES
        )));
    }
    if profiles.len() != crate::codecs::MAPSTATS_RECORDS {
        return Err(SessionError::InvalidClassicImport(format!(
            "Map Stats catalog must contain exactly {} terrain profiles",
            crate::codecs::MAPSTATS_RECORDS
        )));
    }
    validate_mapstats_ranges(catalog)?;
    for (tile, profile) in profiles.iter().enumerate() {
        let expected_tile = if catalog.landlook == -1 {
            tile as i16 + 200
        } else {
            tile as i16
        };
        if profile.tile != expected_tile
            || profile.landlook != Some(catalog.landlook)
            || profile.source != catalog.source
            || profile.source_blob.as_ref() != Some(&catalog.source_blob)
            || profile.movement_sound_id.is_none()
        {
            return Err(SessionError::InvalidClassicImport(format!(
                "Map Stats profile {tile} has inconsistent identity or source attribution"
            )));
        }
    }
    Ok(())
}

fn validate_mapstats_ranges(catalog: &LandlookCatalogMetadata) -> Result<(), SessionError> {
    if !catalog.range_slots.is_empty() {
        if catalog.range_slots.len() != crate::codecs::MAPSTATS_RANGE_SLOTS {
            return Err(SessionError::InvalidClassicImport(format!(
                "Map Stats range tail must contain exactly {} slots",
                crate::codecs::MAPSTATS_RANGE_SLOTS
            )));
        }
        let slots = catalog
            .range_slots
            .iter()
            .map(|range| range.slot)
            .collect::<BTreeSet<_>>();
        if slots.len() != crate::codecs::MAPSTATS_RANGE_SLOTS
            || !slots
                .iter()
                .copied()
                .eq(0..crate::codecs::MAPSTATS_RANGE_SLOTS as u8)
        {
            return Err(SessionError::InvalidClassicImport(
                "Map Stats range slot identities must be complete and unique".into(),
            ));
        }
    }
    Ok(())
}

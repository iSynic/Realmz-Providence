use super::{ClassicCompatibilitySources, ClassicSliceCompileError, NativeManifest};
use crate::codecs::{
    NativeFileFamily, encode_custom_landlook_mapstats, encode_dungeon_action_points,
    encode_dungeon_maps, encode_dungeon_random_levels, encode_land_action_points,
    encode_land_layout, encode_land_maps, encode_land_random_levels, encode_player_maps,
};
use crate::model::ProjectSnapshot;

pub(super) fn compile(
    snapshot: &ProjectSnapshot,
    sources: ClassicCompatibilitySources<'_>,
    manifest: &mut NativeManifest,
) -> Result<(), ClassicSliceCompileError> {
    custom_landlooks(snapshot, sources, manifest)?;
    land(snapshot, sources, manifest)?;
    player_maps(snapshot, sources, manifest)?;
    dungeon(snapshot, sources, manifest)
}

fn custom_landlooks(
    snapshot: &ProjectSnapshot,
    sources: ClassicCompatibilitySources<'_>,
    manifest: &mut NativeManifest,
) -> Result<(), ClassicSliceCompileError> {
    for (landlook, native_path, source) in [
        (6_i8, "Data Custom 1 BD", sources.data_custom_1_bd),
        (7_i8, "Data Custom 2 BD", sources.data_custom_2_bd),
        (8_i8, "Data Custom 3 BD", sources.data_custom_3_bd),
    ] {
        if let Some(catalog) = snapshot
            .landlook_catalogs
            .iter()
            .find(|catalog| catalog.landlook == landlook)
        {
            let profiles = snapshot
                .terrain_catalog
                .iter()
                .filter(|profile| profile.landlook == Some(landlook))
                .cloned()
                .collect::<Vec<_>>();
            manifest.insert_generated(
                native_path,
                NativeFileFamily::CustomLandlookMetadata,
                encode_custom_landlook_mapstats(catalog, &profiles, source.unwrap_or_default())?,
            );
        }
    }
    Ok(())
}

fn land(
    snapshot: &ProjectSnapshot,
    sources: ClassicCompatibilitySources<'_>,
    manifest: &mut NativeManifest,
) -> Result<(), ClassicSliceCompileError> {
    let land_level_count = snapshot
        .world
        .maps
        .iter()
        .filter(|map| map.level_type == crate::model::LevelType::Land)
        .count();
    if land_level_count > 0 {
        manifest.insert_generated(
            "Data LD",
            NativeFileFamily::LandMaps,
            encode_land_maps(&snapshot.world.maps, sources.data_ld)?,
        );
        manifest.insert_generated(
            "Data DD",
            NativeFileFamily::LandActionPoints,
            encode_land_action_points(
                &snapshot.world.action_points,
                land_level_count,
                sources.data_dd,
            )?,
        );
        if sources.data_rd.is_some()
            || snapshot
                .world
                .maps
                .iter()
                .any(|map| map.level_type == crate::model::LevelType::Land && map.runtime.is_some())
        {
            manifest.insert_generated(
                "Data RD",
                NativeFileFamily::LandRandomLevels,
                encode_land_random_levels(&snapshot.world.maps, sources.data_rd)?,
            );
        }
        if let Some(layout) = &snapshot.world.land_layout {
            manifest.insert_generated(
                "Layout",
                NativeFileFamily::LandLayout,
                encode_land_layout(layout, sources.layout)?,
            );
        }
    }
    Ok(())
}

fn player_maps(
    snapshot: &ProjectSnapshot,
    sources: ClassicCompatibilitySources<'_>,
    manifest: &mut NativeManifest,
) -> Result<(), ClassicSliceCompileError> {
    if !snapshot.world.player_maps.is_empty() || sources.data_md2.is_some() {
        manifest.insert_generated(
            "Data MD2",
            NativeFileFamily::PlayerMaps,
            encode_player_maps(&snapshot.world.player_maps, sources.data_md2)?,
        );
    }
    Ok(())
}

fn dungeon(
    snapshot: &ProjectSnapshot,
    sources: ClassicCompatibilitySources<'_>,
    manifest: &mut NativeManifest,
) -> Result<(), ClassicSliceCompileError> {
    let dungeon_level_count = snapshot
        .world
        .maps
        .iter()
        .filter(|map| map.level_type == crate::model::LevelType::Dungeon)
        .count();
    if dungeon_level_count > 0 {
        manifest.insert_generated(
            "Data DL",
            NativeFileFamily::DungeonMaps,
            encode_dungeon_maps(&snapshot.world.maps, sources.data_dl)?,
        );
        manifest.insert_generated(
            "Data DDD",
            NativeFileFamily::DungeonActionPoints,
            encode_dungeon_action_points(
                &snapshot.world.action_points,
                dungeon_level_count,
                sources.data_ddd,
            )?,
        );
        manifest.insert_generated(
            "Data RDD",
            NativeFileFamily::DungeonRandomLevels,
            encode_dungeon_random_levels(&snapshot.world.maps, sources.data_rdd)?,
        );
    }
    Ok(())
}

pub(super) fn special_land_solidity(
    snapshot: &ProjectSnapshot,
    sources: ClassicCompatibilitySources<'_>,
    manifest: &mut NativeManifest,
) -> Result<(), ClassicSliceCompileError> {
    if let Some(catalog) = &snapshot.world.special_land_solidity {
        manifest.insert_generated(
            "Data Solids",
            NativeFileFamily::SpecialLandSolidity,
            crate::codecs::encode_special_land_solidity(&catalog.solid, sources.data_solids)?,
        );
    }
    Ok(())
}

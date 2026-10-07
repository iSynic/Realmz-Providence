use super::{ClassicCompatibilitySources, ClassicSliceCompileError, NativeManifest};
use crate::codecs::{
    NativeFileFamily, ResourceIdentity, compile_classic_text_resource_fork,
    compile_retained_icon_resource_fork, compile_scenario_picture_resource_fork,
    compile_scenario_sound_resource_fork, compile_special_land_tile_resource_fork,
    encode_player_map_name_resources, encode_scenario_item_text_resources,
    remove_resource_entries_preserving_container,
};
use crate::model::ProjectSnapshot;
use std::collections::{BTreeMap, BTreeSet};

pub(super) fn compile(
    snapshot: &ProjectSnapshot,
    sources: ClassicCompatibilitySources<'_>,
    asset_payloads: &BTreeMap<String, Vec<u8>>,
    manifest: &mut NativeManifest,
) -> Result<(), ClassicSliceCompileError> {
    let mut resources = sources.scenario_resources.map(ToOwned::to_owned);
    item_names(snapshot, sources, &mut resources)?;
    player_map_names(snapshot, &mut resources)?;
    pictures(snapshot, asset_payloads, &mut resources)?;
    sounds(snapshot, asset_payloads, &mut resources)?;
    text_resources(snapshot, asset_payloads, &mut resources)?;
    icons(snapshot, asset_payloads, &mut resources)?;
    special_land_tiles(snapshot, asset_payloads, &mut resources)?;
    remove_declared(snapshot, &mut resources)?;
    if let Some(resources) = resources {
        manifest.insert_generated(
            "Scenario.rsrc",
            NativeFileFamily::ScenarioResourceFork,
            resources,
        );
    }
    Ok(())
}

fn item_names(
    snapshot: &ProjectSnapshot,
    sources: ClassicCompatibilitySources<'_>,
    fork: &mut Option<Vec<u8>>,
) -> Result<(), ClassicSliceCompileError> {
    if sources
        .data_ni_text
        .is_some_and(|source| source.native_path == "Scenario.rsrc")
        && !snapshot.scenario_item_rules.is_empty()
    {
        *fork = Some(encode_scenario_item_text_resources(
            &snapshot.scenario_item_rules,
            fork.as_deref()
                .or_else(|| sources.data_ni_text.map(|source| source.bytes)),
        )?);
    }
    Ok(())
}

fn player_map_names(
    snapshot: &ProjectSnapshot,
    fork: &mut Option<Vec<u8>>,
) -> Result<(), ClassicSliceCompileError> {
    if let Some(catalog) = &snapshot.player_map_names {
        *fork = Some(encode_player_map_name_resources(catalog, fork.as_deref())?);
    }
    Ok(())
}

fn pictures(
    snapshot: &ProjectSnapshot,
    asset_payloads: &BTreeMap<String, Vec<u8>>,
    fork: &mut Option<Vec<u8>>,
) -> Result<(), ClassicSliceCompileError> {
    if snapshot.assets.iter().any(|asset| asset.kind == "picture") {
        *fork = Some(compile_scenario_picture_resource_fork(
            &snapshot.assets,
            asset_payloads,
            fork.as_deref(),
        )?);
    }
    Ok(())
}

fn sounds(
    snapshot: &ProjectSnapshot,
    asset_payloads: &BTreeMap<String, Vec<u8>>,
    fork: &mut Option<Vec<u8>>,
) -> Result<(), ClassicSliceCompileError> {
    if snapshot.assets.iter().any(|asset| asset.kind == "sound") {
        *fork = Some(compile_scenario_sound_resource_fork(
            &snapshot.assets,
            asset_payloads,
            fork.as_deref(),
        )?);
    }
    Ok(())
}

fn text_resources(
    snapshot: &ProjectSnapshot,
    asset_payloads: &BTreeMap<String, Vec<u8>>,
    fork: &mut Option<Vec<u8>>,
) -> Result<(), ClassicSliceCompileError> {
    if snapshot
        .assets
        .iter()
        .any(|asset| asset.kind == "text-resource")
    {
        *fork = Some(compile_classic_text_resource_fork(
            &snapshot.assets,
            asset_payloads,
            fork.as_deref(),
        )?);
    }
    Ok(())
}

fn icons(
    snapshot: &ProjectSnapshot,
    asset_payloads: &BTreeMap<String, Vec<u8>>,
    fork: &mut Option<Vec<u8>>,
) -> Result<(), ClassicSliceCompileError> {
    if snapshot
        .assets
        .iter()
        .any(|asset| matches!(asset.kind.as_str(), "icon" | "portrait" | "combat-icon"))
    {
        let signed_icon_ids = snapshot
            .assets
            .iter()
            .filter(|asset| asset.kind == "icon")
            .filter_map(|asset| asset.classic_resource.as_ref())
            .filter_map(|resource| i16::try_from(resource.resource_id).ok())
            .collect();
        *fork = Some(compile_retained_icon_resource_fork(
            &snapshot.assets,
            asset_payloads,
            fork.as_deref(),
            &signed_icon_ids,
        )?);
    }
    Ok(())
}

fn special_land_tiles(
    snapshot: &ProjectSnapshot,
    asset_payloads: &BTreeMap<String, Vec<u8>>,
    fork: &mut Option<Vec<u8>>,
) -> Result<(), ClassicSliceCompileError> {
    if snapshot
        .assets
        .iter()
        .any(|asset| asset.kind == "special-land-tile")
    {
        *fork = Some(
            compile_special_land_tile_resource_fork(
                &snapshot.assets,
                asset_payloads,
                fork.as_deref(),
            )
            .map_err(ClassicSliceCompileError::SpecialLandTiles)?,
        );
    }
    Ok(())
}

fn remove_declared(
    snapshot: &ProjectSnapshot,
    fork: &mut Option<Vec<u8>>,
) -> Result<(), ClassicSliceCompileError> {
    if !snapshot.classic_resource_removals.is_empty() {
        let mut removals = BTreeSet::new();
        for resource in &snapshot.classic_resource_removals {
            let Ok(resource_type) = <[u8; 4]>::try_from(resource.resource_type.as_bytes()) else {
                return Err(ClassicSliceCompileError::InvalidResourceRemoval {
                    resource_type: resource.resource_type.clone(),
                    resource_id: resource.resource_id,
                });
            };
            let Ok(id) = i16::try_from(resource.resource_id) else {
                return Err(ClassicSliceCompileError::InvalidResourceRemoval {
                    resource_type: resource.resource_type.clone(),
                    resource_id: resource.resource_id,
                });
            };
            removals.insert(ResourceIdentity { resource_type, id });
        }
        if let Some(resources) = fork.as_deref() {
            *fork = Some(
                remove_resource_entries_preserving_container(resources, &removals)
                    .map_err(ClassicSliceCompileError::ScenarioResources)?,
            );
        }
    }
    Ok(())
}

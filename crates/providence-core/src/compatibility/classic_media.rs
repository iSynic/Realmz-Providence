use super::{CompatibilityBlocker, blocker, is_sha256_blob};
use crate::codecs::{
    AUTHORED_MONSTER_APPEARANCE_SOURCE_PREFIX, CLASSIC_APPLICATION_MATERIALIZED_SOURCE_PREFIX,
    CLASSIC_SCENARIO_RESOURCE_SOURCE, SCENARIO_ICON_HEIGHT, SCENARIO_ICON_MAX_ID,
    SCENARIO_ICON_MIN_ID, SCENARIO_ICON_WIDTH, SCENARIO_PICTURE_MAX_ID, SCENARIO_PICTURE_MIN_ID,
    SCENARIO_SOUND_MAX_ID, SCENARIO_SOUND_MIN_ID, SPECIAL_LAND_TILE_HEIGHT,
    SPECIAL_LAND_TILE_MAX_ID, SPECIAL_LAND_TILE_MIN_ID, SPECIAL_LAND_TILE_WIDTH,
};
use crate::model::ProjectSnapshot;

pub(super) fn classic_scenario_picture_blockers(
    snapshot: &ProjectSnapshot,
) -> Vec<CompatibilityBlocker> {
    snapshot
        .assets
        .iter()
        .filter(|asset| asset.kind == "picture")
        .filter_map(|asset| {
            let imported_exact = asset.source == CLASSIC_SCENARIO_RESOURCE_SOURCE;
            let valid_resource = asset.classic_resource.as_ref().is_some_and(|resource| {
                resource.resource_type == "PICT"
                    && (imported_exact
                        && i16::try_from(resource.resource_id).is_ok()
                        || (i32::from(SCENARIO_PICTURE_MIN_ID)
                            ..=i32::from(SCENARIO_PICTURE_MAX_ID))
                            .contains(&resource.resource_id))
                    && snapshot
                        .assets
                        .iter()
                        .filter(|candidate| candidate.kind == "picture")
                        .filter_map(|candidate| candidate.classic_resource.as_ref())
                        .filter(|candidate| {
                            candidate.resource_type == "PICT"
                                && candidate.resource_id == resource.resource_id
                        })
                        .count()
                        == 1
            });
            let valid_payload = asset
                .classic_payload_blob
                .as_ref()
                .is_some_and(|blob| is_sha256_blob(&blob.0))
                && asset.classic_payload_byte_length.is_some_and(|bytes| bytes > 0);
            (!valid_resource || !valid_payload).then(|| {
                blocker(
                    "classic.scenario-picture.invalid",
                    format!(
                        "Scenario Picture '{}' requires a unique signed-short imported PICT identity (or authored ID 30000-30128) and a content-addressed compiled PICT payload.",
                        asset.identity.0
                    ),
                    Some(asset.identity.clone()),
                )
            })
        })
        .collect()
}

pub(super) fn classic_scenario_sound_blockers(
    snapshot: &ProjectSnapshot,
) -> Vec<CompatibilityBlocker> {
    snapshot
        .assets
        .iter()
        .filter(|asset| asset.kind == "sound")
        .filter_map(|asset| {
            let imported_exact = asset.source == CLASSIC_SCENARIO_RESOURCE_SOURCE;
            let valid_resource = asset.classic_resource.as_ref().is_some_and(|resource| {
                resource.resource_type == "snd "
                    && (imported_exact
                        && i16::try_from(resource.resource_id).is_ok()
                        || (i32::from(SCENARIO_SOUND_MIN_ID)..=i32::from(SCENARIO_SOUND_MAX_ID))
                            .contains(&resource.resource_id))
                    && snapshot
                        .assets
                        .iter()
                        .filter(|candidate| candidate.kind == "sound")
                        .filter_map(|candidate| candidate.classic_resource.as_ref())
                        .filter(|candidate| {
                            candidate.resource_type == "snd "
                                && candidate.resource_id == resource.resource_id
                        })
                        .count()
                        == 1
            });
            let valid_payload = asset
                .classic_payload_blob
                .as_ref()
                .is_some_and(|blob| is_sha256_blob(&blob.0))
                && asset.classic_payload_byte_length.is_some_and(|bytes| bytes > 0)
                && asset.sample_rate.is_some_and(|rate| (1..=65_535).contains(&rate))
                && asset.channels.is_some_and(|channels| channels > 0);
            (!valid_resource || !valid_payload).then(|| {
                blocker(
                    "classic.scenario-sound.invalid",
                    format!(
                        "Scenario Sound '{}' requires a unique signed-short imported snd identity (or authored ID 200-500), decoded audio metadata, and a content-addressed compiled snd payload.",
                        asset.identity.0
                    ),
                    Some(asset.identity.clone()),
                )
            })
        })
        .collect()
}

pub(super) fn classic_scenario_icon_blockers(
    snapshot: &ProjectSnapshot,
) -> Vec<CompatibilityBlocker> {
    snapshot
        .assets
        .iter()
        .filter(|asset| {
            matches!(asset.kind.as_str(), "icon" | "portrait" | "combat-icon")
        })
        .filter_map(|asset| {
            let valid_resource = valid_icon_resource(snapshot, asset);
            let valid_payload = valid_icon_payload(asset);
            (!valid_resource || !valid_payload).then(|| {
                blocker(
                    "classic.scenario-icon.invalid",
                    format!(
                        "Scenario Icon '{}' requires a unique cicn identity (nonnegative imported, positive authored, or signed item picture), valid decoded geometry, and a content-addressed compiled cicn payload.",
                        asset.identity.0
                    ),
                    Some(asset.identity.clone()),
                )
            })
        })
        .collect()
}

fn valid_icon_resource(snapshot: &ProjectSnapshot, asset: &crate::model::AssetDescriptor) -> bool {
    let imported_exact = asset.source == CLASSIC_SCENARIO_RESOURCE_SOURCE
        || asset
            .source
            .starts_with(CLASSIC_APPLICATION_MATERIALIZED_SOURCE_PREFIX);
    asset.classic_resource.as_ref().is_some_and(|resource| {
        let signed_item_picture =
            asset.kind == "icon" && (i32::from(i16::MIN)..0).contains(&resource.resource_id);
        resource.resource_type == "cicn"
            && (imported_exact
                && (0..=i32::from(SCENARIO_ICON_MAX_ID)).contains(&resource.resource_id)
                || (i32::from(SCENARIO_ICON_MIN_ID)..=i32::from(SCENARIO_ICON_MAX_ID))
                    .contains(&resource.resource_id)
                || signed_item_picture)
            && snapshot
                .assets
                .iter()
                .filter_map(|candidate| candidate.classic_resource.as_ref())
                .filter(|candidate| {
                    candidate.resource_type == "cicn"
                        && candidate.resource_id == resource.resource_id
                })
                .count()
                == 1
    })
}

fn valid_icon_payload(asset: &crate::model::AssetDescriptor) -> bool {
    let imported_exact = asset.source == CLASSIC_SCENARIO_RESOURCE_SOURCE
        || asset
            .source
            .starts_with(CLASSIC_APPLICATION_MATERIALIZED_SOURCE_PREFIX);
    let authored_monster_appearance = asset
        .source
        .starts_with(AUTHORED_MONSTER_APPEARANCE_SOURCE_PREFIX);
    asset
        .classic_payload_blob
        .as_ref()
        .is_some_and(|blob| is_sha256_blob(&blob.0))
        && asset
            .classic_payload_byte_length
            .is_some_and(|bytes| bytes > 0)
        && if imported_exact {
            asset.width.unwrap_or_default() > 0 && asset.height.unwrap_or_default() > 0
        } else if authored_monster_appearance {
            matches!(
                (asset.width, asset.height),
                (Some(32), Some(32))
                    | (Some(32), Some(64))
                    | (Some(64), Some(32))
                    | (Some(64), Some(64))
            )
        } else {
            asset.width == Some(SCENARIO_ICON_WIDTH) && asset.height == Some(SCENARIO_ICON_HEIGHT)
        }
}

pub(super) fn classic_special_land_tile_blockers(
    snapshot: &ProjectSnapshot,
) -> Vec<CompatibilityBlocker> {
    snapshot
        .assets
        .iter()
        .filter(|asset| asset.kind == "special-land-tile")
        .filter_map(|asset| {
            let imported_exact = asset.source == CLASSIC_SCENARIO_RESOURCE_SOURCE;
            let valid_resource = asset.classic_resource.as_ref().is_some_and(|resource| {
                resource.resource_type == "cicn"
                    && (i32::from(SPECIAL_LAND_TILE_MIN_ID)
                        ..=i32::from(SPECIAL_LAND_TILE_MAX_ID))
                        .contains(&resource.resource_id)
                    && snapshot
                        .assets
                        .iter()
                        .filter(|candidate| candidate.kind == "special-land-tile")
                        .filter_map(|candidate| candidate.classic_resource.as_ref())
                        .filter(|candidate| {
                            candidate.resource_type == "cicn"
                                && candidate.resource_id == resource.resource_id
                        })
                        .count()
                        == 1
            });
            let valid_payload = asset
                .classic_payload_blob
                .as_ref()
                .is_some_and(|blob| is_sha256_blob(&blob.0))
                && asset.classic_payload_byte_length.is_some_and(|bytes| bytes > 0)
                && if imported_exact {
                    asset.width.unwrap_or_default() > 0 && asset.height.unwrap_or_default() > 0
                } else {
                    asset.width == Some(SPECIAL_LAND_TILE_WIDTH)
                        && asset.height == Some(SPECIAL_LAND_TILE_HEIGHT)
                };
            (!valid_resource || !valid_payload).then(|| {
                blocker(
                    "classic.special-land-tile.invalid",
                    format!(
                        "Special Land Tile '{}' requires a unique negative cicn ID, certified 32 x 32 output geometry, and a content-addressed compiled cicn payload.",
                        asset.identity.0
                    ),
                    Some(asset.identity.clone()),
                )
            })
        })
        .collect()
}

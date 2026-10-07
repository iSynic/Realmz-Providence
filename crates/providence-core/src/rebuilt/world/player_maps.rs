use super::{
    RebuiltV3PlayerMap, RebuiltV3PlayerMapCoordinate, RebuiltV3PlayerMapMarker,
    RebuiltV3PlayerMapRect, RebuiltV3WorldError,
};
use crate::{
    codecs::player_map_names,
    model::{
        AssetDescriptor, LevelType, PlayerMapRecord, ProjectOrigin, ProjectSnapshot, StableId,
    },
    rebuilt::{ApplicationMediaCatalog, ApplicationMediaResolution},
};

pub(super) fn project_player_map(
    snapshot: &ProjectSnapshot,
    record: &PlayerMapRecord,
    application_media: Option<&ApplicationMediaCatalog>,
) -> Result<RebuiltV3PlayerMap, RebuiltV3WorldError> {
    let invalid = |reason: String| RebuiltV3WorldError::InvalidPlayerMap {
        player_map: record.identity.clone(),
        reason,
    };
    let classic_id = u8::try_from(record.native_id.0)
        .ok()
        .filter(|id| *id < 20)
        .ok_or_else(|| invalid("Classic ID is outside 0 through 19".into()))?;
    if record.icon_size <= 0 {
        return Err(invalid(format!(
            "icon size {} is not positive; Classic divides by this value",
            record.icon_size
        )));
    }
    let imported_source = matches!(snapshot.origin, ProjectOrigin::Imported { .. });
    let mut projected = initial_player_map(snapshot, record, classic_id);

    if record.show < 0 {
        projected.mode = "scrolling-text".into();
        projected.scrolling_text_asset_id = Some(
            player_map_media_identity(
                snapshot,
                application_media,
                "TEXT",
                i32::from(record.show),
                Some("text"),
                imported_source,
            )?
            .ok_or_else(|| invalid(format!("requires exact TEXT resource {}", record.show)))?,
        );
        return Ok(projected);
    }

    project_image_map(
        snapshot,
        record,
        application_media,
        imported_source,
        projected,
    )
}

fn project_image_map(
    snapshot: &ProjectSnapshot,
    record: &PlayerMapRecord,
    application_media: Option<&ApplicationMediaCatalog>,
    imported_source: bool,
    mut projected: RebuiltV3PlayerMap,
) -> Result<RebuiltV3PlayerMap, RebuiltV3WorldError> {
    let invalid = |reason: String| RebuiltV3WorldError::InvalidPlayerMap {
        player_map: record.identity.clone(),
        reason,
    };
    projected.map_id = Some(target_map(snapshot, record, imported_source)?);
    projected.party_marker_asset_id = player_map_media_identity(
        snapshot,
        application_media,
        "cicn",
        138,
        None,
        imported_source,
    )?;

    if record.picture_id != 0 {
        projected.mode = "picture".into();
        projected.picture_asset_id = Some(
            player_map_media_identity(
                snapshot,
                application_media,
                "PICT",
                i32::from(record.picture_id),
                Some("picture"),
                imported_source,
            )?
            .ok_or_else(|| {
                invalid(format!(
                    "requires exact PICT resource {}",
                    record.picture_id
                ))
            })?,
        );
        return Ok(projected);
    }

    projected.mode = if record.is_dungeon {
        "dungeon-crop".into()
    } else {
        "land-crop".into()
    };
    projected.markers = project_markers(snapshot, record, application_media, imported_source)?;
    Ok(projected)
}

fn player_map_media_identity(
    snapshot: &ProjectSnapshot,
    application_media: Option<&ApplicationMediaCatalog>,
    resource_type: &str,
    resource_id: i32,
    expected_application_kind: Option<&str>,
    allow_missing: bool,
) -> Result<Option<StableId>, RebuiltV3WorldError> {
    if let Some(asset) = exact_classic_asset(snapshot, resource_type, resource_id) {
        return Ok(Some(asset.identity.clone()));
    }
    let resource = crate::model::ClassicResourceKey {
        resource_type: resource_type.into(),
        resource_id,
    };
    match application_media
        .map(|catalog| catalog.resolve_resource(&resource, expected_application_kind))
    {
        Some(ApplicationMediaResolution::Resolved(asset)) => {
            Ok(Some(asset.descriptor.identity.clone()))
        }
        Some(ApplicationMediaResolution::Missing) | None if allow_missing => Ok(Some(
            player_map_missing_resource_identity(resource_type, resource_id),
        )),
        Some(ApplicationMediaResolution::Missing) | None => Ok(None),
        Some(ApplicationMediaResolution::Ambiguous | ApplicationMediaResolution::WrongKind) => {
            Err(RebuiltV3WorldError::InvalidPlayerMap {
                player_map: StableId(format!("player-map-resource:{resource_type}:{resource_id}")),
                reason: format!("requires unambiguous {resource_type} resource {resource_id}"),
            })
        }
    }
}

fn player_map_missing_resource_identity(resource_type: &str, resource_id: i32) -> StableId {
    StableId(format!("classic.resource.{resource_type}.{resource_id}"))
}

fn exact_classic_asset<'a>(
    snapshot: &'a ProjectSnapshot,
    resource_type: &str,
    resource_id: i32,
) -> Option<&'a AssetDescriptor> {
    snapshot.assets.iter().find(|asset| {
        asset.classic_resource.as_ref().is_some_and(|resource| {
            resource.resource_type == resource_type && resource.resource_id == resource_id
        })
    })
}

fn initial_player_map(
    snapshot: &ProjectSnapshot,
    record: &PlayerMapRecord,
    classic_id: u8,
) -> RebuiltV3PlayerMap {
    let (available_name, unavailable_name) =
        player_map_names(snapshot.player_map_names.as_ref(), record.native_id.0);
    RebuiltV3PlayerMap {
        id: StableId(format!("classic.player-map.{classic_id}")),
        classic_id,
        name: if available_name.is_none_or(|name| name.trim().is_empty()) {
            format!("Map {}", u16::from(classic_id) + 1)
        } else {
            available_name.expect("nonempty available name").into()
        },
        unavailable_name: unavailable_name.unwrap_or_default().into(),
        mode: String::new(),
        map_id: None,
        start: RebuiltV3PlayerMapCoordinate {
            x: record.start_x,
            y: record.start_y,
        },
        icon_size: record.icon_size,
        picture_asset_id: None,
        scrolling_text_asset_id: None,
        party_marker_asset_id: None,
        picture_rect: RebuiltV3PlayerMapRect {
            top: record.picture_rect.top,
            left: record.picture_rect.left,
            bottom: record.picture_rect.bottom,
            right: record.picture_rect.right,
        },
        markers: Vec::new(),
        note: record.note.clone(),
    }
}

fn target_map(
    snapshot: &ProjectSnapshot,
    record: &PlayerMapRecord,
    imported_source: bool,
) -> Result<StableId, RebuiltV3WorldError> {
    let expected_kind = if record.is_dungeon {
        LevelType::Dungeon
    } else {
        LevelType::Land
    };
    let map = u32::try_from(record.level).ok().and_then(|native_index| {
        snapshot
            .world
            .maps
            .iter()
            .find(|map| map.level_type == expected_kind && map.native_index == native_index)
    });
    Ok(if let Some(map) = map {
        map.identity.clone()
    } else if imported_source {
        StableId(format!(
            "{}:{}",
            if record.is_dungeon { "dungeon" } else { "land" },
            record.level
        ))
    } else {
        return Err(RebuiltV3WorldError::InvalidPlayerMap {
            player_map: record.identity.clone(),
            reason: format!(
                "references missing {:?} source map {}",
                expected_kind, record.level
            ),
        });
    })
}

fn project_markers(
    snapshot: &ProjectSnapshot,
    record: &PlayerMapRecord,
    application_media: Option<&ApplicationMediaCatalog>,
    imported_source: bool,
) -> Result<Vec<RebuiltV3PlayerMapMarker>, RebuiltV3WorldError> {
    let mut markers = Vec::new();
    for marker in record.markers.iter().filter(|marker| marker.icon_id != 0) {
        let Some(asset) = player_map_media_identity(
            snapshot,
            application_media,
            "cicn",
            i32::from(marker.icon_id),
            None,
            imported_source,
        )?
        else {
            continue;
        };
        markers.push(RebuiltV3PlayerMapMarker {
            classic_icon_id: marker.icon_id,
            icon_asset_id: asset,
            x: marker.x,
            y: marker.y,
        });
    }
    Ok(markers)
}

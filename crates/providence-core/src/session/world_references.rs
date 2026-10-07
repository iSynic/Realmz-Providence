use crate::codecs::LAND_LAYOUT_COLUMNS;
use crate::codecs::MAP_LEVEL_BYTES;
use crate::codecs::PLAYER_MAP_RECORD_BYTES;
use crate::codecs::classic_land_index;
use crate::codecs::normalize_special_land_resource_id;
use crate::codecs::player_map_record_has_semantics;
use crate::model::LevelType;
use crate::model::PlayerMapRecord;
use crate::model::ProjectSnapshot;
use crate::model::StableId;
use crate::references::ByteProvenance;
use crate::references::FieldPath;
use crate::references::ReferenceDescriptor;
use crate::references::RepairAction;
use crate::references::ResolutionState;
use crate::references::TargetKind;
use std::collections::BTreeSet;

pub(super) fn map_landlook_references(snapshot: &ProjectSnapshot) -> Vec<ReferenceDescriptor> {
    snapshot
        .world
        .maps
        .iter()
        .filter_map(|map| {
            let landlook = map.runtime.as_ref()?.landlook?;
            let custom = crate::codecs::custom_landlook_source_name(landlook).is_some();
            let built_in = matches!(landlook, -1 | 0 | 3 | 4 | 5 | 9 | 10);
            let resolved = snapshot
                .landlook_catalogs
                .iter()
                .any(|catalog| catalog.landlook == landlook);
            let resolution = if resolved {
                ResolutionState::Resolved
            } else if built_in {
                ResolutionState::StockFallback
            } else {
                ResolutionState::Missing
            };
            let record_start = map.native_index as usize * crate::codecs::RANDOM_LEVEL_RECORD_BYTES;
            Some(ReferenceDescriptor {
                source: map.identity.clone(),
                field: FieldPath("runtime.landlook".into()),
                target_kind: TargetKind::Landlook,
                target_id: format!("landlook:{landlook}"),
                required: true,
                stock_fallback: (!resolved && built_in)
                    .then(|| "Classic application landlook catalog".into()),
                resolution: resolution.clone(),
                repair_actions: match resolution {
                    ResolutionState::Resolved | ResolutionState::StockFallback => {
                        vec![RepairAction::Retarget]
                    }
                    ResolutionState::Missing if custom => {
                        vec![RepairAction::ImportTarget, RepairAction::Retarget]
                    }
                    ResolutionState::Missing | ResolutionState::Ambiguous => {
                        vec![RepairAction::Retarget]
                    }
                },
                byte_provenance: Some(ByteProvenance {
                    native_path: if map.level_type == LevelType::Land {
                        "Data RD".into()
                    } else {
                        "Data RDD".into()
                    },
                    record_index: map.native_index,
                    byte_start: (record_start + crate::codecs::RANDOM_LEVEL_LANDLOOK_OFFSET) as u32,
                    byte_end: (record_start + crate::codecs::RANDOM_LEVEL_LANDLOOK_OFFSET + 1)
                        as u32,
                }),
            })
        })
        .collect()
}

pub(super) fn land_layout_references(snapshot: &ProjectSnapshot) -> Vec<ReferenceDescriptor> {
    let Some(layout) = &snapshot.world.land_layout else {
        return Vec::new();
    };
    layout
        .cells
        .iter()
        .copied()
        .enumerate()
        .filter(|(_, value)| *value != 0)
        .map(|(index, value)| land_layout_cell_reference(snapshot, index, value))
        .collect()
}

pub(super) fn player_map_references(snapshot: &ProjectSnapshot) -> Vec<ReferenceDescriptor> {
    let mut references = Vec::new();
    for player_map in snapshot
        .world
        .player_maps
        .iter()
        .filter(|record| player_map_record_has_semantics(record))
    {
        let row_start = player_map.native_id.0 as usize * PLAYER_MAP_RECORD_BYTES;
        if player_map.show < 0 {
            references.push(player_map_asset_reference(
                snapshot,
                player_map,
                "scrollingText",
                TargetKind::TextResource,
                "TEXT",
                i32::from(player_map.show),
                row_start + 70,
            ));
            continue;
        }

        append_player_map_level_reference(snapshot, player_map, &mut references);
        append_player_map_party_marker(snapshot, player_map, &mut references);

        if player_map.picture_id != 0 {
            references.push(player_map_asset_reference(
                snapshot,
                player_map,
                "picture",
                TargetKind::Picture,
                "PICT",
                i32::from(player_map.picture_id),
                row_start + 66,
            ));
            continue;
        }
        for (slot, marker) in player_map.markers.iter().enumerate() {
            if marker.icon_id == 0 {
                continue;
            }
            references.push(player_map_asset_reference(
                snapshot,
                player_map,
                &format!("markers[{slot}].icon"),
                TargetKind::Icon,
                "cicn",
                i32::from(marker.icon_id),
                row_start + slot * 6,
            ));
        }
    }
    references
}

pub(super) fn player_map_asset_reference(
    snapshot: &ProjectSnapshot,
    player_map: &PlayerMapRecord,
    field: &str,
    target_kind: TargetKind,
    resource_type: &str,
    resource_id: i32,
    byte_start: usize,
) -> ReferenceDescriptor {
    let asset = snapshot.assets.iter().find(|asset| {
        asset.classic_resource.as_ref().is_some_and(|resource| {
            resource.resource_type == resource_type && resource.resource_id == resource_id
        })
    });
    ReferenceDescriptor {
        source: player_map.identity.clone(),
        field: FieldPath(field.into()),
        target_kind,
        target_id: asset
            .map(|asset| asset.identity.0.clone())
            .unwrap_or_else(|| resource_id.to_string()),
        required: true,
        stock_fallback: None,
        resolution: if asset.is_some() {
            ResolutionState::Resolved
        } else {
            ResolutionState::Missing
        },
        repair_actions: vec![RepairAction::ImportTarget, RepairAction::Retarget],
        byte_provenance: Some(ByteProvenance {
            native_path: "Data MD2".into(),
            record_index: player_map.native_id.0,
            byte_start: byte_start as u32,
            byte_end: byte_start as u32 + 2,
        }),
    }
}

pub(super) fn special_land_tile_references(snapshot: &ProjectSnapshot) -> Vec<ReferenceDescriptor> {
    let assets = snapshot
        .assets
        .iter()
        .filter(|asset| asset.kind == "special-land-tile")
        .filter_map(|asset| {
            asset.classic_resource.as_ref().and_then(|resource| {
                (resource.resource_type == "cicn" && resource.resource_id < 0)
                    .then_some(resource.resource_id)
            })
        })
        .collect::<BTreeSet<_>>();
    let mut references = Vec::new();
    for map in snapshot
        .world
        .maps
        .iter()
        .filter(|map| map.level_type == LevelType::Land)
    {
        for (canonical_index, raw_tile) in map.tiles.iter().copied().enumerate() {
            let Some(resource_id) = normalize_special_land_resource_id(raw_tile) else {
                continue;
            };
            let x = canonical_index % crate::model::CLASSIC_MAP_SIZE;
            let y = canonical_index / crate::model::CLASSIC_MAP_SIZE;
            let byte_start = map.native_index as usize * MAP_LEVEL_BYTES
                + (x * crate::model::CLASSIC_MAP_SIZE + y) * 2;
            let resolved = assets.contains(&i32::from(resource_id));
            references.push(ReferenceDescriptor {
                source: map.identity.clone(),
                field: FieldPath(format!("tiles[{y}][{x}].specialLand")),
                target_kind: TargetKind::SpecialLandTile,
                target_id: resource_id.to_string(),
                required: true,
                stock_fallback: None,
                resolution: if resolved {
                    ResolutionState::Resolved
                } else {
                    ResolutionState::Missing
                },
                repair_actions: if resolved {
                    vec![RepairAction::Retarget]
                } else {
                    vec![RepairAction::ImportTarget, RepairAction::Retarget]
                },
                byte_provenance: Some(ByteProvenance {
                    native_path: "Data LD".into(),
                    record_index: map.native_index,
                    byte_start: byte_start as u32,
                    byte_end: byte_start as u32 + 2,
                }),
            });
        }
    }
    references
}

fn land_layout_cell_reference(
    snapshot: &ProjectSnapshot,
    index: usize,
    value: i16,
) -> ReferenceDescriptor {
    let row = index / LAND_LAYOUT_COLUMNS;
    let column = index % LAND_LAYOUT_COLUMNS;
    let native_index = classic_land_index(value);
    let candidates = native_index
        .map(|native_index| {
            snapshot
                .world
                .maps
                .iter()
                .filter(|map| map.level_type == LevelType::Land && map.native_index == native_index)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    let resolution = match candidates.len() {
        1 => ResolutionState::Resolved,
        0 => ResolutionState::Missing,
        _ => ResolutionState::Ambiguous,
    };
    let target_id = candidates
        .first()
        .map(|map| map.identity.0.clone())
        .or_else(|| native_index.map(|value| format!("land:{value}")))
        .unwrap_or_else(|| value.to_string());
    ReferenceDescriptor {
        source: StableId("land-layout".into()),
        field: FieldPath(format!("cells[{row}][{column}]")),
        target_kind: TargetKind::Map,
        target_id,
        required: true,
        stock_fallback: None,
        resolution: resolution.clone(),
        repair_actions: match resolution {
            ResolutionState::Resolved => {
                vec![RepairAction::Retarget, RepairAction::ClearOptional]
            }
            ResolutionState::Ambiguous => vec![
                RepairAction::ChooseCandidate,
                RepairAction::Retarget,
                RepairAction::ClearOptional,
            ],
            ResolutionState::Missing | ResolutionState::StockFallback => {
                vec![RepairAction::Retarget, RepairAction::ClearOptional]
            }
        },
        byte_provenance: Some(ByteProvenance {
            native_path: "Layout".into(),
            record_index: 0,
            byte_start: (index * 2) as u32,
            byte_end: (index * 2 + 2) as u32,
        }),
    }
}

fn append_player_map_level_reference(
    snapshot: &ProjectSnapshot,
    player_map: &PlayerMapRecord,
    references: &mut Vec<ReferenceDescriptor>,
) {
    let row_start = player_map.native_id.0 as usize * PLAYER_MAP_RECORD_BYTES;
    let expected_kind = if player_map.is_dungeon {
        LevelType::Dungeon
    } else {
        LevelType::Land
    };
    let map = u32::try_from(player_map.level)
        .ok()
        .and_then(|native_index| {
            snapshot
                .world
                .maps
                .iter()
                .find(|map| map.level_type == expected_kind && map.native_index == native_index)
        });
    references.push(ReferenceDescriptor {
        source: player_map.identity.clone(),
        field: FieldPath("level".into()),
        target_kind: TargetKind::Map,
        target_id: map.map(|map| map.identity.0.clone()).unwrap_or_else(|| {
            let prefix = match expected_kind {
                LevelType::Land => "land",
                LevelType::Dungeon => "dungeon",
            };
            format!("{prefix}:{}", player_map.level)
        }),
        required: true,
        stock_fallback: None,
        resolution: if map.is_some() {
            ResolutionState::Resolved
        } else {
            ResolutionState::Missing
        },
        repair_actions: vec![RepairAction::Retarget],
        byte_provenance: Some(ByteProvenance {
            native_path: "Data MD2".into(),
            record_index: player_map.native_id.0,
            byte_start: (row_start + 64) as u32,
            byte_end: (row_start + 66) as u32,
        }),
    });
}

fn append_player_map_party_marker(
    snapshot: &ProjectSnapshot,
    player_map: &PlayerMapRecord,
    references: &mut Vec<ReferenceDescriptor>,
) {
    let party_marker = snapshot.assets.iter().find(|asset| {
        asset
            .classic_resource
            .as_ref()
            .is_some_and(|resource| resource.resource_type == "cicn" && resource.resource_id == 138)
    });
    references.push(ReferenceDescriptor {
        source: player_map.identity.clone(),
        field: FieldPath("partyMarker".into()),
        target_kind: TargetKind::Icon,
        target_id: party_marker
            .map(|asset| asset.identity.0.clone())
            .unwrap_or_else(|| "138".into()),
        required: true,
        stock_fallback: None,
        resolution: if party_marker.is_some() {
            ResolutionState::Resolved
        } else {
            ResolutionState::Missing
        },
        repair_actions: vec![RepairAction::ImportTarget, RepairAction::Retarget],
        byte_provenance: None,
    });
}

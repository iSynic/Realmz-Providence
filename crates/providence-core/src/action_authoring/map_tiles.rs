use super::{ActionTarget, ActionTargetContext, ActionTargetStatus};
use crate::{
    codecs::{decode_dungeon_cell, decode_land_cell},
    model::{ClassicResourceKey, LevelType, ProjectSnapshot, StableId},
    rebuilt::{ApplicationMediaCatalog, ApplicationMediaResolution},
};
use std::collections::{BTreeMap, BTreeSet};

pub(super) fn targets(
    snapshot: &ProjectSnapshot,
    application: Option<&ApplicationMediaCatalog>,
    context: &ActionTargetContext,
) -> Vec<ActionTarget> {
    let map = context.map_identity.as_ref().and_then(|identity| {
        snapshot
            .world
            .maps
            .iter()
            .find(|map| &map.identity == identity)
    });
    let level_type = context.level_type.or_else(|| map.map(|map| map.level_type));
    let mut values = BTreeMap::new();
    if level_type == Some(LevelType::Land) {
        for value in 1..=200_i16 {
            values.insert(value, terrain(value, context));
        }
        add_cicn_assets(
            &mut values,
            &snapshot.assets,
            ActionTargetStatus::CompatibilityResource,
        );
        if let Some(application) = application {
            add_application_cicns(&mut values, application);
        }
    }
    if let Some(map) = map {
        for value in map.tiles.iter().copied().collect::<BTreeSet<_>>() {
            values
                .entry(value)
                .or_insert_with(|| preview(snapshot, application, value, context));
        }
    }
    values.into_values().collect()
}

pub(super) fn preview(
    snapshot: &ProjectSnapshot,
    application: Option<&ApplicationMediaCatalog>,
    value: i16,
    context: &ActionTargetContext,
) -> ActionTarget {
    if context.level_type == Some(LevelType::Dungeon) {
        return dungeon(value, context);
    }
    let cell = decode_land_cell(value);
    if let Some(tile) = cell.terrain_tile {
        return terrain_result(value, tile, &cell, context);
    }
    if let Some(resource_id) = cell.icon_resource_id
        && let Some(target) = cicn(snapshot, application, value, resource_id, &cell)
    {
        return target;
    }
    if value == 0 {
        return ActionTarget {
            identity: StableId("map-tile:raw:0".into()),
            value: 0,
            label: "Imported empty/invalid land value 0".into(),
            detail: "Classic's land renderer does not address an atlas tile for zero; the exact imported word is retained.".into(),
            status: ActionTargetStatus::Resolved,
            preview: None,
        };
    }
    ActionTarget {
        identity: StableId(format!("map-tile:raw:{value}")),
        value: i32::from(value),
        label: format!("Imported map value {value}"),
        detail: land_effect_detail(&cell, "No visual resource is currently resolved."),
        status: ActionTargetStatus::Resolved,
        preview: None,
    }
}

fn terrain_result(
    raw_value: i16,
    tile: u16,
    cell: &crate::codecs::LandCellProfile,
    context: &ActionTargetContext,
) -> ActionTarget {
    let mut target = terrain(tile as i16, context);
    target.value = i32::from(raw_value);
    if raw_value != tile as i16 || has_land_modifiers(cell) {
        target.identity = StableId(format!(
            "{}:tile-value:{raw_value}",
            context
                .map_identity
                .as_ref()
                .map(|identity| identity.0.as_str())
                .unwrap_or("land")
        ));
        target.label = format!("Terrain tile {tile}{}", modifier_suffix(cell));
        target.detail = land_effect_detail(cell, "Tile from the destination map's landlook atlas.");
    }
    target
}

fn has_land_modifiers(cell: &crate::codecs::LandCellProfile) -> bool {
    cell.marker_band > 0 || cell.note_marker || cell.path_marker
}

fn modifier_suffix(cell: &crate::codecs::LandCellProfile) -> String {
    let mut modifiers = Vec::new();
    if cell.action_point_marker {
        modifiers.push("action-point marker");
    }
    if cell.revealed_secret {
        modifiers.push("revealed secret");
    }
    if cell.hidden_secret {
        modifiers.push("hidden secret");
    }
    if cell.note_marker {
        modifiers.push("note");
    }
    if cell.path_marker {
        modifiers.push("path");
    }
    if modifiers.is_empty() {
        String::new()
    } else {
        format!(" · {}", modifiers.join(", "))
    }
}

fn land_effect_detail(cell: &crate::codecs::LandCellProfile, source: &str) -> String {
    let rendered = if let Some(tile) = cell.terrain_tile {
        format!("renders terrain tile {tile}")
    } else if let Some(resource_id) = cell.icon_resource_id {
        format!("renders cicn {resource_id}")
    } else {
        "has no resolved rendered tile".into()
    };
    format!(
        "Exact signed cell value {}; {rendered}{}. {source}",
        cell.raw_value,
        modifier_suffix(cell)
    )
}

fn canonical_land_value_for_cicn(resource_id: i16) -> Option<i16> {
    if (-999..0).contains(&resource_id) || (201..=999).contains(&resource_id) {
        return Some(resource_id);
    }
    if resource_id < -999 {
        return resource_id
            .checked_sub(2000)
            .filter(|raw| decode_land_cell(*raw).icon_resource_id == Some(resource_id));
    }
    if (1000..=5191).contains(&resource_id) {
        return resource_id
            .checked_add(3000)
            .filter(|raw| decode_land_cell(*raw).icon_resource_id == Some(resource_id));
    }
    None
}

fn terrain(value: i16, context: &ActionTargetContext) -> ActionTarget {
    ActionTarget {
        identity: StableId(format!(
            "{}:tile:{value}",
            context
                .map_identity
                .as_ref()
                .map(|identity| identity.0.as_str())
                .unwrap_or("land")
        )),
        value: i32::from(value),
        label: format!("Terrain tile {value}"),
        detail: "Tile from the destination map's landlook atlas.".into(),
        status: ActionTargetStatus::Resolved,
        preview: Some(format!("terrain:{value}")),
    }
}

fn dungeon(value: i16, context: &ActionTargetContext) -> ActionTarget {
    let cell = decode_dungeon_cell(value);
    let mut features = Vec::new();
    for (enabled, label) in [
        (cell.wall, "wall"),
        (cell.horizontal_door, "horizontal door"),
        (cell.vertical_door, "vertical door"),
        (cell.stairs, "stairs"),
        (cell.column, "column"),
        (cell.unmapped, "unmapped"),
        (cell.allow_move_north, "allow north"),
        (cell.allow_move_east, "allow east"),
        (cell.allow_move_south, "allow south"),
        (cell.allow_move_west, "allow west"),
        (cell.visible_arch, "visible arch"),
        (cell.no_wall_in_battle, "no battle wall"),
    ] {
        if enabled {
            features.push(label);
        }
    }
    ActionTarget {
        identity: StableId(format!(
            "{}:dungeon-cell:{value}",
            context
                .map_identity
                .as_ref()
                .map(|identity| identity.0.as_str())
                .unwrap_or("dungeon")
        )),
        value: i32::from(value),
        label: if features.is_empty() {
            format!("Empty dungeon cell ({value})")
        } else {
            format!("Dungeon cell · {}", features.join(", "))
        },
        detail: format!(
            "Classic dungeon bitfield 0x{:04x}; retained as one signed word.",
            cell.raw_mask
        ),
        status: ActionTargetStatus::Resolved,
        preview: None,
    }
}

fn add_cicn_assets(
    values: &mut BTreeMap<i16, ActionTarget>,
    assets: &[crate::model::AssetDescriptor],
    status: ActionTargetStatus,
) {
    for asset in assets {
        let Some(resource) = asset.classic_resource.as_ref() else {
            continue;
        };
        if resource.resource_type != "cicn" {
            continue;
        }
        let Ok(resource_id) = i16::try_from(resource.resource_id) else {
            continue;
        };
        let Some(value) = canonical_land_value_for_cicn(resource_id) else {
            continue;
        };
        values.entry(value).or_insert_with(|| ActionTarget {
            identity: asset.identity.clone(),
            value: i32::from(value),
            label: asset_label(asset.label.trim(), resource_id),
            detail: format!(
                "Scenario cicn {resource_id}; stored as signed map-cell value {value}."
            ),
            status: status.clone(),
            preview: Some(format!("cicn:{resource_id}")),
        });
    }
}

fn add_application_cicns(
    values: &mut BTreeMap<i16, ActionTarget>,
    application: &ApplicationMediaCatalog,
) {
    let keys = application
        .assets
        .iter()
        .filter_map(|asset| asset.descriptor.classic_resource.clone())
        .filter(|resource| resource.resource_type == "cicn")
        .collect::<BTreeSet<_>>();
    for resource in keys {
        let Ok(resource_id) = i16::try_from(resource.resource_id) else {
            continue;
        };
        let Some(value) = canonical_land_value_for_cicn(resource_id) else {
            continue;
        };
        let ApplicationMediaResolution::Resolved(asset) =
            application.resolve_resource(&resource, None)
        else {
            continue;
        };
        values.entry(value).or_insert_with(|| ActionTarget {
            identity: asset.descriptor.identity.clone(),
            value: i32::from(value),
            label: asset_label(asset.descriptor.label.trim(), resource_id),
            detail: format!("Stock cicn {resource_id}; stored as signed map-cell value {value}."),
            status: ActionTargetStatus::ApplicationResource,
            preview: Some(format!("cicn:{resource_id}")),
        });
    }
}

fn cicn(
    snapshot: &ProjectSnapshot,
    application: Option<&ApplicationMediaCatalog>,
    raw_value: i16,
    resource_id: i16,
    cell: &crate::codecs::LandCellProfile,
) -> Option<ActionTarget> {
    let resource = ClassicResourceKey {
        resource_type: "cicn".into(),
        resource_id: i32::from(resource_id),
    };
    if let Some(asset) = snapshot
        .assets
        .iter()
        .find(|asset| asset.classic_resource.as_ref() == Some(&resource))
    {
        return Some(ActionTarget {
            identity: asset.identity.clone(),
            value: i32::from(raw_value),
            label: format!(
                "{}{}",
                asset_label(asset.label.trim(), resource_id),
                modifier_suffix(cell)
            ),
            detail: land_effect_detail(
                cell,
                "Scenario resource overrides the same stock cicn key.",
            ),
            status: ActionTargetStatus::CompatibilityResource,
            preview: Some(format!("cicn:{resource_id}")),
        });
    }
    let ApplicationMediaResolution::Resolved(asset) =
        application?.resolve_resource(&resource, None)
    else {
        return None;
    };
    Some(ActionTarget {
        identity: asset.descriptor.identity.clone(),
        value: i32::from(raw_value),
        label: format!(
            "{}{}",
            asset_label(asset.descriptor.label.trim(), resource_id),
            modifier_suffix(cell)
        ),
        detail: land_effect_detail(cell, "Resolved from the stock application library."),
        status: ActionTargetStatus::ApplicationResource,
        preview: Some(format!("cicn:{resource_id}")),
    })
}

fn asset_label(label: &str, value: i16) -> String {
    let canonical = format!("cicn {value}");
    if label.is_empty() || label.eq_ignore_ascii_case(&canonical) {
        canonical
    } else {
        format!("{label} · {canonical}")
    }
}

use super::{
    ActionAuthoringProjection, ActionFormDescribeQuery, ActionTargetKind, ActionValuePreview,
    AuthoringModeControl, DescribedActionField, FormChoice,
};
use crate::codecs::{
    DungeonPrimitive, apply_dungeon_primitive, apply_land_marker_band, apply_land_note_marker,
    apply_land_path_marker, decode_dungeon_cell, decode_land_cell,
};
use crate::{model::ProjectSnapshot, rebuilt::ApplicationMediaCatalog};

const DUNGEON_CONTROLS: [(DungeonPrimitive, &str, &str); 12] = [
    (DungeonPrimitive::Wall, "dungeon.wall", "Wall"),
    (
        DungeonPrimitive::HorizontalDoor,
        "dungeon.horizontalDoor",
        "Horizontal door",
    ),
    (
        DungeonPrimitive::VerticalDoor,
        "dungeon.verticalDoor",
        "Vertical door",
    ),
    (DungeonPrimitive::Stairs, "dungeon.stairs", "Stairs"),
    (DungeonPrimitive::Column, "dungeon.column", "Column"),
    (DungeonPrimitive::Unmapped, "dungeon.unmapped", "Unmapped"),
    (
        DungeonPrimitive::AllowMoveNorth,
        "dungeon.allowNorth",
        "Allow north",
    ),
    (
        DungeonPrimitive::AllowMoveEast,
        "dungeon.allowEast",
        "Allow east",
    ),
    (
        DungeonPrimitive::AllowMoveSouth,
        "dungeon.allowSouth",
        "Allow south",
    ),
    (
        DungeonPrimitive::AllowMoveWest,
        "dungeon.allowWest",
        "Allow west",
    ),
    (
        DungeonPrimitive::VisibleArch,
        "dungeon.visibleArch",
        "Visible arch",
    ),
    (
        DungeonPrimitive::NoWallInBattle,
        "dungeon.noBattleWall",
        "No battle wall",
    ),
];

const LAND_MARKER_BAND: &str = "land.markerBand";
const LAND_NOTE: &str = "land.note";
const LAND_PATH: &str = "land.path";

pub(super) fn resolve(
    query: &ActionFormDescribeQuery,
) -> Result<ActionAuthoringProjection, String> {
    let input = &query.context.authoring;
    if !input.selections.is_empty() || input.modes.keys().any(|key| !known_control(key)) {
        return Err("Unknown Change Map Tile authoring control.".into());
    }
    let mut result = ActionAuthoringProjection {
        resolved_values: query.values.clone(),
        ..Default::default()
    };
    if query.values.get("isDungeon").copied().unwrap_or(0) == 0 {
        resolve_land(input, &mut result)?;
        return Ok(result);
    }
    let imported = query.values.get("tileValue").copied().unwrap_or(0);
    let mut resolved = imported;
    let preserved = dungeon_preservation_summary(decode_dungeon_cell(imported));
    for (primitive, key, _) in DUNGEON_CONTROLS {
        let current = primitive_enabled(decode_dungeon_cell(resolved), primitive);
        let selected = input.modes.get(key).copied().unwrap_or(i16::from(current));
        if !matches!(selected, 0 | 1) {
            return Err(format!("{key} must be Off or On."));
        }
        resolved = apply_dungeon_primitive(resolved, primitive, selected == 1)
            .expect("listed dungeon controls are writer-safe primitives");
        let mut control = toggle(key, label_for(key), selected);
        if key == "dungeon.wall" {
            control.display = preserved.clone();
        }
        result.controls.push(control);
    }
    result.resolved_values.insert("tileValue".into(), resolved);
    Ok(result)
}

fn dungeon_preservation_summary(cell: crate::codecs::DungeonCellProfile) -> String {
    let mut retained = Vec::new();
    if cell.action_point_marker {
        retained.push("Action Point marker".into());
    }
    if cell.note_marker {
        retained.push("note".into());
    }
    if cell.revealed_secret {
        retained.push("revealed secret".into());
    }
    if cell.preserved_high_sign_bits != 0 {
        retained.push(format!(
            "unknown high bits 0x{:04x}",
            cell.preserved_high_sign_bits
        ));
    }
    if retained.is_empty() {
        "Preserved from imported value: no workflow or unknown bits are set.".into()
    } else {
        format!("Preserved from imported value: {}.", retained.join(" · "))
    }
}

fn known_control(key: &str) -> bool {
    matches!(key, LAND_MARKER_BAND | LAND_NOTE | LAND_PATH)
        || DUNGEON_CONTROLS.iter().any(|(_, known, _)| key == *known)
}

fn resolve_land(
    input: &super::ActionAuthoringInput,
    result: &mut ActionAuthoringProjection,
) -> Result<(), String> {
    let imported = result
        .resolved_values
        .get("tileValue")
        .copied()
        .unwrap_or(0);
    let cell = decode_land_cell(imported);
    let marker_band = input
        .modes
        .get(LAND_MARKER_BAND)
        .copied()
        .unwrap_or(i16::from(cell.marker_band));
    let marker_choices = land_marker_choices(imported);
    if !marker_choices
        .iter()
        .any(|choice| choice.value == marker_band)
    {
        return Err("That Cell State would change the selected land visual.".into());
    }
    let mut resolved =
        apply_land_marker_band(imported, marker_band as u8).map_err(str::to_owned)?;
    result.controls.push(AuthoringModeControl {
        key: LAND_MARKER_BAND.into(),
        label: "Cell State".into(),
        value: marker_band,
        choices: marker_choices,
        member_fields: Vec::new(),
        active_fields: Vec::new(),
        display: String::new(),
    });
    if imported >= 0 {
        let note = selected_flag(input, LAND_NOTE, "Note", cell.note_marker)?;
        resolved = apply_land_note_marker(resolved, note == 1).map_err(str::to_owned)?;
        result.controls.push(toggle(LAND_NOTE, "Note", note));
        let path = selected_flag(input, LAND_PATH, "Path", cell.path_marker)?;
        resolved = apply_land_path_marker(resolved, path == 1).map_err(str::to_owned)?;
        result.controls.push(toggle(LAND_PATH, "Path", path));
    }
    result.resolved_values.insert("tileValue".into(), resolved);
    Ok(())
}

fn land_marker_choices(imported: i16) -> Vec<FormChoice> {
    let source = decode_land_cell(imported);
    [
        (0, "None"),
        (1, "Action Point"),
        (2, "AP + revealed secret"),
        (3, "AP + hidden secret"),
    ]
    .into_iter()
    .filter_map(|(band, label)| {
        let candidate = apply_land_marker_band(imported, band).ok()?;
        let decoded = decode_land_cell(candidate);
        (decoded.terrain_tile == source.terrain_tile
            && decoded.icon_resource_id == source.icon_resource_id)
            .then(|| choice(i16::from(band), label))
    })
    .collect()
}

fn selected_flag(
    input: &super::ActionAuthoringInput,
    key: &str,
    label: &str,
    current: bool,
) -> Result<i16, String> {
    let selected = input.modes.get(key).copied().unwrap_or(i16::from(current));
    if !matches!(selected, 0 | 1) {
        return Err(format!("{label} must be Off or On."));
    }
    Ok(selected)
}

fn choice(value: i16, label: &str) -> FormChoice {
    FormChoice {
        value,
        label: label.into(),
    }
}

fn primitive_enabled(cell: crate::codecs::DungeonCellProfile, primitive: DungeonPrimitive) -> bool {
    match primitive {
        DungeonPrimitive::Wall => cell.wall,
        DungeonPrimitive::HorizontalDoor => cell.horizontal_door,
        DungeonPrimitive::VerticalDoor => cell.vertical_door,
        DungeonPrimitive::Stairs => cell.stairs,
        DungeonPrimitive::Column => cell.column,
        DungeonPrimitive::Unmapped => cell.unmapped,
        DungeonPrimitive::AllowMoveNorth => cell.allow_move_north,
        DungeonPrimitive::AllowMoveEast => cell.allow_move_east,
        DungeonPrimitive::AllowMoveSouth => cell.allow_move_south,
        DungeonPrimitive::AllowMoveWest => cell.allow_move_west,
        DungeonPrimitive::VisibleArch => cell.visible_arch,
        DungeonPrimitive::NoWallInBattle => cell.no_wall_in_battle,
        _ => false,
    }
}

fn label_for(key: &str) -> &'static str {
    DUNGEON_CONTROLS
        .iter()
        .find_map(|(_, known, label)| (*known == key).then_some(*label))
        .expect("known dungeon control")
}

fn toggle(key: &str, label: &str, value: i16) -> AuthoringModeControl {
    AuthoringModeControl {
        key: key.into(),
        label: label.into(),
        value,
        choices: vec![
            FormChoice {
                value: 0,
                label: "Off".into(),
            },
            FormChoice {
                value: 1,
                label: "On".into(),
            },
        ],
        member_fields: Vec::new(),
        active_fields: Vec::new(),
        display: String::new(),
    }
}

pub(super) fn decorate(
    snapshot: &ProjectSnapshot,
    application: Option<&ApplicationMediaCatalog>,
    query: &ActionFormDescribeQuery,
    opcode: i16,
    fields: &mut [DescribedActionField],
) {
    if opcode != 12 {
        return;
    }
    let Some(field) = fields.iter_mut().find(|field| field.index == Some(3)) else {
        return;
    };
    let entry = super::semantic_inventory::semantic_entry(opcode)
        .expect("Change Map Tile has audited semantics");
    field.target_context = super::target_context::field_context(
        snapshot,
        query,
        entry,
        Some(ActionTargetKind::MapTile),
    );
    field.value_picker_kind = Some(ActionTargetKind::MapTile);
    if field.target_context.level_type == Some(crate::model::LevelType::Dungeon) {
        field.label = "Stored dungeon cell value".into();
        field.explanation = "Named controls edit writer-safe features. Note, Action Point, revealed-secret, and unknown imported bits remain preserved in this exact word.".into();
    } else {
        field.label = "Replacement visual".into();
    }
    let target =
        super::map_tiles::preview(snapshot, application, field.value, &field.target_context);
    field.value_picker_preview = Some(ActionValuePreview {
        kind: ActionTargetKind::MapTile,
        identity: target.identity,
        value: field.value,
        label: target.label,
        detail: target.detail,
        status: target.status,
    });
}

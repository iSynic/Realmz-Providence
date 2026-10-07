use serde::{Deserialize, Serialize};

use super::{choices, context};
use crate::model::{ClassicAction, ProjectSnapshot};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RandomAreaInput {
    pub map_kind: String,
    pub map: choices::TargetSelection,
    pub area: choices::TargetSelection,
    pub chance_adjustment: String,
    pub shape_mode: String,
    pub bounds: [String; 4],
    pub retained_spare: i16,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FieldError {
    pub field: String,
    pub message: String,
}

pub(super) fn initial(snapshot: &ProjectSnapshot, action: &ClassicAction) -> RandomAreaInput {
    let (primary, secondary) = if let Ok(id) = u32::try_from(action.target_native_id) {
        (
            context::words(snapshot, id).0,
            context::words(snapshot, id + 1).0,
        )
    } else {
        ([None; 5], [None; 5])
    };
    let map_kind = primary[2]
        .map(|kind| match kind {
            0 => "land".into(),
            1 => "dungeon".into(),
            _ => kind.to_string(),
        })
        .unwrap_or_default();
    let map = choices::existing_map(snapshot, &map_kind, primary[0]);
    let area = choices::existing_area(choices::resolve_map(snapshot, &map_kind, &map), primary[1]);
    RandomAreaInput {
        map_kind,
        map,
        area,
        chance_adjustment: primary[3].map(chance_text).unwrap_or_default(),
        shape_mode: primary[4]
            .map(|value| value.to_string())
            .unwrap_or_default(),
        bounds: std::array::from_fn(|index| {
            secondary[index]
                .map(|value| value.to_string())
                .unwrap_or_default()
        }),
        retained_spare: secondary[4].unwrap_or(0),
    }
}

pub fn chance_text(value: i16) -> String {
    let absolute = i32::from(value).abs();
    format!(
        "{}{}.{:02}",
        if value < 0 { "-" } else { "+" },
        absolute / 100,
        absolute % 100
    )
}

pub fn parse_chance(text: &str) -> Option<i16> {
    let text = text.trim();
    let (negative, text) = if let Some(text) = text.strip_prefix('-') {
        (true, text)
    } else {
        (false, text.strip_prefix('+').unwrap_or(text))
    };
    let mut parts = text.split('.');
    let whole = parts.next()?;
    let fractional = parts.next();
    if whole.is_empty()
        || !whole.bytes().all(|byte| byte.is_ascii_digit())
        || parts.next().is_some()
    {
        return None;
    }
    let fraction = match fractional {
        Some(text)
            if (1..=2).contains(&text.len()) && text.bytes().all(|byte| byte.is_ascii_digit()) =>
        {
            text.parse::<i32>().ok()? * if text.len() == 1 { 10 } else { 1 }
        }
        None => 0,
        _ => return None,
    };
    let value = whole
        .parse::<i32>()
        .ok()?
        .checked_mul(100)?
        .checked_add(fraction)?;
    i16::try_from(if negative { -value } else { value }).ok()
}

pub(super) fn mode(input: &RandomAreaInput) -> Option<i16> {
    input
        .shape_mode
        .parse::<i16>()
        .ok()
        .filter(|value| (-1..=2).contains(value))
}

pub(super) fn bound_count(input: &RandomAreaInput) -> usize {
    match mode(input) {
        Some(-1) | None => 0,
        Some(1) => 2,
        _ => 4,
    }
}

pub(super) fn bound_labels(input: &RandomAreaInput) -> [&'static str; 4] {
    match mode(input) {
        Some(1) => [
            "Horizontal offset",
            "Vertical offset",
            "Retained top value",
            "Retained bottom value",
        ],
        Some(2) => ["Left change", "Right change", "Top change", "Bottom change"],
        _ => ["Left edge", "Right edge", "Top edge", "Bottom edge"],
    }
}

pub(super) fn shape_help(input: &RandomAreaInput) -> &'static str {
    match mode(input) {
        Some(-1) => "Keep the area’s shape. The chance adjustment still applies.",
        Some(0) => "Replace the area’s left, right, top and bottom edges.",
        Some(1) => "Move the area. Positive is right/down; negative is left/up.",
        Some(2) => "Move each edge separately. Positive is right/down; negative is left/up.",
        _ => "Choose how the area should change.",
    }
}

pub(super) fn validate(
    snapshot: &ProjectSnapshot,
    input: &RandomAreaInput,
) -> Result<([i16; 5], [i16; 5]), Vec<FieldError>> {
    let mut errors = Vec::new();
    let mut error = |field: &str, message: String| {
        errors.push(FieldError {
            field: field.into(),
            message,
        })
    };
    validate_map_selection(snapshot, input, &mut error);
    let chance = parse_chance(&input.chance_adjustment);
    if chance.is_none() {
        error(
            "chanceAdjustment",
            "Enter a change from -327.68 to +327.67 points, with no more than two decimal places."
                .into(),
        );
    }
    let mode = mode(input);
    if mode.is_none() {
        error(
            "shapeMode",
            "Choose Keep shape, Set bounds, Move area, or Adjust each edge.".into(),
        );
    }
    let secondary = parse_bounds(input, &mut error);
    if !errors.is_empty() {
        return Err(errors);
    }
    Ok((
        [
            input.map.index.unwrap(),
            input.area.index.unwrap(),
            if input.map_kind == "land" { 0 } else { 1 },
            chance.unwrap(),
            mode.unwrap(),
        ],
        secondary,
    ))
}

pub(super) fn change(
    snapshot: &ProjectSnapshot,
    input: &mut RandomAreaInput,
    field: &str,
    value: &str,
) -> Result<(), String> {
    if value.len() > 512 {
        return Err("The field value is too long.".into());
    }
    match field {
        "mapKind" if choices::kind(value).is_some() => {
            if input.map_kind != value {
                input.map_kind = value.into();
                input.map = Default::default();
                input.area = Default::default();
            }
        }
        "map" => change_map(snapshot, input, value)?,
        "area" => change_area(snapshot, input, value)?,
        "chanceAdjustment" => input.chance_adjustment = value.into(),
        "shapeMode" => input.shape_mode = value.into(),
        "bound0" | "bound1" | "bound2" | "bound3" => {
            input.bounds[field.as_bytes()[5] as usize - b'0' as usize] = value.into()
        }
        _ => return Err("This repair field cannot be changed.".into()),
    }
    Ok(())
}

fn validate_map_selection(
    snapshot: &ProjectSnapshot,
    input: &RandomAreaInput,
    error: &mut impl FnMut(&str, String),
) {
    if choices::kind(&input.map_kind).is_none() {
        error(
            "mapKind",
            "Choose Land or Dungeon; the stored map type is not supported.".into(),
        );
    }
    let map = choices::resolve_map(snapshot, &input.map_kind, &input.map);
    if map.is_none() {
        error(
            "map",
            "Choose one existing, unambiguous map of this type.".into(),
        );
    }
    if map
        .and_then(|map| choices::resolve_area(map, &input.area))
        .is_none()
    {
        error(
            "area",
            "Choose one existing, unambiguous area on this exact map.".into(),
        );
    }
}

fn parse_bounds(input: &RandomAreaInput, error: &mut impl FnMut(&str, String)) -> [i16; 5] {
    let mut secondary = [0; 5];
    let labels = bound_labels(input);
    for index in 0..4 {
        let text = input.bounds[index].trim();
        if text.is_empty() && index >= bound_count(input) {
            continue;
        }
        match text.parse::<i16>() {
            Ok(value) => secondary[index] = value,
            Err(_) => error(
                &format!("bound{index}"),
                format!(
                    "{}: enter a whole number from -32768 to 32767.{}",
                    labels[index],
                    if index >= bound_count(input) {
                        " Switch to Set bounds to correct the retained value."
                    } else {
                        ""
                    }
                ),
            ),
        }
    }
    secondary[4] = input.retained_spare;
    secondary
}

fn change_map(
    snapshot: &ProjectSnapshot,
    input: &mut RandomAreaInput,
    value: &str,
) -> Result<(), String> {
    let map = snapshot
        .world
        .maps
        .iter()
        .find(|map| map.identity.0 == value)
        .ok_or("This map no longer exists.")?;
    let selection = choices::TargetSelection {
        identity: Some(map.identity.clone()),
        index: i16::try_from(map.native_index).ok(),
    };
    if choices::resolve_map(snapshot, &input.map_kind, &selection).is_none() {
        return Err("Choose an unambiguous map of the selected type.".into());
    }
    if input.map != selection {
        input.map = selection;
        input.area = Default::default();
    }
    Ok(())
}

fn change_area(
    snapshot: &ProjectSnapshot,
    input: &mut RandomAreaInput,
    value: &str,
) -> Result<(), String> {
    let map =
        choices::resolve_map(snapshot, &input.map_kind, &input.map).ok_or("Choose a map first.")?;
    let area = map
        .runtime
        .as_ref()
        .and_then(|runtime| {
            runtime
                .random_rectangles
                .iter()
                .find(|area| area.identity.0 == value)
        })
        .ok_or("This area no longer exists on this map.")?;
    let selection = choices::TargetSelection {
        identity: Some(area.identity.clone()),
        index: choices::area_slot(map, area),
    };
    if choices::resolve_area(map, &selection).is_none() {
        return Err("Choose an unambiguous area on this map.".into());
    }
    input.area = selection;
    Ok(())
}

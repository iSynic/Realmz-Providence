use serde::{Deserialize, Serialize};

use crate::model::{LevelType, MapLevel, ProjectSnapshot, RandomRectangle, StableId};

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TargetSelection {
    pub identity: Option<StableId>,
    pub index: Option<i16>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Choice {
    pub identity: StableId,
    pub label: String,
    pub detail: String,
    pub selectable: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChoicePage {
    pub items: Vec<Choice>,
    pub offset: usize,
    pub limit: usize,
    pub total: usize,
}

pub(super) fn kind(value: &str) -> Option<LevelType> {
    match value {
        "land" => Some(LevelType::Land),
        "dungeon" => Some(LevelType::Dungeon),
        _ => None,
    }
}

pub(super) fn map_label(map: &MapLevel) -> String {
    let kind = if map.level_type == LevelType::Land {
        "Land"
    } else {
        "Dungeon"
    };
    let name: String = map.name.chars().take(120).collect();
    format!(
        "{kind} {}{}",
        map.native_index,
        if name.is_empty() {
            String::new()
        } else {
            format!(" · {name}")
        }
    )
}

pub(super) fn area_slot(map: &MapLevel, area: &RandomRectangle) -> Option<i16> {
    area.identity
        .0
        .strip_prefix(&format!("{}:rect:", map.identity.0))?
        .parse::<i16>()
        .ok()
        .filter(|slot| (0..20).contains(slot))
}

pub(super) fn resolve_map<'a>(
    snapshot: &'a ProjectSnapshot,
    map_kind: &str,
    selection: &TargetSelection,
) -> Option<&'a MapLevel> {
    let identity = selection.identity.as_ref()?;
    let level_type = kind(map_kind)?;
    let native_index = u32::try_from(selection.index?).ok()?;
    let matching: Vec<_> = snapshot
        .world
        .maps
        .iter()
        .filter(|map| &map.identity == identity)
        .collect();
    let [map] = matching.as_slice() else {
        return None;
    };
    (map.level_type == level_type
        && map.native_index == native_index
        && snapshot
            .world
            .maps
            .iter()
            .filter(|row| row.level_type == level_type && row.native_index == native_index)
            .count()
            == 1)
        .then_some(*map)
}

pub(super) fn resolve_area<'a>(
    map: &'a MapLevel,
    selection: &TargetSelection,
) -> Option<&'a RandomRectangle> {
    let identity = selection.identity.as_ref()?;
    let slot = selection.index?;
    let areas = &map.runtime.as_ref()?.random_rectangles;
    let matching: Vec<_> = areas
        .iter()
        .filter(|row| &row.identity == identity)
        .collect();
    let [area] = matching.as_slice() else {
        return None;
    };
    (area_slot(map, area) == Some(slot)
        && areas
            .iter()
            .filter(|row| area_slot(map, row) == Some(slot))
            .count()
            == 1)
        .then_some(*area)
}

pub(super) fn existing_map(
    snapshot: &ProjectSnapshot,
    map_kind: &str,
    index: Option<i16>,
) -> TargetSelection {
    let mut selected = TargetSelection {
        identity: None,
        index,
    };
    if let (Some(kind), Some(index)) = (kind(map_kind), index) {
        let rows: Vec<_> = snapshot
            .world
            .maps
            .iter()
            .filter(|map| map.level_type == kind && i64::from(map.native_index) == i64::from(index))
            .collect();
        if let [map] = rows.as_slice() {
            selected.identity = Some(map.identity.clone());
            if resolve_map(snapshot, map_kind, &selected).is_none() {
                selected.identity = None;
            }
        }
    }
    selected
}

pub(super) fn existing_area(map: Option<&MapLevel>, index: Option<i16>) -> TargetSelection {
    let mut selected = TargetSelection {
        identity: None,
        index,
    };
    if let (Some(map), Some(index)) = (map, index)
        && let Some(runtime) = &map.runtime
    {
        let rows: Vec<_> = runtime
            .random_rectangles
            .iter()
            .filter(|area| area_slot(map, area) == Some(index))
            .collect();
        if let [area] = rows.as_slice() {
            selected.identity = Some(area.identity.clone());
            if resolve_area(map, &selected).is_none() {
                selected.identity = None;
            }
        }
    }
    selected
}

pub fn map_choices(
    snapshot: &ProjectSnapshot,
    map_kind: &str,
    query: &str,
    offset: usize,
    limit: usize,
) -> ChoicePage {
    let choices = snapshot
        .world
        .maps
        .iter()
        .filter(|map| Some(map.level_type) == kind(map_kind))
        .map(|map| {
            let selection = TargetSelection {
                identity: Some(map.identity.clone()),
                index: i16::try_from(map.native_index).ok(),
            };
            let selectable = resolve_map(snapshot, map_kind, &selection).is_some();
            Choice {
                identity: map.identity.clone(),
                label: map_label(map),
                detail: if selectable {
                    String::new()
                } else {
                    "This map number or identity is ambiguous or unavailable.".into()
                },
                selectable,
            }
        })
        .collect();
    page(choices, query, offset, limit)
}

pub fn area_choices(
    snapshot: &ProjectSnapshot,
    map_kind: &str,
    selection: &TargetSelection,
    query: &str,
    offset: usize,
    limit: usize,
) -> ChoicePage {
    let mut choices = Vec::new();
    if let Some(map) = resolve_map(snapshot, map_kind, selection)
        && let Some(runtime) = &map.runtime
    {
        for area in &runtime.random_rectangles {
            let selection = TargetSelection {
                identity: Some(area.identity.clone()),
                index: area_slot(map, area),
            };
            let selectable = resolve_area(map, &selection).is_some();
            choices.push(Choice {
                identity: area.identity.clone(),
                label: selection
                    .index
                    .map(|index| format!("Area {index}"))
                    .unwrap_or_else(|| "Unsupported area".into()),
                detail: if selectable {
                    format!(
                        "Left {} · Right {} · Top {} · Bottom {}",
                        area.left, area.right, area.top, area.bottom
                    )
                } else {
                    "This area is ambiguous or unavailable.".into()
                },
                selectable,
            });
        }
    }
    page(choices, query, offset, limit)
}

fn page(mut choices: Vec<Choice>, query: &str, offset: usize, limit: usize) -> ChoicePage {
    let query = query.trim().to_lowercase();
    choices.retain(|choice| {
        format!("{} {}", choice.label, choice.detail)
            .to_lowercase()
            .contains(&query)
    });
    choices.sort_by(|a, b| (&a.label, &a.identity).cmp(&(&b.label, &b.identity)));
    let total = choices.len();
    let limit = limit.clamp(1, 128);
    ChoicePage {
        items: choices.into_iter().skip(offset).take(limit).collect(),
        offset,
        limit,
        total,
    }
}

//! Named region drafts reuse the Classic writer while preserving untouched imports.
use crate::model::{MapLevel, ProjectOrigin, ProjectSnapshot, RandomRectangle, StableId};
use serde::Serialize;
pub mod references;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RegionPreview {
    pub slot: u8,
    pub can_apply: bool,
    pub creating: bool,
    pub covered_cells: usize,
    pub overlaps: Vec<RegionOverlap>,
    pub preserved_warnings: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RegionOverlap {
    pub slot: u8,
    pub priority_slot: u8,
}

pub fn slot(map: &StableId, identity: &StableId) -> Result<u8, String> {
    identity
        .0
        .strip_prefix(&format!("{}:rect:", map.0))
        .and_then(|value| value.parse::<u8>().ok())
        .filter(|value| *value < 20)
        .ok_or_else(|| "Choose a region slot 0 through 19 on this exact map.".into())
}

pub fn map<'a>(snapshot: &'a ProjectSnapshot, identity: &StableId) -> Result<&'a MapLevel, String> {
    let map = snapshot
        .world
        .maps
        .iter()
        .find(|map| &map.identity == identity)
        .ok_or("The originating map is unavailable.")?;
    if map.runtime.is_none() {
        return Err("This map has no encounter metadata.".into());
    }
    Ok(map)
}

pub fn preview(
    snapshot: &ProjectSnapshot,
    owner: &StableId,
    edit: &RandomRectangle,
) -> Result<RegionPreview, String> {
    let map = map(snapshot, owner)?;
    let slot = slot(owner, &edit.identity)?;
    let rows = &map
        .runtime
        .as_ref()
        .expect("checked metadata")
        .random_rectangles;
    let mut matches = rows.iter().filter(|row| row.identity == edit.identity);
    let current = matches.next();
    if matches.next().is_some() {
        return Err("This imported slot has ambiguous records. Repair its source first.".into());
    }
    let preserve = matches!(snapshot.origin, ProjectOrigin::Imported { .. });
    let mut warnings = Vec::new();
    validate_fields(current, edit, preserve, &mut warnings)?;
    validate_references(snapshot, current, edit)?;
    let overlaps = rows
        .iter()
        .filter(|row| row.identity != edit.identity && overlap(row, edit))
        .filter_map(|row| self::slot(owner, &row.identity).ok())
        .map(|other| RegionOverlap {
            slot: other,
            priority_slot: slot.max(other),
        })
        .collect();
    Ok(RegionPreview {
        slot,
        can_apply: current != Some(edit),
        creating: current.is_none(),
        covered_cells: covered_cells(edit),
        overlaps,
        preserved_warnings: warnings,
    })
}

fn validate_fields(
    current: Option<&RandomRectangle>,
    edit: &RandomRectangle,
    preserve: bool,
    warnings: &mut Vec<String>,
) -> Result<(), String> {
    let bounds = |row: &RandomRectangle| [row.left, row.top, row.right, row.bottom];
    validate(
        bounds(edit).iter().all(|value| (0..=90).contains(value))
            && edit.left < edit.right
            && edit.top < edit.bottom,
        preserve && current.is_some_and(|row| bounds(row) == bounds(edit)),
        "Bounds must cover cells inside 90×90; Right and Bottom are exclusive edges.",
        warnings,
    )?;
    validate(
        (-1..=10000).contains(&edit.chance_ten_thousand),
        preserve && current.is_some_and(|row| row.chance_ten_thousand == edit.chance_ten_thousand),
        "Chance must be -1 (XAP doors), or 0 through 10000.",
        warnings,
    )?;
    for index in 0..3 {
        validate(
            (-100..=100).contains(&edit.random_door_percent[index]),
            preserve
                && current.is_some_and(|row| {
                    row.random_door_percent[index] == edit.random_door_percent[index]
                }),
            &format!("Door {} percentage must be -100 through 100.", index + 1),
            warnings,
        )?;
    }
    let low = i32::from(edit.battle_range[0]).abs();
    let high = i32::from(edit.battle_range[1]).abs();
    validate(
        low <= high && high <= i32::from(i16::MAX),
        preserve && current.is_some_and(|row| row.battle_range == edit.battle_range),
        "Battle Low must not exceed Battle High.",
        warnings,
    )?;
    if i8::try_from(edit.option).is_err() {
        return Err("Option must fit its signed native byte.".into());
    }
    Ok(())
}

fn validate(
    valid: bool,
    preserved: bool,
    reason: &str,
    warnings: &mut Vec<String>,
) -> Result<(), String> {
    if valid {
        return Ok(());
    }
    if !preserved {
        return Err(reason.into());
    }
    warnings.push(format!("Unchanged imported value retained: {reason}"));
    Ok(())
}

fn validate_references(
    snapshot: &ProjectSnapshot,
    current: Option<&RandomRectangle>,
    edit: &RandomRectangle,
) -> Result<(), String> {
    let changed = current.is_none_or(|row| {
        row.battle_range != edit.battle_range || row.chance_ten_thousand != edit.chance_ten_thousand
    });
    if changed && edit.chance_ten_thousand > 0 {
        for id in edit.battle_range {
            if !snapshot
                .battles
                .iter()
                .any(|row| i64::from(row.native_id.0) == i64::from(id).abs())
            {
                return Err(format!(
                    "Battle {id} is unavailable. Choose the range or set chance to zero."
                ));
            }
        }
    }
    if edit.text_id != 0
        && current.is_none_or(|row| row.text_id != edit.text_id)
        && !snapshot
            .messages
            .iter()
            .any(|row| i64::from(row.native_id.0) == i64::from(edit.text_id).abs())
    {
        return Err(format!("Message {} is unavailable.", edit.text_id));
    }
    for (index, id) in edit.random_doors.iter().enumerate() {
        if *id != 0
            && current.is_none_or(|row| row.random_doors[index] != *id)
            && !snapshot
                .extra_action_points
                .iter()
                .any(|row| i64::from(row.native_id.0) == i64::from(*id).abs())
        {
            return Err(format!("Door {} XAP {id} is unavailable.", index + 1));
        }
    }
    Ok(())
}

pub fn overlap(a: &RandomRectangle, b: &RandomRectangle) -> bool {
    a.left < a.right
        && a.top < a.bottom
        && b.left < b.right
        && b.top < b.bottom
        && a.left < b.right
        && b.left < a.right
        && a.top < b.bottom
        && b.top < a.bottom
}

fn covered_cells(row: &RandomRectangle) -> usize {
    let width = (i32::from(row.right.min(90)) - i32::from(row.left.max(0))).max(0) as usize;
    let height = (i32::from(row.bottom.min(90)) - i32::from(row.top.max(0))).max(0) as usize;
    width * height
}

#[cfg(test)]
#[path = "random_region_authoring/reference_tests.rs"]
mod reference_tests;
#[cfg(test)]
#[path = "random_region_authoring/tests.rs"]
mod tests;

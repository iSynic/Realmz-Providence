//! Mode-dependent visibility for stored words that remain preserved while inactive.

use std::collections::BTreeMap;

pub(super) fn reason(opcode: i16, index: u8, values: &BTreeMap<String, i16>) -> Option<String> {
    primary_reason(opcode, index, values).or_else(|| branch_reason(opcode, index, values))
}

fn primary_reason(opcode: i16, index: u8, values: &BTreeMap<String, i16>) -> Option<String> {
    match (opcode, index) {
        (3, 2) if !matches!(values.get("branchMode"), Some(1..=3)) => {
            Some("The selected Otherwise behavior does not use a destination.".into())
        }
        (7, 3) if values.get("levelOrCache").is_some_and(|value| *value < 0) => {
            Some("Encounter replacements do not use a map kind.".into())
        }
        (7, 4) if values.get("levelOrCache").is_some_and(|value| *value >= 0) => {
            Some("Action Point replacements do not use an encounter result slot.".into())
        }
        (22, 3) if values.get("mode") != Some(&2) => {
            Some("Only Change charges uses a charge change.".into())
        }
        (22, 4) if values.get("mode") != Some(&3) => {
            Some("Only Replace item uses a replacement item.".into())
        }
        (21, 4) if values.get("missingBehavior") == Some(&1) => {
            Some("Continue current script does not use a missing-item destination.".into())
        }
        (40, 2) if values.get("branchMode").copied().unwrap_or(0) == 0 => {
            Some("No branch does not use a destination.".into())
        }
        (42, 3 | 4) if values.get("successBehavior") != Some(&1) => {
            Some("The selected success behavior does not use a branch destination.".into())
        }
        (58 | 59, 3 | 4) if values.get("testB") != Some(&1) => {
            Some("The selected matched behavior does not use a branch destination.".into())
        }
        (37, index) => super::dungeon_move_presentation::availability(index, values),
        (55, 4) if !matches!(values.get("failureBehavior"), Some(1 | 2)) => {
            Some("The selected failure behavior does not use a destination.".into())
        }
        (68, 2) if values.get("mode") != Some(&3) => {
            Some("Only Calculate from current fatigue uses this multiplier.".into())
        }
        _ => None,
    }
}

fn branch_reason(opcode: i16, index: u8, values: &BTreeMap<String, i16>) -> Option<String> {
    match (opcode, index) {
        (33 | 38 | 42 | 46 | 58 | 59, 3) if !matches!(values.get("branchMode"), Some(0..=2)) => {
            Some("The selected branch mode does not use a destination.".into())
        }
        (33 | 38 | 42 | 46 | 58 | 59, 4) if !matches!(values.get("branchMode"), Some(1 | 2)) => {
            Some("Only an encounter-result branch uses a code position.".into())
        }
        (76, 4)
            if values.get("threshold").copied().unwrap_or(0) == 0
                || !matches!(values.get("branchMode"), Some(1..=3)) =>
        {
            Some("The current threshold and branch behavior do not use a destination.".into())
        }
        (78, 1) if values.get("testA") != Some(&7) => {
            Some("Only Specific tile uses a comparison value.".into())
        }
        (86, 1) if matches!(values.get("testSelector"), Some(3 | 4)) => {
            Some("Boat and camping tests do not use a comparison value.".into())
        }
        (87, 4) if values.get("falseBehavior") == Some(&1) => {
            Some("Continue current script does not use a missing-character destination.".into())
        }
        (126, 1) if values.get("mode") == Some(&2) => {
            Some("The Flee / Fail trigger does not use this threshold.".into())
        }
        (126, 4) if values.get("repeatMode") != Some(&2) => {
            Some("Only a random Extra Action Point range uses the high endpoint.".into())
        }
        _ => None,
    }
}

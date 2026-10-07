use std::collections::{BTreeMap, BTreeSet};

use crate::model::{ClassicAction, ProjectSnapshot, StableId};
use crate::references::FieldPath;

use super::{Diagnostic, Severity};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum UsageStatus {
    InUse,
    Shared,
    Unused,
    Missing,
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub struct Caller {
    pub source: StableId,
    pub slot: u8,
    pub raw_opcode: i16,
    pub shape: &'static str,
    pub secondary: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RowUsage {
    pub row_id: i64,
    pub exists: bool,
    pub status: UsageStatus,
    pub callers: Vec<Caller>,
}

// Editor layout groups, not a runtime reachability or byte-ownership declaration.
pub(crate) fn shape(opcode: i16) -> Option<&'static str> {
    crate::classic_action_settings::primary_words(opcode)?;
    crate::action_authoring::form_identity_for_opcode(opcode)
}

fn action_sets(snapshot: &ProjectSnapshot) -> impl Iterator<Item = (&StableId, &[ClassicAction])> {
    snapshot
        .world
        .action_points
        .iter()
        .map(|row| (&row.identity, row.actions.as_slice()))
        .chain(
            snapshot
                .extra_action_points
                .iter()
                .map(|row| (&row.identity, row.actions.as_slice())),
        )
        .chain(
            snapshot
                .simple_encounters
                .iter()
                .filter(|row| row.has_semantics())
                .map(|row| (&row.identity, row.actions.as_slice())),
        )
        .chain(
            snapshot
                .complex_encounters
                .iter()
                .map(|row| (&row.identity, row.actions.as_slice())),
        )
}

fn callers(snapshot: &ProjectSnapshot) -> BTreeMap<i64, Vec<Caller>> {
    let mut result = BTreeMap::<i64, Vec<Caller>>::new();
    for (source, actions) in action_sets(snapshot) {
        for action in actions {
            let Some(shape) = shape(action.opcode()) else {
                continue;
            };
            let caller = Caller {
                source: source.clone(),
                slot: action.slot,
                raw_opcode: action.raw_opcode,
                shape,
                secondary: false,
            };
            let id = i64::from(action.target_native_id);
            result.entry(id).or_default().push(caller.clone());
            if action.opcode() == 92 && id >= 0 {
                result.entry(id + 1).or_default().push(Caller {
                    shape: "random-region-shape-details",
                    secondary: true,
                    ..caller
                });
            }
        }
    }
    result
}

pub fn usages(snapshot: &ProjectSnapshot) -> Vec<RowUsage> {
    let available = snapshot
        .extra_codes
        .iter()
        .map(|row| i64::from(row.native_id.0))
        .collect::<BTreeSet<_>>();
    let mut by_row = callers(snapshot);
    for id in &available {
        by_row.entry(*id).or_default();
    }
    by_row
        .into_iter()
        .map(|(row_id, mut callers)| {
            callers.sort();
            let exists = available.contains(&row_id);
            let status = if !exists {
                UsageStatus::Missing
            } else if callers.len() > 1 {
                UsageStatus::Shared
            } else if callers.is_empty() {
                UsageStatus::Unused
            } else {
                UsageStatus::InUse
            };
            RowUsage {
                row_id,
                exists,
                status,
                callers,
            }
        })
        .collect()
}

pub fn diagnostics(snapshot: &ProjectSnapshot) -> Vec<Diagnostic> {
    usages(snapshot)
        .into_iter()
        .filter(|usage| usage.status == UsageStatus::Missing)
        .flat_map(|usage| {
            usage
                .callers
                .iter()
                .map(|caller| finding(&usage, caller))
                .collect::<Vec<_>>()
        })
        .collect()
}

fn finding(usage: &RowUsage, caller: &Caller) -> Diagnostic {
    let random_area = matches!(caller.raw_opcode, 92 | -92);
    let (code, severity, message) = if random_area {
        (
            if caller.secondary {
                "extra-code.opcode-92.secondary-missing"
            } else {
                "extra-code.opcode-92.primary-missing"
            },
            Severity::Error,
            "Random-area settings are incomplete. Open this action and complete its settings."
                .into(),
        )
    } else {
        (
            "action-settings.missing",
            Severity::Warning,
            format!(
                "Settings #{} are missing. Open this action to create or choose settings.",
                usage.row_id
            ),
        )
    };
    Diagnostic {
        code: code.into(),
        severity,
        message,
        entity: Some(caller.source.clone()),
        field: Some(FieldPath(format!("actions[{}].extraCode", caller.slot))),
    }
}

pub(crate) fn affected_sources(
    before: &ProjectSnapshot,
    after: &ProjectSnapshot,
    changed: &[StableId],
) -> BTreeSet<StableId> {
    let changed = changed.iter().collect::<BTreeSet<_>>();
    let all = changed.contains(&before.project_id) || changed.contains(&after.project_id);
    let before = callers(before);
    let after = callers(after);
    let touched = before
        .iter()
        .chain(&after)
        .filter(|(row_id, callers)| {
            all || changed.contains(&StableId(format!("extra-code:{row_id}")))
                || callers
                    .iter()
                    .any(|caller| changed.contains(&caller.source))
        })
        .map(|(row_id, _)| *row_id)
        .collect::<BTreeSet<_>>();
    before
        .into_iter()
        .chain(after)
        .filter(|(row_id, _)| touched.contains(row_id))
        .flat_map(|(_, callers)| callers.into_iter().map(|caller| caller.source))
        .collect()
}

#[cfg(test)]
mod tests;

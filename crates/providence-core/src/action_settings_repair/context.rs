use std::collections::{BTreeMap, BTreeSet};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::model::{ClassicAction, ExtraCodeRow, LevelType, ProjectSnapshot, StableId};
use crate::session::{ActionSettingsEdit, SessionError, action_settings_commands::inspect_caller};
use crate::validation::action_settings;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RepairUse {
    pub source: StableId,
    pub slot: u8,
    pub label: String,
}

#[derive(Clone, Serialize)]
struct UseFingerprint {
    source: StableId,
    slot: u8,
    opcode: i16,
    shape: String,
    secondary: bool,
}

#[derive(Clone, Serialize)]
pub(super) struct Footprint {
    project: StableId,
    source: StableId,
    action: ClassicAction,
    rows: Vec<(u32, Vec<ExtraCodeRow>, Vec<UseFingerprint>)>,
}

impl Footprint {
    pub(super) fn hash(&self) -> String {
        format!(
            "{:x}",
            Sha256::digest(serde_json::to_vec(self).expect("settings footprint is serializable"))
        )
    }

    pub(super) fn after(mut self, edit: &ActionSettingsEdit) -> Self {
        self.action.target_native_id = edit.target_native_id;
        for (id, rows, uses) in &mut self.rows {
            uses.retain(|usage| usage.source != edit.source || usage.slot != edit.slot);
            let secondary = *id == edit.target_native_id as u32 + 1;
            let values = if *id == edit.target_native_id as u32 {
                Some(edit.values)
            } else if secondary {
                edit.secondary_values
            } else {
                None
            };
            if let Some(values) = values {
                *rows = vec![ExtraCodeRow {
                    native_id: crate::model::NativeRecordId(*id),
                    values,
                }];
                uses.push(UseFingerprint {
                    source: edit.source.clone(),
                    slot: edit.slot,
                    opcode: self.action.raw_opcode,
                    shape: if secondary {
                        "random-region-shape-details"
                    } else {
                        action_settings::shape(self.action.opcode())
                            .expect("a repair has a known settings layout")
                    }
                    .into(),
                    secondary,
                });
            }
            uses.sort_by(|a, b| {
                (&a.source, a.slot, a.opcode, &a.shape, a.secondary).cmp(&(
                    &b.source,
                    b.slot,
                    b.opcode,
                    &b.shape,
                    b.secondary,
                ))
            });
        }
        self
    }
}

pub(super) fn footprint(
    snapshot: &ProjectSnapshot,
    source: &StableId,
    slot: u8,
    row_ids: &[u32],
) -> Result<Footprint, SessionError> {
    let action = inspect_caller(snapshot, source, slot)?;
    let usages = action_settings::usages(snapshot);
    let mut rows = Vec::new();
    for id in row_ids.iter().copied().collect::<BTreeSet<_>>() {
        let mut values: Vec<_> = snapshot
            .extra_codes
            .iter()
            .filter(|row| row.native_id.0 == id)
            .cloned()
            .collect();
        values.sort_by_key(|row| row.values);
        let uses = usages
            .iter()
            .find(|usage| usage.row_id == i64::from(id))
            .map(|usage| {
                usage
                    .callers
                    .iter()
                    .map(|caller| UseFingerprint {
                        source: caller.source.clone(),
                        slot: caller.slot,
                        opcode: caller.raw_opcode,
                        shape: caller.shape.into(),
                        secondary: caller.secondary,
                    })
                    .collect()
            })
            .unwrap_or_default();
        rows.push((id, values, uses));
    }
    Ok(Footprint {
        project: snapshot.project_id.clone(),
        source: source.clone(),
        action,
        rows,
    })
}

pub(super) fn row_ids(action: &ClassicAction) -> Vec<u32> {
    u32::try_from(action.target_native_id)
        .ok()
        .map(|id| {
            if action.opcode() == 92 {
                vec![id, id + 1]
            } else {
                vec![id]
            }
        })
        .unwrap_or_default()
}

pub(super) fn words(snapshot: &ProjectSnapshot, id: u32) -> ([Option<i16>; 5], usize) {
    let rows: Vec<_> = snapshot
        .extra_codes
        .iter()
        .filter(|row| row.native_id.0 == id)
        .collect();
    let words = std::array::from_fn(|index| {
        rows.first().and_then(|first| {
            rows.iter()
                .all(|row| row.values[index] == first.values[index])
                .then_some(first.values[index])
        })
    });
    (words, rows.len())
}

pub(super) fn affected_uses(
    snapshot: &ProjectSnapshot,
    source: &StableId,
    action: &ClassicAction,
) -> Vec<RepairUse> {
    let ids = row_ids(action);
    let mut result: BTreeMap<(StableId, u8), RepairUse> = BTreeMap::new();
    result.insert(
        (source.clone(), action.slot),
        RepairUse {
            source: source.clone(),
            slot: action.slot,
            label: source_label(snapshot, source, action.slot),
        },
    );
    for usage in action_settings::usages(snapshot)
        .into_iter()
        .filter(|usage| ids.iter().any(|id| i64::from(*id) == usage.row_id))
    {
        for caller in usage.callers {
            result
                .entry((caller.source.clone(), caller.slot))
                .or_insert_with(|| RepairUse {
                    label: source_label(snapshot, &caller.source, caller.slot),
                    source: caller.source,
                    slot: caller.slot,
                });
        }
    }
    result.into_values().collect()
}

pub(super) fn available_rows(snapshot: &ProjectSnapshot, companion: bool) -> Option<i16> {
    crate::session::settings_write_policy::available_id(snapshot, companion)
        .ok()
        .and_then(|id| i16::try_from(id).ok())
}

pub(super) fn source_label(snapshot: &ProjectSnapshot, source: &StableId, slot: u8) -> String {
    let label = if let Some(row) = snapshot
        .world
        .action_points
        .iter()
        .find(|row| &row.identity == source)
    {
        format!(
            "{} {} · AP {}",
            if row.level_type == LevelType::Land {
                "Land"
            } else {
                "Dungeon"
            },
            row.level_index,
            row.record_index
        )
    } else if let Some(row) = snapshot
        .extra_action_points
        .iter()
        .find(|row| &row.identity == source)
    {
        format!("Extra AP {}", row.native_id.0)
    } else if let Some(row) = snapshot
        .simple_encounters
        .iter()
        .find(|row| &row.identity == source)
    {
        format!("Simple Encounter {}", row.native_id.0)
    } else if let Some(row) = snapshot
        .complex_encounters
        .iter()
        .find(|row| &row.identity == source)
    {
        format!("Complex Encounter {}", row.native_id.0)
    } else {
        "Unavailable action".into()
    };
    format!("{label} · Step {}", u16::from(slot) + 1)
}

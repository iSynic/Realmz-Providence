//! Word-level settings transactions and their Classic consumers.
//!
//! A form supplies proposed values. It does not decide whether another action is
//! affected. Unedited words are merged against the same transaction baseline.

use crate::classic_action_settings::{companion_words, primary_words};
use crate::model::{ClassicAction, ExtraCodeRow, NativeRecordId, ProjectSnapshot};
use crate::session::ActionSettingsCallerConfirmation;
use crate::validation::action_settings;
use std::collections::{BTreeMap, BTreeSet};

mod presentation;
pub(crate) use presentation::describe_impact;
pub use presentation::{ActionSettingsImpactAction, ActionSettingsValueChange};

/// Merge independently edited forms without letting unchanged copies undo edits.
/// Different proposed values for the same word reject the entire transaction.
pub fn merge_writes(
    snapshot: &ProjectSnapshot,
    requests: &[Vec<ExtraCodeRow>],
) -> Result<Vec<ExtraCodeRow>, String> {
    let mut writes = BTreeMap::<u32, [Option<i16>; 5]>::new();
    for row in requests.iter().flatten() {
        let previous = unique_row(snapshot, row.native_id.0)?;
        let words = writes.entry(row.native_id.0).or_insert([None; 5]);
        for (index, value) in row.values.iter().copied().enumerate() {
            if previous.is_some_and(|old| old.values[index] == value) {
                continue;
            }
            if words[index].is_some_and(|pending| pending != value) {
                return Err(format!(
                    "settings #{} word {} has conflicting edits in this record",
                    row.native_id.0,
                    index + 1
                ));
            }
            words[index] = Some(value);
        }
    }
    writes
        .into_iter()
        .filter(|(_, words)| words.iter().any(Option::is_some))
        .map(|(id, words)| {
            let previous = unique_row(snapshot, id)?.map_or([0; 5], |row| row.values);
            Ok(ExtraCodeRow {
                native_id: NativeRecordId(id),
                values: std::array::from_fn(|index| words[index].unwrap_or(previous[index])),
            })
        })
        .collect()
}

/// Actions which may consume changed words, excluding explicitly selected edits.
/// Conditional runtime paths are possible effects, not a claim they will execute.
pub fn impacted_callers(
    snapshot: &ProjectSnapshot,
    writes: &[ExtraCodeRow],
    selected: &BTreeSet<ActionSettingsCallerConfirmation>,
) -> Result<Vec<ActionSettingsCallerConfirmation>, String> {
    impacted_callers_in_transaction(snapshot, writes, writes, selected)
}

/// Other edits in the same transaction can change a companion consumer's mode.
pub fn impacted_callers_in_transaction(
    snapshot: &ProjectSnapshot,
    writes: &[ExtraCodeRow],
    transaction_writes: &[ExtraCodeRow],
    selected: &BTreeSet<ActionSettingsCallerConfirmation>,
) -> Result<Vec<ActionSettingsCallerConfirmation>, String> {
    let mut callers = BTreeSet::new();
    let usages = action_settings::usages(snapshot);
    for row in writes {
        let changed = changed_words(unique_row(snapshot, row.native_id.0)?, row);
        let Some(usage) = usages
            .iter()
            .find(|usage| usage.row_id == i64::from(row.native_id.0))
        else {
            continue;
        };
        for caller in &usage.callers {
            if consumer_words(snapshot, transaction_writes, row.native_id.0, caller)? & changed == 0
            {
                continue;
            }
            let identity = ActionSettingsCallerConfirmation {
                source: caller.source.clone(),
                slot: caller.slot,
            };
            if !selected.contains(&identity) {
                callers.insert(identity);
            }
        }
    }
    Ok(callers.into_iter().collect())
}

fn consumer_words(
    snapshot: &ProjectSnapshot,
    writes: &[ExtraCodeRow],
    row_id: u32,
    caller: &action_settings::Caller,
) -> Result<u8, String> {
    let opcode = ClassicAction {
        slot: caller.slot,
        raw_opcode: caller.raw_opcode,
        target_native_id: 0,
    }
    .opcode();
    if !caller.secondary {
        return Ok(primary_words(opcode).unwrap_or(0));
    }
    let primary_id = row_id
        .checked_sub(1)
        .ok_or("a companion row has no primary ID")?;
    let before = unique_row(snapshot, primary_id)?.map_or([0; 5], |row| row.values);
    let after = writes
        .iter()
        .find(|row| row.native_id.0 == primary_id)
        .map_or(before, |row| row.values);
    Ok(companion_words(opcode, before) | companion_words(opcode, after))
}

fn changed_words(previous: Option<&ExtraCodeRow>, row: &ExtraCodeRow) -> u8 {
    row.values
        .iter()
        .enumerate()
        .fold(0, |mask, (index, value)| {
            if previous.is_none_or(|old| old.values[index] != *value) {
                mask | (1 << index)
            } else {
                mask
            }
        })
}

fn unique_row(snapshot: &ProjectSnapshot, id: u32) -> Result<Option<&ExtraCodeRow>, String> {
    let mut rows = snapshot
        .extra_codes
        .iter()
        .filter(|row| row.native_id.0 == id);
    let first = rows.next();
    if rows.next().is_some() {
        return Err(format!("settings #{id} are ambiguous"));
    }
    Ok(first)
}

#[cfg(test)]
mod tests;

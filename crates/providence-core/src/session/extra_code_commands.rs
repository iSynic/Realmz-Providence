use super::{ExtraCodeBranchLayout, SessionError};
use crate::model::{ExtraCodeRow, ProjectSnapshot, StableId};

fn row_mut<'a>(
    snapshot: &'a mut ProjectSnapshot,
    source: &StableId,
    index: u8,
) -> Result<&'a mut ExtraCodeRow, SessionError> {
    source
        .0
        .strip_prefix("extra-code:")
        .and_then(|value| value.parse::<u32>().ok())
        .and_then(|native_id| {
            snapshot
                .extra_codes
                .iter_mut()
                .find(|row| row.native_id.0 == native_id)
        })
        .ok_or_else(|| SessionError::InvalidExtraCodeReference {
            source: source.clone(),
            index,
        })
}

pub(super) fn retarget_value(
    snapshot: &mut ProjectSnapshot,
    source: StableId,
    index: u8,
    target_id: i16,
) -> Result<Vec<StableId>, SessionError> {
    let row = row_mut(snapshot, &source, index)?;
    let value = row.values.get_mut(index as usize).ok_or_else(|| {
        SessionError::InvalidExtraCodeReference {
            source: source.clone(),
            index,
        }
    })?;
    *value = target_id;
    Ok(vec![source])
}

pub(super) fn retarget_battle_range(
    snapshot: &mut ProjectSnapshot,
    source: StableId,
    low_id: i16,
    high_id: i16,
) -> Result<Vec<StableId>, SessionError> {
    let row = row_mut(snapshot, &source, 0)?;
    row.values[0] = low_id;
    row.values[1] = high_id;
    Ok(vec![source])
}

pub(super) fn retarget_branch(
    snapshot: &mut ProjectSnapshot,
    source: StableId,
    layout: ExtraCodeBranchLayout,
    mode: i16,
    target_id: i16,
) -> Result<Vec<StableId>, SessionError> {
    let (valid_mode, mode_index, target_index) = match layout {
        ExtraCodeBranchLayout::Choice => ((0..=4).contains(&mode), 1, 2),
        ExtraCodeBranchLayout::Force => ((-1..=3).contains(&mode), 2, 3),
    };
    if !valid_mode {
        return Err(SessionError::InvalidExtraCodeBranchMode {
            source,
            layout,
            mode,
        });
    }
    let row = row_mut(snapshot, &source, 0)?;
    row.values[mode_index] = mode;
    row.values[target_index] = target_id;
    Ok(vec![source])
}

pub(super) fn upsert(snapshot: &mut ProjectSnapshot, row: ExtraCodeRow) -> Vec<StableId> {
    let identity = StableId(format!("extra-code:{}", row.native_id.0));
    if let Some(existing) = snapshot
        .extra_codes
        .iter_mut()
        .find(|existing| existing.native_id == row.native_id)
    {
        *existing = row;
    } else {
        snapshot.extra_codes.push(row);
    }
    snapshot.normalize();
    vec![identity]
}

use crate::{
    model::{ProjectSnapshot, StableId},
    references::{ReferenceDescriptor, TargetKind},
};
use std::collections::BTreeSet;

/// Castle's bestiary stops at the first visible HD-255 Normal record. Explicit
/// references can still load later IDs, including their difficulty variants.
pub(super) fn uncalled(
    snapshot: &ProjectSnapshot,
    references: &[ReferenceDescriptor],
) -> BTreeSet<StableId> {
    let boundary = snapshot
        .monster_sets
        .iter()
        .find(|set| set.set_id == 0)
        .and_then(|set| {
            set.monsters
                .iter()
                .filter(|row| row.hit_dice == 255 && !row.not_on_menu)
                .map(|row| row.native_id.0)
                .min()
        });
    let Some(boundary) = boundary else {
        return BTreeSet::new();
    };
    let mut called: BTreeSet<u32> = crate::monster_uses::monster_uses(snapshot)
        .into_iter()
        .map(|usage| usage.target_id)
        .collect();
    for reference in references
        .iter()
        .filter(|reference| reference.target_kind == TargetKind::Monster)
    {
        if let Some(id) = reference
            .target_id
            .rsplit(':')
            .next()
            .and_then(|id| id.parse().ok())
        {
            called.insert(id);
        }
    }
    snapshot
        .monster_sets
        .iter()
        .flat_map(|set| &set.monsters)
        .filter(|row| {
            !row.authored && row.native_id.0 >= boundary && !called.contains(&row.native_id.0)
        })
        .map(|row| row.identity.clone())
        .collect()
}

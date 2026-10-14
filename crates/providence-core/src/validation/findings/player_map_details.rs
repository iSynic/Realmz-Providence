use crate::{
    codecs::PLAYER_MAP_RUNTIME_NAME_SLOTS,
    model::{ProjectOrigin, ProjectSnapshot, StableId},
    references::{ReferenceDescriptor, TargetKind},
};
use std::collections::BTreeSet;

/// Castle's Maps/Notes menu has twenty slots; opcode 29 can explicitly request
/// a slot. Neither an unnamed imported slot nor file length proves corruption.
pub(super) fn unused(
    snapshot: &ProjectSnapshot,
    references: &[ReferenceDescriptor],
) -> BTreeSet<StableId> {
    if !matches!(snapshot.origin, ProjectOrigin::Imported { .. }) {
        return BTreeSet::new();
    }
    let called = references
        .iter()
        .filter(|reference| reference.target_kind == TargetKind::PlayerMap)
        .map(|reference| reference.target_id.as_str())
        .collect::<BTreeSet<_>>();
    snapshot
        .world
        .player_maps
        .iter()
        .filter(|row| {
            !row.authored
                && !called.contains(row.identity.0.as_str())
                && !called.contains(row.native_id.0.to_string().as_str())
                && has_no_menu_entry(snapshot, row.native_id.0 as usize)
        })
        .map(|row| row.identity.clone())
        .collect()
}

fn has_no_menu_entry(snapshot: &ProjectSnapshot, slot: usize) -> bool {
    if slot >= PLAYER_MAP_RUNTIME_NAME_SLOTS {
        return true;
    }
    // Missing names are unknown context, not evidence of an unused slot.
    snapshot.player_map_names.as_ref().is_some_and(|names| {
        names
            .available_names
            .get(slot)
            .is_some_and(|name| is_placeholder(name))
            && names
                .unavailable_names
                .get(slot)
                .is_some_and(|name| is_placeholder(name))
    })
}

fn is_placeholder(name: &str) -> bool {
    let name = name.trim();
    name.is_empty() || name.bytes().all(|byte| byte == b'-')
}

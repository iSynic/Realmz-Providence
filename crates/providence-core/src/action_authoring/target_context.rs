//! Resolve map-relative fields from the current draft, not the editor's selected map.
use super::{
    ActionFormDescribeQuery, ActionSemanticInventoryEntry, ActionTargetContext, ActionTargetKind,
};
use crate::model::{LevelType, ProjectSnapshot};

pub(super) fn field_context(
    snapshot: &ProjectSnapshot,
    query: &ActionFormDescribeQuery,
    entry: &ActionSemanticInventoryEntry,
    kind: Option<ActionTargetKind>,
) -> ActionTargetContext {
    let caller = &query.context.target_context;
    if !matches!(
        kind,
        Some(
            ActionTargetKind::Map
                | ActionTargetKind::MapTile
                | ActionTargetKind::SameMapActionPoint
                | ActionTargetKind::RandomRectangle
        )
    ) {
        return caller.clone();
    }
    let mut w = [0; 5];
    for field in &entry.fields {
        if let Some(word) = w.get_mut(usize::from(field.index)) {
            *word = query.values.get(&field.internal_name).copied().unwrap_or(0);
        }
    }
    settings_context(snapshot, entry.opcode, w, caller, kind)
}

pub(crate) fn settings_context(
    snapshot: &ProjectSnapshot,
    opcode: i16,
    words: [i16; 5],
    caller: &ActionTargetContext,
    kind: Option<ActionTargetKind>,
) -> ActionTargetContext {
    if !matches!(
        kind,
        Some(
            ActionTargetKind::Map
                | ActionTargetKind::MapTile
                | ActionTargetKind::SameMapActionPoint
                | ActionTargetKind::RandomRectangle
        )
    ) {
        return caller.clone();
    }
    let caller_kind = caller.level_type.or_else(|| {
        snapshot
            .world
            .maps
            .iter()
            .find(|map| Some(&map.identity) == caller.map_identity.as_ref())
            .map(|map| map.level_type)
    });
    let Some((level, level_type)) = map_address(opcode, words, caller_kind) else {
        return caller.clone();
    };
    let map_identity = snapshot
        .world
        .maps
        .iter()
        .find(|map| {
            Some(map.level_type) == level_type && i64::from(map.native_index) == i64::from(level)
        })
        .map(|map| map.identity.clone());
    ActionTargetContext {
        map_identity,
        level_type,
    }
}

fn map_address(
    opcode: i16,
    w: [i16; 5],
    caller_kind: Option<LevelType>,
) -> Option<(i16, Option<LevelType>)> {
    Some(match opcode {
        7 => (
            w[0],
            match w[3] {
                0 => caller_kind,
                1 => Some(LevelType::Land),
                _ => Some(LevelType::Dungeon),
            },
        ),
        12 => (w[0], Some(boolean_level(w[4]))),
        13 => (
            w[0],
            match w[3] {
                0 => caller_kind,
                1.. => Some(LevelType::Land),
                _ => Some(LevelType::Dungeon),
            },
        ),
        20 | 45 => (w[0], caller_kind),
        23 => (w[0], Some(LevelType::Land)),
        -23 => (w[0], Some(LevelType::Dungeon)),
        37 => (
            w[1],
            Some(if w[0] == 0 {
                LevelType::Dungeon
            } else {
                LevelType::Land
            }),
        ),
        57 => (w[2], Some(LevelType::Land)),
        92 => (w[0], Some(boolean_level(w[2]))),
        _ => return None,
    })
}

fn boolean_level(value: i16) -> LevelType {
    if value == 0 {
        LevelType::Land
    } else {
        LevelType::Dungeon
    }
}
